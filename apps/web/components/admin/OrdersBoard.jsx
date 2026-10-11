'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Box, Button, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { api } from '@/lib/client';

const NEXT = { new: ['preparing', 'Start preparing'], preparing: ['served', 'Mark served'] };
const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One entry per table: its orders so far and the running total.
function groupByTable(orders) {
  const groups = new Map();
  for (const o of orders) {
    const key = o.tableId || o.tableLabel;
    if (!groups.has(key)) groups.set(key, { key, tableId: o.tableId, label: o.tableLabel, orders: [] });
    groups.get(key).orders.push(o);
  }
  return [...groups.values()].map((g) => {
    const billable = g.orders.filter((o) => o.status !== 'cancelled');
    return { ...g, billable, total: billable.reduce((n, o) => n + o.total, 0), firstAt: g.orders[0].createdAt };
  }).sort((a, b) => new Date(a.firstAt) - new Date(b.firstAt));
}

// Paid orders from one settle (same table, same paidAt) form one bill; cancelled orders stay separate.
function groupBills(orders) {
  const bills = new Map();
  const cancelled = [];
  for (const o of orders) {
    if (!o.paidAt) { cancelled.push(o); continue; }
    const key = `${o.tableId || o.tableLabel}|${o.paidAt}`;
    if (!bills.has(key)) bills.set(key, { key, label: o.tableLabel, paidAt: o.paidAt, orders: [] });
    bills.get(key).orders.push(o);
  }
  const list = [...bills.values()].map((b) => {
    b.orders.sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));
    return { ...b, billable: b.orders, total: b.orders.reduce((n, o) => n + o.total, 0) };
  });
  return { bills: list.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)), cancelled };
}

// Same dish ordered in several rounds becomes one bill line.
function billLines(orders) {
  const lines = new Map();
  for (const o of orders) {
    for (const i of o.items) {
      const k = `${i.name}|${i.price}`;
      const l = lines.get(k) || { name: i.name, price: i.price, qty: 0 };
      l.qty += i.qty;
      lines.set(k, l);
    }
  }
  return [...lines.values()];
}

function printBill(group, currency, restaurantName) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const rows = billLines(group.billable)
    .map((l) => `<tr><td>${esc(l.name)}</td><td class="r">${l.qty}</td><td class="r">${esc(currency)}${l.price}</td><td class="r">${esc(currency)}${l.qty * l.price}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bill · ${esc(group.label)}</title><style>
    body{font-family:Arial,sans-serif;max-width:380px;margin:20px auto;color:#222}
    h1{font-size:20px;margin:0}p{margin:2px 0;color:#555;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
    th{text-align:left;border-bottom:1px solid #222;padding:4px 0}td{padding:4px 0}.r{text-align:right}
    .total td{border-top:2px solid #222;font-weight:bold;font-size:16px;padding-top:8px}
  </style></head><body><h1>${esc(restaurantName)}</h1><p>${esc(group.label)} · ${(group.paidAt ? new Date(group.paidAt) : new Date()).toLocaleString()}</p>
  <table><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>${rows}
  <tr class="total"><td colspan="3">Total</td><td class="r">${esc(currency)}${group.total}</td></tr></table>
  <p style="margin-top:16px;text-align:center">Thank you!</p></body></html>`);
  w.document.close();
  w.addEventListener('load', () => { w.focus(); w.print(); });
  return true;
}

function OrderRound({ o, currency, onStatus }) {
  return (
    <Box py={2} borderTop="1px dashed" borderColor="line">
      <Flex justify="space-between" align="center" gap={2} wrap="wrap">
        <Text fontSize="14px" color="mute">Ordered at {time(o.createdAt)}</Text>
        <Badge textTransform="capitalize">{o.status}</Badge>
      </Flex>
      <Box as="ul" listStyleType="none" my={1}>
        {o.items.map((i) => (
          <Flex as="li" key={i.dishId || i.name} justify="space-between"><Text>{i.qty} × {i.name}</Text><Text color="mute">{currency}{i.qty * i.price}</Text></Flex>
        ))}
      </Box>
      {o.note && <Text fontSize="14px" color="mute">Note: {o.note}</Text>}
      {NEXT[o.status] && (
        <Flex gap={2} mt={2}>
          <Button size="sm" onClick={() => onStatus(o, NEXT[o.status][0])}>{NEXT[o.status][1]}</Button>
          <Button size="sm" variant="outline" color="danger" onClick={() => confirm('Cancel this order?') && onStatus(o, 'cancelled')}>Cancel</Button>
        </Flex>
      )}
    </Box>
  );
}

