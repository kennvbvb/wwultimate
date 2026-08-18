import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ผู้ดำเนินเกม Ultimate Werewolf',
  description: 'ผู้ช่วยดำเนินเกมกระดาน Ultimate Werewolf: Deluxe Edition สำหรับห้องเรียน'
};

/* The moderator holds a phone in one hand and the deck in the other, so the
 * layout is designed for 360px first and never zooms on input focus. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0b1020'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
