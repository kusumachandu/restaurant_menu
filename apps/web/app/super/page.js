'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Box, Flex, FormControl, FormLabel, Input, Select, SimpleGrid, Text } from '@chakra-ui/react';
import { api, role, token } from '@/lib/client';
import { count, money } from '@/lib/stats';
import { C } from '@/components/menu/ui';
import AdminShell, { PageHeader } from '@/components/admin/shell/AdminShell';
import Icon from '@/components/admin/shell/Icon';
import { Card } from '@/components/admin/charts';

const PlatformDashboard = dynamic(() => import('@/components/admin/PlatformDashboard'), { ssr: false });

const NEW = { name: '', slug: '', plan: 'starter', ownerEmail: '', ownerPassword: '' };
const GROUPS = [{ label: 'Platform', items: [{ key: 'overview', label: 'Overview', icon: 'dashboard' }, { key: 'restaurants', label: 'Restaurants', icon: 'building' }] }];

const ghost = { px: '16px', py: '8px', borderRadius: '99px', border: '1px solid', borderColor: 'line', fontSize: '13.5px', fontWeight: 600, color: 'ink', _hover: { borderColor: C.lineHi, bg: 'rgba(212,168,75,.08)' } };
const gold = { px: '18px', py: '9px', borderRadius: '99px', fontSize: '13.5px', fontWeight: 700, color: '#1a1209', bg: `linear-gradient(135deg, ${C.goldSoft}, ${C.gold})`, boxShadow: '0 8px 20px -8px rgba(212,168,75,.7)', _hover: { filter: 'brightness(1.06)' } };

