'use client';
import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, Flex, Input, Text } from '@chakra-ui/react';
import { C, FONT } from './menu/ui';

async function post(path, body) {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = json.details && Object.values(json.details).flat()[0]; // zod's field messages
    throw new Error(first || json.error || 'Something went wrong. Please try again.');
  }
  return json;
}

const field = {
  h: '52px', bg: 'rgba(255,255,255,.04)', border: '1px solid', borderColor: C.line, borderRadius: '14px', color: C.ivory, fontSize: '16px',
  _placeholder: { color: C.mute }, _hover: { borderColor: C.lineHi }, _focusVisible: { borderColor: C.gold, boxShadow: `0 0 0 1px ${C.gold}` },
};
const label = { fontSize: '11px', letterSpacing: '.18em', textTransform: 'uppercase', color: C.mute, mb: '8px', display: 'block' };

/**
 * Shown to a guest at a table when the restaurant asks for check-in: their mobile number (checked with an SMS code)
 * and how many people are seated. The numbers of the other guests are optional. Orders are linked to the verified number.
 */
export default function CheckIn({ slug, tableToken, tableLabel, restaurantName, onDone }) {
  const [step, setStep] = useState('details'); // details | code
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(2);
  const [others, setOthers] = useState([]);
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [wait, setWait] = useState(0);
  const [dev, setDev] = useState(''); // only when the server has no SMS service (development)

  // The page behind stays put while this is open.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, []);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Only the fields on screen count: lowering the number of people drops the extra numbers.
  const shownOthers = () => Array.from({ length: guests - 1 }, (_, i) => others[i] || '');

  async function sendCode(e) {
    e?.preventDefault();
    setErr('');
    if (phone.replace(/\D/g, '').length < 10) { setErr('Enter your 10-digit mobile number.'); return; }
    const bad = shownOthers().findIndex((o) => o.trim() && o.replace(/\D/g, '').length < 10);
    if (bad >= 0) { setErr(`Guest ${bad + 2}'s number is not complete. Fix it or leave it empty.`); return; }
    if (!consent) { setErr('Please agree to share your details with the restaurant.'); return; }
    setBusy(true);
    try {
      const r = await post(`/r/${slug}/checkin/otp`, { table: tableToken, phone });
      setDev(r.devCode || ''); setWait(r.resendIn || 30); setCode(''); setStep('code');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await post(`/r/${slug}/checkin/verify`, { table: tableToken, phone, code, guests, otherPhones: shownOthers().filter((o) => o.trim()), consent: true });
      onDone({ token: r.token, guests: r.guests, phone: r.phone });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  const stepBtn = (d) => (
    <Box
      as="button" type="button" onClick={() => setGuests((g) => Math.max(1, Math.min(50, g + d)))} aria-label={d > 0 ? 'One more person' : 'One less person'}
      w="46px" h="46px" borderRadius="50%" border="1px solid" borderColor={C.lineHi} color={C.ivory} fontSize="22px" display="grid" placeItems="center" _hover={{ borderColor: C.gold, color: C.gold }}
    >{d > 0 ? '+' : '−'}</Box>
  );

  return (
    <Box position="fixed" inset={0} zIndex={60} bg={C.bg} overflowY="auto" fontFamily={FONT.sans} color={C.ivory} role="dialog" aria-modal="true" aria-label="Check in">
      <Box position="absolute" inset={0} bg="radial-gradient(60% 40% at 50% 0%, rgba(212,168,75,.16), transparent)" pointerEvents="none" />
      <Box position="relative" maxW="460px" mx="auto" px="22px" py="48px" minH="100%">
        <Flex align="center" gap="12px" color={C.gold} aria-hidden="true"><Box h="1px" w="40px" bg={C.gold} /><Text fontSize="12px">✦</Text></Flex>
        <Text mt="18px" fontSize="12px" letterSpacing=".24em" textTransform="uppercase" color={C.gold}>{tableLabel}</Text>
        <Text mt="8px" fontFamily={FONT.display} fontWeight={600} fontSize="42px" lineHeight={1.05}>Welcome to {restaurantName}</Text>
        <Text mt="10px" color={C.mute} fontSize="15px" lineHeight={1.5}>
          {step === 'details' ? 'Tell us a little about your table so we can look after you, then order from your phone.' : `We sent a 6-digit code to ${phone}.`}
        </Text>

        {step === 'details' ? (
          <Box as="form" onSubmit={sendCode} mt="30px">
            <Text {...label} as="label" htmlFor="ci-phone">Your mobile number (required)</Text>
            <Flex gap="10px">
              <Flex align="center" px="16px" h="52px" borderRadius="14px" border="1px solid" borderColor={C.line} color={C.mute} flex="none">+91</Flex>
              <Input id="ci-phone" {...field} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
            </Flex>

            <Text {...label} mt="26px">People seated at your table</Text>
            <Flex align="center" gap="18px">
              {stepBtn(-1)}
              <Text fontFamily={FONT.display} fontWeight={700} fontSize="40px" minW="52px" textAlign="center" lineHeight={1} aria-live="polite">{guests}</Text>
              {stepBtn(1)}
            </Flex>

            {guests > 1 && (
              <Box mt="26px">
                <Text {...label}>Other guests' numbers (optional)</Text>
                {Array.from({ length: guests - 1 }, (_, i) => (
                  <Flex key={i} gap="10px" mb="10px">
                    <Flex align="center" px="14px" h="46px" borderRadius="14px" border="1px solid" borderColor={C.line} color={C.mute} flex="none" fontSize="14px">+91</Flex>
                    <Input
                      {...field} h="46px" type="tel" inputMode="numeric" maxLength={14} placeholder={`Guest ${i + 2}`} aria-label={`Guest ${i + 2} mobile number (optional)`}
                      value={others[i] || ''} onChange={(e) => setOthers((l) => { const next = [...l]; next[i] = e.target.value; return next; })}
                    />
                  </Flex>
                ))}
              </Box>
            )}

            <Checkbox mt="26px" isChecked={consent} onChange={(e) => setConsent(e.target.checked)} alignItems="flex-start" colorScheme="yellow" sx={{ '.chakra-checkbox__control': { mt: '3px', borderColor: C.lineHi } }}>
              <Text fontSize="13px" color={C.mute} lineHeight={1.5}>I agree that {restaurantName} may keep my mobile number and the details of my visit, and contact me about it.</Text>
            </Checkbox>

            {err && <Text mt="16px" fontSize="14px" color={C.nonveg} role="alert">{err}</Text>}
            <Button type="submit" isLoading={busy} w="100%" h="56px" mt="24px" bg={C.gold} color="#1a1209" fontWeight={700} letterSpacing=".1em" fontSize="13px" textTransform="uppercase" borderRadius="99px" _hover={{ bg: C.goldSoft }}>
              Send code
            </Button>
          </Box>
        ) : (
          <Box as="form" onSubmit={verify} mt="30px">
            <Text {...label} as="label" htmlFor="ci-code">Enter the code</Text>
            <Input
              id="ci-code" {...field} h="60px" fontSize="28px" letterSpacing=".5em" textAlign="center" fontFamily={FONT.display} type="text" inputMode="numeric" autoComplete="one-time-code"
              maxLength={6} placeholder="······" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus
            />
            {dev && <Text mt="10px" fontSize="12px" color={C.ember}>Development: SMS is not connected, so your code is {dev}.</Text>}
            {err && <Text mt="16px" fontSize="14px" color={C.nonveg} role="alert">{err}</Text>}
            <Button type="submit" isLoading={busy} isDisabled={code.length !== 6} w="100%" h="56px" mt="22px" bg={C.gold} color="#1a1209" fontWeight={700} letterSpacing=".1em" fontSize="13px" textTransform="uppercase" borderRadius="99px" _hover={{ bg: C.goldSoft }}>
              Verify &amp; continue
            </Button>
            <Flex justify="space-between" mt="18px" fontSize="14px">
              <Button variant="unstyled" h="auto" fontWeight={500} fontSize="14px" color={C.mute} onClick={() => { setStep('details'); setErr(''); }}>Change number</Button>
              <Button variant="unstyled" h="auto" fontWeight={500} fontSize="14px" color={wait > 0 ? C.mute : C.goldSoft} isDisabled={wait > 0 || busy} onClick={() => sendCode()}>
                {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
              </Button>
            </Flex>
          </Box>
        )}
      </Box>
    </Box>
  );
}
