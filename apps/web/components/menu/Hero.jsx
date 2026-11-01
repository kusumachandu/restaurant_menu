'use client';
import { Box, Flex, Heading, Image, Text } from '@chakra-ui/react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { cutUrl, imgUrl } from '@/lib/img';
import { C, EASE, FONT, GRAIN } from './ui';

const MotionBox = motion(Box);

const Chip = ({ children }) => (
  <Text
    as="span" px="14px" py="6px" border="1px solid" borderColor={C.line} borderRadius="99px" fontSize="12px" letterSpacing=".12em"
    textTransform="uppercase" color={C.goldSoft} bg="rgba(255,255,255,.03)" backdropFilter="blur(6px)"
  >
    {children}
  </Text>
);

function Ornament() {
  return (
    <Flex align="center" justify="center" gap="14px" color={C.gold} aria-hidden="true">
      <Box h="1px" w="clamp(30px, 8vw, 70px)" bg={`linear-gradient(90deg, transparent, ${C.gold})`} />
      <Text fontSize="12px" letterSpacing=".4em">✦</Text>
      <Box h="1px" w="clamp(30px, 8vw, 70px)" bg={`linear-gradient(270deg, transparent, ${C.gold})`} />
    </Flex>
  );
}

/** Opening screen: the restaurant's name, one dish floating in a pool of gold light, and a way into the menu. */
export default function Hero({ settings, dish, table, view3d, ar, onExplore }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const lift = useTransform(scrollY, [0, 700], [0, reduce ? 0 : 90]);
  const fade = useTransform(scrollY, [0, 520], [1, reduce ? 1 : 0.15]);
  const fadeUp = (delay) => (reduce ? {} : { initial: { opacity: 0, y: 26 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay, ease: EASE } });

  return (
    <Box
      as="header" position="relative" overflow="hidden" textAlign="center" color={C.ivory}
      minH={{ base: 'min(100svh, 860px)', md: 'min(94vh, 900px)' }} display="flex" flexDirection="column" justifyContent="center"
      px="clamp(18px, 5vw, 48px)" pt="64px" pb="44px"
      bg={`radial-gradient(ellipse 70% 55% at 50% 62%, rgba(212,168,75,.20), transparent 70%), radial-gradient(ellipse 90% 60% at 50% -10%, rgba(224,138,70,.12), transparent 60%), ${C.bg}`}
    >
      <Box position="absolute" inset={0} bgImage={GRAIN} opacity={0.07} pointerEvents="none" aria-hidden="true" />
      <MotionBox style={{ y: lift, opacity: fade }} position="relative" maxW="920px" mx="auto" w="100%">
        <MotionBox {...fadeUp(0.05)}>
          <Ornament />
          <Text mt={4} fontSize="12px" letterSpacing=".42em" textTransform="uppercase" color={C.gold}>Menu</Text>
        </MotionBox>
        <MotionBox {...fadeUp(0.15)}>
          <Heading
            as="h1" mt={3} fontFamily={FONT.display} fontWeight={600} fontSize="clamp(46px, 11.5vw, 124px)" lineHeight={0.95} letterSpacing=".01em"
            bgGradient={`linear(to-b, ${C.ivory} 35%, ${C.goldSoft})`} bgClip="text"
          >
            {settings.name}
          </Heading>
          {settings.tagline && <Text mt={4} mx="auto" maxW="34ch" fontFamily={FONT.display} fontStyle="italic" fontSize="clamp(19px, 3.2vw, 26px)" color={C.mute}>{settings.tagline}</Text>}
        </MotionBox>

        {dish && (
          <MotionBox {...fadeUp(0.3)} position="relative" mx="auto" mt={{ base: 6, md: 8 }} w="min(76vw, 400px)" aspectRatio={1}>
            <Box position="absolute" left="10%" right="10%" bottom="-2%" h="8%" borderRadius="50%" bg="rgba(0,0,0,.7)" filter="blur(18px)" aria-hidden="true" />
            <MotionBox
              w="100%" h="100%" position="relative"
              animate={reduce ? undefined : { y: [0, -14, 0] }} transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Image
                src={dish.cutout ? cutUrl(dish.imageId, 800) : imgUrl(dish.imageId, 800)} alt={dish.name} w="100%" h="100%"
                objectFit={dish.cutout ? 'contain' : 'cover'} borderRadius={dish.cutout ? 0 : '50%'}
                filter="drop-shadow(0 30px 40px rgba(0,0,0,.55))" fetchPriority="high" loading="eager"
              />
            </MotionBox>
          </MotionBox>
        )}

        <MotionBox {...fadeUp(0.45)} mt={{ base: 7, md: 9 }}>
          <Flex wrap="wrap" justify="center" gap="10px">
            {table && <Chip>{table.label}</Chip>}
            {view3d && <Chip>Live 3D dishes</Chip>}
            {ar && <Chip>See it on your table</Chip>}
          </Flex>
          <Box
            as="button" type="button" onClick={onExplore} mt={7} display="inline-flex" flexDirection="column" alignItems="center" gap="8px"
            color={C.gold} fontSize="12px" letterSpacing=".3em" textTransform="uppercase" _hover={{ color: C.goldSoft }}
          >
            Explore the menu
            <MotionBox animate={reduce ? undefined : { y: [0, 7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} fontSize="18px" aria-hidden="true">↓</MotionBox>
          </Box>
        </MotionBox>
      </MotionBox>
    </Box>
  );
}
