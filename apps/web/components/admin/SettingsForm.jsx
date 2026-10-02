'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

export default function SettingsForm() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { api('/admin/settings').then(setS).catch((e) => setErr(e.message)); }, []);

  async function save(e) {
    e.preventDefault();
    setMsg(''); setErr('');
    try { setS(await api('/admin/settings', { method: 'PUT', body: s })); setMsg('Saved.'); }
    catch (e2) { setErr(e2.message); }
  }

  if (!s) return <p>{err || 'Loading…'}</p>;
  return (
    <form onSubmit={save} className="form">
      <label>Restaurant name<input required maxLength={80} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
      <label>Tagline<input maxLength={160} value={s.tagline} onChange={(e) => setS({ ...s, tagline: e.target.value })} /></label>
      <label>Currency symbol<input maxLength={4} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></label>
      {err && <p className="error" role="alert">{err}</p>}
      {msg && <p role="status">{msg}</p>}
      <button>Save</button>
    </form>
  );
}
