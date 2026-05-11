import './globals.css';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'LeadFlow CRM — Capturação e gestão de leads',
  description: 'Plataforma SaaS multi-empresa para capturação de leads via formulários e gestão em Kanban.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
