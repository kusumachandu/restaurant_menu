'use client';
import { useEffect, useRef, useState } from 'react';
import { Box, Flex, Input, Text } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { C, FONT } from './ui';

/** Sticky category bar with a gold underline that glides to the section you are reading, plus search and a veg filter. */
export default function CategoryNav({ names, current, onJump, vegOnly, setVegOnly, query, setQuery }) {
  const bar = useRef(null);
  const [searching, setSearching] = useState(false);

  // Keep the active category in view in the sideways-scrolling bar.
  useEffect(() => {
    const el = bar.current?.querySelector('[aria-current="true"]');
    if (!el) return;
    bar.current.scrollTo({ left: el.offsetLeft - bar.current.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [current]);

  const tool = { as: 'button', type: 'button', display: 'inline-flex', alignItems: 'center', gap: '8px', h: '36px', px: '12px', borderRadius: '99px', border: '1px solid', fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase', flex: 'none', transition: 'all .2s' };

  return (
    <Box
      position="sticky" top={0} zIndex={20} bg="rgba(12,8,6,.82)" backdropFilter="blur(16px) saturate(1.4)"
      borderBottom="1px solid" borderColor={C.line} fontFamily={FONT.sans}
    >
      <Flex maxW="1180px" mx="auto" align="center" gap="10px" px="clamp(14px, 4vw, 40px)" py="10px">
        <Flex ref={bar} as="nav" aria-label="Menu categories" flex={1} gap={{ base: '22px', md: '34px' }} overflowX="auto" sx={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          {names.map((n) => {
            const on = n === current;
            return (
              <Box
                as="button" type="button" key={n} flex="none" position="relative" py="10px" onClick={() => onJump(n)} aria-current={on ? 'true' : undefined}
                fontSize="13px" fontWeight={on ? 700 : 500} letterSpacing=".16em" textTransform="uppercase" color={on ? C.goldSoft : C.mute} _hover={{ color: C.ivory }} transition="color .2s"
              >
                {n}
                {on && <Box as={motion.span} layoutId="navline" position="absolute" left={0} right={0} bottom="2px" h="2px" bg={C.gold} borderRadius="2px" />}
              </Box>
            );
          })}
        </Flex>
        <Box
          {...tool} onClick={() => { setSearching((s) => !s); if (searching) setQuery(''); }} aria-label="Search dishes" aria-expanded={searching}
          borderColor={searching || query ? C.gold : C.line} color={searching || query ? C.gold : C.mute} _hover={{ borderColor: C.gold, color: C.gold }}
        >
          <Box as="span" aria-hidden="true" fontSize="18px" lineHeight={1} transform="translateY(-1px)">⌕</Box>
        </Box>
        <Box
          {...tool} onClick={() => setVegOnly(!vegOnly)} aria-pressed={vegOnly}
          borderColor={vegOnly ? C.veg : C.line} color={vegOnly ? C.veg : C.mute} bg={vegOnly ? 'rgba(63,182,118,.12)' : 'transparent'} _hover={{ borderColor: C.veg }}
        >
          <Box w="8px" h="8px" borderRadius="50%" bg={vegOnly ? C.veg : C.mute} />
          <Text as="span" display={{ base: 'none', sm: 'inline' }}>Veg</Text>
        </Box>
      </Flex>
      {searching && (
        <Box maxW="1180px" mx="auto" px="clamp(14px, 4vw, 40px)" pb="12px">
          <Input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu…" aria-label="Search dishes"
            h="44px" borderRadius="99px" bg="rgba(255,255,255,.04)" border="1px solid" borderColor={C.line} color={C.ivory} _placeholder={{ color: C.mute }}
            _hover={{ borderColor: C.line }} _focusVisible={{ borderColor: C.gold, boxShadow: `0 0 0 1px ${C.gold}` }}
          />
        </Box>
      )}
    </Box>
  );
}
