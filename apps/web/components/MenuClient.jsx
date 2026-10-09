'use client';
import { useCallback, useMemo, useState } from 'react';
import { Badge, Box, Button, Checkbox, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';
import Dish3D from './Dish3D';
import DishModal from './DishModal';

function DishCard({ dish, currency, onOpen }) {
  return (
    <Flex as="article" direction="column" bg="card" border="1px solid" borderColor="line" borderRadius="24px" p="14px 14px 18px">
      <Dish3D dish={dish} currency={currency} look={dish.look} onOpen={onOpen} />
      <Flex gap={2} align="center" mt={3} mx={1}>
        <Box
          title={dish.veg ? 'Vegetarian' : 'Non-vegetarian'}
          w="14px" h="14px" border="2px solid" borderRadius="3px" position="relative"
          color={dish.veg ? '#1b8a3a' : '#b3261e'}
          _after={{ content: '""', position: 'absolute', inset: '2px', borderRadius: '50%', bg: 'currentColor' }}
        />
        {dish.special && <Badge bg="ac" color="#fff" borderRadius="99px" px="10px" py="2px" fontSize="12px" fontWeight={700} textTransform="none">Chef&apos;s special</Badge>}
      </Flex>
      <Heading as="h3" fontSize="21px" m="6px 4px 4px">{dish.name}</Heading>
      <Text color="mute" fontSize="14px" mx={1} flex={1}>{dish.description}</Text>
      <Flex justify="space-between" align="center" mt="14px" mx={1}>
        <Text fontFamily="heading" fontWeight={700} fontSize="22px">{currency}{dish.price}</Text>
        <Button onClick={onOpen}>View in 3D</Button>
      </Flex>
    </Flex>
  );
}

export default function MenuClient({ menu }) {
  const { settings, categories, dishes } = menu;
  const [cat, setCat] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);
  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);
  const shown = useMemo(
    () => dishes.filter((d) => (cat === 'All' || d.category === cat) && (!vegOnly || d.veg)),
    [dishes, cat, vegOnly]
  );

  return (
    <Box as="main" maxW="1100px" mx="auto" pt="36px" pb="60px" px="clamp(14px, 4vw, 40px)">
      <Box as="header">
        <Heading as="h1" fontSize="clamp(34px, 6vw, 58px)" letterSpacing="-.02em">{settings.name}</Heading>
        {settings.tagline && <Text color="mute" mt={2} maxW="52ch">{settings.tagline}</Text>}
        <Text color="mute" mt={2} maxW="52ch" fontSize="14px">Tap a dish to explore it in 3D: turn it, tilt it and zoom in.</Text>
      </Box>

      <Flex wrap="wrap" gap={2} align="center" my={6}>
        {['All', ...categories].map((c) => (
          <Button key={c} variant={cat === c ? 'pillOn' : 'pill'} onClick={() => setCat(c)} aria-pressed={cat === c}>{c}</Button>
        ))}
        <Checkbox ml="auto" isChecked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} colorScheme="orange" sx={{ '.chakra-checkbox__label': { fontSize: '14px' } }}>Veg only</Checkbox>
      </Flex>

      {shown.length === 0 ? (
        <Text color="mute" py="40px">{dishes.length ? 'No dishes match these filters.' : 'The menu is being prepared. Please check back soon.'}</Text>
      ) : (
        <SimpleGrid minChildWidth="270px" spacing="18px">
          {shown.map((d) => <DishCard key={d._id} dish={d} currency={settings.currency} onOpen={() => setOpen(d)} />)}
        </SimpleGrid>
      )}
      {open && <DishModal dish={open} currency={settings.currency} onClose={close} />}
    </Box>
  );
}
