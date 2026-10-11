import { redirect } from 'next/navigation';
import { Box, Heading, Text } from '@chakra-ui/react';

// Optional: send the bare domain to one restaurant's menu.
export default function Home() {
  if (process.env.DEFAULT_RESTAURANT) redirect(`/r/${process.env.DEFAULT_RESTAURANT}`);
  return (
    <Box as="main" maxW="600px" mx="auto" pt="12vh" px="20px">
      <Heading as="h1" fontSize="32px">Menu3D</Heading>
      <Text color="mute" mt={2}>Scan your table&apos;s QR code to open the menu.</Text>
    </Box>
  );
}
