import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'STORM simulator',
  description:
    'Simulate STORM microscopy and compare fitted localizations, ground truth, and the acquired camera frames.',
};

export const viewport: Viewport = {
  themeColor: '#f5f6fa',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
