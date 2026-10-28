import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
export const metadata: Metadata = {
  title: 'FlowTrust — Beyond Balance. Into Resilience.',
  description: 'Evidence-backed financial intelligence, cash-flow simulation, and business resilience for small businesses.',
  applicationName: 'FlowTrust',
  icons: { icon: '/flowtrust-mark.svg' },
};
export const viewport: Viewport = { themeColor: '#101b2d', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
