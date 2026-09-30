'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Power, RotateCcw, ShieldOff, Ban, Save, Coins } from 'lucide-react';
import { StatusBadge } from '@/components/admin/status-badge';

const number = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const CREDIT_SOURCE_LABELS: Record<string, string> = {
  platform_admin_grant: 'Crédito concedido pelo Super Admin',
  usage: 'Consumo',
  refund: 'Estorno',
  top_up: 'Recarga',
  manual_adjustment: 'Ajuste manual',
};

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Dono da empresa' },
  { value: 'admin', label: 'Administrador' },
  { value: 'manager', label: 'Gestor' },
  { value: 'agent', label: 'Atendente/Vendedor' },
  { value: 'viewer', label: 'Visualizador' },
];

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [savingPlan, setSavingPlan] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [savingUserRole, setSavingUserRole] = useState<string | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [grantingCredits, setGrantingCredits] = useState(false);
  const [creditGrant, setCreditGrant] = useState({
    amountCredits: '',
    reason: '',
    idempotencyIdentifier: '',
  });
  const [topUps, setTopUps] = useState<any[]>([]);
  const [topUpsAvailable, setTopUpsAvailable] = useState(true);
  const [loadingTopUps, setLoadingTopUps] = useState(true);
  const [creatingTopUp, setCreatingTopUp] = useState(false);
  const [topUpActionId, setTopUpActionId] = useState<string | null>(null);
  const [topUpForm, setTopUpForm] = useState({
    amountBrl: '',
    credits: '',
    estimatedOpenAiCostUsd: '',
    requestKey: '',
  });
  const [planForm, setPlanForm] = useState<{ planId: string; nextDueDate: string; internalNotes: string }>({ planId: '', nextDueDate: '', internalNotes: '' });

  const load = async () => {
    const d = await fetch(`/api/admin/tenants/${id}`, { cache: 'no-store' }).then((r) => r.json());
    setTenant(d.tenant);
    const nextRoleDrafts: Record<string, string> = {};
    for (const tenantUser of d.tenant?.tenantUsers || []) nextRoleDrafts[tenantUser.id] = tenantUser.role;
    setRoleDrafts(nextRoleDrafts);
    setPlanForm({
      planId: d.tenant?.planId || 'none',
      nextDueDate: d.tenant?.nextDueDate ? new Date(d.tenant.nextDueDate).toISOString().slice(0, 10) : '',
      internalNotes: d.tenant?.internalNotes || '',
    });
  };
  const loadWallet = async () => {
    setLoadingWallet(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/flip-ai-credits`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar a carteira Flip AI.');
      setWallet(data.wallet);
    } catch (e: any) {
      setWallet(null);
      toast.error(e.message);
    } finally {
      setLoadingWallet(false);
    }
  };

  const loadTopUps = async () => {
    setLoadingTopUps(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/flip-ai-top-ups`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar as recargas comerciais.');
      setTopUpsAvailable(data.available !== false);
      setTopUps(data.orders || []);
    } catch (e: any) {
      setTopUps([]);
      setTopUpsAvailable(false);
      toast.error(e.message);
    } finally {
      setLoadingTopUps(false);
    }
  };

  useEffect(() => {
    load();
    loadWallet();
    loadTopUps();
    fetch('/api/admin/plans').then((r) => r.json()).then((d) => setPlans(d.plans || []));
    /* eslint-disable-next-line */
  }, [id]);

  const changeStatus = async (newStatus: string, label: string) => {
    const reason = prompt(`Motivo para ${label.toLowerCase()} (opcional):`) ?? undefined;
    try {
      const res = await fetch(`/api/admin/tenants/${id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro'); }
      toast.success(`Status atualizado para ${label}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const savePlan = async () => {
    setSavingPlan(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/plan`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: planForm.planId === 'none' ? null : planForm.planId,
          nextDueDate: planForm.nextDueDate ? new Date(planForm.nextDueDate + 'T00:00:00').toISOString() : null,
          internalNotes: planForm.internalNotes,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro'); }
      toast.success('Plano atualizado');
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingPlan(false); }
  };

  const grantCredits = async () => {
    const amountCredits = Number(creditGrant.amountCredits);
    if (!Number.isSafeInteger(amountCredits) || amountCredits <= 0) {
      toast.error('Informe uma quantidade inteira e positiva de créditos.');
      return;
    }
    setGrantingCredits(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/flip-ai-credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCredits,
          reason: creditGrant.reason,
          idempotencyIdentifier: creditGrant.idempotencyIdentifier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível adicionar os créditos.');
      toast.success(data.reused
        ? 'Esse lançamento já existia. Nenhum crédito foi duplicado.'
        : `${number.format(amountCredits)} créditos adicionados à carteira deste cliente.`);
      setCreditGrant({ amountCredits: '', reason: '', idempotencyIdentifier: '' });
      await loadWallet();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGrantingCredits(false);
    }
  };

  const parseMoneyToCents = (value: string) => {
    const normalized = value.trim().replace(/\./g, '').replace(',', '.');
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount < 0) return null;
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  };

  const createTopUp = async () => {
    const amountCents = parseMoneyToCents(topUpForm.amountBrl);
    const estimatedOpenAiCostCents = topUpForm.estimatedOpenAiCostUsd.trim()
      ? parseMoneyToCents(topUpForm.estimatedOpenAiCostUsd)
      : 0;
    const credits = Number(topUpForm.credits);

    if (!amountCents || amountCents <= 0) {
      toast.error('Informe um valor comercial em reais maior que zero.');
      return;
    }
    if (estimatedOpenAiCostCents == null) {
      toast.error('Informe um custo estimado da OpenAI válido.');
      return;
    }
    if (!Number.isSafeInteger(credits) || credits <= 0) {
      toast.error('Informe uma quantidade inteira e positiva de créditos.');
      return;
    }

    setCreatingTopUp(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/flip-ai-top-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          credits,
          estimatedOpenAiCostCents,
          requestKey: topUpForm.requestKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível criar a recarga comercial.');
      toast.success(data.reused
        ? 'Essa recarga já existia. Nenhum pedido foi duplicado.'
        : 'Recarga comercial criada como pendente.');
      setTopUpForm({ amountBrl: '', credits: '', estimatedOpenAiCostUsd: '', requestKey: '' });
      await loadTopUps();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingTopUp(false);
    }
  };

  const actOnTopUp = async (order: any, action: 'mark_paid' | 'credit' | 'cancel') => {
    let payload: any = { action };
    if (action === 'mark_paid') {
      const providerPaymentId = window.prompt(
        'Referência idempotente do pagamento (ex.: ID do gateway ou comprovante interno):',
        order.providerPaymentId || `manual:${order.requestKey}`,
      );
      if (!providerPaymentId) return;
      const paymentMethod = window.prompt('Forma de pagamento (opcional):', order.paymentMethod || 'manual');
      payload = {
        action,
        paymentProvider: order.paymentProvider || 'manual',
        providerPaymentId,
        paymentMethod: paymentMethod?.trim() || null,
      };
    }

    setTopUpActionId(order.id);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/flip-ai-top-ups/${order.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível atualizar a recarga.');
      if (action === 'credit') {
        toast.success(data.reused
          ? 'Os créditos dessa recarga já haviam sido lançados.'
          : 'Pagamento convertido em créditos na carteira.');
        await loadWallet();
      } else if (action === 'mark_paid') {
        toast.success(data.reused ? 'Pagamento já estava confirmado.' : 'Pagamento marcado como confirmado.');
      } else {
        toast.success(data.reused ? 'Recarga já estava cancelada.' : 'Recarga cancelada.');
      }
      await loadTopUps();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTopUpActionId(null);
    }
  };

  const saveUserRole = async (tenantUser: any) => {
    const role = roleDrafts[tenantUser.id] || tenantUser.role;
    if (role === tenantUser.role) return;

    setSavingUserRole(tenantUser.id);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/users/${tenantUser.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível alterar o nível de acesso.');
      toast.success(`${tenantUser.user.name} agora é ${ROLE_OPTIONS.find((item) => item.value === role)?.label || role}.`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingUserRole(null);
    }
  };

  if (!tenant) return <div className="p-8 text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando...</div>;

  return (
    <div className="p-8 space-y-5">
      <Link href="/admin/tenants" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />Voltar</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-md flex items-center justify-center text-white font-bold text-xl" style={{ backgroundColor: tenant.primaryColor }}>{tenant.name.charAt(0)}</div>
          <div>
            <h1 className="font-heading text-2xl font-bold flex items-center gap-2">{tenant.name} <StatusBadge status={tenant.status} /></h1>
            <div className="text-sm text-muted-foreground">slug: <code>{tenant.slug}</code> • criado em {new Date(tenant.createdAt).toLocaleDateString('pt-BR')}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {tenant.status !== 'active' && <Button onClick={() => changeStatus('active', 'Ativo')} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Power className="w-4 h-4 mr-1" />Ativar</Button>}
          {tenant.status !== 'suspended' && <Button onClick={() => changeStatus('suspended', 'Suspenso')} variant="outline"><RotateCcw className="w-4 h-4 mr-1 text-amber-600" />Suspender</Button>}
          {tenant.status !== 'blocked' && <Button onClick={() => changeStatus('blocked', 'Bloqueado')} variant="outline"><ShieldOff className="w-4 h-4 mr-1 text-red-600" />Bloquear</Button>}
          {tenant.status !== 'canceled' && <Button onClick={() => changeStatus('canceled', 'Cancelado')} variant="outline"><Ban className="w-4 h-4 mr-1" />Cancelar</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Usuários</div><div className="font-heading text-xl font-bold">{tenant.tenantUsers.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Formulários</div><div className="font-heading text-xl font-bold">{tenant.forms.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Pipelines</div><div className="font-heading text-xl font-bold">{tenant.pipelines.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Leads</div><div className="font-heading text-xl font-bold">{tenant.leadsCount}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Último login</div><div className="text-sm mt-1">{tenant.lastLoginAt ? new Date(tenant.lastLoginAt).toLocaleString('pt-BR') : '—'}</div></Card>
      </div>

      <Tabs defaultValue="plan">
        <TabsList>
          <TabsTrigger value="plan">Plano & Cobrança</TabsTrigger>
          <TabsTrigger value="users">Usuários ({tenant.tenantUsers.length})</TabsTrigger>
          <TabsTrigger value="flip-ai-wallet">Carteira Flip AI</TabsTrigger>
          <TabsTrigger value="history">Histórico de status</TabsTrigger>
          <TabsTrigger value="notes">Notas internas</TabsTrigger>
        </TabsList>
        <TabsContent value="plan">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Plano</label>
                <Select value={planForm.planId} onValueChange={(v) => setPlanForm({ ...planForm, planId: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem plano</SelectItem>
                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — R$ {Number(p.price).toFixed(2)}/{p.billingCycle === 'yearly' ? 'ano' : 'mês'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Próximo vencimento</label>
                <Input type="date" value={planForm.nextDueDate} onChange={(e) => setPlanForm({ ...planForm, nextDueDate: e.target.value })} />
              </div>
            </div>
            <Button onClick={savePlan} disabled={savingPlan}>{savingPlan ? 'Salvando...' : 'Salvar plano'}</Button>
          </Card>
        </TabsContent>
        <TabsContent value="users">
          <div className="space-y-3">
            <Card className="p-4 text-sm text-muted-foreground">
              Hierarquia da empresa: <strong>Dono</strong> → <strong>Administrador</strong> → <strong>Gestor</strong> → <strong>Atendente/Vendedor</strong>. O Gestor acompanha os atendentes vinculados à sua equipe; cada atendente continua operando os próprios leads.
            </Card>
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-4">Nome</th>
                    <th className="text-left py-2 px-4">E-mail</th>
                    <th className="text-left py-2 px-4">Nível de acesso</th>
                    <th className="text-left py-2 px-4">Status</th>
                    <th className="text-right py-2 px-4">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.tenantUsers.map((tu: any) => (
                    <tr key={tu.id} className="border-b last:border-0">
                      <td className="py-2 px-4">{tu.user.name}</td>
                      <td className="py-2 px-4">{tu.user.email}</td>
                      <td className="py-2 px-4 min-w-[220px]">
                        <Select value={roleDrafts[tu.id] || tu.role} onValueChange={(role) => setRoleDrafts((current) => ({ ...current, [tu.id]: role }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-4">{tu.status}</td>
                      <td className="py-2 px-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveUserRole(tu)}
                          disabled={savingUserRole === tu.id || (roleDrafts[tu.id] || tu.role) === tu.role}
                        >
                          <Save className="w-3.5 h-3.5 mr-1" />{savingUserRole === tu.id ? 'Salvando...' : 'Salvar nível'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="flip-ai-wallet">
          <div className="space-y-4">
            <Card className="p-4 border-blue-200 bg-blue-50/60">
              <div className="flex gap-3">
                <Coins className="w-5 h-5 mt-0.5 text-blue-700 shrink-0" />
                <div className="text-sm text-blue-950">
                  <p className="font-medium">Carteira exclusiva deste cliente</p>
                  <p className="mt-1">
                    Os créditos de <strong>{tenant.name}</strong> pertencem somente a este tenant.
                    O consumo nunca utiliza saldo de outra empresa, mesmo que existam créditos disponíveis em outras carteiras.
                  </p>
                </div>
              </div>
            </Card>

            {loadingWallet ? (
              <Card className="p-8 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando carteira...
              </Card>
            ) : !wallet ? (
              <Card className="p-5 text-sm text-muted-foreground">Não foi possível carregar a carteira.</Card>
            ) : !wallet.available ? (
              <Card className="p-5 text-sm text-amber-900 border-amber-200 bg-amber-50">
                A estrutura da carteira ainda não está disponível neste ambiente.
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground">Saldo atual</div>
                    <div className="font-heading text-2xl font-bold mt-1">{number.format(wallet.balanceCredits)}</div>
                    <div className="text-xs text-muted-foreground mt-1">créditos exclusivos deste tenant</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground">Entradas acumuladas</div>
                    <div className="font-heading text-2xl font-bold mt-1">{number.format(wallet.creditedCredits)}</div>
                    <div className="text-xs text-muted-foreground mt-1">créditos e estornos</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground">Consumo acumulado</div>
                    <div className="font-heading text-2xl font-bold mt-1">{number.format(wallet.debitedCredits)}</div>
                    <div className="text-xs text-muted-foreground mt-1">débitos confirmados</div>
                  </Card>
                </div>

                <Card className="p-5 space-y-4">
                  <div>
                    <h3 className="font-semibold">Adicionar créditos</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Operação exclusiva do Super Admin. O lançamento é idempotente e fica registrado no ledger e no audit log.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <label className="space-y-1">
                      <span className="text-sm font-medium">Quantidade de créditos</span>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={creditGrant.amountCredits}
                        onChange={(e) => setCreditGrant((current) => ({ ...current, amountCredits: e.target.value }))}
                        placeholder="Ex.: 100000"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm font-medium">Identificador idempotente</span>
                      <Input
                        value={creditGrant.idempotencyIdentifier}
                        onChange={(e) => setCreditGrant((current) => ({ ...current, idempotencyIdentifier: e.target.value }))}
                        placeholder="Ex.: teste-junqueira-001"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm font-medium">Motivo</span>
                      <Input
                        value={creditGrant.reason}
                        onChange={(e) => setCreditGrant((current) => ({ ...current, reason: e.target.value }))}
                        placeholder="Ex.: Crédito inicial para testes"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      Reutilizar o mesmo identificador com os mesmos dados não duplica o crédito.
                    </p>
                    <Button
                      onClick={grantCredits}
                      disabled={grantingCredits || !creditGrant.amountCredits || !creditGrant.reason || !creditGrant.idempotencyIdentifier}
                    >
                      {grantingCredits ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Coins className="w-4 h-4 mr-1" />}
                      Adicionar créditos
                    </Button>
                  </div>
                </Card>

                <Card className="p-5 space-y-4">
                  <div>
                    <h3 className="font-semibold">Recargas comerciais</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Base segura para comercialização de créditos. Nesta versão não há cobrança automática:
                      o pedido nasce pendente, o pagamento é confirmado separadamente e somente depois pode gerar créditos.
                    </p>
                  </div>

                  {!topUpsAvailable ? (
                    <div className="text-sm text-amber-900 border border-amber-200 bg-amber-50 rounded-md p-3">
                      A estrutura de recargas comerciais ainda não está disponível neste ambiente. A migration deve ser revisada e aplicada separadamente.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <label className="space-y-1">
                          <span className="text-sm font-medium">Valor comercial (R$)</span>
                          <Input
                            value={topUpForm.amountBrl}
                            onChange={(e) => setTopUpForm((current) => ({ ...current, amountBrl: e.target.value }))}
                            placeholder="Ex.: 199,90"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-sm font-medium">Créditos concedidos</span>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={topUpForm.credits}
                            onChange={(e) => setTopUpForm((current) => ({ ...current, credits: e.target.value }))}
                            placeholder="Ex.: 100000"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-sm font-medium">Custo OpenAI estimado (US$)</span>
                          <Input
                            value={topUpForm.estimatedOpenAiCostUsd}
                            onChange={(e) => setTopUpForm((current) => ({ ...current, estimatedOpenAiCostUsd: e.target.value }))}
                            placeholder="Ex.: 8,90"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-sm font-medium">Chave idempotente</span>
                          <Input
                            value={topUpForm.requestKey}
                            onChange={(e) => setTopUpForm((current) => ({ ...current, requestKey: e.target.value }))}
                            placeholder="Ex.: recarga-2026-09-001"
                          />
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          Valor pago, créditos concedidos e custo bruto estimado ficam separados. Nenhum pagamento é criado no Asaas por esta tela.
                        </p>
                        <Button
                          variant="outline"
                          onClick={createTopUp}
                          disabled={creatingTopUp || !topUpForm.amountBrl || !topUpForm.credits || !topUpForm.requestKey}
                        >
                          {creatingTopUp && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                          Criar recarga pendente
                        </Button>
                      </div>

                      {loadingTopUps ? (
                        <div className="py-5 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 inline animate-spin mr-2" />Carregando recargas...
                        </div>
                      ) : topUps.length === 0 ? (
                        <div className="py-5 text-sm text-muted-foreground">Nenhuma recarga comercial registrada.</div>
                      ) : (
                        <div className="overflow-x-auto border rounded-md">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40 border-b">
                              <tr className="text-xs uppercase text-muted-foreground">
                                <th className="text-left py-2 px-3">Criada</th>
                                <th className="text-left py-2 px-3">Status</th>
                                <th className="text-right py-2 px-3">Valor</th>
                                <th className="text-right py-2 px-3">Créditos</th>
                                <th className="text-right py-2 px-3">Custo est.</th>
                                <th className="text-left py-2 px-3">Pagamento</th>
                                <th className="text-right py-2 px-3">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topUps.map((order: any) => (
                                <tr key={order.id} className="border-b last:border-0">
                                  <td className="py-2 px-3 text-xs text-muted-foreground">
                                    {new Date(order.createdAt).toLocaleString('pt-BR')}
                                  </td>
                                  <td className="py-2 px-3">
                                    {order.status === 'pending' ? 'Pendente'
                                      : order.status === 'paid' ? 'Pago'
                                        : order.status === 'credited' ? 'Creditado'
                                          : 'Cancelado'}
                                  </td>
                                  <td className="py-2 px-3 text-right">{brl.format(order.amountCents / 100)}</td>
                                  <td className="py-2 px-3 text-right">{number.format(order.credits)}</td>
                                  <td className="py-2 px-3 text-right">
                                    {usd.format(order.estimatedOpenAiCostCents / 100)}
                                  </td>
                                  <td className="py-2 px-3 text-xs text-muted-foreground">
                                    {order.providerPaymentId || '—'}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex justify-end gap-2">
                                      {order.status === 'pending' && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={topUpActionId === order.id}
                                            onClick={() => actOnTopUp(order, 'mark_paid')}
                                          >
                                            Marcar pago
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={topUpActionId === order.id}
                                            onClick={() => actOnTopUp(order, 'cancel')}
                                          >
                                            Cancelar
                                          </Button>
                                        </>
                                      )}
                                      {order.status === 'paid' && (
                                        <Button
                                          size="sm"
                                          disabled={topUpActionId === order.id}
                                          onClick={() => actOnTopUp(order, 'credit')}
                                        >
                                          {topUpActionId === order.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                                          Creditar carteira
                                        </Button>
                                      )}
                                      {order.status === 'credited' && (
                                        <span className="text-xs text-emerald-700">Ledger confirmado</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </Card>

                <Card className="p-0 overflow-hidden">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold">Histórico da carteira</h3>
                    <p className="text-xs text-muted-foreground mt-1">Últimos 100 lançamentos deste tenant.</p>
                  </div>
                  {wallet.entries.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento registrado.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b">
                          <tr className="text-xs uppercase text-muted-foreground">
                            <th className="text-left py-2 px-4">Quando</th>
                            <th className="text-left py-2 px-4">Tipo</th>
                            <th className="text-left py-2 px-4">Origem</th>
                            <th className="text-left py-2 px-4">Motivo / referência</th>
                            <th className="text-left py-2 px-4">Identificador</th>
                            <th className="text-right py-2 px-4">Créditos</th>
                            <th className="text-right py-2 px-4">Saldo após</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wallet.entries.map((entry: any) => (
                            <tr key={entry.id} className="border-b last:border-0">
                              <td className="py-2 px-4 text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString('pt-BR')}</td>
                              <td className="py-2 px-4">
                                {entry.entryType === 'debit' ? 'Débito' : entry.entryType === 'refund' ? 'Estorno' : 'Crédito'}
                              </td>
                              <td className="py-2 px-4">{CREDIT_SOURCE_LABELS[entry.source] || entry.source}</td>
                              <td className="py-2 px-4 text-muted-foreground">{entry.referenceId || '—'}</td>
                              <td className="py-2 px-4 font-mono text-xs">{entry.idempotencyKey}</td>
                              <td className="py-2 px-4 text-right font-medium">
                                {entry.entryType === 'debit' ? '−' : '+'}{number.format(entry.amountCredits)}
                              </td>
                              <td className="py-2 px-4 text-right">{number.format(entry.balanceAfterCredits)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        </TabsContent>
        <TabsContent value="history">
          <Card className="p-5">
            {tenant.statusHistory.length === 0 ? <div className="text-sm text-muted-foreground">Sem mudanças de status registradas.</div> : (
              <ul className="space-y-2">
                {tenant.statusHistory.map((h: any) => (
                  <li key={h.id} className="text-sm flex items-center gap-2">
                    <StatusBadge status={h.previousStatus || 'inactive'} />
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={h.newStatus} />
                    <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString('pt-BR')} — por {h.changer?.name || 'sistema'}{h.reason ? ` — "${h.reason}"` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="notes">
          <Card className="p-5 space-y-3">
            <Textarea rows={6} value={planForm.internalNotes} onChange={(e) => setPlanForm({ ...planForm, internalNotes: e.target.value })} placeholder="Notas internas (não visíveis ao cliente)..." />
            <Button onClick={savePlan} disabled={savingPlan}>Salvar notas</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
