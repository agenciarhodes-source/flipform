import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { universalConnectAllowed } from '@/lib/universal-connectors/policy';
import { assertAdsScope, type AdsScope } from './read-plan';
import { campaignDigest, normalizeCampaignPlan, planInput, nextDraftState, type CampaignPlan, type BudgetPolicy, type DraftCommand, type DraftState } from './campaign-planner';

type Policy = Readonly<{ grants: readonly AdsScope[]; budget: BudgetPolicy }>;
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;
const deny = () => new Error('ADS_DRAFT_UNAVAILABLE');

/** Internal service only. Callers must supply a verified session and server-owned account/budget
 * policy, never values copied from an HTTP request. No route, scheduler or provider transport. */
async function authorize(tx: Prisma.TransactionClient, session: SessionPayload, scope: AdsScope, policy: Policy) {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.FLIP_ADS_DRAFT_PREVIEW_ENABLED !== 'true'
    || !universalConnectAllowed(scope.tenantId) || session.tenantId !== scope.tenantId ||
    session.role !== 'owner' || session.globalRole === 'platform_admin') throw deny();
  assertAdsScope(scope,policy.grants);
  const [user, member, tenant, subscription] = await Promise.all([
    tx.user.findUnique({ where:{id:session.userId},select:{sessionVersion:true,globalRole:true} }),
    tx.tenantUser.findFirst({ where:{tenantId:scope.tenantId,userId:session.userId,role:'owner',status:'active'},select:{userId:true} }),
    tx.tenant.findUnique({where:{id:scope.tenantId},select:{status:true,plan:{select:{slug:true,isActive:true}}}}),
    tx.subscription.findFirst({where:{tenantId:scope.tenantId},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{status:true,plan:{select:{slug:true,isActive:true}}}}),
  ]);
  if (!user || user.globalRole === 'platform_admin' || user.sessionVersion !== (session.sv ?? 0) || !member ||
    !tenant || tenant.status !== 'active' || tenant.plan?.slug !== 'premium-pro' || !tenant.plan.isActive ||
    !subscription || subscription.status !== 'active' || subscription.plan.slug !== 'premium-pro' || !subscription.plan.isActive) throw deny();
}
export async function createCampaignDraft(session: SessionPayload, scope: AdsScope, policy: Policy, input: unknown, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    await authorize(tx,session,scope,policy);
    const plan = normalizeCampaignPlan(scope,policy.grants,policy.budget,input);
    const digest = campaignDigest(scope,1,plan);
    const count = await tx.flipAdsCampaignDraft.count({where:{tenantId:scope.tenantId}});
    if (count >= 100) throw new Error('ADS_DRAFT_LIMIT');
    const draft = await tx.flipAdsCampaignDraft.create({ data:{...scope,plan:plan as unknown as Prisma.InputJsonObject,digest,createdBy:session.userId} });
    await tx.flipAdsDraftAudit.create({data:{tenantId:scope.tenantId,draftId:draft.id,actorId:session.userId,action:'created',revision:1,digest}});
    return draft;
  },serializable);
}
export async function changeCampaignDraft(session: SessionPayload, scope: AdsScope, policy: Policy, id: string, expectedRevision: number, expectedDigest: string, command: DraftCommand, input?: unknown, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    await authorize(tx,session,scope,policy);
    const row = await tx.flipAdsCampaignDraft.findFirst({where:{...scope,id}});
    if (!row || row.revision !== expectedRevision || row.digest !== expectedDigest) throw new Error('ADS_DRAFT_CONFLICT');
    const next = nextDraftState(row.state as DraftState,command);
    const oldPlan = normalizeCampaignPlan(scope,policy.grants,policy.budget,planInput(row.plan as unknown as CampaignPlan));
    if (campaignDigest(scope,row.revision,oldPlan) !== row.digest) throw new Error('ADS_DRAFT_INTEGRITY');
    const revision = command === 'edit' ? row.revision+1 : row.revision;
    const plan = command === 'edit' ? normalizeCampaignPlan(scope,policy.grants,policy.budget,input) : oldPlan;
    if (command !== 'edit' && input !== undefined) throw new Error('ADS_COMMAND_INVALID');
    const digest = campaignDigest(scope,revision,plan);
    const updated = await tx.flipAdsCampaignDraft.updateMany({where:{...scope,id,revision:row.revision,digest:row.digest,state:row.state},
      data:{state:next,revision,digest,plan:plan as unknown as Prisma.InputJsonObject,
        approvedBy:next==='approved'?session.userId:null,approvedAt:next==='approved'?new Date():null}});
    if (updated.count!==1) throw new Error('ADS_DRAFT_CONFLICT');
    const actions = {edit:'edited',submit:'submitted',approve:'approved',reject:'rejected'} as const;
    await tx.flipAdsDraftAudit.create({data:{tenantId:scope.tenantId,draftId:id,actorId:session.userId,action:actions[command],revision,digest}});
    return tx.flipAdsCampaignDraft.findFirstOrThrow({where:{...scope,id}});
  },serializable);
}
export async function listCampaignDrafts(session: SessionPayload, scope: AdsScope, policy: Policy, db: PrismaClient = prisma) {
  return db.$transaction(async tx=>{await authorize(tx,session,scope,policy);return tx.flipAdsCampaignDraft.findMany({where:scope,orderBy:{updatedAt:'desc'},take:100});},serializable);
}
