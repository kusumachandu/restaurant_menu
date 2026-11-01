'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, Image, Text } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { C, EASE, FONT } from './ui';

const MotionBox = motion(Box);

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 var(--ring); }
  70% { box-shadow: 0 0 0 12px rgba(0,0,0,0); }
  100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
`;

const AMBER = '#e6b53c';
export const STATUS = {
  new: { short: 'Received', headline: 'Order received', text: 'Sent to the kitchen. Waiting for them to accept it.', color: AMBER, step: 0 },
  preparing: { short: 'Preparing', headline: 'Being prepared', text: 'The kitchen accepted your order and is preparing it now.', color: C.ember, step: 1 },
  served: { short: 'Served', headline: 'Served', text: 'Served to your table. Enjoy your meal!', color: C.veg, step: 2 },
  cancelled: { short: 'Cancelled', headline: 'Cancelled', text: 'This order was cancelled. Please ask the staff.', color: C.nonveg, step: -1 },
};
const STEPS = ['Received', 'Preparing', 'Served'];

const NOTICE = {
  new: 'Order sent. Waiting for the kitchen to accept it.',
  preparing: 'The kitchen accepted your order and is preparing it.',
  served: 'Your order is served. Enjoy your meal!',
  cancelled: 'An order was cancelled. Please ask the staff.',
};

function ago(iso) {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

// Three steps on one line: done steps are filled, the current one pulses. The line runs from the first dot to the last.
function Progress({ status, still }) {
  const at = STATUS[status].step;
  const tone = at === 2 ? C.veg : C.gold;
  return (
    <Box position="relative" mt="14px" mb="4px" aria-label={`Progress: ${STATUS[status].short}`}>
      <Box position="absolute" top="11px" left="16.667%" right="16.667%" h="2px" bg={C.line} borderRadius="2px" overflow="hidden">
        <Box h="100%" bg={tone} w={at <= 0 ? '0%' : at === 1 ? '50%' : '100%'} transition="width .8s cubic-bezier(.2,.8,.2,1)" />
      </Box>
      <Box display="grid" gridTemplateColumns="repeat(3, 1fr)">
        {STEPS.map((label, i) => {
          const done = i < at || at === 2;
          const active = i === at && at < 2;
          return (
            <Flex key={label} direction="column" align="center">
              <Box
                position="relative" zIndex={1} w="24px" h="24px" borderRadius="50%" display="grid" placeItems="center" fontSize="12px" fontWeight={700}
                bg={done ? tone : C.panel} color={done ? '#1a1209' : active ? STATUS[status].color : C.mute}
                border="2px solid" borderColor={done ? tone : active ? STATUS[status].color : C.line}
                style={active ? { '--ring': `${STATUS[status].color}88` } : undefined}
                animation={active && !still ? `${pulse} 1.8s ease-out infinite` : undefined}
              >
                {done ? '✓' : i + 1}
              </Box>
              <Text mt="6px" fontSize="10.5px" letterSpacing=".12em" textTransform="uppercase" color={done || active ? C.ivory : C.mute} fontWeight={active ? 700 : 500}>{label}</Text>
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
}

const Thumb = ({ id, size, ring }) => (
  id
    ? <Image src={`/api/images/${id}?w=96`} alt="" loading="lazy" boxSize={size} borderRadius="50%" objectFit="cover" border="2px solid" borderColor={ring || C.panel} bg={C.panelHi} />
    : <Box boxSize={size} borderRadius="50%" bg={C.panelHi} display="grid" placeItems="center" border="2px solid" borderColor={ring || C.panel} fontSize="14px">🍽</Box>
);

/**
 * Floating order tracker for a guest at a table. Collapsed: the ordered dishes as a small stack of photos in the
 * colour of the current status, with a line of text. Tap: it opens into a card showing each order's progress,
 * the kitchen's message and the dishes. Status changes pop up as a short notice above it.
 */
export default function OrderTracker({ orders, tableLabel, currency, raised, hidden, openNonce, onOrderMore }) {
  const still = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const seen = useRef(null); // id -> status, from the previous refresh
  const noticeTimer = useRef(0);
  const [, tick] = useState(0);

  // Open it right after the guest places an order.
  const firstNonce = useRef(openNonce);
  useEffect(() => { if (openNonce !== firstNonce.current) setOpen(true); }, [openNonce]);

  // Tell the guest when the kitchen moves an order along.
  useEffect(() => {
    const now = new Map(orders.map((o) => [o._id, o.status]));
    const before = seen.current;
    seen.current = now;
    if (!before) return; // first load: nothing has "changed" yet
    let latest = null;
    for (const o of orders) {
      const was = before.get(o._id);
      if (was === undefined && before.size === 0 && orders.length === 1 && o.status === 'new') latest = { status: 'new', key: o._id + o.status };
      if (was !== undefined && was !== o.status) latest = { status: o.status, key: o._id + o.status };
    }
    if (!latest) return;
    setNotice(latest);
    navigator.vibrate?.(latest.status === 'served' ? [60, 40, 60] : 60);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 7000);
  }, [orders]);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Keep "3 min ago" fresh, and let Escape close the card.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(t); window.removeEventListener('keydown', onKey); };
  }, []);

  const live = useMemo(() => orders.filter((o) => o.status !== 'cancelled'), [orders]);
  const items = live.reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0);
  const bill = live.reduce((n, o) => n + o.total, 0);
  const photos = useMemo(() => {
    const seenIds = new Set();
    return live.flatMap((o) => o.items).filter((i) => { const k = i.imageId || i.name; if (seenIds.has(k)) return false; seenIds.add(k); return true; });
  }, [live]);

  if (!orders.length || hidden) return null;

  const allCancelled = live.length === 0;
  const anyPreparing = live.some((o) => o.status === 'preparing');
  const anyNew = live.some((o) => o.status === 'new');
  const headline = allCancelled ? STATUS.cancelled : anyPreparing ? { ...STATUS.preparing, headline: 'Preparing your food' } : anyNew ? { ...STATUS.new, headline: 'Waiting for the kitchen' } : { ...STATUS.served, headline: 'Served · enjoy!' };
  const bottom = raised ? 'calc(14px + 58px + 12px + env(safe-area-inset-bottom))' : 'calc(14px + env(safe-area-inset-bottom))';

  return (
    <>
      {open && <Box position="fixed" inset={0} zIndex={21} onClick={() => setOpen(false)} aria-hidden="true" />}
      <Box position="fixed" left="14px" bottom={bottom} zIndex={22} fontFamily={FONT.sans} color={C.ivory} transition="bottom .3s cubic-bezier(.2,.8,.2,1)" maxW="calc(100vw - 28px)">
        <AnimatePresence>
          {notice && !open && (
            <MotionBox
              key={notice.key} role="status" aria-live="polite"
              initial={still ? false : { opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.4, ease: EASE }}
              mb="10px" p="12px 14px" maxW="300px" borderRadius="18px" border="1px solid" borderColor={STATUS[notice.status].color} bg="rgba(21,16,12,.96)" backdropFilter="blur(12px)"
              boxShadow="0 18px 40px -16px rgba(0,0,0,.9)" cursor="pointer" onClick={() => { setNotice(null); setOpen(true); }}
            >
              <Flex align="center" gap="10px">
                <Box flex="none" w="10px" h="10px" borderRadius="50%" bg={STATUS[notice.status].color} />
                <Text fontSize="13.5px" lineHeight={1.4}>{NOTICE[notice.status]}</Text>
              </Flex>
            </MotionBox>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {!open ? (
            <MotionBox
              key="pill" as="button" type="button" onClick={() => { setOpen(true); setNotice(null); }} aria-expanded="false" aria-label={`${headline.headline}. ${items} items. Open order status`}
              initial={still ? false : { opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.25, ease: EASE }}
              style={{ transformOrigin: 'bottom left' }}
              display="flex" alignItems="center" gap="12px" p="8px 18px 8px 8px" borderRadius="99px" textAlign="left"
              bg="rgba(21,16,12,.94)" backdropFilter="blur(14px)" border="1px solid" borderColor={C.line} boxShadow="0 18px 40px -14px rgba(0,0,0,.9)"
              whileTap={{ scale: 0.97 }}
            >
              <Box
                position="relative" flex="none" borderRadius="99px" p="4px" display="flex" alignItems="center"
                border="2px solid" borderColor={headline.color} style={{ '--ring': `${headline.color}99` }}
                animation={!still && !allCancelled && anyNew + anyPreparing > 0 ? `${pulse} 2s ease-out infinite` : undefined}
              >
                {photos.slice(0, 3).map((p, i) => (
                  <Box key={(p.imageId || p.name) + i} ml={i ? '-16px' : 0} zIndex={3 - i}><Thumb id={p.imageId} size="42px" /></Box>
                ))}
                {photos.length > 3 && (
                  <Box ml="-16px" zIndex={0} boxSize="42px" borderRadius="50%" bg={C.panelHi} border="2px solid" borderColor={C.panel} display="grid" placeItems="center" fontSize="12px" fontWeight={700}>+{photos.length - 3}</Box>
                )}
              </Box>
              <Box minW={0}>
                <Flex align="center" gap="7px">
                  <Box w="8px" h="8px" borderRadius="50%" bg={headline.color} flex="none" />
                  <Text fontSize="14px" fontWeight={700} lineHeight={1.2} whiteSpace="nowrap">{headline.headline}</Text>
                </Flex>
                <Text fontSize="12px" color={C.mute} mt="2px" whiteSpace="nowrap">{items} item{items === 1 ? '' : 's'} · {currency}{bill} · tap for details</Text>
              </Box>
            </MotionBox>
          ) : (
            <MotionBox
              key="card" role="dialog" aria-label={`Your orders at ${tableLabel}`}
              initial={still ? false : { opacity: 0, scale: 0.55, borderRadius: 60 }} animate={{ opacity: 1, scale: 1, borderRadius: 26 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              style={{ transformOrigin: 'bottom left' }}
              w="min(380px, calc(100vw - 28px))" maxH="min(72vh, 620px)" display="flex" flexDirection="column" overflow="hidden"
              bg="rgba(21,16,12,.98)" backdropFilter="blur(16px)" border="1px solid" borderColor={C.lineHi} boxShadow="0 30px 70px -20px rgba(0,0,0,.95)"
            >
              <Flex align="center" justify="space-between" p="16px 16px 10px 20px">
                <Box>
                  <Text fontFamily={FONT.display} fontWeight={600} fontSize="26px" lineHeight={1}>Your orders</Text>
                  <Flex align="center" gap="8px" mt="6px" fontSize="12px" color={C.mute}>
                    <Text as="span">{tableLabel}</Text>
                    <Flex as="span" align="center" gap="5px" color={C.veg}><Box w="7px" h="7px" borderRadius="50%" bg={C.veg} animation={still ? undefined : `${pulse} 1.8s ease-out infinite`} style={{ '--ring': `${C.veg}99` }} />Live</Flex>
                  </Flex>
                </Box>
                <Box as="button" type="button" onClick={() => setOpen(false)} aria-label="Close order status" w="40px" h="40px" borderRadius="50%" border="1px solid" borderColor={C.line} display="grid" placeItems="center" color={C.ivory} fontSize="18px" _hover={{ borderColor: C.gold }}>×</Box>
              </Flex>

              <Box overflowY="auto" px="16px" pb="6px" flex={1}>
                {orders.map((o, n) => {
                  const st = STATUS[o.status];
                  return (
                    <Box key={o._id} mb="12px" p="14px 14px 12px" borderRadius="20px" border="1px solid" borderColor={o.status === 'cancelled' ? 'rgba(226,89,78,.4)' : C.line} bg="rgba(255,255,255,.03)">
                      <Flex align="center" justify="space-between" gap={2}>
                        <Text fontSize="11px" letterSpacing=".18em" textTransform="uppercase" color={C.mute}>Order {n + 1} · {ago(o.createdAt)}</Text>
                        <Text fontSize="11px" fontWeight={700} letterSpacing=".1em" textTransform="uppercase" px="10px" py="3px" borderRadius="99px" color={st.color} border="1px solid" borderColor={st.color}>{st.short}</Text>
                      </Flex>
                      {o.status !== 'cancelled' && <Progress status={o.status} still={still} />}
                      <Text mt="10px" fontSize="14px" fontWeight={700} color={st.color}>{st.headline}</Text>
                      <Text fontSize="13px" color={C.mute} mt="2px" lineHeight={1.45} role="status">{st.text}</Text>
                      <Box mt="12px" pt="10px" borderTop="1px solid" borderColor={C.line}>
                        {o.items.map((i, k) => (
                          <Flex key={k} align="center" gap="12px" py="5px">
                            <Thumb id={i.imageId} size="38px" ring={C.line} />
                            <Text flex={1} fontSize="14px" minW={0} noOfLines={1}>{i.qty} × {i.name}</Text>
                            <Text fontSize="13px" color={C.mute}>{currency}{i.price * i.qty}</Text>
                          </Flex>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              <Flex align="center" justify="space-between" gap="12px" p="12px 16px 16px 20px" borderTop="1px solid" borderColor={C.line}>
                <Box>
                  <Text fontSize="11px" letterSpacing=".16em" textTransform="uppercase" color={C.mute}>So far</Text>
                  <Text fontFamily={FONT.display} fontWeight={700} fontSize="28px" lineHeight={1} color={C.goldSoft}>{currency}{bill}</Text>
                </Box>
                <Button
                  onClick={() => { setOpen(false); onOrderMore?.(); }} h="44px" px={6} bg={C.gold} color="#1a1209" fontWeight={700} letterSpacing=".08em" fontSize="13px" textTransform="uppercase"
                  _hover={{ bg: C.goldSoft }}
                >
                  Order more
                </Button>
              </Flex>
            </MotionBox>
          )}
        </AnimatePresence>
      </Box>
    </>
  );
}
