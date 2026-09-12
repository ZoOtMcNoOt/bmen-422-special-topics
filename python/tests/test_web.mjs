import assert from "node:assert/strict";
import test from "node:test";
import { localizationCsv } from "../storm_slides/web/export.js";

const experiment = {
  settings: { specimen: "rings", seed: 42, drift_nm: 2.5, frame_count: 160 },
  model: { pixel_size_nm: 100, psf_sigma_px: 1.2, off_probability: 0.4 },
  localizations: {
    frame: [0, 159],
    xy: [
      [5.125, 8.375],
      [9.1, 6.5],
    ],
    corrected_xy: [
      [5.125, 8.375],
      [5.125, 7.89125],
    ],
    photons: [1200.4321, 980.1357],
    precision_nm: [3.91234, 4.51234],
  },
};

test("CSV retains subpixel positions, raw and corrected coordinates, frame zero, and run metadata", () => {
  const lines = localizationCsv(experiment)
    .trim()
    .split("\r\n")
    .map((line) => line.split(","));
  const rows = lines
    .slice(1)
    .map((row) => Object.fromEntries(lines[0].map((key, i) => [key, row[i]])));
  assert.equal(rows.length, 2);
  assert.equal(Number(rows[0].frame_index), 0);
  assert.equal(Number(rows[0].x_nm), 512.5);
  assert.equal(Number(rows[0].y_nm), 837.5);
  assert.equal(Number(rows[1].corrected_x_nm), 512.5);
  assert.equal(Number(rows[1].frame_index), 159);
  assert.equal(Number(rows[1].photons), 980.1357);
  assert.equal(Number(rows[0].precision_nm), 3.91234);
  for (const row of rows) {
    assert.equal(row.specimen, "rings");
    assert.equal(row.seed, "42");
    assert.equal(row.drift_nm, "2.5");
    assert.equal(row.off_probability, "0.4");
  }
});

test("An acquisition with no accepted fits exports a readable header without fabricated rows", () => {
  const empty = {
    ...experiment,
    localizations: Object.fromEntries(
      Object.keys(experiment.localizations).map((key) => [key, []]),
    ),
  };
  assert.equal(localizationCsv(empty).trim().split("\r\n").length, 1);
  assert.ok(localizationCsv(empty).startsWith("frame_index,x_nm,y_nm,"));
});
