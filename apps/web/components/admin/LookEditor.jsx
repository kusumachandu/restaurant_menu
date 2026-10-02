'use client';
import { useRef } from 'react';
import Dish3D from '../Dish3D';
import { DEFAULT_LOOK, LOOK_FIELDS, resolveLook } from '@/lib/look';

/** Live 3D preview plus lighting sliders. Drag the preview to check every angle. */
export default function LookEditor({ dish, currency, look, onChange }) {
  const api = useRef(null);
  const cur = resolveLook(look);
  return (
    <div className="look">
      <b>3D look</b>
      <Dish3D dish={dish} currency={currency} look={cur} mode="viewer" apiRef={api} />
      <p className="hint center">Drag to rotate · scroll or pinch to zoom. Changes show instantly.</p>
      <div className="sliders">
        {LOOK_FIELDS.map(([k, label, min, max, step]) => (
          <label key={k}>
            <span>{label}<span>{Number(cur[k]).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}</span></span>
            <input type="range" min={min} max={max} step={step} value={cur[k]} onChange={(e) => onChange({ ...cur, [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="ghost" onClick={() => api.current?.reset()}>Reset view</button>
        <button type="button" className="ghost" onClick={() => onChange({ ...DEFAULT_LOOK })}>Reset lighting</button>
      </div>
    </div>
  );
}
