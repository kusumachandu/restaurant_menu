import { extendTheme } from '@chakra-ui/react';

// Same palette as the old globals.css, switching with the system light/dark setting.
const theme = extendTheme({
  config: { initialColorMode: 'system', useSystemColorMode: true },
  semanticTokens: {
    colors: {
      bg: { default: '#fbf3e6', _dark: '#17110d' },
      card: { default: '#ffffff', _dark: '#241a13' },
      ink: { default: '#2b1d12', _dark: '#f6e8d6' },
      mute: { default: '#7a6452', _dark: '#b79f88' },
      ac: { default: '#c2571a', _dark: '#f08a4b' },
      line: { default: '#ecdcc4', _dark: '#3a2b20' },
      danger: { default: '#b3261e', _dark: '#ff8a80' },
    },
  },
  fonts: {
    heading: 'Georgia, serif',
    body: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  },
  styles: {
    global: {
      body: {
        bg: 'bg',
        color: 'ink',
        lineHeight: 1.5,
        pt: 'env(safe-area-inset-top)',
        pb: 'env(safe-area-inset-bottom)',
      },
      'h1, h2, h3': { lineHeight: 1.15 },
      ':focus-visible': { outline: '3px solid', outlineColor: 'ac', outlineOffset: '2px' },
    },
  },
  components: {
    Heading: { baseStyle: { fontFamily: 'heading', lineHeight: 1.15 } },
    Button: {
      baseStyle: { borderRadius: '99px', fontWeight: 600, _disabled: { opacity: 0.6, cursor: 'wait' } },
      defaultProps: { variant: 'solid' },
      variants: {
        solid: { bg: 'ink', color: 'bg', px: 4, py: '9px', h: 'auto', _hover: { bg: 'ink', opacity: 0.85, _disabled: { bg: 'ink' } }, _active: { bg: 'ink', opacity: 0.75 } },
        outline: { bg: 'transparent', color: 'ink', border: '1px solid', borderColor: 'line', px: 4, py: '9px', h: 'auto', _hover: { bg: 'transparent', opacity: 0.8 }, _active: { bg: 'transparent' } },
        pill: { bg: 'card', color: 'ink', border: '1px solid', borderColor: 'line', px: 4, py: '9px', h: 'auto', _hover: { bg: 'card', opacity: 0.85 } },
        pillOn: { bg: 'ac', color: '#fff', border: '1px solid', borderColor: 'ac', px: 4, py: '9px', h: 'auto', _hover: { bg: 'ac', opacity: 0.9 } },
      },
    },
    Input: {
      variants: {
        outline: { field: { bg: 'card', color: 'ink', borderColor: 'line', borderRadius: '12px', _hover: { borderColor: 'line' }, _focusVisible: { borderColor: 'ac', boxShadow: '0 0 0 1px var(--chakra-colors-ac)' } } },
      },
    },
    Textarea: {
      variants: {
        outline: { bg: 'card', color: 'ink', borderColor: 'line', borderRadius: '12px', _hover: { borderColor: 'line' }, _focusVisible: { borderColor: 'ac', boxShadow: '0 0 0 1px var(--chakra-colors-ac)' } },
      },
    },
    FormLabel: { baseStyle: { fontSize: '14px', fontWeight: 600, mb: 1.5 } },
    Modal: {
      baseStyle: {
        overlay: { bg: 'rgba(10,6,3,.72)', backdropFilter: 'blur(3px)' },
        dialog: { bg: 'card', color: 'ink', border: '1px solid', borderColor: 'line', borderRadius: '28px' },
      },
    },
  },
});

export default theme;
