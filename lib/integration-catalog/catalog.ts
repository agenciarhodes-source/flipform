/** Global versioned presentation catalog. No tenant credentials or provider activation. */
export type CatalogApp = { id: string; label: string; glyph: string; tone: string; description: string; anchor?: string; premiumOnly?: boolean };
export const CONNECTION_CATALOG: readonly CatalogApp[] = [
  {id:'whatsapp',label:'WhatsApp',glyph:'WA',tone:'green',description:'Números, atendimento e modelos',anchor:'whatsapp-connection'},
  {id:'instagram',label:'Instagram',glyph:'IG',tone:'pink',description:'Conta profissional e Direct',anchor:'instagram-connection'},
  {id:'tiktok',label:'TikTok',glyph:'TT',tone:'dark',description:'Conta e dados sociais',premiumOnly:true},
  {id:'google-ads',label:'Google Ads',glyph:'Ads',tone:'blue',description:'Funil de conversões existente; relatórios Ads pendentes',anchor:'google-funnel'},
  {id:'google-search',label:'Google Search Console',glyph:'G',tone:'blue',description:'Pesquisa orgânica',premiumOnly:true},
  {id:'google-business',label:'Google Meu Negócio',glyph:'GB',tone:'blue',description:'Perfil da Empresa no Google',premiumOnly:true},
  {id:'meta-ads',label:'Meta Ads',glyph:'M',tone:'blue',description:'Conta Meta, Pixel e eventos; gestão Ads pendente',anchor:'meta-google-settings'},
  {id:'chatgpt-ads',label:'ChatGPT Ads',glyph:'AI',tone:'dark',description:'Relatórios de publicidade',premiumOnly:true},
  {id:'gojus',label:'GoJus',glyph:'GJ',tone:'violet',description:'Gestão jurídica; conexão por API a validar',premiumOnly:true},
  {id:'crm',label:'CRM externo',glyph:'CRM',tone:'violet',description:'Clientes e oportunidades',premiumOnly:true},
  {id:'agenda',label:'Agenda',glyph:'AG',tone:'blue',description:'Calendários e compromissos',premiumOnly:true},
  {id:'erp',label:'ERP e Financeiro',glyph:'ERP',tone:'green',description:'Pedidos, estoque e financeiro',premiumOnly:true},
  {id:'asaas',label:'Asaas',glyph:'A',tone:'blue',description:'Financeiro; piloto sandbox restrito',premiumOnly:true},
  {id:'other',label:'Outros sistemas',glyph:'+',tone:'neutral',description:'Catálogo de futuras conexões por API',premiumOnly:true},
] as const;
export const ICON_TONES: Readonly<Record<string,string>> = {
  green:'bg-emerald-100 text-emerald-800',pink:'bg-pink-100 text-pink-800',blue:'bg-blue-100 text-blue-800',
  dark:'bg-slate-900 text-white',violet:'bg-violet-100 text-violet-800',neutral:'bg-muted text-foreground',
};
