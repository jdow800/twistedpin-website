import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType, type ComponentProps } from 'react';
import { z } from 'zod';
import BrandShell, { type BrandStep } from './BrandShell';
import { createCartSelectionController, exactSelectionHeld, type CartSelectionResult } from './cartSelection';
import { type PartyChoice, eventSelection, choiceFromDraft, compatibleAddOns, answersAfterChange, validNyeDefinitions, nyeAnswersComplete } from './selection';
import { packageDetailsChanged as compareEventPackages, resolveCatalogChoice as resolveEventCatalogChoice } from './selectionCatalog';
import { eventDateLabels, nyeEventConfig, type EventBookingConfig } from './eventConfig';
import * as api from '../../../tprs/client';
import { availabilitySlotSchema, customerProductSchema, formAnswerInputSchema, checkoutAttemptActiveResponseSchema,
  type CustomerProduct, type AvailabilitySlot, type CartState, type FormDefinition, type QuoteResponse, type ActiveCheckoutAttempt } from '../../../tprs/schemas';
import { initialState, guestInvalidFields, type WizardState } from '../state';
import { consentLanguageFor } from '../consentCopy';
import { formatTime12h, formatUsd } from '../format';
import { useQuote } from '../useQuote';
import { loadCheckoutRecovery, loadDiscoveredCheckout, saveCheckoutRecovery, saveDiscoveredCheckout, type CheckoutRecovery } from '../checkoutRecovery';
import DiscoveredCheckout from '../DiscoveredCheckout';
import PaymentStep from '../steps/PaymentStep';
import FormRenderer from '../FormRenderer';
import GuestDetailsStep from '../steps/GuestDetailsStep';
import Markdown from '../Markdown';

export type EventPaymentProps = ComponentProps<typeof PaymentStep>;
export type EventDiscoveredProps = ComponentProps<typeof DiscoveredCheckout>;

const steps: BrandStep[] = ['lanes', 'time', 'arcade', 'food', 'pay'];
const activeSchema=checkoutAttemptActiveResponseSchema.shape.attempt.unwrap();
const choiceSchema = z.object({product: customerProductSchema, slot: availabilitySlotSchema, quantity: z.number().int().min(1).max(6)});
const savedSchema = z.object({ version: z.literal(1), step: z.enum(['lanes','time','arcade','food','pay']),
  choice: choiceSchema.nullable(), roomCode: z.number().int().nullable(), quantity: z.number().int().min(1).max(6), time: z.string().nullable(),
  addOns: z.record(z.number().int().nonnegative()), stagedAddOns: z.record(z.number().int().nonnegative()).optional(), answers: z.array(formAnswerInputSchema),
  catalogReviewRequired: z.boolean().default(false),
  catalogHeldSelection: z.object({choice:choiceSchema,addOns:z.record(z.number().int().nonnegative())}).nullable().default(null),
  guest: z.object({ firstName:z.string(),lastName:z.string(),email:z.string(),phone:z.string(),zip:z.string() }),
  marketingOptIn: z.boolean().optional(),
  pending: z.object({choice:choiceSchema,addOns:z.record(z.number().int().nonnegative()),next:z.enum(['arcade','food'])}).nullable(),
});
type PendingProposal = NonNullable<z.infer<typeof savedSchema>['pending']>;
type Review = { choice:PartyChoice; addOns:Record<string,number>; quote:QuoteResponse|null; error:string|null; lowerCapacity:boolean };
const safeMessage = 'We could not complete that change. Your previous selection has not been replaced.';

async function loadEventCatalog(event:EventBookingConfig,signal?:AbortSignal) {
  const response=await api.getProducts([event.traditionalCode,event.vipCode],signal);
  const products=response.products.filter(p=>p.code===event.vipCode||p.code===event.traditionalCode);
  if(products.length!==2)throw new Error('catalog unavailable');
  if(event.productIds&&products.some(p=>p.id!==(p.code===event.vipCode?event.productIds!.vip:event.productIds!.traditional)))throw new Error('catalog identity changed');
  const availability=await Promise.allSettled(products.map(async p=>[p.id,await api.getAvailability(p.id,event.date,signal)] as const));
  return {products,grid:Object.fromEntries(availability.flatMap(r=>r.status==='fulfilled'?[r.value]:[]))};
}

