'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { token } from '@/lib/client';
import DishManager from '@/components/admin/DishManager';
import SettingsForm from '@/components/admin/SettingsForm';
import QrCard from '@/components/admin/QrCard';

const TABS = [['dishes', 'Dishes'], ['settings', 'Restaurant'], ['qr', 'QR code']];

export default function Admin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('dishes');

  useEffect(() => {
    if (!token.get()) router.replace('/admin/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;
  return (
    <main className="admin">
      <div className="admin-top">
        <h1>Menu admin</h1>
        <div>
          <a className="link" href="/" target="_blank" rel="noreferrer">View menu</a>
          <button className="ghost" onClick={() => { token.clear(); router.push('/admin/login'); }}>Log out</button>
        </div>
      </div>
      <div className="filters">
        {TABS.map(([k, label]) => (
          <button key={k} className={`pill ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} aria-pressed={tab === k}>{label}</button>
        ))}
      </div>
      {tab === 'dishes' && <DishManager />}
      {tab === 'settings' && <SettingsForm />}
      {tab === 'qr' && <QrCard />}
    </main>
  );
}
