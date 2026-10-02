'use client';
import { useEffect, useRef } from 'react';
import Dish3D from './Dish3D';

/** Full-screen viewer: drag to turn the dish to any angle, pinch or scroll to zoom. */
export default function DishModal({ dish, currency, onClose }) {
  const api = useRef(null);
  const closeBtn = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={dish.name}>
        <button ref={closeBtn} className="ghost close" onClick={onClose} aria-label="Close">✕</button>
        <Dish3D dish={dish} currency={currency} look={dish.look} mode="viewer" apiRef={api} />
        <p className="hint center">Drag to rotate · pinch or scroll to zoom</p>
        <h3>{dish.name}</h3>
        {dish.description && <p className="desc">{dish.description}</p>}
        <div className="row">
          <span className="price">{currency}{dish.price}</span>
          <button className="ghost" onClick={() => api.current?.reset()}>Reset view</button>
        </div>
      </div>
    </div>
  );
}
