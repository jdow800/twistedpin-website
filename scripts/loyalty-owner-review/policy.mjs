// Fail-closed read-only allowlist. No account, consent, cart, hold or payment route.
const GET=new Set(['/api/products','/api/products/bookable','/api/availability','/api/availability/month','/api/availability/slot']);
const POST=new Set(['/api/checkout/quote','/api/checkout/coupon-preview','/api/checkout/optin-reward-preview']);
export function allowRequest({method,path,body,code,phone}){
 if(!path.startsWith('/api/')||path.includes('..')||path.includes('%')||path.includes('\\'))return false;
 if(method==='GET')return GET.has(path)||/^\/api\/products\/[0-9a-f-]{36}\/forms$/i.test(path);
 if(method!=='POST'||!POST.has(path)||!body||typeof body!=='object'||Array.isArray(body))return false;
 if(body.couponCode&&body.couponCode!==code)return false;
 for(const number of [body.phone,body.customerIdentity?.phone]){
  if(number&&String(number).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'')!==phone)return false;
 }
 return true;
}
