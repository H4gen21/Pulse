import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { NetworkBanner } from '@/components/NetworkBanner';
import { themeScript } from '@/components/ThemeProvider';

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pulse | Non-custodial inheritance guard',
  description: 'Your crypto reaches your family, even if you can’t. A zero-custody dead man’s switch on Base.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // lets env(safe-area-inset-*) work on notched phones
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F1FE' },
    { media: '(prefers-color-scheme: dark)', color: '#121019' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Providers>
          <Navbar />
          <NetworkBanner />
          <div id="main">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
