'use client';
import { useEffect, useState } from 'react';
import { Box, Drawer, DrawerContent, DrawerOverlay, Flex, Text, useDisclosure } from '@chakra-ui/react';
import Icon from './Icon';
import { C, FONT } from '@/components/menu/ui';

/** Switches the page to the admin look (see 'body.admin-theme' in lib/theme.js) for as long as it is on screen. */
export function useAdminTheme() {
  useEffect(() => {
    document.body.classList.add('admin-theme');
    return () => document.body.classList.remove('admin-theme');
  }, []);
}

export const Brand = ({ name, sub }) => (
  <Flex align="center" gap="12px" minW={0}>
    <Flex flex="none" w="40px" h="40px" borderRadius="12px" align="center" justify="center" color="#1a1209" fontSize="18px"
      bg={`linear-gradient(135deg, ${C.goldSoft}, ${C.gold} 55%, ${C.ember})`} boxShadow="0 8px 22px -8px rgba(212,168,75,.7), inset 0 1px 0 rgba(255,255,255,.35)" aria-hidden="true">✦</Flex>
    <Box minW={0}>
      <Text fontFamily={FONT.display} fontWeight={700} fontSize="21px" lineHeight={1.05} noOfLines={1} title={name}>{name}</Text>
      {sub && <Text fontSize="11px" letterSpacing=".16em" textTransform="uppercase" color={C.gold} mt="3px" noOfLines={1}>{sub}</Text>}
    </Box>
  </Flex>
);

function NavItem({ item, active, onPick }) {
  return (
    <Box
      as="button" type="button" onClick={() => onPick(item.key)} aria-current={active ? 'page' : undefined}
      position="relative" display="flex" alignItems="center" gap="12px" w="100%" px="14px" py="11px" borderRadius="12px" textAlign="left"
      fontSize="14.5px" fontWeight={active ? 700 : 500} color={active ? C.goldSoft : 'mute'} transition="background .18s, color .18s"
      bg={active ? 'linear-gradient(90deg, rgba(212,168,75,.20), rgba(212,168,75,.05))' : 'transparent'}
      _hover={{ bg: active ? undefined : 'rgba(233,213,176,.06)', color: active ? C.goldSoft : 'ink' }}
    >
      {active && <Box position="absolute" left="0" top="22%" bottom="22%" w="3px" borderRadius="0 3px 3px 0" bg={C.gold} boxShadow={`0 0 12px ${C.gold}`} />}
      <Icon name={item.icon} size={19} />
      <Text as="span" flex={1} noOfLines={1}>{item.label}</Text>
      {item.badge ? <Text as="span" fontSize="11px" fontWeight={700} px="7px" py="1px" borderRadius="99px" bg={C.gold} color="#1a1209">{item.badge}</Text> : null}
    </Box>
  );
}

function SideNav({ brand, groups, active, onPick, links, onLogout }) {
  return (
    <Flex direction="column" h="100%" py="22px" px="14px">
      <Box px="6px" mb="26px"><Brand {...brand} /></Box>
      <Box flex={1} overflowY="auto" as="nav" aria-label="Sections">
        {groups.map((g) => (
          <Box key={g.label} mb="22px">
            <Text px="14px" mb="8px" fontSize="10.5px" letterSpacing=".2em" textTransform="uppercase" color="mute" opacity={0.75}>{g.label}</Text>
            <Flex direction="column" gap="3px">
              {g.items.map((it) => <NavItem key={it.key} item={it} active={active === it.key} onPick={onPick} />)}
            </Flex>
          </Box>
        ))}
      </Box>
      <Box pt="14px" borderTop="1px solid" borderColor="line">
        {links.map((l) => (
          <Box key={l.label} as="a" href={l.href} target="_blank" rel="noreferrer" display="flex" alignItems="center" gap="12px" px="14px" py="10px" borderRadius="12px" fontSize="14px" color="mute" _hover={{ color: 'ink', bg: 'rgba(233,213,176,.06)' }}>
            <Icon name="link" size={17} /><Text as="span">{l.label}</Text>
          </Box>
        ))}
        <Box as="button" type="button" onClick={onLogout} display="flex" alignItems="center" gap="12px" w="100%" px="14px" py="10px" borderRadius="12px" fontSize="14px" color="mute" textAlign="left" _hover={{ color: 'ink', bg: 'rgba(233,213,176,.06)' }}>
          <Icon name="logout" size={17} /><Text as="span">Log out</Text>
        </Box>
      </Box>
    </Flex>
  );
}

