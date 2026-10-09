'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Flex, Heading, Link } from '@chakra-ui/react';
import { token } from '@/lib/client';
import DishManager from '@/components/admin/DishManager';
import SettingsForm from '@/components/admin/SettingsForm';
import QrCard from '@/components/admin/QrCard';

const TABS = [['dishes', 'Dishes'], ['settings', 'Restaurant'], ['qr', 'QR code']];

export default function Admin() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('dishes');

  useEffect(() => {
    if (!token.get()) router.replace('/admin/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;
  return (
    <Box as="main" maxW="900px" mx="auto" pt="30px" pb="60px" px="clamp(14px, 4vw, 30px)">
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb="6px">
        <Heading as="h1" fontSize="32px">Menu admin</Heading>
        <Flex align="center" gap={3}>
          <Link href="/" isExternal color="ac">View menu</Link>
          <Button variant="outline" onClick={() => { token.clear(); router.push('/admin/login'); }}>Log out</Button>
        </Flex>
      </Flex>
      <Flex wrap="wrap" gap={2} align="center" my={6}>
        {TABS.map(([k, label]) => (
          <Button key={k} variant={tab === k ? 'pillOn' : 'pill'} onClick={() => setTab(k)} aria-pressed={tab === k}>{label}</Button>
        ))}
      </Flex>
      {tab === 'dishes' && <DishManager />}
      {tab === 'settings' && <SettingsForm />}
      {tab === 'qr' && <QrCard />}
    </Box>
  );
}
