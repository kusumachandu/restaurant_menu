'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Checkbox, Flex, Heading, Image, Input, Stack, Text } from '@chakra-ui/react';
import QRCode from 'qrcode';
import { api } from '@/lib/client';

const tableUrl = (slug, t) => `${window.location.origin}/r/${slug}?t=${t.token}`;
const qrPng = (slug, t) => QRCode.toDataURL(tableUrl(slug, t), { width: 640, margin: 2, errorCorrectionLevel: 'M' });

export default function TablesManager({ slug }) {
  const [data, setData] = useState({ limit: 0, tables: [] });
  const [qrs, setQrs] = useState({});
  const [err, setErr] = useState('');

  const load = useCallback(() => api('/admin/tables').then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let live = true;
    Promise.all(data.tables.map(async (t) => [t.token, await qrPng(slug, t)]))
      .then((pairs) => live && setQrs(Object.fromEntries(pairs))).catch(() => {});
    return () => { live = false; };
  }, [data.tables, slug]);

  async function run(fn) {
    setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message); }
  }

  const rename = (t, label) => label.trim() && label !== t.label && run(() => api(`/admin/tables/${t._id}`, { method: 'PUT', body: { label } }));

  function regenerate(t) {
    if (confirm(`Make a new QR code for "${t.label}"? The printed one will stop working.`)) {
      run(() => api(`/admin/tables/${t._id}/regenerate`, { method: 'POST' }));
    }
  }

  function remove(t) {
    if (confirm(`Delete "${t.label}"? Its QR code will stop working.`)) run(() => api(`/admin/tables/${t._id}`, { method: 'DELETE' }));
  }

  // Opens a printable sheet with one QR per table; choose "Save as PDF" or print.
  function printAll() {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const w = window.open('', '_blank');
    if (!w) { setErr('Allow pop-ups to print the QR codes.'); return; }
    const cards = data.tables.filter((t) => t.active && qrs[t.token])
      .map((t) => `<div class="c"><h2>${esc(t.label)}</h2><img src="${qrs[t.token]}" alt=""><p>Scan to see the menu and order</p></div>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Table QR codes</title><style>
      body{font-family:Arial,sans-serif;margin:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
      .c{border:2px solid #222;border-radius:12px;padding:16px;text-align:center;break-inside:avoid}
      h2{margin:0 0 8px}img{width:100%;max-width:280px}p{margin:8px 0 0;color:#444}
    </style></head><body>${cards}</body></html>`);
    w.document.close();
    w.addEventListener('load', () => { w.focus(); w.print(); });
  }

  const used = data.tables.length;
  return (
    <Box>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb="6px">
        <Heading as="h2" fontSize="24px">{used} / {data.limit} tables</Heading>
        <Flex gap={2} wrap="wrap">
          <Button variant="outline" onClick={printAll} isDisabled={!used}>Print all QR codes</Button>
          <Button onClick={() => run(() => api('/admin/tables', { method: 'POST', body: {} }))} isDisabled={used >= data.limit}>+ Add table</Button>
        </Flex>
      </Flex>
      <Text color="mute" fontSize="14px">Each table has its own QR code. Customers scan it to order from that table. Need more tables? Contact us.</Text>
      {err && <Text color="danger" fontSize="14px" role="alert" mt={2}>{err}</Text>}
      <Stack as="ul" listStyleType="none" p={0} spacing="10px" mt="14px">
        {data.tables.map((t) => (
          <Flex
            as="li" key={t._id} gap={3} align="center" wrap="wrap" p="10px"
            bg="card" border="1px solid" borderColor="line" borderRadius="16px" opacity={t.active ? 1 : 0.55}
          >
            {qrs[t.token] ? <Image src={qrs[t.token]} alt={`QR code for ${t.label}`} boxSize="84px" bg="#fff" borderRadius="8px" /> : <Box boxSize="84px" />}
            <Input
              key={t.label} defaultValue={t.label} maxLength={40} maxW="200px" aria-label="Table name"
              onBlur={(e) => rename(t, e.target.value)}
            />
            <Checkbox colorScheme="orange" isChecked={t.active} onChange={(e) => run(() => api(`/admin/tables/${t._id}`, { method: 'PUT', body: { active: e.target.checked } }))}>
              Taking orders
            </Checkbox>
            <Flex gap={2} wrap="wrap" ml="auto">
              {qrs[t.token] && <Button as="a" variant="outline" href={qrs[t.token]} download={`${t.label.replace(/\W+/g, '-')}-qr.png`}>Download QR</Button>}
              <Button as="a" variant="outline" href={tableUrl(slug, t)} target="_blank" rel="noreferrer">Open menu</Button>
              <Button variant="outline" onClick={() => regenerate(t)}>New QR</Button>
              <Button variant="outline" color="danger" onClick={() => remove(t)}>Delete</Button>
            </Flex>
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}
