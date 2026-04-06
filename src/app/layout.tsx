import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Topdown Shooter',
  description: 'A roguelite top-down shooter — clear rooms, survive the dungeon.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0a0a0f] text-white">
        {children}
      </body>
    </html>
  );
}
