import { useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PaymentStep from '../../src/components/tprs/steps/PaymentStep';
import { wizardReducer, initialState } from '../../src/components/tprs/state';
import { useQuote } from '../../src/components/tprs/useQuote';
import '../../src/components/tprs/tprs.css';
import '../../src/styles/global.css';
import type { CheckoutRecovery } from '../../src/components/tprs/checkoutRecovery';

const fixture=await (await fetch('/__fixture__')).json();
function TestCheckout() {
 const [state,dispatch]=useReducer(wizardReducer,{...initialState,couponCode:fixture.code});
 const [booking,setBooking]=useState<any>(null);
 const [recovery,setRecovery]=useState<CheckoutRecovery|null>(null);
 const [testPhone,setTestPhone]=useState(fixture.customer.phone);
 const customer={...fixture.customer,phone:testPhone};
 const {quote,loading,error,retry}=useQuote(recovery?null:{eventDate:fixture.eventDate,startTime:fixture.startTime,items:fixture.items,couponCode:state.couponCode||undefined,email:customer.email,phone:testPhone,smsMarketingOptIn:customer.smsMarketingOptIn});
 const draft={...state,step:'payment' as const,date:fixture.eventDate,guest:customer,product:fixture.product??{id:fixture.items[0].productId,code:5,name:'Synthetic lanes',shortDescription:'',description:'',defaultPriceCents:fixture.totalCents,durationMinutes:120,minQuantityPerBooking:1,maxQuantityPerBooking:8,salesCutoffMinutesBefore:null,thumbnailUrl:null,heroImageUrl:null,addOnProducts:[]},slot:{time:'12:30',priceCents:fixture.totalCents,available:true}};
 return <>
 <aside style={{maxWidth:520,margin:'0 auto',padding:'12px 20px 0',fontSize:11,fontWeight:600,color:'var(--warm-dim)'}}>LOCAL PREVIEW · Synthetic account · No real payment</aside>
 <main className="tprs-wizard" style={{maxWidth:520,margin:'auto',padding:20}}>
   <label>Synthetic test phone<input value={testPhone} onChange={e=>setTestPhone(e.target.value)}/></label>
   {booking ? <div role="status">Reservation confirmed: {booking.invoiceNumber}</div> : <PaymentStep
    draft={draft} quote={recovery?.quote??quote} recovery={recovery} onRecovery={setRecovery} onLock={locked=>dispatch({type:'SET_CHECKOUT_LOCK',locked})}
    customer={customer} cartHoldItems={fixture.items.map((i:any)=>({...i,startTime:fixture.startTime}))}
    checkoutItems={fixture.items} eventDate={fixture.eventDate} startTime={fixture.startTime} salesCutoffMinutesBefore={null}
    couponCode={state.couponCode} couponResult={state.couponResult}
    onCouponCode={code=>dispatch({type:'SET_COUPON_CODE',code})}
    onCouponResult={result=>dispatch({type:'SET_COUPON_RESULT',result})}
    pricingPending={loading||!quote} pricingError={error} onRetryPricing={retry} formAnswers={[]} onFindNewTime={()=>{}} termsText="Synthetic booking terms." totalCents={quote?.totalIncludingTax??fixture.totalCents}
    onConverted={setBooking}/>}
 </main></>;
}
createRoot(document.getElementById('root')!).render(<TestCheckout/>);
