import { pickScaleBar } from '@/lib/rendering/scaleBar';
import type { ViewBox } from '@/lib/simulator/types';

export function FieldScale({ view }: { view: ViewBox }) {
  const bar = pickScaleBar(view.sizeNm);
  return (
    <div className="field-bottom">
      <span
        className="field-scale"
        style={{ width: `calc(var(--field-side, 100px) * ${bar.fraction})` }}
      >
        <i />
        {bar.label}
      </span>
      <span>
        {(view.sizeNm / 1000).toLocaleString()} ×{' '}
        {(view.sizeNm / 1000).toLocaleString()} µm
      </span>
    </div>
  );
}
