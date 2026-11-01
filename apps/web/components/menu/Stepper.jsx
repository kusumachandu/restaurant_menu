'use client';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { C, FONT } from './ui';

/** Add button that turns into a − qty + stepper once the dish is in the cart. */
export default function Stepper({ qty, name, onAdd, onRemove, size = 'md' }) {
  const h = size === 'lg' ? '48px' : '38px';
  if (!qty) {
    return (
      <Button
        onClick={(e) => { e.stopPropagation(); onAdd(); }} aria-label={`Add ${name}`}
        h={h} px={size === 'lg' ? 8 : 5} bg={C.gold} color="#1a1209" fontFamily={FONT.sans} fontWeight={700} letterSpacing=".06em" fontSize="13px" textTransform="uppercase"
        _hover={{ bg: C.goldSoft }} _active={{ bg: C.goldSoft, transform: 'scale(.97)' }}
      >
        Add +
      </Button>
    );
  }
  const btn = { variant: 'unstyled', display: 'grid', placeItems: 'center', minW: h, h, color: C.gold, fontSize: '20px', _hover: { color: C.goldSoft } };
  return (
    <Flex align="center" h={h} border="1px solid" borderColor={C.gold} borderRadius="99px" onClick={(e) => e.stopPropagation()}>
      <Button {...btn} aria-label={`Remove one ${name}`} onClick={onRemove}>−</Button>
      <Text minW="22px" textAlign="center" fontWeight={700} color={C.ivory} fontFamily={FONT.sans}>{qty}</Text>
      <Button {...btn} aria-label={`Add one ${name}`} onClick={onAdd}>+</Button>
    </Flex>
  );
}

export function VegMark({ veg }) {
  return (
    <Box
      title={veg ? 'Vegetarian' : 'Non-vegetarian'} flex="none" w="14px" h="14px" border="1.5px solid" borderRadius="3px" position="relative"
      color={veg ? C.veg : C.nonveg}
      _after={{ content: '""', position: 'absolute', inset: '2.5px', borderRadius: '50%', bg: 'currentColor' }}
    />
  );
}
