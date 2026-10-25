import type { Metadata, Viewport } from 'next';
import { Archivo, Big_Shoulders, JetBrains_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Providers } from '@/components/providers';
import './globals.css';

const display = Big_Shoulders({ variable: '--font-display', subsets: ['latin'], weight: ['600', '700', '800'] });
const body = Archivo({ variable: '--font-body', subsets: ['latin'] });
const mono = JetBrains_Mono({ variable: '--font-mono-stamp', subsets: ['latin'], weight: ['500'] });

export const metadata: Metadata = {
  title: { default: 'Pyramid Coach', template: '%s · Pyramid Coach' },
  description: 'Evidence-based training and nutrition that plans, runs and adapts itself.',
  applicationName: 'Pyramid Coach',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Pyramid', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1a1b17' },
    { media: '(prefers-color-scheme: light)', color: '#f3f1ea' },
  ],
};

// Dark by default (gym lighting); "system" and "light" are opt-in in Settings.
const themeScript = `(function(){try{var t=localStorage.getItem('pc-theme')||'dark';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} dark`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grain min-h-dvh">
        <Providers>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}
