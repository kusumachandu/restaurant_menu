'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

const EMPTY = { name: '', description: '', price: '', category: 'Mains', veg: false, special: false, available: true, imageId: null };

export default function DishManager() {
  const [dishes, setDishes] = useState([]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('/admin/dishes').then(setDishes).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const categories = [...new Set(dishes.map((d) => d.category))];

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const body = { ...edit, price: Number(edit.price) };
      if (edit._id) await api(`/admin/dishes/${edit._id}`, { method: 'PUT', body });
      else await api('/admin/dishes', { method: 'POST', body });
      setEdit(null);
      load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setErr('');
    try {
      const { imageId } = await api('/admin/upload', { method: 'POST', form: fd });
      setEdit((d) => ({ ...d, imageId }));
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function toggle(d) {
    await api(`/admin/dishes/${d._id}`, { method: 'PUT', body: { available: !d.available } });
    load();
  }

  async function remove(d) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    await api(`/admin/dishes/${d._id}`, { method: 'DELETE' });
    load();
  }

  if (edit) {
    return (
      <form onSubmit={save} className="form">
        <h2>{edit._id ? 'Edit dish' : 'New dish'}</h2>
        <label>Name<input required maxLength={120} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
        <label>Description<textarea maxLength={600} rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
        <div className="two">
          <label>Price<input required type="number" min="0" step="1" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></label>
          <label>Category<input required list="cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /><datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={edit.veg} onChange={(e) => setEdit({ ...edit, veg: e.target.checked })} /> Vegetarian</label>
          <label><input type="checkbox" checked={edit.special} onChange={(e) => setEdit({ ...edit, special: e.target.checked })} /> Chef&apos;s special</label>
          <label><input type="checkbox" checked={edit.available} onChange={(e) => setEdit({ ...edit, available: e.target.checked })} /> Available today</label>
        </div>
        <label>Photo (best: a top-down photo of the dish)
          <input type="file" accept="image/*" onChange={upload} />
        </label>
        {edit.imageId && <img className="preview" src={`/api/images/${edit.imageId}`} alt="Dish preview" />}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions">
          <button disabled={busy}>{busy ? 'Saving…' : 'Save dish'}</button>
          <button type="button" className="ghost" onClick={() => { setEdit(null); setErr(''); }}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="admin-top"><h2>{dishes.length} dishes</h2><button onClick={() => setEdit({ ...EMPTY })}>+ Add dish</button></div>
      {err && <p className="error" role="alert">{err}</p>}
      <ul className="list">
        {dishes.map((d) => (
          <li key={d._id} className={d.available ? '' : 'off'}>
            {d.imageId ? <img src={`/api/images/${d.imageId}`} alt="" /> : <span className="noimg">🍽</span>}
            <div className="info"><b>{d.name}</b><small>{d.category} · {d.price}{d.veg ? ' · Veg' : ''}{d.special ? ' · Special' : ''}</small></div>
            <div className="actions">
              <button className="ghost" onClick={() => toggle(d)}>{d.available ? 'Mark sold out' : 'Mark available'}</button>
              <button className="ghost" onClick={() => setEdit({ ...EMPTY, ...d })}>Edit</button>
              <button className="ghost danger" onClick={() => remove(d)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
