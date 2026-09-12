'use client';

import { useEffect, useMemo, useRef } from 'react';
import { conventionalPreview } from '@/lib/rendering/conventionalPreview';
import { drawCameraPreview } from '@/lib/rendering/labCanvas';
import type { GroundTruth, ViewBox } from '@/lib/simulator/types';
import { FieldScale } from './FieldScale';

export function ConventionalView({ truth, view, psfSigmaNm }: {
  truth: GroundTruth | null;
  view: ViewBox;
  psfSigmaNm: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useMemo(
    () => conventionalPreview(truth?.emitters ?? [], view, psfSigmaNm),
    [truth, view, psfSigmaNm],
  );
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const draw = () => drawCameraPreview(
      target, preview.pixels, preview.sizePx, preview.sizePx, { smooth: true },
    );
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(target);
    return () => observer.disconnect();
  }, [preview]);

  return (
    <figure className="image-panel conventional-panel">
      <figcaption>
        <h3>Conventional microscope</h3>
        <span>Ideal view</span>
      </figcaption>
      <div className="microscopy-field reference-field">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Ideal conventional fluorescence image of all emitters, with a ${psfSigmaNm} nm Gaussian PSF sigma and no noise or drift`}
        />
        <FieldScale view={view} />
        {!truth && <div className="empty-field">Choose a sample</div>}
      </div>
      <p className="image-note">All emitters on · optical blur</p>
    </figure>
  );
}
