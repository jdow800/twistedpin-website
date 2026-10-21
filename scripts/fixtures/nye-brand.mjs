/** Synthetic browser-only fixture. No backend, provider, real guest or email data. */
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// The reviewed NYE schedule; prices below are synthetic presentation amounts.
export const parties = [['11:00',90],['13:00',90],['15:00',90],['17:00',120],['19:30',120],['22:00',150]];
export const arcade = {id:id(125),code:125,name:'NYE Arcade Mega Deal',shortDescription:"Buy $100, get $100 free — $200 in game play! Online pre-purchase only (you cannot buy this in store). Credits don't expire, so keep your card for next time. Buy multiple cards and you'll receive multiple cards.",defaultPriceCents:10000,minQuantity:0,maxQuantity:36,isRequired:false,thumbnailUrl:null};
export const products = [126,124].map(code=>({
  id:id(code),code,name:`NYE Party ${code===124?'VIP':'Traditional'} Lanes`,shortDescription:'Bowling, shoes, pizza and soda included.',description:'',
  defaultPriceCents:code===124?19995:14995,durationMinutes:90,
  durationOverrides:parties.map(([startTime,durationMinutes])=>({date:'2026-12-31',startTime,durationMinutes})),
  minQuantityPerBooking:1,maxQuantityPerBooking:6,salesCutoffMinutesBefore:code===124?30:60,
  thumbnailUrl:null,heroImageUrl:null,addOnProducts:[arcade],
}));
const field=(n,more)=>({id:id(n),fieldType:'checkbox',label:'',helpText:'',placeholder:'',required:true,options:[],minSelections:null,maxSelections:null,countSource:null,countDivisor:null,perUnitMulti:false,perUnitRole:null,baseOption:null,displayOrder:0,visibleWhenFieldId:null,visibleWhenValues:[],...more});
export function formsFor(product) {
  const base=product.code*10;
  return [{id:id(base),title:`NYE ${product.code===124?'VIP':'Traditional'} party details`,thankYouCopy:'',fields:[
    field(base+1,{fieldType:'per_unit_select',label:'Included pizza',options:['Cheese','Pepperoni','Sausage','Half cheese / half pepperoni','Half pepperoni / half sausage'],countSource:'lane_count',countDivisor:1,perUnitRole:'pizza'}),
    field(base+2,{fieldType:'per_unit_select',label:'Included soda pitcher',options:['Pepsi','Diet Pepsi','Starry','Pink Lemonade','Orange Crush','Dr. Pepper','Mountain Dew','Mug Root Beer'],countSource:'lane_count',countDivisor:1,perUnitRole:'pitcher',displayOrder:1}),
    field(base+3,{label:`I understand the ${product.code===124?6:5}-guest limit per lane, including spectators.`,displayOrder:2}),
    field(base+4,{label:'I understand outside food and drinks are not permitted.',displayOrder:3}),
    // Real NYE optional-field identities exercise the flow's presentation-only helper copy.
    field(base+5,{id:product.code===124?'4a0f5bea-3e39-4943-a171-fa83cf3d47a3':'e6dab680-9820-405f-aeb5-4c409c035ffb',fieldType:'short_text',label:'Bowl near another group',helpText:'Enter the other reservation name.',required:false,displayOrder:4}),
  ]}];
}
export function quoteFor(body) {
  const subtotal=body.items.reduce((n,i)=>n+i.quantity*(i.productId===arcade.id?arcade.defaultPriceCents:(products.find(p=>p.id===i.productId)?.defaultPriceCents??0)),0);
  const lanes=body.items.filter(i=>i.productId!==arcade.id).reduce((n,i)=>n+i.quantity,0);
  const fee=Math.round(subtotal*.045),tax=lanes*125;
  return {reviewToken:'synthetic-review-v1',reviewExpiresAt:'2099-01-01T00:00:00.000Z',contractVersion:1,
    subtotalExcludingTax:subtotal+fee,taxBreakdown:{shoesRentalSubtotal:0,shoesRentalTax:0,foodBeverageSubtotal:lanes*2000,foodBeverageTax:tax,untaxedSubtotal:subtotal-lanes*2000+fee,totalTax:tax},
    fees:[{name:'Online service fee',amountCents:fee}],autoDiscounts:[],totalIncludingTax:subtotal+fee+tax};
}
export const payment={attemptId:id(900),recoveryToken:'synthetic-recovery-only',paymentIntentId:'pi_synthetic_only',clientSecret:'pi_synthetic_only_secret_fake',attemptStatus:'prepared'};
export const booking={bookingId:id(901),paymentRecordId:id(902),customerId:id(903),invoiceNumber:'NYE-SYNTHETIC',railStatus:'succeeded'};

