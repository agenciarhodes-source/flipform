import { z } from 'zod';
import { createHash } from 'node:crypto';
import { PLAN_SLUGS, MAX_PNG_BYTES } from './presentation';

export const catalogInput = z.object({
  id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  expectedRevision:z.number().int().min(0).max(1000000000),
  label:z.string().trim().min(1).max(80),
  description:z.string().trim().max(300),
  category:z.string().trim().min(1).max(60),
  sortOrder:z.number().int().min(0).max(9999),
  planSlugs:z.array(z.enum(PLAN_SLUGS)).max(8).refine(a=>new Set(a).size===a.length),
  iconPng:z.string().max(87384).nullable().optional(),
}).strict();

/** Raster PNG only. Bound encoded length, dimensions, complete chunk framing and terminal IEND.
 * Never accept SVG, HTML, remote URLs, arbitrary MIME types or unbounded image data.
 */
export function validateIcon(png:string): { iconPng:string; iconDigest:string } | null {
  if (!png || png.length>87384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(png)) return null;
  const bytes=Buffer.from(png,'base64');
  if(bytes.toString('base64')!==png || bytes.length>MAX_PNG_BYTES || bytes.length<45 ||
     !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return null;
  let offset=8, first=true, idat=false;
  while(offset+12<=bytes.length) {
    const len=bytes.readUInt32BE(offset), end=offset+12+len;
    if(end>bytes.length) return null;
    const type=bytes.toString('ascii',offset+4,offset+8);
    if(first) {
      if(type!=='IHDR'||len!==13) return null;
      const w=bytes.readUInt32BE(offset+8), h=bytes.readUInt32BE(offset+12);
      if(!w||!h||w>256||h>256) return null;
      first=false;
    } else if(type==='IHDR') return null;
    if(type==='IDAT') idat=true;
    if(type==='IEND') return len===0 && idat && end===bytes.length ? {iconPng:png,iconDigest:createHash('sha256').update(bytes).digest('hex')} : null;
    offset=end;
  }
  return null;
}
