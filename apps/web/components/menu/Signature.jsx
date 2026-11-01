'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { motion, useReducedMotion } from 'framer-motion';
import Dish3D from '../Dish3D';
import Stepper, { VegMark } from './Stepper';
import { C, EASE, FONT } from './ui';

const MotionBox = motion(Box);
const SLIDE = 'clamp(250px, 78vw, 400px)';

/** The kitchen's signature dishes: big live 3D, one centred at a time, swipe or use the arrows. */
export default function Signature({ dishes, currency, view3d, qtyOf, onAdd, onRemove, onOpen }) {
  const reduce = useReducedMotion();
  const track = useRef(null);
  const [now, setNow] = useState(0);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0, gap = Infinity;
    [...el.children].forEach((c, i) => {
      const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid);
      if (d < gap) { gap = d; best = i; }
    });
    setNow(best);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [measure]);

  const go = (i) => {
    const c = track.current?.children[Math.max(0, Math.min(dishes.length - 1, i))];
    c?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  };

  if (!dishes.length) return null;
  const arrow = (dir, label) => (
    <Box
      as="button" type="button" onClick={() => go(now + dir)} aria-label={label}
      display={{ base: 'none', md: 'grid' }} placeItems="center" w="48px" h="48px" borderRadius="50%" border="1px solid" borderColor={C.line}
      color={C.gold} fontSize="20px" opacity={(dir < 0 ? now === 0 : now === dishes.length - 1) ? 0.3 : 1} _hover={{ borderColor: C.gold }}
    >
      {dir < 0 ? '←' : '→'}
    </Box>
  );

  return (
    <Box as="section" aria-label="Signature dishes" pt={{ base: '56px', md: '84px' }} pb="30px" position="relative" overflow="hidden">
      <MotionBox
        initial={reduce ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASE }}
        textAlign="center" px="20px"
      >
        <Text fontSize="12px" letterSpacing=".4em" textTransform="uppercase" color={C.gold}>✦ Chef&apos;s selection ✦</Text>
        <Heading as="h2" mt={3} fontFamily={FONT.display} fontWeight={600} fontSize="clamp(34px, 6vw, 56px)" color={C.ivory}>Signature dishes</Heading>
      </MotionBox>

      <Flex align="center" justify="center" gap={{ md: '8px' }} mt={{ base: 2, md: 4 }}>
        <Box display={{ base: 'none', md: 'block' }}>{arrow(-1, 'Previous dish')}</Box>
        <Flex
          ref={track} gap="clamp(12px, 3vw, 28px)" overflowX="auto" py="26px" w="100%" maxW="1120px"
          px={`calc(50% - ${SLIDE} / 2)`} sx={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
        >
          {dishes.map((d, i) => {
            const on = i === now;
            return (
              <Box
                key={d._id} flex="none" w={SLIDE} scrollSnapAlign="center" textAlign="center"
                transform={on ? 'scale(1)' : 'scale(.8)'} opacity={on ? 1 : 0.4} transition="transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s"
                aria-current={on ? 'true' : undefined}
              >
                {view3d
                  ? <Dish3D dish={d} currency={currency} look={d.look} onOpen={() => onOpen(d)} priority={i < 2} hint={false} />
                  : <Box aspectRatio={1} />}
                <Flex justify="center" align="center" gap={2} mt={2}>
                  <VegMark veg={d.veg} />
                  <Text fontSize="12px" letterSpacing=".28em" textTransform="uppercase" color={C.gold}>{d.category}</Text>
                </Flex>
                <Heading as="h3" mt={2} fontFamily={FONT.display} fontWeight={600} fontSize="clamp(28px, 4vw, 36px)" color={C.ivory}>{d.name}</Heading>
                <Text mt={2} mx="auto" maxW="32ch" fontSize="14px" color={C.mute} noOfLines={2}>{d.description}</Text>
                <Flex justify="center" align="center" gap="18px" mt={4}>
                  <Text fontFamily={FONT.display} fontWeight={700} fontSize="30px" color={C.goldSoft}>{currency}{d.price}</Text>
                  {qtyOf(d._id) !== null && <Stepper qty={qtyOf(d._id)} name={d.name} onAdd={() => onAdd(d._id)} onRemove={() => onRemove(d._id)} />}
                </Flex>
              </Box>
            );
          })}
        </Flex>
        <Box display={{ base: 'none', md: 'block' }}>{arrow(1, 'Next dish')}</Box>
      </Flex>

      {dishes.length > 1 && (
        <Flex justify="center" gap="8px" aria-hidden="true">
          {dishes.map((d, i) => (
            <Box key={d._id} as="button" type="button" tabIndex={-1} onClick={() => go(i)} h="6px" borderRadius="99px" transition="all .3s" w={i === now ? '26px' : '6px'} bg={i === now ? C.gold : C.line} />
          ))}
        </Flex>
      )}
    </Box>
  );
}
