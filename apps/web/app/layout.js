import { Cormorant_Garamond, Manrope } from 'next/font/google';
import Providers from './providers';

export const metadata = { title: 'Menu', description: 'Digital menu' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Fonts for the guest menu: set as CSS variables, so other pages are unchanged until they opt in.
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'], style: ['normal', 'italic'], variable: '--font-display', display: 'swap' });
const sans = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
