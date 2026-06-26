'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Mail, Phone, Flame, Snowflake, Thermometer, Plus } from 'lucide-react';
import { LeadDetailModal } from '@/components/lead-detail-modal';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ManualLeadDialog } from '@/components/manual-lead-dialog';
import { formatLeadSource } from '@/lib/leads';

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const load = async () => {
    const [l, p] = await Promise.all([
      fetch(`/api/leads${search ? `?q=${encodeURIComponent(search)}` : ''}`).then((r) => r.json()),
      fetch('/api/pipelines').then((r) => r.json()),
    ]);
    setLeads(l.leads);
    setPipelines(p.pipelines || []);
    setStages(p.pipelines[0]?.stages || []);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);

  const tempIcon = (t: string) => t === 'hot' ? <Flame className="w-3.5 h-3.5 text-red-500" /> : t === 'warm' ? <Thermometer className="w-3.5 h-3.5 text-amber-500" /> : <Snowflake className="w-3.5 h-3.5 text-sky-500" />;

  return (
    <div className="p-4 lg:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">{leads.length} leads encontrados</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => setManualOpen(true)}><Plus className="w-4 h-4 mr-1" />Novo lead</Button>
          <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nome</th>
              <th className="text-left px-4 py-3 font-medium">Contato</th>
              <th className="text-left px-4 py-3 font-medium">Etapa</th>
              <th className="text-left px-4 py-3 font-medium">Origem</th>
              <th className="text-left px-4 py-3 font-medium">Responsável</th>
              <th className="text-left px-4 py-3 font-medium">Temp.</th>
              <th className="text-left px-4 py-3 font-medium">Criado</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} onClick={() => setSelectedId(l.id)} className="border-t hover:bg-muted/30 cursor-pointer">
                <td className="px-4 py-3 font-medium">{l.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div className="space-y-0.5">
                    {l.email && <div className="flex items-center gap-1 text-xs"><Mail className="w-3 h-3" />{l.email}</div>}
                    {l.phone && <div className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" />{l.phone}</div>}
                  </div>
                </td>
                <td className="px-4 py-3"><Badge style={{ backgroundColor: l.stage.color }} className="text-white border-0">{l.stage.name}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{formatLeadSource(l.source)}</td>
                <td className="px-4 py-3">{l.assignedUser?.name || '—'}</td>
                <td className="px-4 py-3">{tempIcon(l.temperature)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(l.createdAt)}</td>
              </tr>
            ))}
            {leads.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Nenhum lead encontrado.</td></tr>}
          </tbody>
        </table>
      </Card>
      <ManualLeadDialog open={manualOpen} onOpenChange={setManualOpen} pipelines={pipelines} onCreated={load} />
      {selectedId && <LeadDetailModal leadId={selectedId} stages={stages} onClose={() => setSelectedId(null)} onChange={load} />}
    </div>
  );
}
