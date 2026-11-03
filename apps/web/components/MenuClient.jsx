'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';
import { motion, useReducedMotion } from 'framer-motion';
import CheckIn from './CheckIn';
import DishModal from './DishModal';
import OrderPanel from './OrderPanel';
import CategoryNav from './menu/CategoryNav';
import DishRow from './menu/DishRow';
import Hero from './menu/Hero';
import Signature from './menu/Signature';
import { C, EASE, FONT, GRAIN, slugId } from './menu/ui';

const MotionBox = motion(Box);

export default function MenuClient({ menu, tableToken }) {
  const { settings, categories, dishes } = menu;
  const view3d = menu.features?.view3d !== false;
  const ar = Boolean(menu.features?.ar) && view3d;
  const canOrder = Boolean(menu.table && tableToken);
  const reduce = useReducedMotion();
  const [cart, setCart] = useState({});
  const [active, setActive] = useState(null);
  const [vegOnly, setVegOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);
  const jumping = useRef(0);

  // Restaurants that ask for check-in: the guest verifies a mobile number first. The check-in is remembered on this phone
  // until the table's bill is paid, which ends it on the server.
  const checkInOn = canOrder && Boolean(menu.features?.checkIn);
  const sessionKey = `menu3d_guest_${menu.slug}_${tableToken}`;
  const [guest, setGuest] = useState(null); // { token, guests, phone }
  const [checking, setChecking] = useState(checkInOn);
  useEffect(() => {
    if (!checkInOn) { setChecking(false); return undefined; }
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(sessionKey)); } catch { /* storage unavailable */ }
    if (!stored?.token) { setChecking(false); return undefined; }
    let live = true;
    fetch(`/api/r/${menu.slug}/checkin/session`, { headers: { 'x-guest-token': stored.token } })
      .then((r) => { if (!live) return; if (r.ok) setGuest(stored); else { try { localStorage.removeItem(sessionKey); } catch { /* ignore */ } } })
      .catch(() => { if (live) setGuest(stored); }) // offline: trust it, the server checks again when ordering
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [checkInOn, sessionKey, menu.slug]);
  const checkedIn = (g) => { try { localStorage.setItem(sessionKey, JSON.stringify(g)); } catch { /* ignore */ } setGuest(g); };
  const checkInEnded = useCallback(() => { try { localStorage.removeItem(sessionKey); } catch { /* ignore */ } setGuest(null); }, [sessionKey]);

  // The menu has its own look, whatever the visitor's system theme: paint the whole page, including overscroll.
  useEffect(() => {
    const { documentElement: html, body } = document;
    const before = [html.style.background, body.style.background, html.style.colorScheme];
    html.style.background = C.bg; body.style.background = C.bg; html.style.colorScheme = 'dark';
    return () => { [html.style.background, body.style.background, html.style.colorScheme] = before; };
  }, []);

  const add = (id, delta) => setCart((c) => {
    const qty = Math.max(0, Math.min(20, (c[id] || 0) + delta));
    const next = { ...c };
    if (qty) next[id] = qty; else delete next[id];
    return next;
  });
  const qtyOf = (id) => (canOrder ? cart[id] || 0 : null);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ok = (d) => (!vegOnly || d.veg) && (!q || `${d.name} ${d.description || ''} ${d.category}`.toLowerCase().includes(q));
    return categories.map((c) => ({ name: c, items: dishes.filter((d) => d.category === c && ok(d)) })).filter((s) => s.items.length);
  }, [categories, dishes, vegOnly, query]);

  const withPhoto = useMemo(() => dishes.filter((d) => d.imageId), [dishes]);
  const signature = useMemo(() => {
    const picks = withPhoto.filter((d) => d.special);
    return (picks.length ? picks : withPhoto).slice(0, 6);
  }, [withPhoto]);
  const heroDish = signature[0];

  // Highlight the category whose section is under the sticky bar.
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(slugId(s.name))).filter(Boolean);
    if (!els.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (Date.now() < jumping.current) return;
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.dataset.cat);
    }, { rootMargin: '-110px 0px -62% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  const jump = (name) => {
    setActive(name);
    jumping.current = Date.now() + 900; // do not let the scroll-spy fight the scroll
    document.getElementById(slugId(name))?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const explore = () => document.getElementById('menu')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

  const current = active && sections.some((s) => s.name === active) ? active : sections[0]?.name;
  let rowIndex = 0;

  return (
    <Box as="main" position="relative" bg={C.bg} color={C.ivory} fontFamily={FONT.sans} minH="100vh" pb={canOrder ? '190px' : 0} overflowX="clip">
      <Hero settings={settings} dish={heroDish} table={canOrder ? menu.table : null} ordering={Boolean(menu.features?.ordering)} view3d={view3d} ar={ar} onExplore={explore} />

      {menu.features?.ordering && !canOrder && (
        <Box px="clamp(16px, 4vw, 40px)" mt={{ base: 2, md: 0 }}>
          <MotionBox
            initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE }}
            maxW="640px" mx="auto" display="flex" alignItems="center" gap="16px" p="16px 20px" borderRadius="22px" border="1px solid" borderColor={C.lineHi}
            bg="linear-gradient(135deg, rgba(212,168,75,.14), rgba(212,168,75,.04))" role="note"
          >
            <Box flex="none" w="46px" h="46px" borderRadius="14px" border="1px solid" borderColor={C.gold} display="grid" placeItems="center" color={C.gold} fontSize="22px" aria-hidden="true">▦</Box>
            <Box>
              <Text fontFamily={FONT.display} fontWeight={700} fontSize="22px" lineHeight={1.1} color={C.ivory}>Dining with us?</Text>
              <Text mt="4px" fontSize="14px" color={C.mute}>Scan the QR code on your table to order from your phone and follow your order live.</Text>
            </Box>
          </MotionBox>
        </Box>
      )}

      <Signature dishes={signature} currency={settings.currency} view3d={view3d} qtyOf={qtyOf} onAdd={(id) => add(id, 1)} onRemove={(id) => add(id, -1)} onOpen={setOpen} />

      <Box id="menu" mt={{ base: '30px', md: '50px' }}>
        <CategoryNav
          names={sections.map((s) => s.name)} current={current} onJump={jump}
          vegOnly={vegOnly} setVegOnly={setVegOnly} query={query} setQuery={setQuery}
        />

        <Box maxW="1180px" mx="auto" px="clamp(14px, 4vw, 40px)" pb="30px">
          {sections.length === 0 ? (
            <Text color={C.mute} py="70px" textAlign="center" fontFamily={FONT.display} fontStyle="italic" fontSize="24px">
              {dishes.length ? 'No dishes match your search.' : 'The menu is being prepared. Please check back soon.'}
            </Text>
          ) : sections.map((s, si) => (
            <Box as="section" key={s.name} id={slugId(s.name)} data-cat={s.name} pt={{ base: '54px', md: '76px' }} sx={{ scrollMarginTop: '58px' }}>
              <MotionBox
                initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE }}
                display="flex" alignItems="center" gap={{ base: '14px', md: '24px' }} mb={{ base: '24px', md: '34px' }}
              >
                <Text fontFamily={FONT.display} fontSize={{ base: '20px', md: '26px' }} color={C.gold} fontStyle="italic" aria-hidden="true">{String(si + 1).padStart(2, '0')}</Text>
                <Heading as="h2" fontFamily={FONT.display} fontWeight={600} fontSize={{ base: '36px', md: '54px' }} lineHeight={1} color={C.ivory}>{s.name}</Heading>
                <Box flex={1} h="1px" bg={`linear-gradient(90deg, ${C.lineHi}, transparent)`} />
                <Text fontSize="12px" letterSpacing=".2em" textTransform="uppercase" color={C.mute} whiteSpace="nowrap">{s.items.length} {s.items.length > 1 ? 'dishes' : 'dish'}</Text>
              </MotionBox>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: '14px', md: '20px' }}>
                {s.items.map((d) => {
                  const i = rowIndex++;
                  return (
                    <DishRow
                      key={d._id} dish={d} currency={settings.currency} view3d={view3d} index={i} priority={i < 3} still={reduce}
                      qty={qtyOf(d._id)} onAdd={() => add(d._id, 1)} onRemove={() => add(d._id, -1)} onOpen={() => setOpen(d)}
                    />
                  );
                })}
              </SimpleGrid>
            </Box>
          ))}
        </Box>
      </Box>

      <Box as="footer" textAlign="center" px="20px" pt="80px" pb={{ base: '70px', md: '90px' }} position="relative">
        <Box position="absolute" inset={0} bgImage={GRAIN} opacity={0.05} pointerEvents="none" aria-hidden="true" />
        <Flex align="center" justify="center" gap="14px" color={C.gold} aria-hidden="true">
          <Box h="1px" w="60px" bg={`linear-gradient(90deg, transparent, ${C.gold})`} /><Text fontSize="12px">✦</Text><Box h="1px" w="60px" bg={`linear-gradient(270deg, transparent, ${C.gold})`} />
        </Flex>
        <Heading as="p" mt={5} fontFamily={FONT.display} fontWeight={600} fontSize="32px" color={C.ivory}>{settings.name}</Heading>
        <Text mt={2} fontFamily={FONT.display} fontStyle="italic" fontSize="19px" color={C.mute}>Thank you for dining with us</Text>
      </Box>

      {canOrder && (
        <OrderPanel
          slug={menu.slug} tableToken={tableToken} tableLabel={menu.table.label} dishes={dishes} cart={cart} setCart={setCart} currency={settings.currency}
          sessionToken={guest?.token} onSessionEnded={checkInEnded}
        />
      )}
      {checkInOn && checking && <Box position="fixed" inset={0} zIndex={60} bg={C.bg} aria-hidden="true" />}
      {checkInOn && !checking && !guest && (
        <CheckIn slug={menu.slug} tableToken={tableToken} tableLabel={menu.table.label} restaurantName={settings.name} onDone={checkedIn} />
      )}
      {open && (
        <DishModal
          dish={open} currency={settings.currency} onClose={close} ar={ar} orderHint={Boolean(menu.features?.ordering) && !canOrder}
          qty={qtyOf(open._id)} onAdd={() => add(open._id, 1)} onRemove={() => add(open._id, -1)}
        />
      )}
    </Box>
  );
}