export default function SuperAdmin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState({ plans: [], restaurants: [] });
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [view, setView] = useState('overview'); // overview | restaurants

  const load = useCallback(() => api('/super/restaurants').then(setData).catch((e) => setErr(e.message)), []);

  useEffect(() => {
    if (!token.get() || role.get() !== 'super') router.replace('/admin/login');
    else {
      setReady(true); load();
      if (window.location.hash === '#restaurants') setView('restaurants');
    }
  }, [router, load]);

  async function run(fn, done) {
    setErr(''); setMsg('');
    try { await fn(); if (done) setMsg(done); await load(); } catch (e) { setErr(e.message); }
  }

  const update = (r, body) => run(() => api(`/super/restaurants/${r._id}`, { method: 'PUT', body }), `Updated ${r.name}.`);

  function resetPassword(r) {
    const password = prompt(`New password for ${r.ownerEmail} (min 8 characters):`);
    if (password) run(() => api(`/super/restaurants/${r._id}/reset-password`, { method: 'POST', body: { password } }), 'Password changed.');
  }

  async function create(e) {
    e.preventDefault();
    await run(async () => { await api('/super/restaurants', { method: 'POST', body: form }); setForm(null); }, 'Restaurant created.');
  }

  function select(k) {
    setView(k);
    window.history.replaceState(null, '', `#${k}`);
    window.scrollTo({ top: 0 });
  }

  if (!ready) return null;
  return (
    <AdminShell
      brand={{ name: 'Platform', sub: 'Owner console' }} groups={GROUPS} active={view} onSelect={select} wide={view === 'overview'}
      onLogout={() => { token.clear(); role.clear(); router.push('/admin/login'); }}
    >
      {view === 'overview' && <PlatformDashboard onOpenRestaurants={() => select('restaurants')} />}

      {view === 'restaurants' && (
        <>
          <PageHeader
            eyebrow="Platform" title="Restaurants" subtitle={`${data.restaurants.length} on the platform. Change plans, add tables, suspend or reset a password.`}
            actions={!form && <Box as="button" type="button" {...gold} display="inline-flex" alignItems="center" gap="8px" onClick={() => { setForm({ ...NEW }); setMsg(''); }}><Icon name="plus" size={16} />Add restaurant</Box>}
          />

          {err && <Text color="danger" fontSize="14px" role="alert" mb={3}>{err}</Text>}
          {msg && <Text role="status" color={C.goldSoft} mb={3}>{msg}</Text>}

          {form && (
            <Card title="New restaurant" mb="18px">
              <Box as="form" onSubmit={create}>
                <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
                  <FormControl isRequired><FormLabel>Restaurant name</FormLabel><Input maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormControl>
                  <FormControl isRequired><FormLabel>Menu address (/r/…)</FormLabel><Input maxLength={40} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></FormControl>
                  <FormControl isRequired><FormLabel>Owner email</FormLabel><Input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></FormControl>
                  <FormControl isRequired><FormLabel>Owner password</FormLabel><Input type="password" minLength={8} autoComplete="new-password" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} /></FormControl>
                  <FormControl>
                    <FormLabel>Plan</FormLabel>
                    <Select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} textTransform="capitalize">
                      {data.plans.map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </FormControl>
                </SimpleGrid>
                <Flex gap={3} mt={5}>
                  <Box as="button" type="submit" {...gold}>Create</Box>
                  <Box as="button" type="button" {...ghost} onClick={() => setForm(null)}>Cancel</Box>
                </Flex>
              </Box>
            </Card>
          )}

          <Flex as="ul" direction="column" gap="12px" listStyleType="none" p={0} m={0}>
            {data.restaurants.map((r) => (
              <Flex
                as="li" key={r._id} gap="16px" align="center" wrap="wrap" p="16px" bg="linear-gradient(150deg, rgba(31,23,17,.94), rgba(18,13,10,.94))" border="1px solid" borderColor="line" borderRadius="20px"
                opacity={r.active ? 1 : 0.6} transition="border-color .2s" _hover={{ borderColor: C.lineHi }}
              >
                <Flex flex="none" w="46px" h="46px" borderRadius="14px" align="center" justify="center" fontWeight={700} fontSize="20px" color="#1a1209" bg={`linear-gradient(135deg, ${C.goldSoft}, ${C.gold} 60%, ${C.ember})`}>{r.name.slice(0, 1).toUpperCase()}</Flex>
                <Box flex={1} minW="200px">
                  <Flex gap="10px" align="center" wrap="wrap">
                    <Text fontWeight={700} fontSize="16.5px">{r.name}</Text>
                    <Text fontSize="10.5px" letterSpacing=".14em" textTransform="uppercase" px="9px" py="2px" borderRadius="99px" bg="rgba(212,168,75,.14)" color={C.goldSoft}>{r.plan}</Text>
                    {!r.active && <Text fontSize="10.5px" letterSpacing=".14em" textTransform="uppercase" px="9px" py="2px" borderRadius="99px" bg="rgba(226,89,78,.16)" color={C.nonveg}>Suspended</Text>}
                  </Flex>
                  <Text fontSize="12.5px" color="mute" mt="3px">/r/{r.slug} · {r.ownerEmail}</Text>
                  <Text fontSize="12.5px" color="mute">{r.dishCount} dishes · {r.tableCount} tables · <Text as="b" color="ink">{count(r.orders30)}</Text> orders, <Text as="b" color="ink">{money(r.revenue30)}</Text> in 30 days</Text>
                </Box>
                <Flex gap="10px" align="center" wrap="wrap">
                  <Select w="130px" size="sm" value={r.plan} onChange={(e) => update(r, { plan: e.target.value })} aria-label={`Plan for ${r.name}`} textTransform="capitalize">
                    {data.plans.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                  <FormControl w="auto" display="flex" alignItems="center" gap={2} title="Paid tables on top of the plan's included tables">
                    <FormLabel m={0} fontSize="12.5px" color="mute" fontWeight={500}>Extra tables</FormLabel>
                    <Input key={r.extraTables} type="number" min="0" size="sm" w="64px" defaultValue={r.extraTables} onBlur={(e) => Number(e.target.value) !== r.extraTables && update(r, { extraTables: Number(e.target.value) })} />
                  </FormControl>
                  <Box as="button" type="button" {...ghost} onClick={() => update(r, { active: !r.active })}>{r.active ? 'Suspend' : 'Reactivate'}</Box>
                  <Box as="button" type="button" {...ghost} onClick={() => resetPassword(r)}>Reset password</Box>
                </Flex>
              </Flex>
            ))}
          </Flex>
        </>
      )}
    </AdminShell>
  );
}
