'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Checkbox, Flex, FormControl, FormLabel, Heading, Image, Input, SimpleGrid, Stack, Text, Textarea,
} from '@chakra-ui/react';
import { api } from '@/lib/client';
import LookEditor from './LookEditor';

const EMPTY = { name: '', description: '', price: '', category: 'Mains', veg: false, special: false, available: true, imageId: null, look: null };

export default function DishManager() {
  const [dishes, setDishes] = useState([]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState('₹');

  const load = useCallback(() => api('/admin/dishes').then(setDishes).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/admin/settings').then((s) => setCurrency(s.currency)).catch(() => {}); }, []);
  const categories = [...new Set(dishes.map((d) => d.category))];

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const body = { ...edit, price: Number(edit.price) };
      if (edit._id) await api(`/admin/dishes/${edit._id}`, { method: 'PUT', body });
      else await api('/admin/dishes', { method: 'POST', body });
      setEdit(null);
      load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setErr('');
    try {
      const { imageId } = await api('/admin/upload', { method: 'POST', form: fd });
      setEdit((d) => ({ ...d, imageId }));
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function toggle(d) {
    await api(`/admin/dishes/${d._id}`, { method: 'PUT', body: { available: !d.available } });
    load();
  }

  async function remove(d) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    await api(`/admin/dishes/${d._id}`, { method: 'DELETE' });
    load();
  }

  // Opens a print-ready menu; choose "Save as PDF" in the print dialog.
  function exportPdf() {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const w = window.open('', '_blank');
    if (!w) { setErr('Allow pop-ups to export the PDF.'); return; }
    const rows = categories.map((cat) => `
      <h2>${esc(cat)}</h2>
      ${dishes.filter((d) => d.category === cat).map((d) => `
        <div class="dish${d.available ? '' : ' off'}">
          ${d.imageId ? `<img src="${location.origin}/api/images/${esc(d.imageId)}" alt="">` : '<div class="ph"></div>'}
          <div class="info">
            <b>${esc(d.name)}</b>${d.veg ? ' <span class="tag">Veg</span>' : ''}${d.special ? ' <span class="tag">Special</span>' : ''}${d.available ? '' : ' <span class="tag">Sold out</span>'}
            ${d.description ? `<p>${esc(d.description)}</p>` : ''}
          </div>
          <div class="price">${esc(currency)}${esc(d.price)}</div>
        </div>`).join('')}`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Menu dishes</title><style>
      body{font-family:Arial,sans-serif;color:#222;margin:24px}
      h1{margin:0 0 4px}h2{border-bottom:2px solid #ddd;padding-bottom:4px;margin:24px 0 8px}
      .dish{display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid #eee;break-inside:avoid}
      .dish img,.ph{width:56px;height:56px;border-radius:8px;object-fit:cover;background:#eee;flex:none}
      .info{flex:1}.info p{margin:2px 0 0;font-size:12px;color:#666}
      .price{font-weight:bold}.off{opacity:.5}
      .tag{font-size:11px;background:#eee;border-radius:4px;padding:1px 5px;margin-left:4px}
    </style></head><body><h1>Dishes</h1><div>${dishes.length} items · ${new Date().toLocaleDateString()}</div>${rows}</body></html>`);
    w.document.close();
    w.addEventListener('load', () => { w.focus(); w.print(); });
  }

  if (edit) {
    return (
      <Stack as="form" onSubmit={save} spacing="14px" mt={4}>
        <Heading as="h2" fontSize="24px">{edit._id ? 'Edit dish' : 'New dish'}</Heading>
        <FormControl isRequired>
          <FormLabel>Name</FormLabel>
          <Input maxLength={120} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
        </FormControl>
        <FormControl>
          <FormLabel>Description</FormLabel>
          <Textarea maxLength={600} rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
        </FormControl>
        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
          <FormControl isRequired>
            <FormLabel>Price</FormLabel>
            <Input type="number" min="0" step="1" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Category</FormLabel>
            <Input list="cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
            <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </FormControl>
        </SimpleGrid>
        <Flex gap="18px" wrap="wrap">
          <Checkbox colorScheme="orange" isChecked={edit.veg} onChange={(e) => setEdit({ ...edit, veg: e.target.checked })}>Vegetarian</Checkbox>
          <Checkbox colorScheme="orange" isChecked={edit.special} onChange={(e) => setEdit({ ...edit, special: e.target.checked })}>Chef&apos;s special</Checkbox>
          <Checkbox colorScheme="orange" isChecked={edit.available} onChange={(e) => setEdit({ ...edit, available: e.target.checked })}>Available today</Checkbox>
        </Flex>
        <FormControl>
          <FormLabel>Photo (best: a top-down photo of the dish)</FormLabel>
          <Input type="file" accept="image/*" onChange={upload} p="7px" />
        </FormControl>
        {edit.imageId && <LookEditor dish={{ ...edit, name: edit.name || 'Dish name', price: edit.price || 0 }} currency={currency} look={edit.look} onChange={(look) => setEdit((d) => ({ ...d, look }))} />}
        {err && <Text color="danger" fontSize="14px" role="alert">{err}</Text>}
        <Flex gap={2} wrap="wrap">
          <Button type="submit" isDisabled={busy}>{busy ? 'Saving…' : 'Save dish'}</Button>
          <Button type="button" variant="outline" onClick={() => { setEdit(null); setErr(''); }}>Cancel</Button>
        </Flex>
      </Stack>
    );
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" gap={3} wrap="wrap" mb="6px">
        <Heading as="h2" fontSize="24px">{dishes.length} dishes</Heading>
        <Flex gap={2} wrap="wrap">
          <Button variant="outline" onClick={exportPdf} isDisabled={!dishes.length}>Export PDF</Button>
          <Button onClick={() => setEdit({ ...EMPTY })}>+ Add dish</Button>
        </Flex>
      </Flex>
      {err && <Text color="danger" fontSize="14px" role="alert">{err}</Text>}
      <Stack as="ul" listStyleType="none" p={0} spacing="10px" mt="14px">
        {dishes.map((d) => (
          <Flex
            as="li" key={d._id} gap={3} align="center" wrap="wrap" p="10px"
            bg="card" border="1px solid" borderColor="line" borderRadius="16px"
            opacity={d.available ? 1 : 0.55}
          >
            {d.imageId
              ? <Image src={`/api/images/${d.imageId}`} alt="" boxSize="56px" borderRadius="50%" objectFit="cover" />
              : <Box boxSize="56px" borderRadius="50%" bg="line" display="grid" placeItems="center">🍽</Box>}
            <Flex direction="column" flex={1} minW="140px">
              <Text as="b">{d.name}</Text>
              <Text as="small" color="mute">{d.category} · {d.price}{d.veg ? ' · Veg' : ''}{d.special ? ' · Special' : ''}</Text>
            </Flex>
            <Flex gap={2} wrap="wrap">
              <Button variant="outline" onClick={() => toggle(d)}>{d.available ? 'Mark sold out' : 'Mark available'}</Button>
              <Button variant="outline" onClick={() => setEdit({ ...EMPTY, ...d })}>Edit</Button>
              <Button variant="outline" color="danger" onClick={() => remove(d)}>Delete</Button>
            </Flex>
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}
