import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'See past the blur — STORM microscopy simulator',
  description:
    'An interactive simulation of single-molecule localization microscopy: watch a super-resolution image emerge from blinking molecules.',
};

export const viewport: Viewport = {
  themeColor: 'hsl(222.2 84% 4.9%)', // matches --background in globals.css
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
