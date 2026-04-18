import type { Localization } from '@/lib/simulator/types';
import { reconstructImage } from '@/lib/simulator/reconstruction';

// ─── WGSL Compute Shader ────────────────────────────────────────────────────
// Each invocation handles one localization, splatting its pixel-integrated
// Gaussian onto a u32 accumulation buffer via atomicAdd. The erf
// approximation matches the CPU reconstructor (Abramowitz & Stegun 7.1.26).

const SPLAT_SHADER = /* wgsl */ `
struct Params {
  width      : u32,
  height     : u32,
  pixelSizeNm: f32,
  nLocs      : u32,
  scale      : f32,
  _pad1      : f32,
  _pad2      : f32,
  _pad3      : f32,
}

fn erf_approx(x: f32) -> f32 {
  let s  = select(-1.0, 1.0, x >= 0.0);
  let ax = abs(x);
  let t  = 1.0 / (1.0 + 0.3275911 * ax);
  let y  = 1.0 - (((((1.061405429 * t - 1.453152027) * t
                     + 1.421413741) * t - 0.284496736) * t
                     + 0.254829592) * t * exp(-ax * ax));
  return s * y;
}

@group(0) @binding(0) var<storage, read>       locs   : array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> output : array<atomic<u32>>;
@group(0) @binding(2) var<uniform>             params : Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.nLocs) { return; }

  let loc   = locs[idx];
  let cx    = loc.x;
  let cy    = loc.y;
  let sigma = max(loc.z, 0.1);
  let inv   = 1.0 / (sigma * 1.4142136);
  let pxSz  = params.pixelSizeNm;

  let rad    = i32(ceil(3.0 * sigma / pxSz)) + 1;
  let ctrX   = i32(floor(cx / pxSz));
  let ctrY   = i32(floor(cy / pxSz));
  let pxMin  = max(0, ctrX - rad);
  let pxMax  = min(i32(params.width)  - 1, ctrX + rad);
  let pyMin  = max(0, ctrY - rad);
  let pyMax  = min(i32(params.height) - 1, ctrY + rad);

  for (var py = pyMin; py <= pyMax; py = py + 1) {
    let yLo = f32(py)     * pxSz;
    let yHi = f32(py + 1) * pxSz;
    let ey  = 0.5 * (erf_approx((yHi - cy) * inv) - erf_approx((yLo - cy) * inv));
    if (ey <= 0.0) { continue; }
    for (var px = pxMin; px <= pxMax; px = px + 1) {
      let xLo = f32(px)     * pxSz;
      let xHi = f32(px + 1) * pxSz;
      let ex  = 0.5 * (erf_approx((xHi - cx) * inv) - erf_approx((xLo - cx) * inv));
      let val = ex * ey;
      if (val > 0.0005) {
        let oi = u32(py) * params.width + u32(px);
        atomicAdd(&output[oi], u32(val * params.scale));
      }
    }
  }
}
`;

const QUANT_SCALE = 10000;

// ─── WebGPU Reconstructor ───────────────────────────────────────────────────

export class WebGPUReconstructor {
  private device: GPUDevice;
  private pipeline: GPUComputePipeline;
  private bgl: GPUBindGroupLayout;

  private locBuf: GPUBuffer | null = null;
  private outBuf: GPUBuffer | null = null;
  private readBuf: GPUBuffer | null = null;
  private uniBuf: GPUBuffer;
  private nPixels = 0;
  private outW = 0;
  private outH = 0;
  private pxNm = 10;

  private constructor(
    device: GPUDevice,
    pipeline: GPUComputePipeline,
    bgl: GPUBindGroupLayout,
    uniBuf: GPUBuffer,
  ) {
    this.device = device;
    this.pipeline = pipeline;
    this.bgl = bgl;
    this.uniBuf = uniBuf;
  }

