'use client';
import { useEffect, useState } from 'react';
import { Button, Flex, FormControl, FormHelperText, FormLabel, Input, Stack, Switch, Text } from '@chakra-ui/react';
import { api } from '@/lib/client';
import WebhookSettings from './WebhookSettings';

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
    <>
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
      {s.features?.ordering && (
        <FormControl>
          <FormLabel>Order cancel window (seconds)</FormLabel>
          <Input type="number" inputMode="numeric" min={0} max={300} w="140px" value={s.orderHoldSeconds ?? 120} onChange={(e) => setS({ ...s, orderHoldSeconds: e.target.value })} />
          <FormHelperText>
            A new order reaches the kitchen after this time, and the guest can cancel it until then (for free). 0 sends orders straight to the kitchen.
          </FormHelperText>
        </FormControl>
      )}
      {s.features?.ordering && (
        <FormControl>
          <Flex align="center" gap={3}>
            <Switch isChecked={Boolean(s.customerCheckIn)} onChange={(e) => setS({ ...s, customerCheckIn: e.target.checked })} aria-label="Ask guests to verify their mobile number" />
            <FormLabel m={0}>Ask guests to verify their mobile number</FormLabel>
          </Flex>
          <FormHelperText>
            Before ordering, the guest at a table enters their mobile number (checked with an SMS code) and how many people are seated, and may add the other guests' numbers. Their orders are linked to that number.
          </FormHelperText>
          {s.customerCheckIn && !s.smsLive && (
            <Text mt={2} fontSize="13px" color="danger">SMS sending is not set up on the server yet, so codes cannot reach guests' phones. Set SMS_PROVIDER on the API first.</Text>
          )}
        </FormControl>
      )}
      {err && <Text color="danger" fontSize="14px" role="alert">{err}</Text>}
      {msg && <Text role="status">{msg}</Text>}
      <Button type="submit" alignSelf="flex-start">Save</Button>
    </Stack>
    {s.features?.ordering && <WebhookSettings />}
    </>
  );
}
