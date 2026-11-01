'use client';
import { useRef } from 'react';
import { Box, Button, Flex, Heading, Modal, ModalCloseButton, ModalContent, ModalOverlay, Text } from '@chakra-ui/react';
import ArButton from './ArButton';
import Dish3D from './Dish3D';
import Stepper, { VegMark } from './menu/Stepper';
import { C, FONT } from './menu/ui';

/** Full-screen viewer: drag to turn the dish to any angle, pinch or scroll to zoom. */
export default function DishModal({ dish, currency, onClose, qty = null, onAdd, onRemove, ar = false }) {
  const api = useRef(null);

  return (
    <Modal isOpen onClose={onClose} size="full" motionPreset="scale" returnFocusOnClose>
      <ModalOverlay bg="rgba(5,3,2,.9)" backdropFilter="blur(8px)" />
      <ModalContent
        bg={`radial-gradient(ellipse 80% 55% at 50% 38%, rgba(212,168,75,.20), transparent 70%), ${C.bg}`} color={C.ivory} fontFamily={FONT.sans}
        aria-label={dish.name} overflowY="auto" borderRadius={0}
      >
        <ModalCloseButton
          top="max(14px, env(safe-area-inset-top))" right="16px" zIndex={3} w="44px" h="44px" borderRadius="50%" border="1px solid" borderColor={C.line}
          bg="rgba(12,8,6,.6)" color={C.ivory} aria-label="Close" _hover={{ borderColor: C.gold, bg: 'rgba(12,8,6,.8)' }} _focusVisible={{ boxShadow: `0 0 0 2px ${C.gold}` }}
        />
        <Flex direction={{ base: 'column', lg: 'row' }} align="center" justify="center" gap={{ base: 2, lg: '56px' }} maxW="1180px" w="100%" mx="auto" minH="100dvh" px={{ base: '18px', lg: '48px' }} pt={{ base: '64px', lg: '40px' }} pb="30px">
          <Box w={{ base: 'min(100%, 52vh, 460px)', lg: 'min(52vw, 82vh, 620px)' }} flex="none">
            <Dish3D dish={dish} currency={currency} look={dish.look} mode="viewer" apiRef={api} width="100%" />
            <Text textAlign="center" mt={1} fontSize="12px" letterSpacing=".2em" textTransform="uppercase" color={C.mute}>Drag to tilt · pinch to zoom</Text>
          </Box>

          <Flex direction="column" flex={1} maxW="520px" w="100%" textAlign={{ base: 'center', lg: 'left' }} align={{ base: 'center', lg: 'flex-start' }}>
            <Flex align="center" gap={2}>
              <VegMark veg={dish.veg} />
              <Text fontSize="12px" letterSpacing=".28em" textTransform="uppercase" color={C.gold}>{dish.special ? '★ Signature · ' : ''}{dish.category}</Text>
            </Flex>
            <Heading as="h2" mt={3} fontFamily={FONT.display} fontWeight={600} fontSize="clamp(38px, 6vw, 64px)" lineHeight={1} color={C.ivory}>{dish.name}</Heading>
            {dish.description && <Text mt={4} fontSize="16px" lineHeight={1.7} color={C.mute} maxW="46ch">{dish.description}</Text>}
            <Text mt={5} fontFamily={FONT.display} fontWeight={700} fontSize="44px" color={C.goldSoft} lineHeight={1}>{currency}{dish.price}</Text>

            <Flex mt={6} gap="12px" wrap="wrap" justify={{ base: 'center', lg: 'flex-start' }} align="center">
              {qty !== null && <Stepper qty={qty} name={dish.name} onAdd={onAdd} onRemove={onRemove} size="lg" />}
              <Button
                variant="unstyled" h="48px" px={6} border="1px solid" borderColor={C.line} borderRadius="99px" color={C.ivory} fontSize="13px" letterSpacing=".1em" textTransform="uppercase"
                _hover={{ borderColor: C.gold, color: C.goldSoft }} onClick={() => api.current?.reset()}
              >
                Reset view
              </Button>
            </Flex>
            {ar && (dish.modelId || dish.imageId) && <Box mt={4} w="100%" maxW="360px"><ArButton dish={dish} /></Box>}
          </Flex>
        </Flex>
      </ModalContent>
    </Modal>
  );
}
