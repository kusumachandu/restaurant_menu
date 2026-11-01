'use client';
import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import Dish3D from '../Dish3D';
import Stepper, { VegMark } from './Stepper';
import { C, EASE, FONT } from './ui';

const MotionBox = motion(Box);

/** One dish on the menu: a live 3D thumbnail, name, description and price. Tapping it opens the full viewer. */
export default function DishRow({ dish, currency, view3d, qty, onAdd, onRemove, onOpen, priority, index, still }) {
  const motionProps = still ? {} : {
    initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '0px 0px -50px 0px' }, transition: { duration: 0.6, delay: (index % 2) * 0.08, ease: EASE },
  };
  const open = view3d ? onOpen : undefined;

  return (
    <MotionBox
      {...motionProps} role={open ? 'button' : undefined} tabIndex={open ? 0 : undefined} onClick={open}
      onKeyDown={open ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}
      aria-label={open ? `${dish.name}, open in 3D` : undefined}
      display="flex" gap={{ base: '14px', md: '22px' }} alignItems="center" p={{ base: '14px', md: '18px' }} borderRadius="26px" cursor={open ? 'pointer' : 'default'}
      bg={`linear-gradient(145deg, ${C.panelHi}, ${C.panel})`} border="1px solid" borderColor={C.line}
      transition="border-color .3s, transform .3s, box-shadow .3s"
      _hover={open ? { borderColor: C.lineHi, transform: 'translateY(-3px)', boxShadow: '0 24px 50px -28px rgba(212,168,75,.45)' } : undefined}
      _focusVisible={{ outline: `2px solid ${C.gold}`, outlineOffset: '3px' }}
    >
      <Box flex="none" w={{ base: '128px', sm: '156px', md: '184px' }} alignSelf="center">
        {view3d
          ? <Dish3D dish={dish} currency={currency} look={dish.look} priority={priority} hint={false} interactive={false} />
          : <Box aspectRatio={1} />}
      </Box>
      <Flex direction="column" flex={1} minW={0} alignSelf="stretch" justify="center">
        <Flex align="center" gap="8px">
          <VegMark veg={dish.veg} />
          {dish.special && <Text fontSize="11px" letterSpacing=".2em" textTransform="uppercase" color={C.gold}>★ Signature</Text>}
        </Flex>
        <Heading as="h3" mt="4px" fontFamily={FONT.display} fontWeight={600} fontSize={{ base: '24px', md: '28px' }} lineHeight={1.08} color={C.ivory}>{dish.name}</Heading>
        {dish.description && <Text mt="6px" fontFamily={FONT.sans} fontSize="13.5px" lineHeight={1.5} color={C.mute} noOfLines={2}>{dish.description}</Text>}
        <Flex align="center" justify="space-between" gap={3} mt="12px" wrap="wrap">
          <Text fontFamily={FONT.display} fontWeight={700} fontSize="26px" color={C.goldSoft} lineHeight={1}>{currency}{dish.price}</Text>
          {qty !== null && <Stepper qty={qty} name={dish.name} onAdd={onAdd} onRemove={onRemove} />}
        </Flex>
      </Flex>
    </MotionBox>
  );
}
