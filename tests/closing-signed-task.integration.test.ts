import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

test('closing task: explicit approval, tenant scope, atomic once-only creation, revocation', {skip:process.env.CI!=='true'}, async()=>{
  const url=new URL(process.env.DATABASE_URL||'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='5432'||url.pathname!=='/flipform_ci'||url.username!=='postgres')throw Error('Disposable CI DB required');
  const {prisma:db}=await import('../lib/prisma');
  const {approveSignedReturnMode,ensureSignedClosingTask}=await import('../lib/closing-documents/signed-task');
  const suffix=randomUUID();const ids:string[]=[];let userId:string|undefined;
  try {
    const a=await db.tenant.create({data:{name:'Synthetic closing A',slug:'closing-a-'+suffix}});ids.push(a.id);
    const b=await db.tenant.create({data:{name:'Synthetic closing B',slug:'closing-b-'+suffix}});ids.push(b.id);
    const user=await db.user.create({data:{name:'Synthetic owner',email:suffix+'@example.invalid',passwordHash:'synthetic'}});userId=user.id;
    await db.tenantUser.create({data:{tenantId:a.id,userId:user.id,role:'owner',status:'active'}});
    const grant=await db.tenantEntitlementGrant.create({data:{tenantId:a.id,feature:'closing_signed_check',enabled:true,reason:'synthetic test',approvedBy:user.id,startsAt:new Date(Date.now()-60_000),expiresAt:new Date(Date.now()+3_600_000)}});
    const pipeline=await db.pipeline.create({data:{tenantId:a.id,name:'Synthetic'}});
    const stage=await db.pipelineStage.create({data:{pipelineId:pipeline.id,name:'Synthetic',orderIndex:0}});
    const lead=await db.lead.create({data:{tenantId:a.id,pipelineId:pipeline.id,stageId:stage.id,name:'Synthetic',assignedTo:user.id}});
    const contact=await db.externalContactIdentity.create({data:{tenantId:a.id,channel:'whatsapp',externalUserId:suffix}});
    const conversation=await db.conversation.create({data:{tenantId:a.id,channel:'whatsapp',externalContactIdentityId:contact.id,leadId:lead.id}});
    const identity={tenantId:a.id,conversationId:conversation.id,leadId:lead.id};
    const templates=[{id:'a',name:'Template A'},{id:'b',name:'Template B'},{id:'c',name:'Template C'}];
    const sent=await db.auditLog.create({data:{tenantId:a.id,entityType:'conversation',entityId:conversation.id,action:'closing_documents.sent',createdAt:new Date(Date.now()-30_000),metadata:{situation:'adult',confirmedTemplates:templates,sendComplete:true}}});
    for(const t of templates.slice(0,2)){
      const msg=await db.message.create({data:{tenantId:a.id,conversationId:conversation.id,channel:'whatsapp',direction:'inbound',type:'document',externalMessageId:suffix+t.id}});
      await db.leadDocument.create({data:{...identity,messageId:msg.id,itemKey:'closing:'+t.id,detectedType:t.name,status:'received'}});
    }
    assert.equal((await ensureSignedClosingTask(identity)).created,false);
    assert.equal((await approveSignedReturnMode({...identity,tenantId:b.id,userId:user.id,sentId:sent.id,mode:'separate'})).ok,false);
    assert.equal((await approveSignedReturnMode({...identity,userId:user.id,sentId:'old',mode:'separate'})).ok,false);
    assert.equal((await approveSignedReturnMode({...identity,userId:user.id,sentId:sent.id,mode:'package'})).ok,false);
    assert.equal((await approveSignedReturnMode({...identity,userId:user.id,sentId:sent.id,mode:'separate'})).ok,true);
    assert.equal(await db.task.count({where:{tenantId:a.id,leadId:lead.id}}),0);
    const msg=await db.message.create({data:{tenantId:a.id,conversationId:conversation.id,channel:'whatsapp',direction:'inbound',type:'document',externalMessageId:suffix+'c'}});
    await db.leadDocument.create({data:{...identity,messageId:msg.id,itemKey:'closing:c',detectedType:'Template C',status:'received'}});
    await db.tenantEntitlementGrant.update({where:{id:grant.id},data:{revokedAt:new Date()}});
    assert.equal((await ensureSignedClosingTask(identity)).created,false);
    await db.tenantEntitlementGrant.update({where:{id:grant.id},data:{revokedAt:null}});
    const result=await Promise.all([ensureSignedClosingTask(identity),ensureSignedClosingTask(identity),ensureSignedClosingTask(identity)]);
    assert.equal(result.filter(r=>r.created).length,1);
    const tasks=await db.task.findMany({where:{tenantId:a.id,leadId:lead.id}});
    assert.equal(tasks.length,1);assert.equal(tasks[0].assignedTo,user.id);assert.equal(tasks[0].priority,'high');
    assert.equal(await db.auditLog.count({where:{tenantId:a.id,entityId:conversation.id,action:'closing_documents.all_signed'}}),1);
    assert.equal((await ensureSignedClosingTask(identity)).created,false);
    assert.equal(await db.task.count({where:{tenantId:b.id}}),0);
  } finally {
    if(ids.length){
      const where={tenantId:{in:ids}};
      await db.task.deleteMany({where});await db.leadDocument.deleteMany({where});await db.auditLog.deleteMany({where});
      await db.message.deleteMany({where});await db.conversation.deleteMany({where});await db.externalContactIdentity.deleteMany({where});
      await db.tenantEntitlementGrant.deleteMany({where});await db.lead.deleteMany({where});
      await db.pipelineStage.deleteMany({where:{pipeline:{tenantId:{in:ids}}}});await db.pipeline.deleteMany({where});await db.tenantUser.deleteMany({where});await db.tenant.deleteMany({where:{id:{in:ids}}});
    }
    if(userId)await db.user.delete({where:{id:userId}});
    await db.$disconnect();
  }
});
