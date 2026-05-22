import type { EmailTemplateName } from './types';

export type EmailTemplateDefinition = {
  subject: string;
  text: string;
};

export const emailTemplates: Record<EmailTemplateName, EmailTemplateDefinition> = {
  plan_activated: {
    subject: 'SEU PLANO JÁ ESTÁ ATIVO NA FLIPFORM',
    text: `Olá,\n\nSeu plano já está ativo na FlipForm.\n\nEmpresa: {{tenantName}}\nPlano: {{planName}}\nE-mail de acesso: {{email}}\n\nAcesse a plataforma pelo link abaixo:\n{{appLoginUrl}}\n\nPor segurança, defina ou altere sua senha no primeiro acesso.\n\nEm caso de dúvidas, fale com nosso suporte:\natendimento@flipform.com.br`,
  },
  payment_received: {
    subject: 'Pagamento confirmado — FlipForm',
    text: `Olá,\n\nRecebemos a confirmação do seu pagamento.\n\nEmpresa: {{tenantName}}\nPlano: {{planName}}\nValor: {{amount}}\nCiclo/vencimento: {{cycleOrDueDate}}\n\nAcesse sua conta em:\n{{appLoginUrl}}\n\nSuporte: atendimento@flipform.com.br`,
  },
  payment_pending: {
    subject: 'Pagamento pendente — FlipForm',
    text: `Olá,\n\nIdentificamos um pagamento pendente na sua assinatura.\n\nEmpresa: {{tenantName}}\nPlano: {{planName}}\nValor: {{amount}}\nFatura: {{invoiceUrl}}\n\nRegularize dentro do prazo para evitar restrições.\n\nSuporte: atendimento@flipform.com.br`,
  },
  payment_overdue: {
    subject: 'Pagamento vencido — FlipForm',
    text: `Olá,\n\nSeu pagamento está vencido.\n\nEmpresa: {{tenantName}}\nPlano: {{planName}}\nValor: {{amount}}\nFatura: {{invoiceUrl}}\n\nA inadimplência pode gerar restrição de acesso.\n\nSuporte: atendimento@flipform.com.br`,
  },
  subscription_canceled: {
    subject: 'Assinatura cancelada — FlipForm',
    text: `Olá,\n\nConfirmamos o cancelamento da sua assinatura na FlipForm.\n\nEmpresa: {{tenantName}}\nPlano: {{planName}}\nStatus: {{status}}\n\nAcesso e retenção de dados seguem as condições comerciais e obrigações legais vigentes.\n\nSuporte: atendimento@flipform.com.br`,
  },
  tenant_invite: {
    subject: 'Você foi convidado para acessar a FlipForm',
    text: `Olá,\n\nVocê foi convidado para acessar a FlipForm.\n\nTenant: {{tenantName}}\nE-mail: {{email}}\nLink de acesso: {{inviteUrl}}\nValidade: {{expiresAt}}\n\nSe você não reconhece este convite, ignore este e-mail.\n\nSuporte: atendimento@flipform.com.br`,
  },
  deletion_request_received: {
    subject: 'Solicitação de exclusão recebida — FlipForm',
    text: `Olá,\n\nRecebemos sua solicitação de exclusão de conta/dados.\n\nEmpresa: {{tenantName}}\nData da solicitação: {{requestedAt}}\n\nA solicitação será revisada manualmente, considerando obrigações legais e financeiras aplicáveis.\n\nSuporte: atendimento@flipform.com.br`,
  },
};
