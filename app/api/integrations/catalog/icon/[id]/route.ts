import { NextResponse, type NextRequest } from 'next/server';
import { getVerifiedSessionFromRequest } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { validateIcon } from '@/lib/integration-catalog/validation';

export const dynamic='force-dynamic';
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}) {
  const session=await getVerifiedSessionFromRequest(req);
  if(!session || (session.globalRole!=='platform_admin' && (!session.tenantId || !can(session.role,'INTEGRATIONS_VIEW')))) return new NextResponse(null,{status:403});
  const {id}=await ctx.params;
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return new NextResponse(null,{status:404});
  try {
    const row=await prisma.platformCatalogApp.findUnique({where:{id},select:{iconPng:true,iconDigest:true}});
    const checked=row?.iconPng ? validateIcon(row.iconPng) : null;
    if(!checked||checked.iconDigest!==row?.iconDigest) return new NextResponse(null,{status:404});
    return new NextResponse(Uint8Array.from(Buffer.from(checked.iconPng,'base64')),{headers:{
      'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'
    }});
  }catch{return new NextResponse(null,{status:503});}
}
