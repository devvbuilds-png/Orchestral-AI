import type { Metadata } from 'next';
import { Lora, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-lora',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'kaizen documentation',
  description: "A builder's public product report. Kaizen is a structured product knowledge base — built by Dev Saxena.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${lora.variable} ${ibmPlexMono.variable}`}>
      <body>
        <div className="layout">
          <Sidebar />
          <main className="main-content">
            <div className="content-inner page-fade">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
