import type { Metadata, Viewport } from 'next';
import { Prompt, Sarabun } from 'next/font/google';
import './globals.css';

/* Self-hosted at build time: a classroom wifi that cannot reach Google Fonts
 * must not leave the moderator staring at fallback glyphs mid-game. */
const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sarabun',
  display: 'swap'
});

const prompt = Prompt({
  subsets: ['thai', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-prompt',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'ผู้ดำเนินเกม Ultimate Werewolf',
  description: 'ผู้ช่วยดำเนินเกมกระดาน Ultimate Werewolf: Deluxe Edition สำหรับห้องเรียน'
};

/* The moderator holds a phone in one hand and the deck in the other, so the
 * layout is designed for 360px first and must not zoom when a field is focused. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0b1020'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={sarabun.variable + ' ' + prompt.variable}>
      <body>{children}</body>
    </html>
  );
}
