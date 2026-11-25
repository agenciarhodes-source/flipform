import { WHATSAPP_CALLING_DEFAULTS } from './whatsapp-calling-policy';
/** Accounting estimate ONLY, not Twilio/Meta provider invoices. */
export function whatsappEstimatedTerminalSpend(
  status:'completed'|'busy'|'no-answer'|'failed'|'canceled',
  durationSeconds:number|null,
  reservedMicros:bigint,
):bigint|null {
  if(reservedMicros<0n)return null;
  if(status!=='completed')return 0n;
  if(!Number.isSafeInteger(durationSeconds)||durationSeconds===null
     ||durationSeconds<0||durationSeconds>3600)return null;
  const cost=BigInt(Math.ceil(Math.max(1,durationSeconds)/60))*
    WHATSAPP_CALLING_DEFAULTS.estimatedCombinedUsdMicrosPerMinute;
  return cost<=reservedMicros?cost:null;
}
