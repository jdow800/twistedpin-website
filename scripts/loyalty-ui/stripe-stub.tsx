// TEST HARNESS ONLY. No Stripe.js load, card collection or payment-provider request.
import type { ReactNode } from 'react';
export function Elements({children}:{children:ReactNode}) { return <>{children}</>; }
export function PaymentElement() { return <div style={{border:'1px dashed var(--tw-border-strong)',borderRadius:7,padding:'24px 16px',textAlign:'center',fontSize:12,fontWeight:600,color:'var(--tw-text-dim)'}}>Payment form placeholder<br/>No card details collected in this preview.</div>; }
const elements = {update:()=>{},submit:async()=>({})};
const stripe = {confirmPayment:async()=>{(window as any).__confirmCount=((window as any).__confirmCount??0)+1;return {};}};
export const useElements=()=>elements;
export const useStripe=()=>stripe;
export const loadStripe=async()=>stripe;
