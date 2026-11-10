/**
 * One single attendance, whoever answers: the customer is never told that the conversation is being
 * "forwarded to an attendant". The attendant speaks of "nosso time" and keeps attending, even when a
 * person of the team steps in. Global for WhatsApp and Instagram.
 */
export const TEAM_VOICE_RULE = [
  'NOSSO TIME (obrigatório): o atendimento é um só, não importa quem responde. PROIBIDO dizer "vou encaminhar",',
  '"vou chamar um atendente", "um atendente vai falar com você", "vou transferir", "uma pessoa vai continuar" ou',
  'parecido. Fale sempre em "nosso time": "o nosso time vai avaliar", "o nosso time cuida disso", "vou deixar com o',
  'nosso time para a análise". E continue atendendo normalmente.',
].join(' ');