/**
 * Frame for every admin screen: a sidebar on large screens, a top bar with a slide-out menu on small ones.
 * `groups` = [{ label, items: [{ key, label, icon, badge? }] }]; the page decides what `active` is.
 */
export default function AdminShell({ brand, groups, active, onSelect, links = [], onLogout, wide = false, children }) {
  useAdminTheme();
  const drawer = useDisclosure();
  const current = groups.flatMap((g) => g.items).find((i) => i.key === active);
  const pick = (k) => { onSelect(k); drawer.onClose(); };
  const nav = <SideNav brand={brand} groups={groups} active={active} onPick={pick} links={links} onLogout={onLogout} />;

  return (
    <Flex minH="100vh" fontFamily="body" color="ink">
      <Box display={{ base: 'none', lg: 'block' }} flex="none" w="264px" position="sticky" top={0} h="100vh" borderRight="1px solid" borderColor="line"
        bg="linear-gradient(180deg, rgba(21,16,12,.92), rgba(12,8,6,.92))" backdropFilter="blur(14px)">
        {nav}
      </Box>

      <Box flex={1} minW={0}>
        <Flex display={{ base: 'flex', lg: 'none' }} position="sticky" top={0} zIndex={20} align="center" gap="12px" px="16px" py="12px" borderBottom="1px solid" borderColor="line"
          bg="rgba(12,8,6,.82)" backdropFilter="blur(14px)">
          <Box as="button" type="button" onClick={drawer.onOpen} aria-label="Open menu" w="40px" h="40px" display="grid" placeItems="center" borderRadius="12px" border="1px solid" borderColor="line" color="ink"><Icon name="menu" size={20} /></Box>
          <Flex align="center" gap="8px" minW={0}>
            <Text fontFamily={FONT.display} fontWeight={700} fontSize="20px" noOfLines={1}>{current?.label || brand.name}</Text>
          </Flex>
          <Text ml="auto" fontSize="11px" letterSpacing=".14em" textTransform="uppercase" color={C.gold} noOfLines={1}>{brand.name}</Text>
        </Flex>

        <Box as="main" maxW={wide ? '1240px' : '1000px'} mx="auto" px={{ base: '14px', md: '28px', xl: '36px' }} pt={{ base: '20px', lg: '34px' }} pb="80px">
          {children}
        </Box>
      </Box>

      <Drawer isOpen={drawer.isOpen} onClose={drawer.onClose} placement="left">
        <DrawerOverlay bg="rgba(5,3,2,.7)" backdropFilter="blur(3px)" />
        <DrawerContent maxW="290px" bg="linear-gradient(180deg, #17110d, #0c0806)" color="ink" borderRight="1px solid" borderColor="line">
          <Box position="absolute" top="14px" right="12px" zIndex={1}>
            <Box as="button" type="button" onClick={drawer.onClose} aria-label="Close menu" w="34px" h="34px" display="grid" placeItems="center" borderRadius="10px" color="mute" _hover={{ color: 'ink' }}><Icon name="close" size={18} /></Box>
          </Box>
          {nav}
        </DrawerContent>
      </Drawer>
    </Flex>
  );
}

/** Title block at the top of a screen. */
export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <Flex justify="space-between" align="flex-end" gap="16px" wrap="wrap" mb={{ base: '18px', md: '26px' }}>
      <Box minW={0}>
        {eyebrow && (
          <Flex align="center" gap="10px" color={C.gold} mb="8px" aria-hidden="true">
            <Box h="1px" w="28px" bg={`linear-gradient(90deg, transparent, ${C.gold})`} />
            <Text fontSize="11px" letterSpacing=".24em" textTransform="uppercase">{eyebrow}</Text>
          </Flex>
        )}
        <Text as="h1" fontFamily={FONT.display} fontWeight={700} fontSize={{ base: '32px', md: '42px' }} lineHeight={1.04} letterSpacing="-.01em">{title}</Text>
        {subtitle && <Text mt="8px" color="mute" fontSize="14.5px" maxW="60ch">{subtitle}</Text>}
      </Box>
      {actions}
    </Flex>
  );
}
