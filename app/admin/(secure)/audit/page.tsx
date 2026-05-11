'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/admin/audit').then((r) => r.json()).then((d) => { setLogs(d.logs || []); setLoading(false); }); }, []);

  return (
    <div className="p-8 space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Audit logs da plataforma</h1>
        <p className="text-sm text-muted-foreground">Ações administrativas realizadas pela equipe FlipForm.</p>
      </div>
      <Card className="p-0 overflow-hidden">
        {loading ? <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando...</div> :
          logs.length === 0 ? <div className="p-10 text-center text-muted-foreground">Nenhuma ação administrativa registrada ainda.</div> :
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b"><tr className="text-xs uppercase text-muted-foreground"><th className="text-left py-2 px-4">Quando</th><th className="text-left py-2 px-4">Ação</th><th className="text-left py-2 px-4">Tenant</th><th className="text-left py-2 px-4">Quem</th><th className="text-left py-2 px-4">Metadata</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 px-4 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString('pt-BR')}</td>
                  <td className="py-2 px-4"><Badge variant="outline" className="font-mono text-[10px]">{l.action}</Badge></td>
                  <td className="py-2 px-4">{l.tenant ? <Link href={`/admin/tenants/${l.tenant.id}`} className="hover:underline">{l.tenant.name}</Link> : '—'}</td>
                  <td className="py-2 px-4 text-xs">{l.user?.name || 'sistema'}</td>
                  <td className="py-2 px-4 text-xs text-muted-foreground font-mono max-w-md truncate">{l.metadata ? JSON.stringify(l.metadata) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </Card>
    </div>
  );
}
