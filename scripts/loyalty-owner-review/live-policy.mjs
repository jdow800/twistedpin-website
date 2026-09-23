// Operator-only test boundary. This does not restore guest-facing phone matching.
export const PRODUCTS=new Set(['aea165f3-6f78-4341-9f7d-68a7caab3fa3','6464132b-4050-4eae-8361-93dd21b2f077','38134c80-74f5-4420-add9-134f95e7543d','7ffa6080-167c-47b2-969e-bb4653bcc531']);
const digits=x=>String(x??'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const itemsMatch=items=>Array.isArray(items)&&items.length===1&&PRODUCTS.has(items[0]?.productId)&&items[0]?.quantity===1;
export function allowOwnerWrite({method,path,body,trial,state,now=Date.now()}){
 if(!trial?.commitVerified||trial.mode!=='owner-live'||!Number.isFinite(Date.parse(trial.deadline)))return false;
 if(method==='POST'&&path==='/api/checkout/convert'){
  // An already-started charge must be allowed to reach conversion/refund even if
  // the coupon's short test deadline passed during card confirmation.
  return now<Date.parse(trial.deadline)+30*60000&&body?.couponCode===trial.code&&
   !!state.cartToken&&body.cartToken===state.cartToken&&state.intentIds.has(body.paymentIntentId)&&itemsMatch(body.items);
 }
 if(method==='DELETE'&&path.startsWith('/api/cart/items/')){
  return !!state.cartToken&&state.lineRefs.has(decodeURIComponent(path.slice('/api/cart/items/'.length)));
 }
 if(now>=Date.parse(trial.deadline)||state.bookingId)return false;
 if(method==='GET'&&path==='/api/cart')return true;
 if(method==='POST'&&path==='/api/cart/items')return itemsMatch(body);
 if(method==='POST'&&path==='/api/checkout/payment-intents'){
  return !!state.cartToken&&body?.couponCode===trial.code&&itemsMatch(body.items)&&
   digits(body.customer?.phone)===trial.phone&&
   String(body.customer?.email??'').trim().toLowerCase()===trial.email.toLowerCase();
 }
 return false;
}
export function recordOwnerResponse({path,body,response,state}){
 if(path==='/api/cart/items'||path==='/api/cart'){
  if(response.cartToken)state.cartToken=response.cartToken;
  state.lineRefs=new Set((response.holds??[]).map(h=>h.cartLineRef));
 }
 if(path==='/api/checkout/payment-intents'&&response.paymentIntentId)state.intentIds.add(response.paymentIntentId);
 if(path==='/api/checkout/convert'&&response.bookingId)state.bookingId=response.bookingId;
}
