'use client';
import { useCallback, useMemo, useState } from 'react';
import Dish3D from './Dish3D';
import DishModal from './DishModal';

function DishCard({ dish, currency, onOpen }) {
  return (
    <article className="card">
      <Dish3D dish={dish} currency={currency} look={dish.look} onOpen={onOpen} />
      <div className="meta">
        <span className={`dot ${dish.veg ? 'veg' : 'nonveg'}`} title={dish.veg ? 'Vegetarian' : 'Non-vegetarian'} />
        {dish.special && <span className="badge">Chef&apos;s special</span>}
      </div>
      <h3>{dish.name}</h3>
      <p>{dish.description}</p>
      <div className="row">
        <span className="price">{currency}{dish.price}</span>
        <button onClick={onOpen}>View in 3D</button>
      </div>
    </article>
  );
}

export default function MenuClient({ menu }) {
  const { settings, categories, dishes } = menu;
  const [cat, setCat] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);
  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);
  const shown = useMemo(
    () => dishes.filter((d) => (cat === 'All' || d.category === cat) && (!vegOnly || d.veg)),
    [dishes, cat, vegOnly]
  );

  return (
    <main className="page">
      <header>
        <h1>{settings.name}</h1>
        {settings.tagline && <p>{settings.tagline}</p>}
        <p className="hint">Tap a dish to explore it in 3D: turn it, tilt it and zoom in.</p>
      </header>

      <div className="filters">
        {['All', ...categories].map((c) => (
          <button key={c} className={`pill ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)} aria-pressed={cat === c}>{c}</button>
        ))}
        <label className="vegtoggle">
          <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} /> Veg only
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="empty">{dishes.length ? 'No dishes match these filters.' : 'The menu is being prepared. Please check back soon.'}</p>
      ) : (
        <div className="grid">
          {shown.map((d) => <DishCard key={d._id} dish={d} currency={settings.currency} onOpen={() => setOpen(d)} />)}
        </div>
      )}
      {open && <DishModal dish={open} currency={settings.currency} onClose={close} />}
    </main>
  );
}
