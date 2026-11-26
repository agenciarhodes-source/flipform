import { createHash } from 'node:crypto';
import { assertAdsScope, assertAdsWindow, type AdsScope } from './read-plan';

const REGIONS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
export type DraftState = 'draft' | 'review' | 'approved' | 'rejected';
export type DraftCommand = 'edit' | 'submit' | 'approve' | 'reject';
export type BudgetPolicy = Readonly<{ currency: 'BRL'; maxDailyMinor: number; maxTotalMinor: number }>;
export type CampaignPlan = Readonly<{
  name: string; objective: 'leads' | 'traffic' | 'sales';
  channel: 'meta_social' | 'google_search';
  currency: 'BRL'; dailyMinor: number; totalMinor: number;
  start: string; end: string; regions: string[];
  creatives: { assetRef: string; headline: string }[];
}>;
function plainObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('ADS_PLAN_INVALID');
  return input as Record<string, unknown>;
}
function exactKeys(o: Record<string, unknown>, keys: string[]) {
  if (Object.keys(o).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(o,k))) throw new Error('ADS_PLAN_INVALID');
}
function text(v: unknown, max: number) {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new Error('ADS_PLAN_INVALID');
  return v.trim();
}
function money(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0 || v > 100_000_000) throw new Error('ADS_BUDGET_INVALID');
  return v;
}
export function normalizeCampaignPlan(scope: AdsScope, grants: readonly AdsScope[], policy: BudgetPolicy, input: unknown): CampaignPlan {
  assertAdsScope(scope, grants);
  const o = plainObject(input);
  exactKeys(o,['name','objective','channel','currency','dailyMinor','start','end','regions','creatives']);
  const name = text(o.name,100);
  if (o.objective !== 'leads' && o.objective !== 'traffic' && o.objective !== 'sales') throw new Error('ADS_OBJECTIVE_INVALID');
  const channel = scope.provider === 'meta_ads' ? 'meta_social' : 'google_search';
  if (o.channel !== channel || o.currency !== 'BRL' || policy.currency !== 'BRL') throw new Error('ADS_CHANNEL_INVALID');
  const start = text(o.start,10), end = text(o.end,10);
  assertAdsWindow({ since: start, until: end });
  const days = (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000 + 1;
  const dailyMinor = money(o.dailyMinor), totalMinor = money(dailyMinor * days);
  if (dailyMinor > money(policy.maxDailyMinor) || totalMinor > money(policy.maxTotalMinor)) throw new Error('ADS_BUDGET_CAP');
  if (!Array.isArray(o.regions) || !o.regions.length || o.regions.length > 27) throw new Error('ADS_TARGET_INVALID');
  const regions = o.regions.map(v => text(v,2));
  if (new Set(regions).size !== regions.length || regions.some(v => !REGIONS.has(v))) throw new Error('ADS_TARGET_INVALID');
  if (!Array.isArray(o.creatives) || !o.creatives.length || o.creatives.length > 10) throw new Error('ADS_CREATIVE_INVALID');
  const creatives = o.creatives.map(v => {
    const c = plainObject(v); exactKeys(c,['assetRef','headline']);
    const assetRef = text(c.assetRef,64);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(assetRef)) throw new Error('ADS_CREATIVE_INVALID');
    return { assetRef, headline:text(c.headline,90) };
  });
  if (new Set(creatives.map(c => c.assetRef)).size !== creatives.length) throw new Error('ADS_CREATIVE_INVALID');
  return { name, objective:o.objective, channel, currency:'BRL', dailyMinor, totalMinor, start, end, regions:regions.sort(), creatives };
}
export function planInput(p: CampaignPlan) {
  const { totalMinor: _computed, ...input } = p;
  return input;
}
export function campaignDigest(scope: AdsScope, revision: number, plan: CampaignPlan): string {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('ADS_REVISION_INVALID');
  return createHash('sha256').update(JSON.stringify(['flip-ads-draft-v1',scope.tenantId,scope.provider,scope.accountId,revision,plan])).digest('hex');
}
export function nextDraftState(state: DraftState, command: DraftCommand): DraftState {
  if (command === 'edit' && ['draft','review','approved','rejected'].includes(state)) return 'draft';
  if (command === 'submit' && state === 'draft') return 'review';
  if (command === 'approve' && state === 'review') return 'approved';
  if (command === 'reject' && state === 'review') return 'rejected';
  throw new Error('ADS_TRANSITION_INVALID');
}
/** Recommendations only. Missing or unverified data must never drive spend. */
export function budgetAdvice(input: { complete: boolean; spendMinor: number; contracts: number | null; targetCpaMinor: number; minContracts: number }): 'insufficient_data' | 'review_cost' | 'maintain_review' {
  if (!input.complete || input.contracts === null || ![input.spendMinor,input.contracts,input.targetCpaMinor,input.minContracts].every(n=>Number.isSafeInteger(n)&&n>=0) ||
    input.minContracts < 3 || input.targetCpaMinor < 1 || input.spendMinor < 1 || input.contracts < input.minContracts) return 'insufficient_data';
  return input.spendMinor / input.contracts > input.targetCpaMinor ? 'review_cost' : 'maintain_review';
}
