'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { drawActualObject, drawLocalizationCloud } from '@/lib/rendering/labCanvas';
import type { GroundTruth, GroundTruthInput, ViewBox } from '@/lib/simulator/types';
import { FieldScale } from './FieldScale';

export function SpecimenView({ specimen, truth, view }: {
  specimen: GroundTruthInput | null;
  truth: GroundTruth | null;
  view: ViewBox;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [showLabels, setShowLabels] = useState(false);
  const draw = useCallback(() => {
    if (!canvas.current) return;
    if (showLabels)
      drawLocalizationCloud(canvas.current, truth?.emitters ?? [], view, { truth: true });
    else
      drawActualObject(canvas.current, truth ? specimen : null, truth?.fieldSizeNm ?? { width: 0, height: 0 }, view);
  }, [showLabels, specimen, truth, view]);
  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [draw]);

  const description = specimen?.kind === 'two-lines'
    ? `${specimen.separationNm} nm gap`
    : specimen?.kind === 'ring'
      ? `${specimen.diameterNm} nm diameter`
      : specimen?.kind === 'actin'
        ? `${specimen.periodNm} nm spacing`
        : 'Source image';
  return (
    <figure className="image-panel specimen-panel">
      <figcaption>
        <h3>{specimen?.kind === 'image' ? 'Input image' : 'Actual object'}</h3>
        <span>{showLabels ? `${truth?.emitters.length.toLocaleString() ?? 0} molecules` : description}</span>
      </figcaption>
      <div className="microscopy-field main-field">
        <canvas ref={canvas} role="img" aria-label={!truth
          ? 'No specimen selected'
          : showLabels
            ? `All ${truth.emitters.length} known molecule positions in the specimen`
            : specimen?.kind === 'image'
              ? 'Uploaded source image, in the same physical view as the reconstruction'
              : `Known specimen: ${truth.label}`} />
        <FieldScale view={view} />
        {!truth && <div className="empty-field">Choose an image to see the specimen</div>}
      </div>
      <div className="view-options">
        <div className="segmented-control" role="group" aria-label="Actual object view">
          <button aria-pressed={!showLabels} onClick={() => setShowLabels(false)}>
            {specimen?.kind === 'image' ? 'Image' : 'Object'}
          </button>
          <button aria-pressed={showLabels} onClick={() => setShowLabels(true)}>Molecules</button>
        </div>
      </div>
    </figure>
  );
}
