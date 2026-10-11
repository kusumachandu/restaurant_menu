'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, Flex, Image, Text, Textarea, useDisclosure,
} from '@chakra-ui/react';

const STATUS = {
  new: { label: 'Order received', text: 'Your order has been sent. Waiting for the kitchen to accept it.', color: '#d9a400' },
  preparing: { label: 'Preparing', text: 'The kitchen is preparing this.', color: '#c8561a' },
  served: { label: 'Served', text: 'This has been served. Enjoy your meal!', color: '#1b8a3a' },
  cancelled: { label: 'Cancelled', text: 'This was cancelled. Please ask the staff.', color: '#b3261e' },
};

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
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
  return json;
}

// Cart bar + checkout drawer + live order status for a customer sitting at a table.
export default function OrderPanel({ slug, tableToken, tableLabel, dishes, cart, setCart, currency }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [orders, setOrders] = useState([]); // this table's unpaid orders, oldest first
  const [picked, setPicked] = useState(null); // { orderId, index } of the circle the customer tapped

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
      setOrders(list);
    } catch { /* keep what we have; try again on the next tick */ }
  }, [slug]);

  // Follow all orders for this table, also after a page reload.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
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
      const placed = await call(`/r/${slug}/orders`, { table: tableToken, note, items });
      saved.set(slug, [...saved.get(slug), placed._id]);
      setCart({}); setNote(''); onClose();
      refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const billTotal = orders.filter((o) => o.status !== 'cancelled').reduce((n, o) => n + o.total, 0);
  const chosenOrder = picked && orders.find((o) => o._id === picked.orderId);
  const chosen = chosenOrder?.items[picked.index];
  const chosenStatus = chosenOrder && STATUS[chosenOrder.status];

  // One circle per ordered item; tap a circle to see where that item is.
  const tracking = orders.length > 0 && (
    <Box bg="card" border="1px solid" borderColor="line" borderRadius="16px" p="10px 12px" mb={2}>
      <Flex justify="space-between" align="baseline" mb={2}>
        <Text as="b" fontSize="14px">Your orders · {tableLabel}</Text>
        <Text fontSize="14px" color="mute">So far {currency}{billTotal}</Text>
      </Flex>
      <Flex gap="10px" overflowX="auto" pb="6px" pt="6px">
        {orders.flatMap((o) => o.items.map((i, index) => {
          const st = STATUS[o.status];
          const on = picked?.orderId === o._id && picked.index === index;
          return (
            <Box
              as="button" type="button" key={`${o._id}-${index}`} position="relative" flex="none"
              aria-label={`${i.name}, ${st.label}`} aria-pressed={on}
              onClick={() => setPicked(on ? null : { orderId: o._id, index })}
            >
              {i.imageId
                ? <Image src={`/api/images/${i.imageId}`} alt="" boxSize="52px" borderRadius="50%" objectFit="cover" border="3px solid" borderColor={st.color} />
                : <Box boxSize="52px" borderRadius="50%" bg="line" display="grid" placeItems="center" border="3px solid" borderColor={st.color}>🍽</Box>}
              {i.qty > 1 && (
                <Box position="absolute" top="-4px" right="-4px" bg="ink" color="#fff" borderRadius="99px" minW="20px" h="20px" px="4px" fontSize="12px" lineHeight="20px" textAlign="center">{i.qty}</Box>
              )}
              {on && <Box position="absolute" bottom="-6px" left="50%" transform="translateX(-50%)" w="8px" h="8px" borderRadius="50%" bg={st.color} />}
            </Box>
          );
        }))}
      </Flex>
      {chosen && (
        <Box mt={2} p="8px 10px" borderRadius="12px" bg="line" role="status">
          <Text as="b">{chosen.qty} × {chosen.name}</Text>
          <Text fontSize="14px" color={chosenStatus.color} fontWeight={700}>{chosenStatus.label}</Text>
          <Text fontSize="14px">{chosenStatus.text}</Text>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      <Box position="fixed" left={0} right={0} bottom={0} zIndex={20} px="14px" pb="14px" pointerEvents="none">
        <Box maxW="600px" mx="auto" pointerEvents="auto">
          {tracking}
          {count > 0 && (
            <Button w="100%" onClick={onOpen} justifyContent="space-between" h="52px">
              <span>View cart · {count} item{count > 1 ? 's' : ''}</span>
              <span>{currency}{total}</span>
            </Button>
          )}
        </Box>
      </Box>

      <Drawer isOpen={isOpen} onClose={onClose} placement="bottom">
        <DrawerOverlay />
        <DrawerContent maxW="600px" mx="auto" borderTopRadius="20px" maxH="85vh">
          <DrawerCloseButton />
          <DrawerHeader>Your order · {tableLabel}</DrawerHeader>
          <DrawerBody pb={5}>
            {lines.map((l) => (
              <Flex key={l._id} align="center" justify="space-between" gap={3} py={2} borderBottom="1px solid" borderColor="line">
                <Box flex={1}><Text as="b">{l.name}</Text><Text fontSize="14px" color="mute">{currency}{l.price} each</Text></Box>
                <Flex align="center" gap={2}>
                  <Button size="sm" variant="outline" aria-label={`Remove one ${l.name}`} onClick={() => change(l._id, -1)}>−</Button>
                  <Text minW="20px" textAlign="center">{l.qty}</Text>
                  <Button size="sm" variant="outline" aria-label={`Add one ${l.name}`} onClick={() => change(l._id, 1)}>+</Button>
                </Flex>
                <Text minW="60px" textAlign="right">{currency}{l.qty * l.price}</Text>
              </Flex>
            ))}
            <Textarea mt={3} rows={2} maxLength={200} placeholder="Any request? (less spicy, no onion…)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Flex justify="space-between" mt={3}><Text as="b">Total</Text><Text as="b">{currency}{total}</Text></Flex>
            {err && <Text color="danger" fontSize="14px" role="alert" mt={2}>{err}</Text>}
            <Button w="100%" mt={3} onClick={place} isDisabled={busy || !count}>{busy ? 'Sending…' : 'Place order'}</Button>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
