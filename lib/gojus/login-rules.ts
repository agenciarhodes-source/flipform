export const GOJUS_PROVIDER='gojus_browser';
export const GOJUS_AUTH_METHOD='browser_login';
export type GoJusLogin={url:string;email:string;password:string};
export function exactHttpsUrl(value:unknown):string|null{
  if(typeof value!=='string'||value.length>500)return null;
  try{const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||u.hostname.endsWith('.')||!u.hostname.includes('.')||/^\d+(\.\d+)+$/.test(u.hostname)||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))return null;
    return u.href===value?u.href:null;
  }catch{return null;}
}
export function validatedLogin(body:unknown,allowed:string):GoJusLogin|null{
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  const b=body as Record<string,unknown>;
  if(exactHttpsUrl(allowed)!==allowed||b.url!==allowed||typeof b.email!=='string'||typeof b.password!=='string')return null;
  if(b.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(b.email)||b.password.length<1||b.password.length>1024||/[\u0000-\u001f\u007f]/.test(b.password))return null;
  return {url:allowed,email:b.email,password:b.password};
}
export const LOGIN_RESULTS=['login_ok','login_failed','manual_required','unavailable'] as const;
export type LoginResult=typeof LOGIN_RESULTS[number];
