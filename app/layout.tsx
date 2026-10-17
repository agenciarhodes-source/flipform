import './globals.css';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'FlipForm — Capture e gerencie leads em escala',
  description: 'Plataforma SaaS multi-empresa para capturação de leads via formulários e gestão em Kanban.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        {/* Below the 64px top bar, so its buttons stay visible and clickable while a notice shows. */}
        <Toaster richColors position="top-right" offset={{ top: 80, right: 16 }} mobileOffset={{ top: 72 }} />
      </body>
    </html>
  );
}