  static async create(): Promise<WebGPUReconstructor | null> {
    if (typeof navigator === 'undefined' || !navigator.gpu) return null;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();

      const shader = device.createShaderModule({ code: SPLAT_SHADER });
      const bgl = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        ],
      });
      const pipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
        compute: { module: shader, entryPoint: 'main' },
      });
      const uniBuf = device.createBuffer({
        size: 32, // 8 × f32/u32
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      return new WebGPUReconstructor(device, pipeline, bgl, uniBuf);
    } catch {
      return null;
    }
  }

  uploadLocalizations(
    locs: Localization[],
    fieldSizeNm: { width: number; height: number },
    outputPixelSizeNm: number,
  ): void {
    const d = this.device;
    this.outW = Math.round(fieldSizeNm.width / outputPixelSizeNm);
    this.outH = Math.round(fieldSizeNm.height / outputPixelSizeNm);
    this.pxNm = outputPixelSizeNm;
    this.nPixels = this.outW * this.outH;

    // Pack loc data: vec4<f32> per loc → [x, y, sigma, 0]
    const n = locs.length;
    const data = new Float32Array(Math.max(4, n * 4));
    for (let i = 0; i < n; i++) {
      data[i * 4] = locs[i].x;
      data[i * 4 + 1] = locs[i].y;
      data[i * 4 + 2] = locs[i].sigmaLocNm;
    }
    this.locBuf?.destroy();
    this.locBuf = d.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    d.queue.writeBuffer(this.locBuf, 0, data);

    // Accumulation + readback buffers
    const byteLen = this.nPixels * 4;
    this.outBuf?.destroy();
    this.outBuf = d.createBuffer({
      size: byteLen,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.readBuf?.destroy();
    this.readBuf = d.createBuffer({
      size: byteLen,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }

  async render(nLocs: number): Promise<Float32Array> {
    const d = this.device;
    if (!this.locBuf || !this.outBuf || !this.readBuf || nLocs <= 0) {
      return new Float32Array(this.nPixels);
    }

    // Uniforms
    const ub = new ArrayBuffer(32);
    const v = new DataView(ub);
    v.setUint32(0, this.outW, true);
    v.setUint32(4, this.outH, true);
    v.setFloat32(8, this.pxNm, true);
    v.setUint32(12, Math.min(nLocs, (this.locBuf.size / 16) | 0), true);
    v.setFloat32(16, QUANT_SCALE, true);
    d.queue.writeBuffer(this.uniBuf, 0, ub);

    const enc = d.createCommandEncoder();
    enc.clearBuffer(this.outBuf);

    const bg = d.createBindGroup({
      layout: this.bgl,
      entries: [
        { binding: 0, resource: { buffer: this.locBuf } },
        { binding: 1, resource: { buffer: this.outBuf } },
        { binding: 2, resource: { buffer: this.uniBuf } },
      ],
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(nLocs / 64));
    pass.end();
    enc.copyBufferToBuffer(this.outBuf, 0, this.readBuf, 0, this.nPixels * 4);
    d.queue.submit([enc.finish()]);

    await this.readBuf.mapAsync(GPUMapMode.READ);
    const raw = new Uint32Array(this.readBuf.getMappedRange().slice(0));
    this.readBuf.unmap();

    const out = new Float32Array(raw.length);
    const inv = 1 / QUANT_SCALE;
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] * inv;
    return out;
  }

  dispose(): void {
    this.locBuf?.destroy();
    this.outBuf?.destroy();
    this.readBuf?.destroy();
    this.uniBuf.destroy();
    this.device.destroy();
  }
}

// ─── CPU fallback ───────────────────────────────────────────────────────────
// Uses the existing erf-based reconstructImage when WebGPU is unavailable.

export function cpuReconstruct(
  locs: Localization[],
  nLocs: number,
  fieldSizeNm: { width: number; height: number },
  outputPixelSizeNm: number,
): { pixels: Float32Array; width: number; height: number } {
  const subset = nLocs >= locs.length ? locs : locs.slice(0, nLocs);
  const r = reconstructImage(subset, { fieldSizeNm, outputPixelSizeNm });
  return { pixels: r.pixels, width: r.width, height: r.height };
}
