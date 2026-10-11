'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Button, Flex, FormControl, FormLabel, Heading, Input, Select, SimpleGrid, Stack, Text,
} from '@chakra-ui/react';
import { api, role, token } from '@/lib/client';

const NEW = { name: '', slug: '', plan: 'starter', ownerEmail: '', ownerPassword: '' };

export default function SuperAdmin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState({ plans: [], restaurants: [] });
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api('/super/restaurants').then(setData).catch((e) => setErr(e.message)), []);

  useEffect(() => {
    if (!token.get() || role.get() !== 'super') router.replace('/admin/login');
    else { setReady(true); load(); }
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

  if (!ready) return null;
  return (
    <Box as="main" maxW="900px" mx="auto" pt="30px" pb="60px" px="clamp(14px, 4vw, 30px)">
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={6}>
        <Heading as="h1" fontSize="32px">Platform admin</Heading>
        <Button variant="outline" onClick={() => { token.clear(); role.clear(); router.push('/admin/login'); }}>Log out</Button>
      </Flex>

      {err && <Text color="danger" fontSize="14px" role="alert" mb={3}>{err}</Text>}
      {msg && <Text role="status" mb={3}>{msg}</Text>}

      {form ? (
        <Stack as="form" onSubmit={create} spacing="14px" mb={8}>
          <Heading as="h2" fontSize="24px">New restaurant</Heading>
          <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
            <FormControl isRequired>
              <FormLabel>Restaurant name</FormLabel>
              <Input maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Menu address (/r/…)</FormLabel>
              <Input maxLength={40} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Owner email</FormLabel>
              <Input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Owner password</FormLabel>
              <Input type="password" minLength={8} autoComplete="new-password" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} />
            </FormControl>
            <FormControl>
              <FormLabel>Plan</FormLabel>
              <Select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} textTransform="capitalize">
                {data.plans.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </FormControl>
          </SimpleGrid>
          <Flex gap={2}>
            <Button type="submit">Create</Button>
            <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          </Flex>
        </Stack>
      ) : (
        <Flex justify="space-between" align="center" mb={3}>
          <Heading as="h2" fontSize="24px">{data.restaurants.length} restaurants</Heading>
          <Button onClick={() => { setForm({ ...NEW }); setMsg(''); }}>+ Add restaurant</Button>
        </Flex>
      )}

      <Stack as="ul" listStyleType="none" p={0} spacing="10px">
        {data.restaurants.map((r) => (
          <Flex
            as="li" key={r._id} gap={3} align="center" wrap="wrap" p="12px"
            bg="card" border="1px solid" borderColor="line" borderRadius="16px" opacity={r.active ? 1 : 0.55}
          >
            <Flex direction="column" flex={1} minW="180px">
              <Text as="b">{r.name}</Text>
              <Text as="small" color="mute">/r/{r.slug} · {r.ownerEmail} · {r.dishCount} dishes · {r.tableCount} tables{r.active ? '' : ' · Suspended'}</Text>
            </Flex>
            <Select w="130px" value={r.plan} onChange={(e) => update(r, { plan: e.target.value })} aria-label={`Plan for ${r.name}`} textTransform="capitalize">
              {data.plans.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
            <FormControl w="120px" display="flex" alignItems="center" gap={2} title="Paid tables on top of the plan's included tables">
              <FormLabel m={0} fontSize="13px">Extra tables</FormLabel>
              <Input
                key={r.extraTables} type="number" min="0" size="sm" w="64px" defaultValue={r.extraTables}
                onBlur={(e) => Number(e.target.value) !== r.extraTables && update(r, { extraTables: Number(e.target.value) })}
              />
            </FormControl>
            <Button variant="outline" onClick={() => update(r, { active: !r.active })}>{r.active ? 'Suspend' : 'Reactivate'}</Button>
            <Button variant="outline" onClick={() => resetPassword(r)}>Reset password</Button>
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}
