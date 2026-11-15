import type { ReactNode } from 'react';
import Link from 'next/link';
import 'marimo-blog/styles.css';
import './globals.css';

export const metadata = { title: 'marimo-blog Next example' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>
    <nav aria-label="Main navigation"><Link href="/">Article</Link> <Link href="/about">About this example</Link></nav>
    {children}
  </body></html>;
}
