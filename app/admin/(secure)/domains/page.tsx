"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";

type Domain = {
  id: string;
  domain: string;
  status: string;
  verificationStatus: string;
  sslStatus: string;
  dnsTarget?: string | null;
  verificationType?: string | null;
  verificationDomain?: string | null;
  verificationValue?: string | null;
  verificationReason?: string | null;
  isPrimary: boolean;
  lastCheckedAt?: string | null;
  createdAt: string;
  tenant: { id: string; name: string; slug: string };
};
const statuses = [
  "requested",
  "pending_setup",
  "dns_pending",
  "ssl_pending",
  "pending",
  "active",
  "error",
];
const verificationStatuses = ["pending", "verified", "failed"];
const sslStatuses = ["unknown", "pending", "active", "failed"];

export default function AdminDomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const data = await fetch("/api/admin/domains").then((r) => r.json());
    setDomains(data.domains || []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);
  const update = async (id: string, patch: Partial<Domain>) => {
    const res = await fetch(`/api/admin/domains/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      return toast.error(data.error || "Não foi possível atualizar.");
    toast.success("Domínio atualizado.");
    setDomains((items) =>
      items.map((d) =>
        d.id === id
          ? data.domain
          : patch.isPrimary && d.tenant.id === data.domain.tenant.id
            ? { ...d, isPrimary: false }
            : d,
      ),
    );
  };
  const copy = async (value?: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success("Copiado.");
  };
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            Domínios personalizados
          </h1>
          <p className="text-sm text-muted-foreground">
            Backoffice para configurar CNAME, status de DNS e SSL dos domínios
            solicitados pelos clientes.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>
      {loading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : domains.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Nenhum domínio solicitado.
        </Card>
      ) : (
        <div className="space-y-4">
          {domains.map((d) => (
            <DomainCard key={d.id} domain={d} onUpdate={update} onCopy={copy} />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainCard({
  domain,
  onUpdate,
  onCopy,
}: {
  domain: Domain;
  onUpdate: (id: string, patch: Partial<Domain>) => void;
  onCopy: (value?: string | null) => void;
}) {
  const [draft, setDraft] = useState(domain);
  useEffect(() => setDraft(domain), [domain]);
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2">
            {domain.domain}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onCopy(domain.domain)}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
            {domain.isPrimary && <Badge>Principal</Badge>}
          </div>
          <div className="text-sm text-muted-foreground">
            {domain.tenant.name} · {domain.tenant.slug}
          </div>
          <div className="text-xs text-muted-foreground">
            Criado em {formatDateTime(domain.createdAt)} · Última verificação:{" "}
            {domain.lastCheckedAt
              ? formatDateTime(domain.lastCheckedAt)
              : "nunca"}
          </div>
        </div>
        <a
          href={`https://vercel.com/dashboard/search?q=${encodeURIComponent(domain.domain)}`}
          target="_blank"
          rel="noreferrer"
        >
          <Button variant="outline" size="sm">
            <ExternalLink className="w-3.5 h-3.5 mr-1" />
            Abrir busca na Vercel
          </Button>
        </a>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <FieldSelect
          label="Status"
          value={draft.status}
          values={statuses}
          onChange={(status) => setDraft({ ...draft, status })}
        />
        <FieldSelect
          label="Verificação"
          value={draft.verificationStatus}
          values={verificationStatuses}
          onChange={(verificationStatus) =>
            setDraft({ ...draft, verificationStatus })
          }
        />
        <FieldSelect
          label="SSL"
          value={draft.sslStatus}
          values={sslStatuses}
          onChange={(sslStatus) => setDraft({ ...draft, sslStatus })}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="DNS target/CNAME recomendado"
          value={draft.dnsTarget || ""}
          onChange={(dnsTarget) => setDraft({ ...draft, dnsTarget })}
          onCopy={() => onCopy(draft.dnsTarget)}
        />
        <Field
          label="Verification value"
          value={draft.verificationValue || ""}
          onChange={(verificationValue) =>
            setDraft({ ...draft, verificationValue })
          }
          onCopy={() => onCopy(draft.verificationValue)}
        />
        <Field
          label="Verification type"
          value={draft.verificationType || ""}
          onChange={(verificationType) =>
            setDraft({ ...draft, verificationType })
          }
        />
        <Field
          label="Verification domain"
          value={draft.verificationDomain || ""}
          onChange={(verificationDomain) =>
            setDraft({ ...draft, verificationDomain })
          }
        />
        <Field
          label="Motivo/observação"
          value={draft.verificationReason || ""}
          onChange={(verificationReason) =>
            setDraft({ ...draft, verificationReason })
          }
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onUpdate(domain.id, draft)}>
          <Save className="w-4 h-4 mr-2" />
          Salvar
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            onUpdate(domain.id, {
              status: "dns_pending",
              verificationStatus: "pending",
              sslStatus: "unknown",
            })
          }
        >
          Aguardando DNS
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            onUpdate(domain.id, {
              verificationStatus: "verified",
              sslStatus: "pending",
              status: "ssl_pending",
            })
          }
        >
          DNS verificado
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            onUpdate(domain.id, {
              status: "active",
              verificationStatus: "verified",
              sslStatus: "active",
            })
          }
        >
          Ativar
        </Button>
        <Button
          variant="outline"
          disabled={domain.status !== "active"}
          onClick={() => onUpdate(domain.id, { isPrimary: true })}
        >
          Marcar principal
        </Button>
        <Button
          variant="outline"
          onClick={() => onUpdate(domain.id, { status: "error" })}
        >
          Marcar erro
        </Button>
      </div>
    </Card>
  );
}
function Field({
  label,
  value,
  onChange,
  onCopy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCopy?: () => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
        {onCopy && (
          <Button type="button" variant="outline" size="icon" onClick={onCopy}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
function FieldSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || values[0]} onValueChange={onChange}>
        {
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        }
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
