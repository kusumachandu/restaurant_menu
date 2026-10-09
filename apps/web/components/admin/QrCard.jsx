'use client';
import { useEffect, useState } from 'react';
import { Button, FormControl, FormLabel, Heading, Image, Input, Stack, Text } from '@chakra-ui/react';
import QRCode from 'qrcode';

export default function QrCard() {
  const [url, setUrl] = useState('');
  const [png, setPng] = useState('');

  useEffect(() => { setUrl(window.location.origin); }, []);
  useEffect(() => {
    if (url) QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' }).then(setPng).catch(() => setPng(''));
  }, [url]);

  return (
    <Stack spacing="14px" mt={4} align="flex-start">
      <Heading as="h2" fontSize="24px">Table QR code</Heading>
      <FormControl>
        <FormLabel>Menu address (use your live domain)</FormLabel>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} />
      </FormControl>
      {png && <Image src={png} alt="QR code for the menu" w="260px" maxW="100%" borderRadius="12px" bg="#fff" />}
      {png && <Button as="a" href={png} download="menu-qr.png">Download PNG</Button>}
      <Text color="mute" fontSize="14px">Print this on table tents. The code never changes, so you only print it once.</Text>
    </Stack>
  );
}
