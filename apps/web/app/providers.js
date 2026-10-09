'use client';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import theme from '@/lib/theme';

export default function Providers({ children }) {
  return (
    <>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ChakraProvider theme={theme}>{children}</ChakraProvider>
    </>
  );
}
