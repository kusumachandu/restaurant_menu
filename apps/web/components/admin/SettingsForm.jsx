'use client';
import { useEffect, useState } from 'react';
import { Button, FormControl, FormLabel, Input, Stack, Text } from '@chakra-ui/react';
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

  if (!s) return <Text>{err || 'Loading…'}</Text>;
  return (
    <Stack as="form" onSubmit={save} spacing="14px" mt={4}>
      <FormControl isRequired>
        <FormLabel>Restaurant name</FormLabel>
        <Input maxLength={80} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </FormControl>
      <FormControl>
        <FormLabel>Tagline</FormLabel>
        <Input maxLength={160} value={s.tagline} onChange={(e) => setS({ ...s, tagline: e.target.value })} />
      </FormControl>
      <FormControl>
        <FormLabel>Currency symbol</FormLabel>
        <Input maxLength={4} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} />
      </FormControl>
      {err && <Text color="danger" fontSize="14px" role="alert">{err}</Text>}
      {msg && <Text role="status">{msg}</Text>}
      <Button type="submit" alignSelf="flex-start">Save</Button>
    </Stack>
  );
}
