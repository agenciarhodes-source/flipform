/**
 * Sending the documents that finish the attendance (procuração, contrato, declarações). The
 * customer fills them in: the files go as they are. The AI decides the moment from the company's
 * text and says who signs; the system sends the files and how to fill and sign them.
 * Pure rules, easy to test.
 */

export type SigningSituation = 'adult' | 'minor' | 'rogo';

/** A new send of the same documents only after this time (the customer lost them, asked again). */
export const CLOSING_RESEND_GAP_MS = 60 * 60_000;

const MARKER = /\[\s*ENVIAR[_\s]DOCUMENTOS\s*(?::\s*([^\]]{0,30}))?\]/gi;

function situationOf(value: string | undefined): SigningSituation {
  const text = (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/rogo|nao (sabe|consegue)|analfabet|digital/.test(text)) return 'rogo';
  if (/menor|crianca|responsavel|filh/.test(text)) return 'minor';
  return 'adult';
}

/** The reply without the marker, and who signs when the documents must go now (null: not now). */
export function extractSendDocuments(reply: string): { reply: string; send: SigningSituation | null } {
  let send: SigningSituation | null = null;
  const cleaned = reply.replace(MARKER, (_match, who: string | undefined) => {
    if (!send) send = situationOf(who);
    return '';
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { reply: cleaned, send };
}

/** Models for the case of this conversation: those of its case type, or those for every case. */
export function templatesForCase<T extends { checklistIds: string[] }>(templates: T[], checklistId: string | null) {
  const own = checklistId ? templates.filter((template) => template.checklistIds.includes(checklistId)) : [];
  return own.length ? own : templates.filter((template) => template.checklistIds.length === 0);
}

/** What the AI reads: when to send, who signs, and whether they already went. */
export function closingInstruction(input: { sendWhen: string; fileNames: string[]; sentAt: Date | null }) {
  return [
    `DOCUMENTOS PARA FINALIZAR O ATENDIMENTO (${input.fileNames.join(', ')}): o cliente preenche e assina estes documentos.`,
    `QUANDO ENVIAR (regra da empresa): ${input.sendWhen.trim()}`,
    input.sentAt
      ? `Eles JÁ FORAM ENVIADOS nesta conversa (${input.sentAt.toISOString().slice(0, 10)}). Não mande de novo, a não ser que o`
        + ' cliente peça ou diga que perdeu. Quando o cliente mandar de volta os documentos preenchidos e assinados (fotos ou PDF),'
        + ' agradeça e crie [TAREFA_EQUIPE: Conferir os documentos assinados que o cliente enviou].'
      : 'Ainda NÃO foram enviados.',
    'Para enviar, escreva no FIM da resposta, numa linha separada: [ENVIAR_DOCUMENTOS: adulto], [ENVIAR_DOCUMENTOS: menor] ou'
      + ' [ENVIAR_DOCUMENTOS: rogo]. O cliente não vê essa linha; o sistema manda os arquivos logo depois da sua mensagem, com a'
      + ' explicação de como preencher e assinar. Na sua mensagem, só avise que vai mandar os documentos (sem explicar a assinatura).',
    'QUEM ASSINA: "adulto" = o próprio cliente, maior de 18, que lê e assina (idade avançada, sozinha, não muda isso);'
      + ' "menor" = o beneficiário tem menos de 18 anos: preenche e assina o pai, a mãe ou o responsável legal (com 16 ou 17'
      + ' anos, o adolescente também assina); "rogo" = o cliente não sabe ler ou não consegue assinar: outra pessoa assina a'
      + ' rogo, com 2 testemunhas e a digital do cliente. Se o cliente tem 60 anos ou mais e você não sabe se ele assina, pergunte'
      + ' com delicadeza antes ("Você consegue assinar o seu nome, ou prefere que outra pessoa assine por você?"). Se o cliente'
      + ' falar em curador, curatela ou interdição, NÃO envie: crie [TAREFA_EQUIPE: Cliente com curatela: analisar quem assina].',
  ].join('\n');
}

/** Bytes of each file go as a document; this text follows them. */
export function signingInstructions(situation: SigningSituation, fileCount: number) {
  const files = fileCount > 1 ? 'os documentos' : 'o documento';
  const back = 'Depois, é só mandar aqui nesta conversa uma foto nítida de *todas as páginas* (ou o PDF assinado). 😊';
  if (situation === 'rogo') {
    return [
      `Como preencher e assinar ${files}:`,
      `1. Imprima ${files}.`,
      '2. Uma pessoa de sua confiança preenche os seus dados nos espaços em branco.',
      '3. Coloque a sua *digital* (polegar direito) no quadro *"Digital do outorgante"*, usando uma almofada de carimbo.',
      '4. Essa pessoa assina no campo *"Assinatura do rogado"* (assina por você), e *2 testemunhas* assinam e colocam o nome e o CPF.',
      back,
    ].join('\n');
  }
  const who = situation === 'minor'
    ? 'Quem preenche e assina é o *pai, a mãe ou o responsável legal*: no começo, os dados da criança (outorgante); em "neste ato representado por", os dados do responsável. Se o adolescente tiver 16 ou 17 anos, ele também assina.'
    : 'Preencha os seus dados nos espaços em branco (nome, CPF, endereço…).';
  return [
    `Como preencher e assinar ${files}:`,
    who,
    'Você pode assinar de dois jeitos:',
    '✍️ *À mão:* imprima, preencha com letra legível e assine igual ao seu documento.',
    '📱 *Pelo gov.br:* preencha o PDF no celular ou computador, abra o app gov.br (ou o site assinador.iti.br), entre com a sua conta gov.br (nível prata ou ouro), escolha "Assinar documento", envie o PDF, assine e baixe o arquivo assinado.',
    back,
  ].join('\n');
}
