/** Operational archive policy, independent of the provider and generated PDFs. */
export const WHATSAPP_BACKUP_DAYS = 30;
export const WHATSAPP_BACKUP_MS = WHATSAPP_BACKUP_DAYS * 86_400_000;
export function backupCutoff(now:Date){return new Date(now.getTime()-WHATSAPP_BACKUP_MS);}
// Also cap existing outgoing R2 copies while the legacy send path is still in use.
export function backupWindow(now:Date){
  return {OR:[{NOT:{OR:[{sessionRef:{startsWith:'whatsapp:'}},{sessionRef:{startsWith:'inbox:'}}]}},{createdAt:{gt:backupCutoff(now)}}]};
}
export function effectiveAttachmentExpiry(row:{sessionRef:string;createdAt:Date;expiresAt:Date}){
  return /^(whatsapp|inbox):/.test(row.sessionRef)?new Date(Math.min(row.expiresAt.getTime(),row.createdAt.getTime()+WHATSAPP_BACKUP_MS)):row.expiresAt;
}
