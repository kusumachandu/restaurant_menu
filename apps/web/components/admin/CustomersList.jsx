'use client';
import { useEffect, useState } from 'react';
import { Badge, Box, Button, Flex, Heading, Text } from '@chakra-ui/react';
import { api, token } from '@/lib/client';

const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Guests who verified their mobile number, one row per number.
export default function CustomersList() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { api('/admin/customers').then(setList).catch((e) => setErr(e.message)); }, []);

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

  if (!list) return <Text>{err || 'Loading…'}</Text>;
  return (
    <Box>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb={3}>
        <Heading as="h2" fontSize="24px">{list.length} guest{list.length === 1 ? '' : 's'}</Heading>
        <Button variant="outline" onClick={download} isDisabled={!list.length}>Download CSV</Button>
      </Flex>
      {err && <Text color="danger" fontSize="14px" role="alert">{err}</Text>}
      {!list.length && <Text color="mute" py="30px">No guests yet. Turn on "Ask guests to verify their mobile number" in Restaurant settings; guests who check in at a table appear here.</Text>}
      {list.map((c) => (
        <Flex key={c._id} justify="space-between" align="center" gap={3} py={3} borderTop="1px dashed" borderColor="line" wrap="wrap">
          <Box>
            <Text as="b">{c.phone}</Text>
            {!c.verified && <Badge ml={2} verticalAlign="middle" title="Given by another guest at the table; not checked by SMS">Not verified</Badge>}
            <Text fontSize="13px" color="mute">Last visit {when(c.lastVisitAt)} · {c.lastTable} · {c.lastGuests} {c.lastGuests === 1 ? 'person' : 'people'}</Text>
          </Box>
          <Text color="mute" fontSize="14px">{c.visits} visit{c.visits === 1 ? '' : 's'}</Text>
        </Flex>
      ))}
    </Box>
  );
}
