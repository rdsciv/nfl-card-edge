import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NFL Card Edge — Football signals. Card evidence.',
  description: 'Research NFL opportunities, exact rookie cards, and grading economics with transparent evidence.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
