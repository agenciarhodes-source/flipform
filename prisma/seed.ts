import { PrismaClient } from '@prisma/client';

type Role = 'owner' | 'admin' | 'manager' | 'agent' | 'viewer';
type LeadTemperature = 'cold' | 'warm' | 'hot';
type LeadStatus = 'open' | 'won' | 'lost';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding LeadFlow...');

  // Clean (apenas para demo)
  await prisma.auditLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.note.deleteMany();
  await prisma.leadStageHistory.deleteMany();
  await prisma.leadAnswer.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.formField.deleteMany();
  await prisma.form.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.tenantUser.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();


  const commercialPlans = [
    {
      slug: 'starter', name: 'Starter', description: 'Plano de entrada para pequenos negócios que precisam capturar, organizar e acompanhar leads.',
      price: '97', billingCycle: 'monthly', maxUsers: 3, maxForms: 5, maxPipelines: 2, maxLeadsPerMonth: 2500,
      canUseReports: false, canExportCsv: true, canUseCustomBranding: false, canUseMetaPixel: false, canUseWebhooks: false, canUseTasks: true, isActive: true,
    },
    {
      slug: 'growth', name: 'Growth', description: 'Plano recomendado para empresas em crescimento que precisam de CRM, funil, formulários e integrações.',
      price: '157', billingCycle: 'monthly', maxUsers: 7, maxForms: 15, maxPipelines: 5, maxLeadsPerMonth: 10000,
      canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true, isActive: true,
    },
    {
      slug: 'pro', name: 'Pro', description: 'Plano profissional para operações comerciais com volume, múltiplas equipes e integrações avançadas.',
      price: '397', billingCycle: 'monthly', maxUsers: 20, maxForms: 60, maxPipelines: 25, maxLeadsPerMonth: 75000,
      canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true, isActive: true,
    },
    {
      slug: 'enterprise', name: 'Enterprise', description: 'Plano sob consulta para operações com necessidades customizadas, SLA dedicado e suporte avançado.',
      price: '0', billingCycle: 'monthly', maxUsers: 0, maxForms: 0, maxPipelines: 0, maxLeadsPerMonth: 0,
      canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true, isActive: true,
    },
  ] as const;

  for (const plan of commercialPlans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: plan as any,
      update: plan as any,
    });
  }

  // Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'LeadFlow Demo',
      slug: 'leadflow-demo',
      primaryColor: '#2563EB',
      status: 'active',
    },
  });

  // Usuários
  const ownerPassword = await bcrypt.hash('demo123', 10);
  const owner = await prisma.user.create({
    data: { name: 'Demo Owner', email: 'demo@leadflow.com', passwordHash: ownerPassword },
  });
  const manager = await prisma.user.create({
    data: { name: 'Carlos Gestor', email: 'carlos@leadflow.com', passwordHash: ownerPassword },
  });
  const agent = await prisma.user.create({
    data: { name: 'Ana Vendas', email: 'ana@leadflow.com', passwordHash: ownerPassword },
  });

  await prisma.tenantUser.createMany({
    data: [
      { tenantId: tenant.id, userId: owner.id, role: 'owner' },
      { tenantId: tenant.id, userId: manager.id, role: 'manager' },
      { tenantId: tenant.id, userId: agent.id, role: 'agent' },
    ],
  });

  await prisma.allowedUser.createMany({
    data: [
      { email: owner.email, tenantId: tenant.id, role: 'owner', active: true, status: 'active', source: 'seed', acceptedAt: new Date() },
      { email: manager.email, tenantId: tenant.id, role: 'manager', active: true, status: 'active', source: 'seed', acceptedAt: new Date() },
      { email: agent.email, tenantId: tenant.id, role: 'agent', active: true, status: 'active', source: 'seed', acceptedAt: new Date() },
    ],
  });

  // Pipeline padrão
  const pipeline = await prisma.pipeline.create({
    data: { tenantId: tenant.id, name: 'Funil de Vendas', isDefault: true },
  });

  const stagesData = [
    { name: 'Novo lead', color: '#3B82F6' },
    { name: 'Primeiro contato', color: '#8B5CF6' },
    { name: 'Qualificado', color: '#06B6D4' },
    { name: 'Proposta enviada', color: '#F59E0B' },
    { name: 'Negociação', color: '#EC4899' },
    { name: 'Ganho', color: '#10B981' },
    { name: 'Perdido', color: '#EF4444' },
  ];

  const stages = [];
  for (let i = 0; i < stagesData.length; i++) {
    const s = await prisma.pipelineStage.create({
      data: { pipelineId: pipeline.id, name: stagesData[i].name, color: stagesData[i].color, orderIndex: i },
    });
    stages.push(s);
  }

  // Formulário demo
  const form = await prisma.form.create({
    data: {
      tenantId: tenant.id,
      name: 'Capturação Site',
      publicTitle: 'Quer turbinar seu time comercial?',
      publicDescription: 'Preencha em 1 minuto e nosso time entra em contato.',
      slug: 'turbinar-comercial',
      primaryColor: '#2563EB',
      successMessage: 'Obrigado! Recebemos seu contato e em breve falaremos com você.',
      pipelineId: pipeline.id,
      initialStageId: stages[0].id,
      isActive: true,
    },
  });

  const fields = [
    { label: 'Qual seu nome?', placeholder: 'Seu nome completo', fieldType: 'name', isRequired: true, orderIndex: 0 },
    { label: 'Qual seu melhor e-mail?', placeholder: 'voce@empresa.com', fieldType: 'email', isRequired: true, orderIndex: 1 },
    { label: 'WhatsApp para contato', placeholder: '(11) 99999-9999', fieldType: 'phone', isRequired: true, orderIndex: 2 },
    { label: 'Qual o tamanho do seu time comercial?', fieldType: 'single_select', options: ['1-5', '6-15', '16-50', '50+'], isRequired: true, orderIndex: 3 },
    { label: 'O que mais te incomoda hoje?', fieldType: 'long_text', placeholder: 'Conte um pouco sobre seu desafio...', isRequired: false, orderIndex: 4 },
    { label: 'De 1 a 10, quão urgente é resolver isso?', fieldType: 'rating', isRequired: false, orderIndex: 5 },
  ];

  for (const f of fields) {
    await prisma.formField.create({
      data: {
        formId: form.id,
        label: f.label,
        placeholder: f.placeholder ?? null,
        fieldType: f.fieldType,
        options: f.options ? f.options : undefined,
        isRequired: f.isRequired,
        orderIndex: f.orderIndex,
      },
    });
  }

  // Leads mockados (20)
  const mockLeads = [
    { name: 'Roberto Silva', email: 'roberto@acme.com', phone: '(11) 98765-4321', stageIdx: 0, temp: 'hot' },
    { name: 'Mariana Costa', email: 'mariana@startup.io', phone: '(11) 99887-7766', stageIdx: 0, temp: 'warm' },
    { name: 'Felipe Santos', email: 'felipe@techbr.com', phone: '(21) 98877-6655', stageIdx: 0, temp: 'cold' },
    { name: 'Juliana Almeida', email: 'juliana@growth.co', phone: '(11) 97766-5544', stageIdx: 1, temp: 'warm' },
    { name: 'Lucas Oliveira', email: 'lucas@ecommerce.com', phone: '(11) 96655-4433', stageIdx: 1, temp: 'hot' },
    { name: 'Patricia Lima', email: 'patricia@retail.com', phone: '(31) 95544-3322', stageIdx: 1, temp: 'cold' },
    { name: 'Ricardo Mendes', email: 'ricardo@indus.com.br', phone: '(11) 94433-2211', stageIdx: 2, temp: 'hot' },
    { name: 'Camila Rocha', email: 'camila@servicos.com', phone: '(11) 93322-1100', stageIdx: 2, temp: 'warm' },
    { name: 'Diego Ferreira', email: 'diego@logistica.com', phone: '(11) 92211-0099', stageIdx: 2, temp: 'warm' },
    { name: 'Fernanda Souza', email: 'fer@consult.com.br', phone: '(11) 91100-9988', stageIdx: 3, temp: 'hot' },
    { name: 'Andre Pereira', email: 'andre@digital.io', phone: '(11) 90099-8877', stageIdx: 3, temp: 'hot' },
    { name: 'Beatriz Martins', email: 'bia@agency.com', phone: '(11) 98899-7766', stageIdx: 3, temp: 'warm' },
    { name: 'Gustavo Reis', email: 'gustavo@saas.io', phone: '(21) 97788-6655', stageIdx: 4, temp: 'hot' },
    { name: 'Larissa Dias', email: 'larissa@bio.com', phone: '(11) 96677-5544', stageIdx: 4, temp: 'hot' },
    { name: 'Marcos Alves', email: 'marcos@fintech.com', phone: '(11) 95566-4433', stageIdx: 4, temp: 'warm' },
    { name: 'Renata Cardoso', email: 'renata@health.io', phone: '(11) 94455-3322', stageIdx: 5, temp: 'hot' },
    { name: 'Thiago Nascimento', email: 'thiago@edu.br', phone: '(11) 93344-2211', stageIdx: 5, temp: 'hot' },
    { name: 'Vanessa Carvalho', email: 'vanessa@market.com', phone: '(31) 92233-1100', stageIdx: 5, temp: 'warm' },
    { name: 'Eduardo Barros', email: 'eduardo@auto.com', phone: '(11) 91122-0099', stageIdx: 6, temp: 'cold' },
    { name: 'Aline Ribeiro', email: 'aline@beauty.com', phone: '(11) 90011-9988', stageIdx: 6, temp: 'cold' },
  ];

  for (let i = 0; i < mockLeads.length; i++) {
    const ml = mockLeads[i];
    const stage = stages[ml.stageIdx];
    const status: LeadStatus = stage.name === 'Ganho' ? 'won' : stage.name === 'Perdido' ? 'lost' : 'open';
    const lead = await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        formId: form.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        assignedTo: i % 2 === 0 ? agent.id : manager.id,
        name: ml.name,
        email: ml.email,
        phone: ml.phone,
        source: i % 3 === 0 ? 'formulario' : i % 3 === 1 ? 'site' : 'indicacao',
        status,
        temperature: ml.temp as LeadTemperature,
        tags: i % 4 === 0 ? ['vip', 'inbound'] : i % 3 === 0 ? ['novo'] : [],
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000),
      },
    });
    // Histórico inicial
    await prisma.leadStageHistory.create({
      data: { leadId: lead.id, fromStageId: null, toStageId: stages[0].id, changedBy: owner.id },
    });
    if (ml.stageIdx > 0) {
      await prisma.leadStageHistory.create({
        data: { leadId: lead.id, fromStageId: stages[0].id, toStageId: stage.id, changedBy: agent.id },
      });
    }
  }

  console.log('✅ Seed completo!');
  console.log('   Login: demo@leadflow.com / demo123');
  console.log(`   Form público: /f/${form.slug}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
