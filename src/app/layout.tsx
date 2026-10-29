import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google';
import './globals.css';

const ui = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-ui-loaded', display: 'swap' });
const display = Newsreader({ subsets: ['latin'], variable: '--font-display-loaded', display: 'swap' });
const data = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-data-loaded', display: 'swap' });

export const metadata: Metadata = {
  title: 'Nexo Assist · Service desk de TI',
  description: 'Seu problema de TI, resolvido em uma conversa.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${display.variable} ${data.variable}`}>
      <body>{children}</body>
    </html>
  );
}
