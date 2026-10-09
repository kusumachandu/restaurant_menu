'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, FormControl, FormLabel, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { api, token } from '@/lib/client';

export default function Login() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { token: t } = await api('/auth/login', { method: 'POST', body: form });
      token.set(t);
      router.push('/admin');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box as="main" maxW="420px" mx="auto" pt="12vh" pb="60px" px="clamp(14px, 4vw, 30px)">
      <Heading as="h1" fontSize="32px">Owner login</Heading>
      <Stack as="form" onSubmit={submit} spacing="14px" mt={4}>
        <FormControl isRequired>
          <FormLabel>Email</FormLabel>
          <Input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormControl>
        <FormControl isRequired>
          <FormLabel>Password</FormLabel>
          <Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </FormControl>
        {err && <Text color="danger" fontSize="14px" role="alert">{err}</Text>}
        <Button type="submit" isDisabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </Stack>
    </Box>
  );
}