export default function OrdersBoard({ currency, restaurantName }) {
  const [scope, setScope] = useState('open');
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState('');

  const load = useCallback(() => api(`/admin/orders?scope=${scope}`).then((list) => {
    setOrders(list); setErr('');
  }).catch((e) => setErr(e.message)), [scope]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const groups = useMemo(() => groupByTable(orders), [orders]);
  const history = useMemo(() => groupBills(orders), [orders]);

  async function setStatus(o, status) {
    try { await api(`/admin/orders/${o._id}`, { method: 'PUT', body: { status } }); load(); } catch (e) { setErr(e.message); }
  }

  async function settle(g) {
    const pending = g.billable.some((o) => o.status !== 'served');
    const msg = `Mark ${g.label} as paid (${currency}${g.total}) and close it?` + (pending ? '\n\nSome orders are not served yet.' : '');
    if (!confirm(msg)) return;
    try { await api(`/admin/tables/${g.tableId}/settle`, { method: 'POST' }); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb="6px">
        <Heading as="h2" fontSize="24px">{scope === 'open' ? `${groups.length} open tables` : `${history.bills.length} paid bills`}</Heading>
        <Flex gap={2}>
          <Button variant={scope === 'open' ? 'pillOn' : 'pill'} onClick={() => setScope('open')}>Open tables</Button>
          <Button variant={scope === 'done' ? 'pillOn' : 'pill'} onClick={() => setScope('done')}>History</Button>
        </Flex>
      </Flex>
      {err && <Text color="danger" fontSize="14px" role="alert">{err}</Text>}
      {!orders.length && !err && <Text color="mute" py="30px">{scope === 'open' ? 'No open tables. New orders appear here automatically.' : 'Nothing yet.'}</Text>}

      {scope === 'open' ? (
        <Stack as="ul" listStyleType="none" p={0} spacing="12px" mt="14px">
          {groups.map((g) => (
            <Box as="li" key={g.key} p="14px" bg="card" border="1px solid" borderColor={g.orders.some((o) => o.status === 'new') ? 'ac' : 'line'} borderRadius="16px">
              <Flex justify="space-between" align="baseline" gap={2} wrap="wrap" mb={1}>
                <Text as="b" fontSize="20px">{g.label}</Text>
                <Text color="mute" fontSize="14px">{g.orders.length} order{g.orders.length > 1 ? 's' : ''} · since {time(g.firstAt)}</Text>
              </Flex>
              {g.orders.map((o) => <OrderRound key={o._id} o={o} currency={currency} onStatus={setStatus} />)}
              <Flex justify="space-between" align="center" gap={2} wrap="wrap" pt={3} borderTop="2px solid" borderColor="line">
                <Text as="b" fontSize="20px">Total {currency}{g.total}</Text>
                <Flex gap={2} wrap="wrap">
                  <Button variant="outline" isDisabled={!g.billable.length} onClick={() => printBill(g, currency, restaurantName) || setErr('Allow pop-ups to print the bill.')}>Print bill</Button>
                  <Button isDisabled={!g.billable.length || !g.tableId} onClick={() => settle(g)}>Mark paid &amp; close</Button>
                </Flex>
              </Flex>
            </Box>
          ))}
        </Stack>
      ) : (
        <Stack as="ul" listStyleType="none" p={0} spacing="12px" mt="14px">
          {history.bills.map((b) => (
            <Box as="li" key={b.key} p="14px" bg="card" border="1px solid" borderColor="line" borderRadius="16px">
              <Flex justify="space-between" align="baseline" gap={2} wrap="wrap" mb={1}>
                <Text as="b" fontSize="20px">{b.label}</Text>
                <Text color="mute" fontSize="14px">Paid {new Date(b.paidAt).toLocaleString()}</Text>
              </Flex>
              {b.orders.map((o) => (
                <Box key={o._id} py={2} borderTop="1px dashed" borderColor="line">
                  <Text fontSize="14px" color="mute">Ordered at {time(o.createdAt)}</Text>
                  {o.items.map((i) => (
                    <Flex key={i.dishId || i.name} justify="space-between"><Text>{i.qty} × {i.name}</Text><Text color="mute">{currency}{i.qty * i.price}</Text></Flex>
                  ))}
                  {o.note && <Text fontSize="14px" color="mute">Note: {o.note}</Text>}
                </Box>
              ))}
              <Flex justify="space-between" align="center" gap={2} wrap="wrap" pt={3} borderTop="2px solid" borderColor="line">
                <Text as="b" fontSize="20px">Total {currency}{b.total}</Text>
                <Button variant="outline" onClick={() => printBill(b, currency, restaurantName) || setErr('Allow pop-ups to print the bill.')}>Reprint bill</Button>
              </Flex>
            </Box>
          ))}
          {history.cancelled.map((o) => (
            <Box as="li" key={o._id} p="12px" bg="card" border="1px solid" borderColor="line" borderRadius="16px" opacity={0.6}>
              <Flex justify="space-between" align="center" gap={2} wrap="wrap">
                <Text as="b">{o.tableLabel} <Text as="span" color="mute" fontSize="14px" fontWeight={400}>· {new Date(o.createdAt).toLocaleString()}</Text></Text>
                <Badge>Cancelled</Badge>
              </Flex>
              <Text fontSize="14px" color="mute">{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</Text>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
