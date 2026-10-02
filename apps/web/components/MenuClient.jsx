'use client';
import { useMemo, useState } from 'react';
import Dish3D from './Dish3D';

function DishCard({ dish, currency }) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);
  return (
    <article className="card">
      <Dish3D dish={dish} currency={currency} flipped={flipped} onToggle={toggle} />
      <div className="meta">
        <span className={`dot ${dish.veg ? 'veg' : 'nonveg'}`} title={dish.veg ? 'Vegetarian' : 'Non-vegetarian'} />
        {dish.special && <span className="badge">Chef&apos;s special</span>}
      </div>
      <h3>{dish.name}</h3>
      <p>{dish.description}</p>
      <div className="row">
        <span className="price">{currency}{dish.price}</span>
        <button onClick={toggle}>Flip</button>
      </div>
    </article>
  );
}

export default function MenuClient({ menu }) {
  const { settings, categories, dishes } = menu;
  const [cat, setCat] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);
  const shown = useMemo(
    () => dishes.filter((d) => (cat === 'All' || d.category === cat) && (!vegOnly || d.veg)),
    [dishes, cat, vegOnly]
  );

  return (
    <main className="page">
      <header>
        <h1>{settings.name}</h1>
        {settings.tagline && <p>{settings.tagline}</p>}
        <p className="hint">Touch a dish to bring it to the front. Tap to flip it.</p>
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
          {shown.map((d) => <DishCard key={d._id} dish={d} currency={settings.currency} />)}
        </div>
      )}
    </main>
  );
}
