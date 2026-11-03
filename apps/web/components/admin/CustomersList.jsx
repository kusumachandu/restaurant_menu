'use client';
import { useEffect, useMemo, useState } from 'react';
import { Box, Flex, Input, Text } from '@chakra-ui/react';
import { api, token } from '@/lib/client';
import { C } from '@/components/menu/ui';
import { Empty } from './charts';

const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const PAGE = 30;
const pill = { px: '16px', py: '8px', borderRadius: '99px', border: '1px solid', borderColor: 'line', fontSize: '13.5px', fontWeight: 600, color: 'ink', _hover: { borderColor: C.lineHi, bg: 'rgba(212,168,75,.08)' } };

// Guests who checked in with a mobile number, one row per number. Search and "show more" keep a long list light.
export default function CustomersList() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);

  useEffect(() => { api('/admin/customers').then(setList).catch((e) => setErr(e.message)); }, []);
  useEffect(() => setShown(PAGE), [q]);

  const found = useMemo(() => {
    if (!list) return [];
    const digits = q.replace(/\D/g, '');
    return digits ? list.filter((c) => c.phone.replace(/\D/g, '').includes(digits)) : list;
  }, [list, q]);

  async function download() {
    try {
      const res = await fetch('/api/admin/customers?format=csv', { headers: { Authorization: `Bearer ${token.get()}` } });
      if (!res.ok) throw new Error('Could not download the list.');
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: 'customers.csv' });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
  }

  if (!list) return <Text color="mute">{err || 'Loading…'}</Text>;
  return (
    <Box>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb="16px">
        <Text fontFamily="heading" fontWeight={700} fontSize="24px">{list.length} guest{list.length === 1 ? '' : 's'}</Text>
        <Flex gap="10px" wrap="wrap" align="center">
          <Input type="search" inputMode="numeric" placeholder="Search by number" aria-label="Search guests by number" w={{ base: '100%', sm: '220px' }} value={q} onChange={(e) => setQ(e.target.value)} isDisabled={!list.length} />
          <Box as="button" type="button" {...pill} onClick={download} disabled={!list.length}>Download CSV</Box>
        </Flex>
      </Flex>
      {err && <Text color="danger" fontSize="14px" role="alert" mb={3}>{err}</Text>}
      {!list.length && <Empty icon="guests">No guests yet. Turn on “Ask guests to verify their mobile number” in Restaurant settings; guests who check in at a table appear here.</Empty>}
      {list.length > 0 && !found.length && <Empty icon="guests">No guest matches that number.</Empty>}
      <Flex as="ul" direction="column" gap="8px" listStyleType="none" p={0} m={0}>
        {found.slice(0, shown).map((c) => (
          <Flex key={c._id} as="li" justify="space-between" align="center" gap={3} p="14px 16px" wrap="wrap" bg="linear-gradient(150deg, rgba(31,23,17,.94), rgba(18,13,10,.94))" border="1px solid" borderColor="line" borderRadius="16px">
            <Flex gap="14px" align="center" minW={0}>
              <Flex flex="none" w="40px" h="40px" borderRadius="12px" align="center" justify="center" bg="rgba(212,168,75,.12)" color={C.gold} fontWeight={700} aria-hidden="true">{c.phone.slice(-2)}</Flex>
              <Box minW={0}>
                <Flex gap="8px" align="center" wrap="wrap">
                  <Text fontWeight={700}>{c.phone}</Text>
                  {!c.verified && <Text fontSize="10.5px" letterSpacing=".12em" textTransform="uppercase" px="8px" py="2px" borderRadius="99px" bg="rgba(165,150,128,.16)" color="mute" title="Given by another guest at the table; not checked by SMS">Not verified</Text>}
                </Flex>
                <Text fontSize="12.5px" color="mute">Last visit {when(c.lastVisitAt)} · {c.lastTable} · {c.lastGuests} {c.lastGuests === 1 ? 'person' : 'people'}</Text>
              </Box>
            </Flex>
            <Text fontSize="12px" fontWeight={700} px="12px" py="4px" borderRadius="99px" bg="rgba(212,168,75,.12)" color={C.goldSoft}>{c.visits} visit{c.visits === 1 ? '' : 's'}</Text>
          </Flex>
        ))}
      </Flex>
      {found.length > shown && (
        <Flex justify="center" mt="18px">
          <Box as="button" type="button" {...pill} onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, found.length - shown)} more · {found.length - shown} left</Box>
        </Flex>
      )}
    </Box>
  );
}
