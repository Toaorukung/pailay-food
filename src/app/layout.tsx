import type { Metadata, Viewport } from 'next';
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'ไปเล วิลล่า — สั่งอาหาร',
  description: 'สั่งอาหารในวิลล่า — สแกน QR แล้วสั่งได้ทันที',
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Guests pinch-zoom menu photos; locking that out to look "app-like" is an
  // accessibility regression, so maximumScale is deliberately not set.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#12181f' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        {/*
          Applies the stored theme during HTML parse, before the first paint.
          Without it a guest who chose dark gets a white flash on every
          navigation. dangerouslySetInnerHTML is the only way to emit an inline
          script here; the content is a build-time constant, not user input.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
