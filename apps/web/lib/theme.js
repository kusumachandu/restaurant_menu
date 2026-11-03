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
      onAc: { default: '#ffffff', _dark: '#ffffff' }, // text on top of the accent colour
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
      // The admin area (see AdminShell) always uses the guest menu's dark gold look. Re-pointing the tokens here restyles
      // every admin screen and its dialogs, which sit outside the page's own elements, in one place.
      'body.admin-theme': {
        '--chakra-colors-bg': '#0c0806',
        '--chakra-colors-card': '#15100c',
        '--chakra-colors-ink': '#f4ead8',
        '--chakra-colors-mute': '#a59680',
        '--chakra-colors-ac': '#d4a84b',
        '--chakra-colors-line': 'rgba(233,213,176,.13)',
        '--chakra-colors-danger': '#e2594e',
        '--chakra-colors-onAc': '#1a1209',
        '--chakra-fonts-heading': "var(--font-display), 'Cormorant Garamond', Georgia, serif",
        '--chakra-fonts-body': "var(--font-sans), system-ui, -apple-system, 'Segoe UI', sans-serif",
        // Chakra's light badge and alert shades, retinted so they read well on the dark surface.
        '--chakra-colors-gray-100': 'rgba(233,213,176,.12)', '--chakra-colors-gray-800': '#e4d7c0',
        '--chakra-colors-green-100': 'rgba(63,182,118,.18)', '--chakra-colors-green-800': '#8fe0b0',
        '--chakra-colors-red-100': 'rgba(226,89,78,.2)', '--chakra-colors-red-800': '#ffa79e',
        '--chakra-colors-yellow-100': 'rgba(212,168,75,.2)', '--chakra-colors-yellow-800': '#ecd08f',
        '--chakra-colors-orange-100': 'rgba(224,138,70,.2)', '--chakra-colors-orange-800': '#f3b27c',
        '--chakra-colors-blue-100': 'rgba(120,160,230,.18)', '--chakra-colors-blue-800': '#a9c3f2',
        colorScheme: 'dark',
        background: 'radial-gradient(ellipse 60% 38% at 78% -6%, rgba(212,168,75,.15), transparent 62%), radial-gradient(ellipse 45% 34% at 4% 14%, rgba(224,138,70,.08), transparent 62%), #0c0806',
        backgroundAttachment: 'fixed',
      },
      'body.admin-theme ::selection': { background: 'rgba(212,168,75,.35)' },
      'body.admin-theme .chakra-switch__track[data-checked]': { background: '#d4a84b' },
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
        pillOn: { bg: 'ac', color: 'onAc', border: '1px solid', borderColor: 'ac', px: 4, py: '9px', h: 'auto', _hover: { bg: 'ac', opacity: 0.9 } },
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
