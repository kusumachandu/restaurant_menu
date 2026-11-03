'use client';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Button, Flex, FormControl, FormHelperText, FormLabel, Heading, Input, Switch, Text } from '@chakra-ui/react';
import { api } from '@/lib/client';

const EVENTS = [
  ['customer.checked_in', 'a guest verified their number at a table'],
  ['order.placed', 'a guest placed an order'],
  ['order.status_changed', 'the kitchen started or served an order'],
  ['order.cancelled', 'an order was cancelled'],
  ['table.closed', 'a table was paid and closed'],
];
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const TONE = { sent: 'green', pending: 'yellow', failed: 'red' };

// A small section like a call-centre's "callback URL": the restaurant enters an address and we POST events to it.
export default function WebhookSettings() {
  const [hook, setHook] = useState(null);
  const [events, setEvents] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const loadEvents = useCallback(() => api('/admin/webhook/events').then(setEvents).catch(() => {}), []);
  useEffect(() => {
    api('/admin/webhook').then(setHook).catch((e) => setErr(e.message));
    loadEvents();
    const t = setInterval(loadEvents, 8000);
    return () => clearInterval(t);
  }, [loadEvents]);

  async function save(e) {
    e.preventDefault();
    setMsg(''); setErr('');
    try { setHook(await api('/admin/webhook', { method: 'PUT', body: { enabled: hook.enabled, url: hook.url } })); setMsg('Saved.'); }
    catch (e2) { setErr(e2.message); }
  }

  async function test() {
    setMsg(''); setErr(''); setTesting(true);
    try {
      const r = await api('/admin/webhook/test', { method: 'POST' });
      if (r.ok) setMsg(`Your address answered ${r.status}. It works.`); else setErr(r.error || 'The test failed.');
    } catch (e) { setErr(e.message); } finally { setTesting(false); loadEvents(); }
  }

  async function newSecret() {
    if (!confirm('Create a new secret? Your system must be updated with it, or it will reject our requests.')) return;
    try { setHook(await api('/admin/webhook/secret', { method: 'POST' })); setShowSecret(true); } catch (e) { setErr(e.message); }
  }

  async function retry(ev) {
    try { await api(`/admin/webhook/events/${ev._id}/retry`, { method: 'POST' }); loadEvents(); } catch (e) { setErr(e.message); }
  }

  if (!hook) return null;
  return (
    <Box mt={10} pt={6} borderTop="1px solid" borderColor="line">
      <Heading as="h2" fontSize="22px">Webhook</Heading>
      <Text color="mute" fontSize="14px" mt={1}>
        Send guest details and order updates to your own system. We send a JSON message to your address each time one of these happens:
      </Text>
      <Box as="ul" mt={2} pl={5} fontSize="14px" color="mute">
        {EVENTS.map(([k, label]) => <li key={k}><Text as="span" fontFamily="mono" color="inherit">{k}</Text>: {label}</li>)}
      </Box>

      <Box as="form" onSubmit={save} mt={4}>
        <Flex align="center" gap={3} mb={3}>
          <Switch isChecked={hook.enabled} onChange={(e) => setHook({ ...hook, enabled: e.target.checked })} aria-label="Webhook on" />
          <Text>{hook.enabled ? 'On' : 'Off'}</Text>
        </Flex>
        <FormControl>
          <FormLabel>Your webhook address</FormLabel>
          <Input type="url" placeholder="https://your-system.example.com/menu-events" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} />
        </FormControl>
        <FormControl mt={3}>
          <FormLabel>Signing secret</FormLabel>
          <Flex gap={2}>
            <Input readOnly fontFamily="mono" fontSize="13px" type={showSecret ? 'text' : 'password'} value={hook.secret || 'Created when you save'} />
            <Button variant="outline" onClick={() => setShowSecret((s) => !s)}>{showSecret ? 'Hide' : 'Show'}</Button>
            <Button variant="outline" onClick={newSecret} isDisabled={!hook.secret}>New</Button>
          </Flex>
          <FormHelperText>
            Every request has an <Text as="span" fontFamily="mono">X-Webhook-Signature</Text> header: <Text as="span" fontFamily="mono">sha256=</Text> plus the HMAC-SHA256 of <Text as="span" fontFamily="mono">timestamp.body</Text> made with this secret
            (timestamp from <Text as="span" fontFamily="mono">X-Webhook-Timestamp</Text>). Ignore a message whose id you have already seen: failed sends are retried.
          </FormHelperText>
        </FormControl>
        {err && <Text color="danger" fontSize="14px" role="alert" mt={3}>{err}</Text>}
        {msg && <Text role="status" mt={3}>{msg}</Text>}
        <Flex gap={2} mt={4}>
          <Button type="submit">Save</Button>
          <Button variant="outline" onClick={test} isLoading={testing} isDisabled={!hook.url}>Send test</Button>
        </Flex>
      </Box>

      <Heading as="h3" fontSize="16px" mt={8} mb={2}>Recent deliveries</Heading>
      {!events.length && <Text color="mute" fontSize="14px">Nothing sent yet.</Text>}
      {events.map((ev) => (
        <Flex key={ev._id} align="center" justify="space-between" gap={3} py={2} borderTop="1px dashed" borderColor="line" wrap="wrap">
          <Box minW={0}>
            <Text fontFamily="mono" fontSize="13px">{ev.type}</Text>
            <Text fontSize="12px" color="mute">
              {when(ev.createdAt)}{ev.attempts ? ` · ${ev.attempts} ${ev.attempts > 1 ? 'tries' : 'try'}` : ''}{ev.lastStatus ? ` · HTTP ${ev.lastStatus}` : ''}
              {ev.status !== 'sent' && ev.lastError ? ` · ${ev.lastError}` : ''}
            </Text>
          </Box>
          <Flex align="center" gap={2}>
            <Badge colorScheme={TONE[ev.status]}>{ev.status === 'pending' && ev.attempts ? 'retrying' : ev.status}</Badge>
            {ev.status === 'failed' && <Button size="xs" variant="outline" onClick={() => retry(ev)}>Retry</Button>}
          </Flex>
        </Flex>
      ))}
    </Box>
  );
}
