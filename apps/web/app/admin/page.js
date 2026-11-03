'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { api, role, token } from '@/lib/client';
import AdminShell, { PageHeader } from '@/components/admin/shell/AdminShell';
import DishManager from '@/components/admin/DishManager';
import SettingsForm from '@/components/admin/SettingsForm';
import QrCard from '@/components/admin/QrCard';
import TablesManager from '@/components/admin/TablesManager';
import OrdersBoard from '@/components/admin/OrdersBoard';
import CustomersList from '@/components/admin/CustomersList';

// Only loaded when the screen is opened, so the other screens stay light.
const Dashboard = dynamic(() => import('@/components/admin/Dashboard'), { ssr: false });

const COPY = {
  orders: ['Service', 'Live orders', 'Orders from your tables, as they arrive.'],
  tables: ['Service', 'Tables and QR codes', 'One code per table, so every order reaches the right place.'],
  customers: ['Service', 'Guests', 'Everyone who checked in with a verified mobile number.'],
  dishes: ['Menu', 'Dishes', 'What guests see on your menu.'],
  settings: ['Menu', 'Restaurant', 'Name, ordering rules, guest check-in and webhook.'],
  qr: ['Menu', 'Menu QR code', 'Print this so guests can open your menu.'],
};

export default function Admin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('dishes');
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!token.get()) router.replace('/admin/login');
    else if (role.get() === 'super') router.replace('/super');
    else {
      setReady(true);
      api('/admin/settings').then((i) => {
        setInfo(i);
        const wanted = window.location.hash.slice(1); // reopening the page lands on the same screen
        const known = ['dishes', 'settings', 'qr', ...(i.features.ordering ? ['dashboard', 'orders', 'tables', 'customers'] : [])];
        setTab(known.includes(wanted) ? wanted : i.features.ordering ? 'dashboard' : 'dishes');
      }).catch(() => {});
    }
  }, [router]);

  const groups = useMemo(() => {
    const ordering = info?.features.ordering;
    return [
      ...(ordering ? [
        { label: 'Insights', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'dashboard' }] },
        { label: 'Service', items: [{ key: 'orders', label: 'Orders', icon: 'orders' }, { key: 'tables', label: 'Tables', icon: 'tables' }, { key: 'customers', label: 'Guests', icon: 'guests' }] },
      ] : []),
      { label: 'Menu', items: [{ key: 'dishes', label: 'Dishes', icon: 'dishes' }, { key: 'settings', label: 'Restaurant', icon: 'store' }, { key: 'qr', label: 'QR code', icon: 'qr' }] },
    ];
  }, [info]);

  function select(k) {
    setTab(k);
    window.history.replaceState(null, '', `#${k}`);
    window.scrollTo({ top: 0 });
  }

  if (!ready) return null;
  const [eyebrow, title, subtitle] = COPY[tab] || [];
  return (
    <AdminShell
      brand={{ name: info?.name || 'Menu admin', sub: info ? `${info.features.label} plan` : '' }}
      groups={groups} active={tab} onSelect={select} wide={tab === 'dashboard'}
      links={[{ label: 'View live menu', href: '/' }]}
      onLogout={() => { token.clear(); role.clear(); router.push('/admin/login'); }}
    >
      {tab !== 'dashboard' && <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />}
      {tab === 'dashboard' && <Dashboard name={info?.name} />}
      {tab === 'orders' && <OrdersBoard currency={info?.currency || '₹'} restaurantName={info?.name || ''} />}
      {tab === 'tables' && <TablesManager slug={info.slug} />}
      {tab === 'customers' && <CustomersList />}
      {tab === 'dishes' && <DishManager />}
      {tab === 'settings' && <SettingsForm />}
      {tab === 'qr' && <QrCard />}
    </AdminShell>
  );
}
