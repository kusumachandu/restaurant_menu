'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, token } from '@/lib/client';

export default function Login() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { token: t } = await api('/auth/login', { method: 'POST', body: form });
      token.set(t);
      router.push('/admin');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin narrow">
      <h1>Owner login</h1>
      <form onSubmit={submit} className="form">
        <label>Email<input type="email" required autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Password<input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {err && <p className="error" role="alert">{err}</p>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