/** Installed before mounting the unmodified production React component. */
export function installFixture() {
  const get=(key,fallback)=>JSON.parse(sessionStorage.getItem(key)??JSON.stringify(fallback));
  const put=(key,value)=>sessionStorage.setItem(key,JSON.stringify(value));
  const settings=()=>get('fixture-settings',{});
  window.configure=next=>put('fixture-settings',{...settings(),...next});
  const storageSet=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(key==='tprs:nye:brand-draft:v1'&&settings().failAcceptedDraftWrite){
      const draft=JSON.parse(value);
      if(draft.choice&&draft.pending===null){window.configure({failAcceptedDraftWrite:false});throw new Error('Synthetic interruption after controller receipt, before parent draft persistence.');}
    }
    return storageSet.call(this,key,value);
  };
  let cart=get('fixture-cart',{cartToken:'synthetic-cart',revision:0,items:[],holds:[],holdExpiresAt:null});
  let receipts=get('fixture-receipts',{});
  const reviews=get('fixture-reviews',{});
  const saveCart=()=>{put('fixture-cart',cart);put('fixture-receipts',receipts);};
  window.fixtureBumpRevision=()=>{cart={...cart,revision:cart.revision+1};saveCart();};
  const formWaiters=[];
  window.releaseFixtureForms=()=>{window.configure({delayForms:false});for(const resolve of formWaiters.splice(0))resolve();};
  window.calls=get('fixture-calls',[]);
  const log=(path,body,method='POST')=>{window.calls.push({path,body,method});put('fixture-calls',window.calls);};
  window.fixtureState=()=>structuredClone({cart,settings:settings(),calls:window.calls});
  window.stripeFake={
    retrievePaymentIntent:async()=>({paymentIntent:{id:payment.paymentIntentId,status:settings().provider??'requires_payment_method'}}),
    confirmPayment:async()=>{log('stripe:confirm',{});if(settings().confirmDecline)return {error:{message:'Synthetic declined card.'}};window.configure({provider:'succeeded'});return {};},
  };
  window.elementsFake={submit:async()=>{log('stripe:submit',{});return {};},update:()=>{}};
  const realFetch=window.fetch.bind(window);
  window.fetch=async(url,options={})=>{
    const target=new URL(String(url),location.href);
    if(!target.pathname.startsWith('/fixture-api/')) {
      // Fail closed even if an accidental future component bypasses the fixture base.
      if(target.origin!==location.origin||target.pathname.startsWith('/api/'))throw new Error('External API calls are disabled in the synthetic fixture.');
      return realFetch(url,options);
    }
    const path=target.pathname.slice('/fixture-api'.length),body=options.body?JSON.parse(options.body):null;
    log(path,body,options.method??'GET');
    const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
    if(path==='/api/products')return respond({products:products.map(product=>settings().catalogDurationMinutes?{...product,durationOverrides:product.durationOverrides.map(d=>d.startTime==='15:00'?{...d,durationMinutes:settings().catalogDurationMinutes}:d)}:product)});
    if(path==='/api/availability') {
      const product=products.find(p=>p.id===target.searchParams.get('product_id'));
      return respond(parties.map(([time])=>({time,priceCents:product.defaultPriceCents,available:!(settings().unavailable??[]).includes(`${product.code}/${time}`)})));
    }
    if(path==='/api/availability/slot') {
      const product=products.find(p=>p.id===target.searchParams.get('product_id')),time=target.searchParams.get('time'),key=`${product.code}/${time}`;
      if((settings().unknown??[]).includes(key))return respond({error:'Synthetic availability unavailable.'},503);
      return respond({maxUnits:settings().capacity?.[key]??(product.code===124?6:16)});
    }
    if(/^\/api\/products\/.+\/forms$/.test(path)) {
      const product=products.find(p=>p.id===path.split('/')[3]);
      if(settings().delayForms)await new Promise(resolve=>formWaiters.push(resolve));
      if(settings().formFailure)return respond({error:'Synthetic form unavailable.'},503);
      return respond({forms:settings().malformedForms?[]:formsFor(product)});
    }
    if(path==='/api/cart/session'||path==='/api/cart')return respond(cart);
    if(path==='/api/cart/replace') {
      if(settings().failNextReplace){window.configure({failNextReplace:false});return respond({code:'capacity_exhausted',error:'INTERNAL private capacity diagnostics must never be displayed'},409);}
      if(receipts[body.mutationKey])return respond({...cart,mutation:{key:body.mutationKey,appliedRevision:receipts[body.mutationKey],replayed:true}});
      if(body.expectedRevision!==cart.revision)return respond({code:'cart_revision_conflict',error:'Synthetic revision mismatch.',currentRevision:cart.revision},409);
      const expiresAt=cart.holdExpiresAt&&Date.parse(cart.holdExpiresAt)>Date.now()?cart.holdExpiresAt:new Date(Date.now()+600000).toISOString();
      cart={...cart,revision:cart.revision+1,items:structuredClone(body.items),holdExpiresAt:body.items.length?expiresAt:null,holds:body.items.filter(i=>i.productId!==arcade.id).map(i=>{
        const time=i.startTime.slice(11,16),duration=time==='15:00'&&settings().catalogDurationMinutes?settings().catalogDurationMinutes:parties.find(([t])=>t===time)?.[1];
        if(!duration)throw new Error('Synthetic fixture rejected an unrecognized dated party start.');
        return {id:id(700),cartLineRef:i.cartLineRef,poolId:id(i.productId===id(124)?724:726),count:i.quantity,startTime:new Date(Date.parse(i.startTime)-60000).toISOString(),endTime:new Date(Date.parse(i.startTime)+(duration+10)*60000).toISOString(),expiresAt};
      })};
      receipts[body.mutationKey]=cart.revision;saveCart();
      if(settings().dropNextReplaceResponse){window.configure({dropNextReplaceResponse:false});throw new TypeError('Synthetic lost successful replacement response.');}
      return respond({...cart,mutation:{key:body.mutationKey,appliedRevision:cart.revision,replayed:false}});
    }
    if(path==='/api/checkout/quote') {
      const reviewToken=`synthetic-review-${window.calls.length}`;
      reviews[reviewToken]=structuredClone(body);put('fixture-reviews',reviews);
      return respond({...quoteFor(body),reviewToken});
    }
    if(path==='/api/checkout/attempt-active') {
      if(settings().ordinaryActive){
        const originalRequest={customer:{firstName:'Saved',lastName:'Guest',email:'saved@example.invalid',phone:'8155550199',zip:'60544'},eventDate:'2026-11-23',startTime:'2026-11-23T12:30:00-06:00',items:[{productId:id(5),quantity:2,cartLineRef:'ordinary-lane'}],acceptedTerms:true,formAnswers:[],checkoutContractVersion:1,reviewToken:'original-review',attemptKey:'original-ordinary'};
        return respond({attempt:{...payment,status:'prepared',paymentReady:true,originalRequest,originalOrder:{cartToken:cart.cartToken,eventDate:originalRequest.eventDate,startTime:originalRequest.startTime,items:originalRequest.items,paymentType:'full',paymentIntentId:payment.paymentIntentId,acceptedTerms:true,formAnswers:[]},financialSnapshot:{subtotalExcludingTax:23990,totalIncludingTax:23990,taxBreakdown:{shoesRentalSubtotal:0,shoesRentalTax:0,foodBeverageSubtotal:0,foodBeverageTax:0,untaxedSubtotal:23990,totalTax:0},lineItems:[{name:'Original two-hour bowling',quantity:2,unitPrice:11995,lineTotal:23990,isFee:false}]},endTime:'2026-11-23T20:30:00.000Z'}});
      }
      return respond({attempt:null});
    }
    if(path==='/api/checkout/payment-intents') {
      const reviewed=reviews[body.reviewToken];
      if(!reviewed||reviewed.smsMarketingOptIn!==body.customer?.smsMarketingOptIn) {
        return respond({code:'review_changed',error:'The accepted marketing choice must match the quoted choice.'},409);
      }
      put('fixture-accepted',body);window.configure({accepted:true});
      // Faithful protected handoff: soft cart holds disappear, immutable payment survives.
      cart={...cart,holds:[],holdExpiresAt:null};saveCart();return respond(payment);
    }
    if(path==='/api/checkout/attempt-status')return respond({attemptId:payment.attemptId,status:settings().confirmed?'confirmed':settings().provider==='succeeded'?'processing':'prepared',...(settings().confirmed?{booking}: {})});
    if(path==='/api/checkout/attempt-cancel'){window.configure({accepted:false,provider:'canceled'});return respond({attemptId:payment.attemptId,status:'cancelled',paymentIntentId:payment.paymentIntentId});}
    if(path==='/api/checkout/convert'){window.configure({confirmed:true});return respond(booking);}
    if(path==='/api/checkout/optin-reward-preview')return respond({available:false,amountCents:0});
    throw new Error(`Synthetic fixture has no handler for ${options.method??'GET'} ${path}`);
  };
}
