'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Flex, FormControl, FormLabel, Input, Stack, Text } from '@chakra-ui/react';
import { api, role, token } from '@/lib/client';
import { useAdminTheme } from '@/components/admin/shell/AdminShell';
import { C, FONT } from '@/components/menu/ui';

export default function Login() {
  useAdminTheme();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { token: t, role: r } = await api('/auth/login', { method: 'POST', body: form });
      token.set(t);
      role.set(r);
      router.push(r === 'super' ? '/super' : '/admin');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Flex as="main" minH="100vh" align="center" justify="center" px="16px" py="40px" fontFamily="body">
      <Box w="100%" maxW="420px">
        <Flex direction="column" align="center" textAlign="center" mb="26px">
          <Flex w="54px" h="54px" borderRadius="16px" align="center" justify="center" color="#1a1209" fontSize="24px" aria-hidden="true"
            bg={`linear-gradient(135deg, ${C.goldSoft}, ${C.gold} 55%, ${C.ember})`} boxShadow="0 14px 34px -10px rgba(212,168,75,.75), inset 0 1px 0 rgba(255,255,255,.35)">✦</Flex>
          <Text as="h1" fontFamily={FONT.display} fontWeight={700} fontSize="40px" lineHeight={1.05} mt="18px">Welcome back</Text>
          <Text color="mute" fontSize="14.5px" mt="8px">Sign in to manage your menu, orders and guests.</Text>
        </Flex>
        <Box bg="linear-gradient(150deg, rgba(31,23,17,.94), rgba(18,13,10,.94))" border="1px solid" borderColor="line" borderRadius="24px" p={{ base: '22px', md: '28px' }} boxShadow="0 30px 60px -30px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,244,214,.05)">
          <Stack as="form" onSubmit={submit} spacing="16px">
            <FormControl isRequired>
              <FormLabel>Email</FormLabel>
              <Input type="email" autoComplete="username" h="48px" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Password</FormLabel>
              <Input type="password" autoComplete="current-password" h="48px" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </FormControl>
            {err && <Text color="danger" fontSize="14px" role="alert">{err}</Text>}
            <Button type="submit" isDisabled={busy} h="50px" mt="4px" color="#1a1209" bg={`linear-gradient(135deg, ${C.goldSoft}, ${C.gold})`} boxShadow="0 12px 26px -10px rgba(212,168,75,.8)" _hover={{ bg: `linear-gradient(135deg, ${C.goldSoft}, ${C.gold})`, filter: 'brightness(1.06)' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Flex>
  );
}
