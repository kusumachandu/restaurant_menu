'use client';
import { useRef } from 'react';
import { Button, Flex, Heading, Modal, ModalCloseButton, ModalContent, ModalOverlay, Text } from '@chakra-ui/react';
import Dish3D from './Dish3D';

/** Full-screen viewer: drag to turn the dish to any angle, pinch or scroll to zoom. */
export default function DishModal({ dish, currency, onClose }) {
  const api = useRef(null);

  return (
    <Modal isOpen onClose={onClose} isCentered scrollBehavior="outside" returnFocusOnClose>
      <ModalOverlay />
      <ModalContent maxW="min(560px, calc(100% - 28px))" p="16px 18px 20px" aria-label={dish.name}>
        <ModalCloseButton top="12px" right="12px" zIndex={2} borderRadius="99px" aria-label="Close" />
        <Dish3D dish={dish} currency={currency} look={dish.look} mode="viewer" apiRef={api} width="min(100%, 62vh, 520px)" />
        <Text color="mute" fontSize="14px" textAlign="center">Drag to rotate · pinch or scroll to zoom</Text>
        <Heading as="h3" fontSize="26px" m="6px 4px">{dish.name}</Heading>
        {dish.description && <Text color="mute" mx={1}>{dish.description}</Text>}
        <Flex justify="space-between" align="center" mt="14px" mx={1}>
          <Text fontFamily="heading" fontWeight={700} fontSize="22px">{currency}{dish.price}</Text>
          <Button variant="outline" onClick={() => api.current?.reset()}>Reset view</Button>
        </Flex>
      </ModalContent>
    </Modal>
  );
}