export default function NyeBrandWizard({salesOpen=true,closedContent,eventConfig=nyeEventConfig,initialLaneType,PaymentComponent=PaymentStep,DiscoveredComponent=DiscoveredCheckout}:{salesOpen?:boolean;closedContent?:ReactNode;eventConfig?:EventBookingConfig;initialLaneType?:'traditional'|'vip';PaymentComponent?:ComponentType<EventPaymentProps>;DiscoveredComponent?:ComponentType<EventDiscoveredProps>} = {}) {
  const EVENT_DATE=eventConfig.date, DRAFT_KEY=eventConfig.draftKey;
  const freshDraft=():WizardState=>({...initialState,date:EVENT_DATE,guest:{...(eventConfig.initialGuest??initialState.guest)}});
  const codes=useMemo(()=>[eventConfig.traditionalCode,eventConfig.vipCode],[eventConfig]);
  const marketingEnabled=eventConfig.marketingEnabled!==false;
  const labels=eventDateLabels(eventConfig);
  const helpTextOverrides=eventConfig.helpTextOverrides;
  const {roomName,guestsPerLane,onlineMax,partyStart,partyDuration,partyRange,laneCoverage,selectionItems,safeAlternativeQuantity}=useMemo(()=>eventSelection(eventConfig),[eventConfig]);
  const loadCatalog=(signal?:AbortSignal)=>loadEventCatalog(eventConfig,signal);
  const resolveCatalogChoice=(choice:PartyChoice,products:CustomerProduct[],grid:Record<string,AvailabilitySlot[]>)=>resolveEventCatalogChoice(choice,products,grid,eventConfig);
  const packageDetailsChanged=(saved:PartyChoice,fresh:PartyChoice)=>compareEventPackages(saved,fresh,eventConfig);
  const [products,setProducts] = useState<CustomerProduct[]>([]);
  const [grid,setGrid] = useState<Record<string,AvailabilitySlot[]>>({});
  // A closed-page bootstrap is not an initialized sales session. Derive this
  // during render so the opening tick cannot save an empty draft or launch a
  // second catalog load before the restoration effect starts.
  const [initializedSalesMode,setInitializedSalesMode] = useState<boolean|null>(null);
  const loaded = initializedSalesMode === salesOpen;
  const [loadError,setLoadError] = useState<string|null>(null);
  const [draft,setDraft] = useState<WizardState>(freshDraft);
  const [step,setStep] = useState<BrandStep>('lanes');
  const [roomCode,setRoomCode] = useState<number|null>(null), [quantity,setQuantity] = useState(1), [time,setTime] = useState<string|null>(null);
  const [cart,setCart] = useState<CartState|null>(null), [busy,setBusy] = useState(false), busyRef=useRef(false);
  const [notice,setNotice] = useState<string|null>(null), [now,setNow] = useState(Date.now());
  const [recovery,setRecovery] = useState<CheckoutRecovery|null>(null), [discovered,setDiscovered] = useState<ActiveCheckoutAttempt|null>(null);
  const [acceptedQuote,setAcceptedQuote] = useState<QuoteResponse|null>(null);
  const [forms,setForms] = useState<FormDefinition[]|null>(null), [formsError,setFormsError] = useState(false), [formsRetry,setFormsRetry] = useState(0);
  const [invalidIds,setInvalidIds] = useState<string[]>([]), [submitAttempt,setSubmitAttempt] = useState(0);
  const [addOns,setAddOns] = useState<Record<string,number>>({});
  const [probe,setProbe] = useState<{key:string;max:number|null;error:boolean}|null>(null), [probeRetry,setProbeRetry] = useState(0);
  const [alternatives,setAlternatives] = useState<PartyChoice[]>([]), [alternativesBusy,setAlternativesBusy] = useState(false);
  const [review,setReview] = useState<Review|null>(null), [headcount,setHeadcount] = useState('');
  const [pending,setPending] = useState<PendingProposal|null>(null);
  const [catalogReviewRequired,setCatalogReviewRequired] = useState(false);
  const [catalogHeldSelection,setCatalogHeldSelection] = useState<Pick<PendingProposal,'choice'|'addOns'>|null>(null);
  const controller = useMemo(() => createCartSelectionController({api}), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const initialization = useRef(0);
  // A Jingle package link is a fresh entry preference, never a replacement for
  // a saved draft, pending cart change or accepted payment. Keep it mount-local.
  const entryLaneType = useRef(initialLaneType);
  const entryChoiceUsed = useRef(false);
  const locked = busy || !!recovery || !!discovered || draft.checkoutLocked;
  const product = products.find(p=>p.code===roomCode) ?? null;
  const slot = product && time ? grid[product.id]?.find(s=>s.time===time) ?? null : null;
  const requested:PartyChoice|null = product && slot ? {product,slot,quantity} : null;
  const heldChoice = choiceFromDraft(draft);
  const requestedKey = requested ? `${requested.product.id}/${requested.slot.time}/${requested.quantity}` : '';
  const requestedKeyRef = useRef(requestedKey);requestedKeyRef.current=requestedKey;
  const alternativesRun = useRef(0);
  const currentProbe = probe?.key === requestedKey ? probe : null;
  const shortage = !!requested && !!currentProbe && currentProbe.max !== null && currentProbe.max < quantity;
  const heldItems = heldChoice ? selectionItems(heldChoice,draft.addOnQtys) : [];
  const heldCoverage = heldChoice ? laneCoverage(heldChoice) : [];
  const requestedMatchesHeld = !catalogReviewRequired&&!!requested&&!!heldChoice&&requested.product.id===heldChoice.product.id&&requested.slot.time===heldChoice.slot.time&&requested.quantity===heldChoice.quantity;
  const ownHold = !!cart && !!heldChoice && exactSelectionHeld(cart,heldItems,heldCoverage,now);
  // During catalog review the old lane claim may still be live even though a
  // longer package or removed arcade item makes the NEW full selection differ.
  // This is display-only evidence; payment continues to require exact coverage.
  const existingLanesHeldForReview = catalogReviewRequired&&!!cart&&!!catalogHeldSelection
    &&exactSelectionHeld(cart,selectionItems(catalogHeldSelection.choice,catalogHeldSelection.addOns),laneCoverage(catalogHeldSelection.choice),now);
  const holdLeft = cart?.holdExpiresAt ? Math.max(0, Math.ceil((Date.parse(cart.holdExpiresAt)-now)/1000)) : 0;
  const quoteRequest = salesOpen && heldChoice && !recovery ? {items:step==='arcade'?selectionItems(heldChoice,addOns):heldItems,eventDate:EVENT_DATE,startTime:partyStart(heldChoice.slot.time),email:draft.guest.email,phone:draft.guest.phone,
    ...(marketingEnabled && draft.marketingOptIn !== undefined && {smsMarketingOptIn:draft.marketingOptIn})} : null;
  const pricing = useQuote(quoteRequest);
  const quote = recovery?.quote ?? (draft.booking ? acceptedQuote : pricing.quote);

  function preserveDiscovered(attempt:ActiveCheckoutAttempt) {
    // Even a late response is credible accepted-payment evidence. Keep a
    // newer discovered attempt if present; otherwise resolve this one before
    // allowing a fresh payment. Its status is rechecked by recovery.
    // Establish the in-memory barrier BEFORE storage access: even reads or
    // parsing can fail, and a superseded initialization ignores its errors.
    setDiscovered(current=>current??attempt);
    try {
      // Do not overwrite newer persisted evidence with an older response.
      if(!loadDiscoveredCheckout(sessionStorage))saveDiscoveredCheckout(sessionStorage,attempt);
    }catch { /* The known attempt remains locked in memory for recovery. */ }
  }
  function save(nextPending:PendingProposal|null = pending, nextDraft=draft, nextStep=step) {
    if (nextStep === 'confirmation') return;
    sessionStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,step:nextStep,choice:choiceFromDraft(nextDraft),roomCode,quantity,time,
      addOns:nextDraft.addOnQtys,stagedAddOns:addOns,answers:nextDraft.formAnswers,guest:nextDraft.guest,marketingOptIn:nextDraft.marketingOptIn,pending:nextPending,catalogReviewRequired,catalogHeldSelection}));
  }
  function pendingProposalMatches(proposal:PendingProposal) {
    const retained=controller.readPending();
    if(retained.kind!=='pending')return false;
    const itemKey=(item:{cartLineRef:string;productId:string;quantity:number;startTime?:string})=>
      JSON.stringify([item.cartLineRef,item.productId,item.quantity,item.startTime?Date.parse(item.startTime):null]);
    const expected=selectionItems(proposal.choice,proposal.addOns).map(itemKey).sort();
    const actual=retained.pending.request.items.map(itemKey).sort();
    const coverage=laneCoverage(proposal.choice), savedCoverage=retained.pending.coverage;
    return JSON.stringify(expected)===JSON.stringify(actual)&&coverage.length===savedCoverage.length&&coverage.every(c=>
      savedCoverage.some(s=>s.cartLineRef===c.cartLineRef&&s.count===c.count&&Date.parse(s.startTime)===Date.parse(c.startTime)&&Date.parse(s.endTime)===Date.parse(c.endTime)));
  }
  async function acceptHeldProposal(proposal:PendingProposal,base:WizardState,current:CartState,isCurrent=()=>true) {
    if(!exactSelectionHeld(current,selectionItems(proposal.choice,proposal.addOns),laneCoverage(proposal.choice)))
      throw new Error('proposal coverage unavailable');
    // The immutable mutation has now been reconciled. Re-read the current
    // dated package before adopting a proposal that may have survived reload.
    // Do not mutate its request/key or silently substitute new package terms.
    const catalog=await loadCatalog();
    if(!isCurrent())return false;
    const fresh=resolveCatalogChoice(proposal.choice,catalog.products,catalog.grid);
    if(!fresh)throw new Error('current package unavailable');
    const requiresReview=packageDetailsChanged(proposal.choice,fresh);
    // Reload may precede the form effect. Never interpret missing definitions
    // as permission to erase a same-room guest's saved food and acknowledgments.
    let definitions:FormDefinition[]=[];
    if(base.product?.id===proposal.choice.product.id&&base.formAnswers.length){
      definitions=base.product.id===draft.product?.id&&forms?forms:(await api.getProductForms(base.product.id)).forms;
      if(!isCurrent())return false;
      if(!validNyeDefinitions(definitions,base.product.code,codes))throw new Error('form definitions unavailable');
    }
    const nextDraft={...base,date:EVENT_DATE,product:fresh.product,slot:fresh.slot,laneQty:fresh.quantity,
      addOnQtys:proposal.addOns,formAnswers:answersAfterChange(base,fresh,definitions)};
    const stillHeld=exactSelectionHeld(current,selectionItems(proposal.choice,proposal.addOns),laneCoverage(proposal.choice));
    const nextStep=requiresReview||!stillHeld?'time':proposal.next;
    const heldEvidence=requiresReview?{choice:proposal.choice,addOns:proposal.addOns}:null;
    // Write the accepted proposal's room/time/count, not the render's older
    // requested controls. A failed write leaves the prior proposal recoverable.
    sessionStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,step:nextStep,choice:fresh,
      roomCode:fresh.product.code,quantity:fresh.quantity,time:fresh.slot.time,
      addOns:proposal.addOns,stagedAddOns:proposal.addOns,answers:nextDraft.formAnswers,guest:nextDraft.guest,marketingOptIn:nextDraft.marketingOptIn,pending:null,catalogReviewRequired:requiresReview,catalogHeldSelection:heldEvidence}));
    setProducts(catalog.products);setGrid(catalog.grid);setCatalogReviewRequired(requiresReview);setCatalogHeldSelection(heldEvidence);
    setCart(current);setDraft(nextDraft);setAddOns(proposal.addOns);setPending(null);setReview(null);
    setRoomCode(fresh.product.code as number);setQuantity(fresh.quantity);setTime(fresh.slot.time);
    setStep(nextStep);setNotice(!stillHeld?'The lane hold has ended. Your answers are saved; review your party choice again.':requiresReview?'Your lanes are held; package details changed. Please review before continuing.':null);
    return !requiresReview&&stillHeld;
  }
  const initialize = useCallback(async()=>{
    // Opening, a retry or unmount may supersede a slow discovery/restoration.
    // Its response must not replace the newer sales mode or retained payment.
    const generation=++initialization.current;
    const isCurrent=()=>initialization.current===generation;
    setInitializedSalesMode(null);setLoadError(null);
    try {
      const activeSaved=loadDiscoveredCheckout(sessionStorage);
      const recovered=loadCheckoutRecovery(sessionStorage);
      // Never let a broken/returning payment fall through into a fresh booking.
      if(activeSaved){setDiscovered(activeSaved);return;}
      if(recovered){
        if(!recovered.draft.product||!codes.includes(recovered.draft.product.code)
          ||recovered.draft.date!==EVENT_DATE||recovered.request.eventDate!==EVENT_DATE){
          // Recovery is shared across booking pages. An ordinary reservation
          // must use its server-retained dates/products/money, never NYE copy.
          const original=await api.getActiveCheckoutAttempt();
          if(!isCurrent()){if(original)preserveDiscovered(original);return;}
          if(!original||(recovered.payment?.attemptId&&original.attemptId!==recovered.payment.attemptId)
            ||(recovered.payment?.paymentIntentId&&original.paymentIntentId!==recovered.payment.paymentIntentId))throw new Error('original payment unavailable');
          saveDiscoveredCheckout(sessionStorage,original);setDiscovered(original);return;
        }
        setRecovery(recovered);setAcceptedQuote(recovered.quote);setDraft(recovered.draft);
        setRoomCode(recovered.draft.product.code as number);setTime(recovered.draft.slot?.time??null);
        setQuantity(recovered.draft.laneQty);setAddOns(recovered.draft.addOnQtys);setStep('pay');return;
      }
      const active=await api.getActiveCheckoutAttempt();
      if(!isCurrent()){if(active)preserveDiscovered(active);return;}
      if(active){saveDiscoveredCheckout(sessionStorage,active);setDiscovered(active);return;}
      if(new URLSearchParams(location.search).has('payment_intent_client_secret')) throw new Error('returning payment');
      // Opening controls new purchases only. A saved/returning payment above
      // retains its existing recovery path without loading a fresh catalog.
      if(!salesOpen)return;
      const raw=sessionStorage.getItem(DRAFT_KEY),saved=raw?savedSchema.parse(JSON.parse(raw)):null;
      if(saved?.roomCode!==null&&saved?.roomCode!==undefined&&!codes.includes(saved.roomCode))throw new Error('wrong room');
      let restoredDraft:WizardState=freshDraft();
      if(saved){
        if(saved.choice && !codes.includes(saved.choice.product.code)) throw new Error('wrong product');
        if(saved.pending && !codes.includes(saved.pending.choice.product.code)) throw new Error('wrong pending product');
        setRoomCode(saved.roomCode);setQuantity(saved.quantity);setTime(saved.time);setPending(saved.pending);setAddOns(saved.stagedAddOns??saved.addOns);setCatalogReviewRequired(saved.catalogReviewRequired);setCatalogHeldSelection(saved.catalogHeldSelection);
        restoredDraft={...initialState,date:EVENT_DATE,product:saved.choice?.product??null,slot:saved.choice?.slot??null,laneQty:saved.choice?.quantity??1,
          addOnQtys:saved.addOns,formAnswers:saved.answers,guest:saved.guest,marketingOptIn:saved.marketingOptIn};
        setDraft(restoredDraft);setStep(saved.catalogReviewRequired?'time':saved.step);
      }
      const retained=controller.readPending();
      if(retained.kind==='blocked')throw new Error('pending storage unavailable');
      let current:CartState;
      if(retained.kind==='pending'){
        if(!saved?.pending||!pendingProposalMatches(saved.pending))throw new Error('pending proposal unavailable');
        // Restore the retry UI without creating a session or reissuing a hold.
        // Only the guest's explicit Check this selection retries the saved key.
        current=await api.getCart();
        if(!isCurrent())return;
        if(current.cartToken!==retained.pending.cartToken)throw new Error('cart session changed');
        setNotice('Your selection is still being checked. Check this same selection before making another change.');
      }else{
        const session=await controller.establishSession();
        if(!isCurrent()){if(session.kind==='payment_recovery'&&session.attempt)preserveDiscovered(activeSchema.parse(session.attempt));return;}
        if(session.kind==='payment_recovery'){if(session.attempt){const found=activeSchema.parse(session.attempt);saveDiscoveredCheckout(sessionStorage,found);setDiscovered(found);}else throw new Error('payment discovery');return;}
        if(session.kind!=='session')throw new Error('session unavailable');
        current=session.cart;
        if(saved?.pending){
          if(exactSelectionHeld(current,selectionItems(saved.pending.choice,saved.pending.addOns),laneCoverage(saved.pending.choice))){
            // Server acceptance can precede the parent draft write or reload.
            // Exact current coverage is enough to restore that explicit choice;
            // this path never creates or extends a hold.
            await acceptHeldProposal(saved.pending,restoredDraft,current,isCurrent);
            if(!isCurrent())return;
          }else{
            const noLiveHolds=!current.holds.length||!current.holdExpiresAt||Date.parse(current.holdExpiresAt)<=Date.now();
            if(!noLiveHolds)throw new Error('unrelated live selection');
            sessionStorage.setItem(DRAFT_KEY,JSON.stringify({...saved,pending:null,step:'time'}));
            setPending(null);setStep('time');setNotice('The held selection could not be restored. Your answers are saved; review your party choice again.');
          }
        }else if(current.holds.length){
          // Updated catalog details can differ from the still-held original
          // bounds/items. Retain that original proof solely for restoration;
          // it cannot satisfy payment's fresh full-selection coverage check.
          const original=saved?.catalogReviewRequired&&saved.catalogHeldSelection?saved.catalogHeldSelection:saved?.choice?{choice:saved.choice,addOns:saved.addOns}:null;
          // Another page owns a different live cart. Do not silently replace it
          // with a newly opened NYE draft.
          if(!original||!exactSelectionHeld(current,selectionItems(original.choice,original.addOns),laneCoverage(original.choice)))throw new Error('unrelated live selection');
        }
      }
      setCart(current);
      if(saved?.catalogReviewRequired&&!saved.pending){
        const original=saved.catalogHeldSelection;
        const stillHeld=!!original&&exactSelectionHeld(current,selectionItems(original.choice,original.addOns),laneCoverage(original.choice));
        setNotice(stillHeld?'Your lanes are held; package details changed. Please review before continuing.':'Package details changed. Please review before continuing. Your answers are saved.');
      }
      const catalog=await loadCatalog();
      if(!isCurrent())return;
      setProducts(catalog.products);setGrid(catalog.grid);
      if(!saved&&!entryChoiceUsed.current&&eventConfig.id==='jingle'){
        const code=entryLaneType.current==='traditional'?eventConfig.traditionalCode:entryLaneType.current==='vip'?eventConfig.vipCode:null;
        if(code!==null&&catalog.products.some(p=>p.code===code)){
          setRoomCode(code);setStep('time');
        }
      }
      entryChoiceUsed.current=true;
    }catch {if(isCurrent())setLoadError('We could not safely restore your reservation. Try again, or call (815) 782-7790 before making another payment.');}
    finally{if(isCurrent())setInitializedSalesMode(salesOpen);}
  },[controller,salesOpen,eventConfig]);
  useEffect(()=>{void initialize();return()=>{initialization.current++;};},[initialize]);
  useEffect(()=>{
    // A restored payment intentionally loaded no editable catalog. A proved
    // cancellation/refund can release it later without erasing saved answers.
    if(!salesOpen||!loaded||loadError||recovery||discovered||draft.booking||products.length)return;
    const ctrl=new AbortController();
    loadCatalog(ctrl.signal).then(catalog=>{
      if(ctrl.signal.aborted)return;
      setProducts(catalog.products);setGrid(catalog.grid);
    }).catch(()=>{if(!ctrl.signal.aborted)setLoadError('We could not reload the party choices. Your answers are saved. Try again.');});
    return()=>ctrl.abort();
  },[salesOpen,loaded,loadError,recovery,discovered,draft.booking,products.length]);
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  useEffect(()=>{
    if(!salesOpen||!loaded||loadError||recovery||discovered||draft.booking)return;
    try{save();}catch{setLoadError('Please allow browser storage before continuing. Your existing held lanes have not been changed.');}
  },[salesOpen,loaded,draft,step,roomCode,quantity,time,pending,addOns,catalogReviewRequired,catalogHeldSelection]);
  useEffect(()=>{
    if(!salesOpen||!loaded||loadError||recovery||discovered||draft.booking||draft.checkoutLocked||pending||!products.length)return;
    const previous=choiceFromDraft(draft);
    if(!previous)return;
    const fresh=resolveCatalogChoice(previous,products,grid);
    if(!fresh){
      setCatalogHeldSelection(current=>current??{choice:previous,addOns:draft.addOnQtys});
      setCatalogReviewRequired(true);setStep('time');setReview(null);
      setNotice('We could not confirm the current package details. Your answers are saved. Check the party choices again.');return;
    }
    const changed=packageDetailsChanged(previous,fresh);
    if(JSON.stringify(fresh.product)!==JSON.stringify(previous.product)||JSON.stringify(fresh.slot)!==JSON.stringify(previous.slot))
      setDraft(current=>({...current,product:fresh.product,slot:fresh.slot}));
    if(changed){
      setCatalogHeldSelection(current=>current??{choice:previous,addOns:draft.addOnQtys});
      setCatalogReviewRequired(true);setStep('time');setReview(null);
      const stillHeld=!!cart&&exactSelectionHeld(cart,selectionItems(previous,draft.addOnQtys),laneCoverage(previous));
      setNotice(stillHeld?'Your lanes are held; package details changed. Please review before continuing.':'Package details changed. Please review before continuing. Your answers are saved.');
    }
  },[salesOpen,products,grid,loaded,loadError,recovery,discovered,draft.product,draft.slot,draft.booking,draft.checkoutLocked,pending]);
  useEffect(()=>{
    if(!salesOpen || !draft.product || recovery)return;
    const ctrl=new AbortController();setForms(null);setFormsError(false);
    api.getProductForms(draft.product.id,ctrl.signal).then(res=>{
      if(ctrl.signal.aborted)return;
      if(!validNyeDefinitions(res.forms,draft.product!.code,codes))throw new Error('required food definitions unavailable');
      setForms(res.forms);
    }).catch(()=>{if(!ctrl.signal.aborted)setFormsError(true);});
    return()=>ctrl.abort();
  },[salesOpen,draft.product?.id,formsRetry,recovery]);
  useEffect(()=>{
    setAlternatives([]);
    if(!salesOpen||!requested||locked)return;
    const ctrl=new AbortController();const key=requestedKey;
    api.getSlotMaxUnits(requested.product.id,EVENT_DATE,requested.slot.time,ctrl.signal).then(r=>{
      if(!ctrl.signal.aborted)setProbe({key,max:r.maxUnits,error:false});
    }).catch(()=>{if(!ctrl.signal.aborted)setProbe({key,max:null,error:true});});
    return()=>ctrl.abort();
  },[salesOpen,requestedKey,probeRetry,locked]);
  // Browser Back uses the same guarded navigation; a retained payment owns the flow.
  useEffect(()=>{
    const pop=(event:PopStateEvent)=>{
      if(locked||pending||draft.booking){history.pushState({[eventConfig.historyKey]:step},'');return;}
      const target=event.state?.[eventConfig.historyKey] as BrandStep|undefined;
      let next=target&&steps.includes(target)?target:'lanes';
      if(next==='time'&&!product)next='lanes';
      if(['arcade','food','pay'].includes(next)&&(!heldChoice||!requestedMatchesHeld||!ownHold))next='time';
      if(next==='pay'&&(!forms||!draft.product||!nyeAnswersComplete(forms,draft.product.code,draft.formAnswers,draft.laneQty,codes)||guestInvalidFields(draft.guest).length))next='food';
      setReview(null);setStep(next);
    };
    window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
  },[locked,pending,draft,step,requestedMatchesHeld,ownHold,forms,product]);
  function navigate(next:BrandStep){
    if(locked||pending)return;
    setReview(null);setNotice(null);setSubmitAttempt(0);setStep(next);history.pushState({[eventConfig.historyKey]:next},'');
    requestAnimationFrame(()=>{rootRef.current?.scrollIntoView({block:'start'});rootRef.current?.querySelector<HTMLElement>('h2')?.focus();});
  }
  const onAnswers=useCallback((answers:WizardState['formAnswers'])=>setDraft(d=>({...d,formAnswers:answers})),[]);
  function chooseRoom(p:CustomerProduct){if(locked||pending)return;setRoomCode(p.code as number);setTime(null);setReview(null);setNotice(null);}
  function changeQuantity(q:number){if(locked||pending)return;setQuantity(Math.min(product?onlineMax(product):eventConfig.maxLanes,Math.max(1,q)));setReview(null);setNotice(null);}

  async function findAlternatives(){
    if(!requested||alternativesBusy)return;
    setAlternativesBusy(true);setNotice(null);setAlternatives([]);
    const original=requested;
    const key=requestedKey, run=++alternativesRun.current;
    const other=products.find(p=>p.id!==original.product.id);
    const nearby=(grid[original.product.id]??[]).filter(s=>s.available&&s.time!==original.slot.time)
      .sort((a,b)=>Math.abs(Date.parse(partyStart(a.time))-Date.parse(partyStart(original.slot.time)))-Math.abs(Date.parse(partyStart(b.time))-Date.parse(partyStart(original.slot.time)))||a.time.localeCompare(b.time));
    const target=other&&(grid[other.id]??[]).find(s=>s.available&&s.time===original.slot.time);
    const options:PartyChoice[]=[...nearby.map(s=>({product:original.product,slot:s,quantity:original.quantity})),
      ...(other&&target?[{product:other,slot:target,quantity:safeAlternativeQuantity(original,other)}]:[])];
    const verified:PartyChoice[]=[];
    // Bounded checks: one nearest time that fits, and the other room at this time.
    for(const candidate of options){
      if(key!==requestedKeyRef.current||run!==alternativesRun.current){setAlternativesBusy(false);return;}
      if(candidate.quantity>onlineMax(candidate.product)||verified.some(v=>v.product.id===candidate.product.id))continue;
      try{
        const availability=await api.getSlotMaxUnits(candidate.product.id,EVENT_DATE,candidate.slot.time);
        if(availability.maxUnits<candidate.quantity)continue;
        await api.getQuote({items:selectionItems(candidate,compatibleAddOns({...draft,addOnQtys:addOns},candidate.product)),eventDate:EVENT_DATE,startTime:partyStart(candidate.slot.time)});
        verified.push(candidate);
      }catch{/* Unknown is not sold out, and does not prove no alternatives exist. */}
    }
    if(key!==requestedKeyRef.current||run!==alternativesRun.current){setAlternativesBusy(false);return;}
    setAlternatives(verified.slice(0,2));setAlternativesBusy(false);
    if(!verified.length)setNotice('No verified alternatives right now. Try checking again, or choose another party time.');
  }
  async function openReview(choice:PartyChoice, extras=compatibleAddOns({...draft,addOnQtys:addOns},choice.product)){
    const baselineCapacity=Math.max(heldChoice?heldChoice.quantity*guestsPerLane(heldChoice.product):0,requested?requested.quantity*guestsPerLane(requested.product):0);
    const lowerCapacity=choice.quantity*guestsPerLane(choice.product)<baselineCapacity;
    setHeadcount('');setNotice(null);setReview({choice,addOns:extras,quote:null,error:null,lowerCapacity});
    try{
      const availability=await api.getSlotMaxUnits(choice.product.id,EVENT_DATE,choice.slot.time);
      if(availability.maxUnits<choice.quantity)throw new Error('capacity');
      const quoted=await api.getQuote({items:selectionItems(choice,extras),eventDate:EVENT_DATE,startTime:partyStart(choice.slot.time),email:draft.guest.email,phone:draft.guest.phone,
        ...(marketingEnabled && draft.marketingOptIn !== undefined && {smsMarketingOptIn:draft.marketingOptIn})});
      setReview(r=>r?.choice===choice?{...r,quote:quoted}:r);
    }catch{setReview(r=>r?.choice===choice?{...r,error:'These lanes could not be confirmed. Your held lanes and answers are unchanged.'}:r);}
  }
  async function applyResult(result:CartSelectionResult, proposal:PendingProposal){
    if('cart'in result && result.cart)setCart(result.cart);
    if(result.kind==='held'){
      const advance=await acceptHeldProposal(proposal,draft,result.cart);history.pushState({[eventConfig.historyKey]:advance?proposal.next:'time'},'');
      requestAnimationFrame(()=>rootRef.current?.scrollIntoView({block:'start'}));return;
    }
    if(result.kind==='uncertain'||result.kind==='blocked'){
      setNotice('We are checking whether your change went through. Check this same selection before making another change.');return;
    }
    // Session-mismatch review may deliberately retain controller evidence.
    // Keep the paired proposal so a refresh cannot orphan that original key.
    if(result.kind==='review'&&controller.readPending().kind==='pending'){
      setNotice('We could not verify this reservation session. Check this same selection before making another change.');return;
    }
    if(result.kind==='payment_recovery'){
      // A guard can discover payment BEFORE sending this retained mutation.
      // Keep its paired UI proposal until the original payment is terminal and
      // the guest explicitly reconciles the original mutation, without a new key.
      if(controller.readPending().kind==='empty'){setPending(null);save(null);}
      const active=result.attempt?activeSchema.parse(result.attempt):await api.getActiveCheckoutAttempt();
      if(active){saveDiscoveredCheckout(sessionStorage,active);setDiscovered(active);}else setLoadError('Please check your saved payment before changing lanes.');return;
    }
    setPending(null);save(null);
    if(result.kind==='rejected'&&['cart_revision_conflict','cart_mutation_conflict','cart_line_conflict','cart_session_required'].includes(result.error.code)){
      // A rejection has no current cart in its response. Re-read it instead of
      // repeatedly submitting the obsolete revision, then require Use this
      // party before any replacement of the newly observed selection.
      const current=await api.getCart();
      if(!current.cartToken||current.revision===undefined||!current.items)throw new Error('current cart unavailable');
      setCart(current);setStep('time');await openReview(proposal.choice,proposal.addOns);
      setNotice('Your cart changed in another page. Review this party before replacing the current selection.');return;
    }
    if(result.kind==='rejected'&&result.error.code==='capacity_exhausted'){
      setNotice('There are not enough lanes available for that selection. Your previous held lanes and answers are unchanged.');
      setProbeRetry(n=>n+1);return;
    }
    if(result.kind==='expired'){setNotice('The lane hold has ended. Review your party choice to reserve available lanes again.');setStep('time');return;}
    setNotice('Your cart changed in another page, or this selection could not be verified. Review the current party before continuing.');
  }
  async function commit(choice:PartyChoice,extras:Record<string,number>,next:'arcade'|'food'){
    if(!cart||busyRef.current||recovery||discovered)return;
    const proposal={choice,addOns:extras,next};
    busyRef.current=true;setBusy(true);setNotice(null);
    try{
      if(controller.readPending().kind!=='empty'){setNotice('Check the pending selection before making another change.');return;}
      save(proposal);setPending(proposal);
      await applyResult(await controller.commit(cart,selectionItems(choice,extras),laneCoverage(choice)),proposal);
    }catch{setNotice(safeMessage);}
    finally{busyRef.current=false;setBusy(false);}
  }
  async function retryPending(){
    if(!pending||busyRef.current)return;busyRef.current=true;setBusy(true);
    try{
      const retained=controller.readPending();
      if(retained.kind==='pending'){
        if(!pendingProposalMatches(pending))throw new Error('pending proposal differs');
        await applyResult(await controller.retryPending(),pending);
      }else if(retained.kind==='empty'){
        // The controller can have received success before the parent draft
        // was persisted. Recover through a read, never another mutation/key.
        const active=await api.getActiveCheckoutAttempt();
        if(active){saveDiscoveredCheckout(sessionStorage,active);setDiscovered(active);return;}
        const current=await api.getCart();setCart(current);
        if(exactSelectionHeld(current,selectionItems(pending.choice,pending.addOns),laneCoverage(pending.choice))){
          const advance=await acceptHeldProposal(pending,draft,current);history.pushState({[eventConfig.historyKey]:advance?pending.next:'time'},'');
        }else{
          setPending(null);save(null);setStep('time');
          await openReview(pending.choice,pending.addOns);
          setNotice('Your saved choice is not currently held. Review this party before reserving available lanes again.');
        }
      }else throw new Error('pending storage unavailable');
    }catch{setNotice('We could not check that selection yet. Please try again.');}
    finally{busyRef.current=false;setBusy(false);}
  }
  function continueFlow(){
    if(locked||pending)return;
    if(step==='lanes'){if(product)navigate('time');return;}
    if(step==='time'&&requested){
      if(catalogReviewRequired){void openReview(requested);return;}
      if(!currentProbe||currentProbe.error||currentProbe.max===null||!slot?.available){setProbeRetry(n=>n+1);return;}
      if(shortage){void findAlternatives();return;}
      if(heldChoice&&(heldChoice.product.id!==requested.product.id||heldChoice.slot.time!==requested.slot.time||heldChoice.quantity!==requested.quantity))void openReview(requested);
      else void commit(requested,compatibleAddOns({...draft,addOnQtys:addOns},requested.product),'arcade');
      return;
    }
    if(step==='arcade'&&heldChoice){void commit(heldChoice,addOns,'food');return;}
    if(step==='food'){
      setSubmitAttempt(n=>n+1);
      if(!forms||!draft.product||!nyeAnswersComplete(forms,draft.product.code,draft.formAnswers,draft.laneQty,codes)||guestInvalidFields(draft.guest).length){
        setNotice('Please complete your food choices, acknowledgments and contact details.');
        requestAnimationFrame(()=>rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());return;
      }
      if(!ownHold){setNotice('Your hold has ended. Review your party choice before continuing.');setStep('time');return;}
      navigate('pay');
    }
  }
  function handleRecovery(value:CheckoutRecovery|null){
    const previous=value?null:loadCheckoutRecovery(sessionStorage);
    saveCheckoutRecovery(sessionStorage,value);setRecovery(value);
    if(value)setAcceptedQuote(value.quote);
    else{
      setDraft(d=>({...d,checkoutLocked:false}));
      // PaymentCheckoutForm calls onFindNewTime in the same tick; its parent
      // navigation closure may still see recovery locked. Make the proved
      // cancellation transition explicit here, preserving the current draft.
      if(previous&&(previous.status==='cancelled'||previous.status==='refunded')){
        setStep('time');setAcceptedQuote(null);setNotice('Your payment is resolved. Review your party choice before reserving lanes again.');
      }
    }
  }
  async function discover(){const active=await api.getActiveCheckoutAttempt();if(!active)throw new Error('missing saved payment');saveDiscoveredCheckout(sessionStorage,active);setDiscovered(active);}
  function resetResolved(){
    // Called only by the shared recovery component after a terminal result or
    // confirmed booking. Keep any paired pending cart proposal: only its same
    // mutation retry/current authoritative read can resolve that identity.
    setInitializedSalesMode(null);
    // Finishing a previous payment must not replay a landing-page preference.
    entryChoiceUsed.current=true;
    saveCheckoutRecovery(sessionStorage,null);saveDiscoveredCheckout(sessionStorage,null);
    const retained=controller.readPending();
    if(retained.kind==='blocked'){setLoadError('We could not read the saved lane selection. Please allow browser storage before continuing.');setInitializedSalesMode(salesOpen);return;}
    if(retained.kind==='pending'&&!sessionStorage.getItem(DRAFT_KEY)){
      setLoadError('Your saved lane change needs review. Please call (815) 782-7790 before starting another reservation.');setInitializedSalesMode(salesOpen);return;
    }
    const raw=sessionStorage.getItem(DRAFT_KEY);
    if(retained.kind==='empty'&&discovered?.status==='confirmed')sessionStorage.removeItem(DRAFT_KEY);
    else if(raw){const saved=savedSchema.parse(JSON.parse(raw));if(!saved.pending)sessionStorage.setItem(DRAFT_KEY,JSON.stringify({...saved,step:'time'}));}
    setDiscovered(null);setRecovery(null);setAcceptedQuote(null);
    if(!sessionStorage.getItem(DRAFT_KEY)){
      setDraft(freshDraft());setStep('lanes');setRoomCode(null);setTime(null);setQuantity(1);setPending(null);setAddOns({});setCatalogReviewRequired(false);setCatalogHeldSelection(null);
    }else{setDraft(d=>({...d,checkoutLocked:false,booking:null}));setStep('time');}
    void initialize();
  }
  const priceChoice=review?.choice??(step==='lanes'||step==='time'?requested:heldChoice);
  const displayedQuote=review?.quote??(step==='lanes'||step==='time'?null:quote);
  const summary={caption:displayedQuote?'TOTAL':priceChoice?'PACKAGE SUBTOTAL':'YOUR PARTY',value:displayedQuote?formatUsd(displayedQuote.totalIncludingTax):['arcade','food','pay'].includes(step)&&pricing.loading?'Checking total…':priceChoice?formatUsd(priceChoice.quantity*priceChoice.slot.priceCents):'Choose your party',
    note:eventConfig.pricingSummaryNote??(displayedQuote?'Includes taxes & service fee':'Taxes & service fee extra')};
  const headcountValid=!review?.lowerCapacity || (/^\d+$/.test(headcount)&&Number(headcount)>0&&Number(headcount)<=review.choice.quantity*guestsPerLane(review.choice.product));
  let primary=step==='pay'||step==='confirmation'?undefined:{label:step==='lanes'?(product?`Choose a ${roomName(product)} time`:'Choose a lane type'):step==='time'?(shortage?'Review other options':`Continue with ${quantity} ${product?roomName(product)+' ':''}${quantity===1?'lane':'lanes'}`):step==='arcade'?'Continue to food & details':'Review & pay',
    onClick:continueFlow,disabled:locked||!!pending||(step==='lanes'&&!product)||(step==='time'&&(!requested||!currentProbe||currentProbe.error))||(step==='food'&&(!forms||formsError)),busy};
  if(review)primary={label:'Use this party',onClick:()=>{if(review.quote&&headcountValid)void commit(review.choice,review.addOns,'arcade');},disabled:locked||!!pending||!review.quote||!headcountValid,busy};
  if(primary&&busy)primary={...primary,label:'Checking your selection…'};
  const noticeContent=<>{notice&&<p role="status">{notice}</p>}{pending&&<button className="link" type="button" disabled={busy} onClick={()=>void retryPending()}>Check this selection</button>}</>;
  // A first-time visitor can read the opening date while recovery discovery
  // runs. Discovery failure still blocks any checkout; it does not turn the
  // countdown into an alarming empty reservation screen.
  if(!salesOpen&&!recovery&&!discovered&&!draft.booking&&closedContent&&(!loaded||loadError))return <>
    {loadError&&<div className="nye-public-recovery-note" role="alert"><p>We couldn't check for a saved payment. Try again, or call (815) 782-7790 before making another payment.</p><button type="button" onClick={()=>void initialize()}>Try again</button></div>}
    {closedContent}
  </>;
  if(!loaded||loadError)return <BrandShell eventDate={EVENT_DATE} identity={eventConfig.identity} previewNotice={eventConfig.reviewNotice} step="lanes" summary={{caption:eventConfig.identity.name.toUpperCase(),value:labels.monthDay,note:`${labels.year} · Plainfield, IL`}} locked onNavigate={()=>{}} canNavigate={()=>false}>
    <h2 className="page-heading" tabIndex={-1}>{loadError?'Let’s check your reservation.':'Getting your party ready.'}</h2><p role="status">{loadError??'Checking for a saved payment and loading your party choices…'}</p>
    {loadError&&<button className="primary" onClick={()=>void initialize()}>Try again</button>}</BrandShell>;
  if(discovered)return <div className={`nye-brand ${eventConfig.identity.theme==='jingle'?'jingle-booking':''}`}><div className="flow" style={{maxWidth:760,margin:'0 auto',minHeight:'100vh'}}>
    <img src="/logo/twisted-pin-horizontal-white.webp" alt="Twisted Pin" width="178" height="70"/>
    <h1 className="page-heading">Your saved reservation.</h1>
    <DiscoveredComponent attempt={discovered} onSave={a=>{saveDiscoveredCheckout(sessionStorage,a);setDiscovered(a);}} onClear={()=>{saveCheckoutRecovery(sessionStorage,null);saveDiscoveredCheckout(sessionStorage,null);}} onNewReservation={resetResolved}/></div></div>;
  if(!salesOpen&&!recovery&&!draft.booking)return <>{closedContent ?? <p>{eventConfig.closedMessage}</p>}</>;
  return <BrandShell eventDate={EVENT_DATE} identity={eventConfig.identity} previewNotice={eventConfig.reviewNotice} step={step} summary={summary} locked={locked||!!pending||!!draft.booking} primary={primary}
    secondaryPrimary={step==='arcade'&&!Object.values(addOns).some(q=>q>0)}
    contextLabel={heldChoice?`${draft.laneQty} ${roomName(heldChoice.product)} ${draft.laneQty===1?'lane':'lanes'} · ${formatTime12h(heldChoice.slot.time)}`:undefined}
    holdStatus={draft.booking||step==='pay'?undefined:recovery?'Your original payment is being checked.':existingLanesHeldForReview?<>Your existing lanes are held · {Math.floor(holdLeft/60)}:{String(holdLeft%60).padStart(2,'0')}<span>Review the updated package before continuing.</span></>:ownHold?<>Your lanes are held · {Math.floor(holdLeft/60)}:{String(holdLeft%60).padStart(2,'0')}{holdLeft<=120&&<span>Less than two minutes left. Your answers will stay saved if the hold ends.</span>}</>:heldChoice?'Your hold has ended. Your answers are saved.':undefined}
    notice={notice||pending?noticeContent:undefined} onNavigate={navigate}
    canNavigate={s=>!locked&&!pending&&!draft.booking&&steps.indexOf(s)<steps.indexOf(step)}
    onBack={step!=='lanes'&&step!=='confirmation'&&!locked&&!pending?()=>navigate(steps[Math.max(0,steps.indexOf(step)-1)]):undefined}>
    <div ref={rootRef}>
    {step==='lanes'&&<>
      <div className="date-stamp"><span className="date-number">{labels.day}</span><div><span className="month">{labels.monthYear}</span><span className="day">{labels.weekday} · {eventConfig.identity.name}</span></div></div>
      <h2 className="page-heading" tabIndex={-1}>Choose your lanes.</h2><p className="intro">{eventConfig.intro.map((line,i)=><FragmentLine key={i} text={line} last={i===eventConfig.intro.length-1}/>)}</p>
      <div className="room-list" aria-label="Choose lane type">{codes.map(code=>products.find(p=>p.code===code)).filter((p):p is CustomerProduct=>!!p).map(p=><button type="button" key={p.id} className={`room-choice ${roomCode===p.code?'selected':''}`} aria-pressed={roomCode===p.code} disabled={locked||!!pending} onClick={()=>chooseRoom(p)}>
        <span className="room-photo"><img src={`/snap/tile-${p.code===eventConfig.vipCode?'vip':'trad'}-540.webp`} alt="" width="540" height="300"/><span className="radio-mark" aria-hidden="true">{roomCode===p.code?'✓':''}</span></span>
        <span className="room-copy"><span className="room-name">{p.code===eventConfig.vipCode?'VIP suite':'Traditional'}<br/>lanes</span><span className="capacity">Up to <strong>{guestsPerLane(p)} guests</strong><br/>per lane</span><span className="room-detail">{p.code===eventConfig.vipCode?'Lanes in our semi-private suite.':'The classic bowling setup.'}</span>
        <span className="price">From <strong>{formatUsd(grid[p.id]?.length?Math.min(...grid[p.id].map(s=>s.priceCents)):p.defaultPriceCents)}</strong> / lane</span><span className="room-cta">{roomCode===p.code?'Selected':'Choose'} {roomName(p)}</span></span></button>)}</div>
      <p className="selection-note">Tap <strong>Traditional</strong> or <strong>VIP</strong> to choose your lanes.</p>
      <div className="quantity-box"><div className="qty-line"><h3 className="section-heading">How many lanes?</h3><Quantity value={quantity} max={product?onlineMax(product):eventConfig.maxLanes} disabled={locked||!!pending} onChange={changeQuantity}/></div><p className="qty-caption">{product&&<strong>Up to {quantity*guestsPerLane(product)} guests total.<br/></strong>}Count everyone, including non-bowlers and spectators.</p></div>
      <div className="included"><p className="included-title">Every lane includes</p><div className="included-list">{eventConfig.included.map(item=><span key={item}>{item}</span>)}</div><details><summary>The full package</summary><p>{eventConfig.packageDescription}</p></details></div>
    </>}
    {step==='time'&&product&&<>
      <h2 className="page-heading" tabIndex={-1}>Choose your time.</h2><p className="intro">{labels.full} · Chicago time</p>
      <div className="time-request"><div><strong>{roomName(product)} lanes</strong><p>Up to {guestsPerLane(product)} guests per lane</p></div><Quantity value={quantity} max={onlineMax(product)} disabled={locked||!!pending} onChange={changeQuantity}/></div>
      {(shortage||currentProbe?.error||review||alternativesBusy||alternatives.length>0)&&<section className="recovery-panel" aria-label="Other party options">
        {!review&&<><h3>{shortage&&currentProbe?.max?`Only ${currentProbe.max} ${roomName(product)} ${currentProbe.max===1?'lane is':'lanes are'} available at ${formatTime12h(time!)}.`:currentProbe?.error?'We could not check these lanes.':'Let’s find your party.'}</h3>
          <p>You asked for <strong>{quantity} {roomName(product)} {quantity===1?'lane':'lanes'}</strong>{time?` at ${formatTime12h(time)}`:''}. Your requested number has not changed.</p>
          <div className="recovery-options">{alternatives.map(a=><button type="button" className="alternative" key={`${a.product.id}/${a.slot.time}`} disabled={locked} onClick={()=>void openReview(a)}><strong>{a.product.id===product.id?`Keep ${roomName(product)}`:`Keep ${formatTime12h(time!)}`}</strong><span>{a.quantity} {roomName(a.product)} lanes · {partyRange(a)}</span><span>Up to {a.quantity*guestsPerLane(a.product)} guests · {formatUsd(a.quantity*a.slot.priceCents)} + taxes &amp; fee</span><span>Review this option →</span></button>)}</div>
          <button className="link" type="button" disabled={alternativesBusy||locked} onClick={()=>void findAlternatives()}>{alternativesBusy?'Checking other parties…':'Check other party options'}</button>
          {shortage&&!!currentProbe?.max&&requested&&<button className="link" type="button" onClick={()=>void openReview({...requested,quantity:currentProbe.max!})}>Use fewer lanes</button>}
          {shortage&&requested&&product.code===eventConfig.vipCode&&products.some(p=>p.code===eventConfig.traditionalCode&&(grid[p.id]??[]).some(s=>s.time===time&&s.available))&&<button className="link" type="button" onClick={()=>{
            const traditional=products.find(p=>p.code===eventConfig.traditionalCode)!;
            void openReview({product:traditional,slot:grid[traditional.id].find(s=>s.time===time)!,quantity});
          }}>Check {quantity} Traditional {quantity===1?'lane':'lanes'} for a smaller group</button>}
        </>}
        {review&&<div className="change-review"><h3>Review your change.</h3><p><strong>{review.choice.quantity} {roomName(review.choice.product)} lanes</strong> · up to {review.choice.quantity*guestsPerLane(review.choice.product)} guests</p><p>{labels.full}<br/>{partyRange(review.choice)} · {partyDuration(review.choice)} minutes</p>
          <p>{review.choice.quantity} large pizzas + {review.choice.quantity} soda pitchers included.</p>
          {review.choice.product.addOnProducts.filter(a=>(review.addOns[a.id]??0)>0).map(a=><p key={a.id}>{review.addOns[a.id]} × <Markdown text={a.name} inline/> retained.</p>)}
          {Object.keys(addOns).some(id=>addOns[id]>0&&!review.addOns[id])&&<p>Arcade choices that are unavailable with this lane type will be removed.</p>}
          {heldChoice&&<p>{draft.product?.id!==review.choice.product.id?'You will choose food and review the acknowledgments for this lane type again.':review.choice.quantity<draft.laneQty?`Food pairs ${review.choice.quantity+1}–${draft.laneQty} will be removed.`:review.choice.quantity>draft.laneQty?'Your existing food pairs stay; choose food for the added lanes.':'Your numbered food choices stay.'} {draft.slot?.time!==review.choice.slot.time?'Please review the party acknowledgments again.':''}</p>}
          {eventConfig.midnightToastTime&&(heldChoice??requested)?.slot.time!==review.choice.slot.time&&<p>{review.choice.slot.time===eventConfig.midnightToastTime?'Midnight champagne or sparkling cider toast is added.':(heldChoice??requested)?.slot.time===eventConfig.midnightToastTime?'Midnight toast is removed.':'This party does not include the midnight toast.'}</p>}
          {review.lowerCapacity&&<label>How many guests are coming, including spectators?<input type="number" min="1" max={review.choice.quantity*guestsPerLane(review.choice.product)} value={headcount} onChange={e=>setHeadcount(e.target.value)} inputMode="numeric"/>{headcount&&!headcountValid&&<span role="alert">This choice fits up to {review.choice.quantity*guestsPerLane(review.choice.product)} guests.</span>}</label>}
          <p><strong>{review.quote?formatUsd(review.quote.totalIncludingTax):review.error??'Checking total…'}</strong>{review.quote?' including taxes & service fee':''}</p><button className="link" type="button" disabled={locked} onClick={()=>setReview(null)}>{ownHold?'Keep my held lanes':'Keep my original choice'}</button>
        </div>}
      </section>}
      <div className="time-list" aria-label="Party times">{(grid[product.id]??[]).map(s=>{
        const choice={product,slot:s,quantity};return <button type="button" key={s.time} className={`time-choice ${time===s.time?'selected':''}`} aria-pressed={time===s.time} disabled={locked||!!pending||!s.available} onClick={()=>{setTime(s.time);setReview(null);setNotice(null);}}>
          <span><strong>{partyRange(choice)}</strong><span>{partyDuration(choice)} minutes{s.time===eventConfig.midnightToastTime?' · Midnight toast':''}</span></span><span><strong>{formatUsd(s.priceCents)}</strong> / lane{!s.available&&<span>Unavailable right now</span>}</span></button>;
      })}</div>
      {!grid[product.id]?.length&&<p role="status">Party times are not available right now. <button className="link" onClick={()=>void initialize()}>Check again</button></p>}
      {currentProbe?.error&&<button type="button" className="link" onClick={()=>setProbeRetry(n=>n+1)}>Check availability again</button>}
      {ownHold&&heldChoice&&!catalogReviewRequired&&<button type="button" className="link" onClick={()=>{
        setRoomCode(heldChoice.product.code as number);setQuantity(heldChoice.quantity);setTime(heldChoice.slot.time);navigate('food');
      }}>Keep my held lanes</button>}
    </>}
    {step==='arcade'&&heldChoice&&<><h2 className="page-heading" tabIndex={-1}>Add arcade play.</h2><p className="intro">Keep the fun going for your crew.</p>
      {heldChoice.product.addOnProducts.map(a=>{
        // The approved $200 visual is tied to the explicitly named catalog
        // offer, never calculated by doubling an arbitrary add-on's price.
        const mega=a.code===eventConfig.arcadeMegaCode&&a.defaultPriceCents===10000&&/\$200\s+in\s+game\s*play/i.test(a.shortDescription);
        const offer=eventConfig.arcadeCardOffer;
        const regular=!!offer&&a.code===offer.code&&a.defaultPriceCents===offer.priceCents&&a.shortDescription.replace(/\s+/g,' ').toLowerCase().includes(`$${offer.playCreditCents/100} in game play`);
        const playCredit=mega?20000:regular?offer!.playCreditCents:null;
        const count=addOns[a.id]??0;
        return <section key={a.id} aria-label={playCredit!==null?'Arcade cards':a.name}>
          {playCredit!==null?<><span className="caps kicker">Optional · Online prepurchase only</span><div className="arcade-art"><img src="/snap/arcade-interior-540.webp" alt="Arcade games at Twisted Pin" width="540" height="401"/><div className="arcade-amount"><span className="caps">Each arcade card comes with</span><strong><span>$</span>{playCredit/100}</strong><span className="of-play">of play.</span></div></div></>:<><h3 className="section-heading"><Markdown text={a.name} inline/></h3><p><Markdown text={a.shortDescription}/></p></>}
          <div className="offer-line"><p className="offer-price">{formatUsd(a.defaultPriceCents)} <span>{playCredit!==null?'per card':'each'}</span></p>
            {count===0?<button type="button" className="outline-button arcade-add" disabled={locked||!!pending} onClick={()=>setAddOns(x=>({...x,[a.id]:Math.max(1,a.minQuantity)}))}>Add a card +</button>:<Quantity value={count} min={a.isRequired?a.minQuantity:0} max={a.maxQuantity??99} disabled={locked||!!pending} onChange={q=>setAddOns(x=>({...x,[a.id]:q}))}/>}</div>
          {mega&&<><p className="card-count" role="status">{count?`${count} ${count===1?'card':'cards'} · ${formatUsd(count*20000)} of play.`:'No arcade added. It’s entirely up to you.'}</p><ul className="arcade-facts"><li>Buy $100, get $100 free on each card.</li><li>Credits don't expire.</li><li>Collect your cards at the front desk.</li></ul><p className="soft-note">Buying more than one? Each purchase is a separate card with $200 of play.</p></>}
          {regular&&<><p className="card-count" role="status">{count?`${count} ${count===1?'card':'cards'} · ${formatUsd(count*offer!.playCreditCents)} of play.`:'No arcade cards added.'}</p><p className="soft-note">Each purchase is a separate card with {formatUsd(offer!.playCreditCents)} in game play.</p></>}
        </section>;
      })}
      <button type="button" className="link" disabled={locked||!!pending} onClick={()=>void commit(heldChoice,{},'food')}>Continue without arcade</button>
    </>}
    {step==='food'&&heldChoice&&<><h2 className="page-heading" tabIndex={-1}>Choose your pizza &amp; soda.</h2><p className="intro">{eventConfig.foodHelp}</p>
      {formsError?<p role="alert">We could not load your required food choices. <button type="button" className="link" onClick={()=>setFormsRetry(n=>n+1)}>Try again</button></p>:!forms?<p role="status">Loading your food choices…</p>:<FormRenderer key={draft.product!.id} hideTitle definitions={forms} helpTextOverrides={helpTextOverrides} pairedPresentation={eventConfig.pairedPresentation} pairedProductCodes={codes} productId={draft.product!.id} productCode={draft.product!.code} answers={draft.formAnswers} onAnswersChange={onAnswers} onInvalidIdsChange={setInvalidIds} submitAttempt={submitAttempt} unitQuantities={{guest_count:0,lane_count:draft.laneQty}}/>}
      <GuestDetailsStep showBookingForms={false} showMarketingConsent={marketingEnabled} contactNotice={eventConfig.contactNotice} guest={draft.guest} onGuestField={(field,value)=>setDraft(d=>({...d,guest:{...d.guest,[field]:value}}))} marketingOptIn={draft.marketingOptIn} onMarketingOptIn={value=>setDraft(d=>({...d,marketingOptIn:value}))} productId={draft.product!.id} productCode={draft.product!.code} formAnswers={draft.formAnswers} onFormAnswers={onAnswers} onFormInvalidIds={setInvalidIds} submitAttempt={submitAttempt} formInvalidCount={invalidIds.length} rewardAmountCents={null} unitQuantities={{guest_count:0,lane_count:draft.laneQty}}/>
    </>}
    {step==='pay'&&heldChoice&&<><h2 className="page-heading" tabIndex={-1}>Review &amp; pay.</h2><div className="reservation-ticket"><strong>{draft.laneQty} {roomName(heldChoice.product)} lanes</strong><p>{labels.full}<br/>{partyRange(heldChoice)}</p><p>Up to {draft.laneQty*guestsPerLane(heldChoice.product)} guests · Shoes included</p><p>{draft.laneQty} large pizzas + {draft.laneQty} soda pitchers</p>
      <div className="summary-food"><div className="summary-food-heading"><h3>Your pizza &amp; soda</h3><button type="button" className="link" disabled={locked||!!pending} onClick={()=>navigate('food')}>Edit pizza &amp; soda</button></div>{Array.from({length:draft.laneQty},(_,i)=><p key={i}><strong>{eventConfig.pairedPresentation?.unitLabel??'Pizza & pitcher'} {i+1}:</strong> {draft.formAnswers.filter(a=>a.unitIndex===i+1).map(a=>a.value==='Cheese'?'Cheese only':a.value).join(' · ')}</p>)}</div>
      {draft.product!.addOnProducts.filter(a=>(draft.addOnQtys[a.id]??0)>0).map(a=><p key={a.id}>{draft.addOnQtys[a.id]} × <Markdown text={a.name} inline/></p>)}<p>{draft.guest.firstName} {draft.guest.lastName}<br/>{draft.guest.email}</p></div>
      {quote&&<div className="ledger"><p><span>Packages &amp; arcade</span><strong>{formatUsd(quote.subtotalExcludingTax-quote.fees.reduce((n,f)=>n+f.amountCents,0))}</strong></p>{quote.fees.map((f,i)=><p key={i}><span>{f.name}</span><strong>{formatUsd(f.amountCents)}</strong></p>)}<p><span>Sales tax</span><strong>{formatUsd(quote.taxBreakdown.totalTax)}</strong></p><p><span>Total</span><strong>{formatUsd(quote.totalIncludingTax)}</strong></p></div>}
      <PaymentComponent draft={{...draft,step:'payment'}} quote={quote} recovery={recovery} onRecovery={handleRecovery} onDiscover={discover} onLock={value=>setDraft(d=>({...d,checkoutLocked:value}))}
        customer={{...draft.guest,...(marketingEnabled && draft.marketingOptIn !== undefined && {smsMarketingOptIn:draft.marketingOptIn,consentLanguage:consentLanguageFor(null)})}} cartHoldItems={heldItems} checkoutItems={heldItems} eventDate={EVENT_DATE} startTime={partyStart(heldChoice.slot.time)} salesCutoffMinutesBefore={heldChoice.product.salesCutoffMinutesBefore}
        salesClosedMessage={eventConfig.salesClosedMessage}
        couponsEnabled={false} couponResult={null} onCouponCode={()=>{}} onCouponResult={()=>{}} formAnswers={draft.formAnswers}
        formStale={!recovery&&(!forms||!nyeAnswersComplete(forms,draft.product!.code,draft.formAnswers,draft.laneQty,codes))}
        preAcquiredSelection={{items:heldItems,coverage:heldCoverage}} onSelectionLost={()=>{setStep('time');setNotice('Review your party choice to reserve available lanes again.');}}
        onFindNewTime={()=>navigate('time')} termsText={eventConfig.termsText} totalCents={quote?.totalIncludingTax??0} pricingPending={!recovery&&(pricing.loading||!quote)} pricingError={recovery?null:pricing.error} onRetryPricing={pricing.retry}
        onConverted={booking=>{setAcceptedQuote(quote);setDraft(d=>({...d,booking,checkoutLocked:false}));setStep('confirmation');sessionStorage.removeItem(DRAFT_KEY);}}/>
    </>}
    {step==='confirmation'&&heldChoice&&draft.booking&&<><div className="success-mark" aria-hidden="true">✓</div><h2 className="page-heading" tabIndex={-1}>{eventConfig.confirmation?.heading??"You're booked."}</h2><p>Confirmation {draft.booking.invoiceNumber}</p><div className="reservation-ticket"><strong>{draft.laneQty} {roomName(heldChoice.product)} lanes</strong><p>{labels.full}<br/>{partyRange(heldChoice)}</p><p>{eventConfig.confirmation?.amountLabel??'Paid'} {formatUsd(acceptedQuote?.totalIncludingTax??0)}</p></div><p>{eventConfig.confirmation?.message??<>Your confirmation is on its way to <strong>{draft.guest.email}</strong>.</>}</p>
      {eventConfig.confirmation?.previewPath&&<p><a href={`${eventConfig.confirmation.previewPath}/${encodeURIComponent(draft.booking.bookingId)}/confirmation/`} target="_blank" rel="noreferrer">Confirmation preview</a> · <a href={`${eventConfig.confirmation.previewPath}/${encodeURIComponent(draft.booking.bookingId)}/kitchen/`} target="_blank" rel="noreferrer">Kitchen preview</a></p>}
      <a className="primary" href="https://www.twistedpin.com/">Back to twistedpin.com</a></>}
    </div>
  </BrandShell>;
}

function Quantity({value,onChange,min=1,max=6,disabled=false}:{value:number;onChange:(value:number)=>void;min?:number;max?:number;disabled?:boolean}){
  return <div className="stepper"><button type="button" aria-label="Fewer" disabled={disabled||value<=min} onClick={()=>onChange(value-1)}>−</button><output aria-label="Quantity">{value}</output><button type="button" aria-label="More" disabled={disabled||value>=max} onClick={()=>onChange(value+1)}>+</button></div>;
}

function FragmentLine({text,last}:{text:string;last:boolean}){return <>{text}{!last&&<br/>}</>;}
