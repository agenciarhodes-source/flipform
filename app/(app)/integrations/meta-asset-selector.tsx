'use client';

type MetaConnection = {
  status?: string | null;
  assetSelection?: {
    businessId?: string | null;
    businessName?: string | null;
    adAccountId?: string | null;
    adAccountName?: string | null;
    pixelId?: string | null;
    pixelName?: string | null;
    selectedAt?: string | null;
  } | null;
};

export function MetaAssetSelector({ connection }: { connection: MetaConnection; onSaved?: () => Promise<void> | void }) {
  if (connection.status !== 'authorized') return null;

  const selection = connection.assetSelection;
  const hasBinding = Boolean(selection?.adAccountId && selection?.pixelId);

  return <div className="rounded-lg border p-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">Ativos Meta vinculados</h3>
        <p className="text-xs text-muted-foreground">Por segurança, contas de anúncios e Pixels são vinculados pelo administrador da plataforma. Este tenant nunca recebe a lista completa de ativos acessíveis à identidade Meta autorizada.</p>
      </div>
      {hasBinding && <span className="rounded-full border bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Vinculado</span>}
    </div>

    {hasBinding ? <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-md border bg-slate-50 p-3">
        <p className="text-xs text-muted-foreground">Conta de anúncios</p>
        <p className="text-sm font-medium">{selection?.adAccountName || selection?.adAccountId}</p>
      </div>
      <div className="rounded-md border bg-slate-50 p-3">
        <p className="text-xs text-muted-foreground">Pixel / Dataset</p>
        <p className="text-sm font-medium">{selection?.pixelName || selection?.pixelId}</p>
      </div>
    </div> : <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      A autorização Meta está ativa, mas nenhum ativo foi vinculado a este tenant ainda. A configuração será concluída pelo administrador do FlipForm.
    </div>}
  </div>;
}
