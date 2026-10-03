import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Plus Jakarta Sans for the interface, Fraunces (a soft serif) for page titles and the brand.
const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] });
const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'], axes: ['SOFT'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Fernleaf Kitchen', template: '%s · Fernleaf Kitchen' },
  description: 'Kitchen operations admin panel for Fernleaf Kitchen corporate meal programs.',
};

export const viewport: Viewport = {
  themeColor: '#f9f4ec',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
