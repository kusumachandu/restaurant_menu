'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import OrderTracker from './menu/OrderTracker';
import { C, FONT } from './menu/ui';
import {
  Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, Flex, Text, Textarea, useDisclosure,
} from '@chakra-ui/react';

const saved = {
  key: (slug) => `menu3d_orders_${slug}`,
  get(slug) { try { return JSON.parse(localStorage.getItem(this.key(slug)) || '[]'); } catch { return []; } },
  set(slug, ids) { try { localStorage.setItem(this.key(slug), JSON.stringify(ids)); } catch { /* storage unavailable */ } },
};

async function call(path, body) {
  const res = await fetch(`/api${path}`, body && {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || 'Something went wrong. Please try again.'), { code: json.code });
  return json;
}

// Cart bar + checkout drawer + live order tracker for a customer sitting at a table.
export default function OrderPanel({ slug, tableToken, tableLabel, dishes, cart, setCart, currency, sessionToken, onSessionEnded }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [orders, setOrders] = useState([]); // this table's unpaid orders, oldest first
  const [openNonce, setOpenNonce] = useState(0); // bumped after an order is placed, to open the tracker

  const lines = useMemo(
    () => dishes.filter((d) => cart[d._id]).map((d) => ({ ...d, qty: cart[d._id] })),
    [dishes, cart]
  );
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((n, l) => n + l.qty * l.price, 0);

  const refresh = useCallback(async () => {
    const ids = saved.get(slug);
    if (!ids.length) { setOrders([]); return; }
    try {
      const list = await call(`/r/${slug}/orders?ids=${ids.join(',')}`);
      saved.set(slug, list.map((o) => o._id)); // forget orders that were paid
      const at = Date.now(); // lets the tracker count the cancel grace period down between refreshes
      setOrders(list.map((o) => ({ ...o, fetchedAt: at })));
    } catch { /* keep what we have; try again on the next tick */ }
  }, [slug]);

  const sendOrderNow = useCallback(async (id) => {
    try { await call(`/r/${slug}/orders/${id}/send`, {}); } finally { await refresh(); }
  }, [slug, refresh]);

  // Throws the server's reason (for example "already sent to the kitchen") for the tracker to show.
  const cancelOrder = useCallback(async (id) => {
    try { await call(`/r/${slug}/orders/${id}/cancel`, {}); } finally { await refresh(); }
  }, [slug, refresh]);

  // Follow all orders for this table, also after a page reload.
  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 4000);
    const onShow = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [refresh]);

  const change = (id, delta) => setCart((c) => {
    const qty = Math.max(0, Math.min(20, (c[id] || 0) + delta));
    const next = { ...c };
    if (qty) next[id] = qty; else delete next[id];
    return next;
  });

  async function place() {
    setBusy(true); setErr('');
    try {
      const items = lines.map((l) => ({ dishId: l._id, qty: l.qty }));
      const placed = await call(`/r/${slug}/orders`, { table: tableToken, note, items, session: sessionToken });
      saved.set(slug, [...saved.get(slug), placed._id]);
      setCart({}); setNote(''); onClose();
      await refresh();
      setOpenNonce((n) => n + 1);
    } catch (e) {
      // The table was paid (or the check-in is no longer valid): the guest verifies again, and their cart is kept.
      if (e.code === 'checkin') { onClose(); onSessionEnded?.(); } else setErr(e.message);
    } finally { setBusy(false); }
  }

  return (
    <>
      <Box position="fixed" left={0} right={0} bottom={0} zIndex={20} px="14px" pb="14px" pointerEvents="none">
        <Box maxW="600px" mx="auto" pointerEvents="auto">
          {count > 0 && (
            <Button
              w="100%" onClick={onOpen} justifyContent="space-between" h="58px" px={7} fontSize="14px" fontFamily={FONT.sans} fontWeight={700} letterSpacing=".08em" textTransform="uppercase"
              bg={C.gold} color="#1a1209" _hover={{ bg: C.goldSoft }} _active={{ bg: C.goldSoft }}
              boxShadow="0 18px 40px -10px rgba(212,168,75,.55)"
            >
              <span>View cart · {count} item{count > 1 ? 's' : ''}</span>
              <span>{currency}{total}</span>
            </Button>
          )}
        </Box>
      </Box>

      <OrderTracker
        orders={orders} tableLabel={tableLabel} currency={currency} raised={count > 0} hidden={isOpen} openNonce={openNonce} onCancel={cancelOrder} onSend={sendOrderNow}
        onOrderMore={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      <Drawer isOpen={isOpen} onClose={onClose} placement="bottom">
        <DrawerOverlay bg="rgba(5,3,2,.78)" backdropFilter="blur(4px)" />
        <DrawerContent maxW="600px" mx="auto" borderTopRadius="28px" maxH="88vh" bg={C.panel} color={C.ivory} border="1px solid" borderColor={C.line} fontFamily={FONT.sans}>
          <DrawerCloseButton color={C.ivory} />
          <DrawerHeader fontFamily={FONT.display} fontWeight={600} fontSize="30px">Your order · {tableLabel}</DrawerHeader>
          <DrawerBody pb={5}>
            {lines.map((l) => (
              <Flex key={l._id} align="center" justify="space-between" gap={3} py={2} borderBottom="1px solid" borderColor={C.line}>
                <Box flex={1}><Text as="b">{l.name}</Text><Text fontSize="14px" color={C.mute}>{currency}{l.price} each</Text></Box>
                <Flex align="center" gap={2}>
                  <Button size="sm" variant="outline" color={C.ivory} borderColor={C.line} aria-label={`Remove one ${l.name}`} onClick={() => change(l._id, -1)}>−</Button>
                  <Text minW="20px" textAlign="center">{l.qty}</Text>
                  <Button size="sm" variant="outline" color={C.ivory} borderColor={C.line} aria-label={`Add one ${l.name}`} onClick={() => change(l._id, 1)}>+</Button>
                </Flex>
                <Text minW="60px" textAlign="right">{currency}{l.qty * l.price}</Text>
              </Flex>
            ))}
            <Textarea mt={3} rows={2} maxLength={200} placeholder="Any request? (less spicy, no onion…)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Flex justify="space-between" mt={3}><Text as="b">Total</Text><Text as="b">{currency}{total}</Text></Flex>
            {err && <Text color="#ff8a80" fontSize="14px" role="alert" mt={2}>{err}</Text>}
            <Button w="100%" mt={4} h="54px" onClick={place} isDisabled={busy || !count} bg={C.gold} color="#1a1209" fontWeight={700} letterSpacing=".08em" textTransform="uppercase" _hover={{ bg: C.goldSoft }}>{busy ? 'Sending…' : 'Place order'}</Button>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
