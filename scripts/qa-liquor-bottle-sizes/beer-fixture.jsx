import React, {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import BottledBeer from 'qa:beer';
import {resolveCountQuantity} from 'qa:count-quantity';
import 'qa:styles';

// Only synthetic beer and HTTP responses. No production requests leave this fixture.
const mode = new URL(location.href).searchParams.get('mode');
const catalog = [
  {id:'lager',name:'Example Lager',unitsPerCase:24},
  {id:'light',name:'Example Light',unitsPerCase:24},
  {id:'unknown',name:'Unknown Case Size',unitsPerCase:null},
].map(s => ({...s,category:'Beer',sizeMl:355,wacCost:null}));
const initialLines = mode === 'resumed' ? [{skuId:'lager',zoneId:'cooler',qtyUnits:'68.000',enteredCases:'2.000',caseSizeAtEntry:24,enteredPacks:'1.000',packSizeAtEntry:6}]
  : mode === 'frozen-pack' ? [{skuId:'lager',zoneId:'cooler',qtyUnits:'8.000',enteredCases:null,caseSizeAtEntry:null,enteredPacks:'2.000',packSizeAtEntry:4}]
  : mode === 'frozen' ? [{skuId:'lager',zoneId:'cooler',qtyUnits:'32.000',enteredCases:'1.000',caseSizeAtEntry:12,enteredPacks:'1.000',packSizeAtEntry:6}]
  : [];
const qa = window.beerQa = {calls:[],lines:initialLines,state:null,flush:null};
let storedLines=initialLines;
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
// ?mode=stale: another phone saved after this screen loaded (12 Example Light,
// 0 Example Lager), so the first save is refused once with the draft as it is now.
let refuseNextSave = mode === 'stale';
const otherPhone = ['lager','light'].map((skuId,i) => ({skuId,zoneId:'cooler',qtyUnits:i ? '12.000' : '0.000',
  enteredCases:null,caseSizeAtEntry:null,enteredPacks:null,packSizeAtEntry:null,source:'grid',rawUtterance:null}));
let saves = 0;
window.fetch = async (input,init={}) => {
  const url = new URL(String(input),location.origin);
  const path = url.pathname;
  const body = init.body ? JSON.parse(String(init.body)) : null;
  qa.calls.push({path,method:init.method || 'GET',query:url.search,body});
  if (path.endsWith('/catalog')) return json({items:catalog});
  if (path.endsWith('/zones')) return json({zones:[{id:'cooler',name:'Walk In Cooler',walkOrder:1}]});
  if (path.endsWith('/counts/open')) return json({session:{id:'synthetic-beer',isFullCount:false,section:'bar',lines:storedLines,
    ...(mode === 'stale' ? {linesHash:'server1'} : {})}});
  if (path.endsWith('/lines')) {
    // ?mode=save-fails: the server is down for every save.
    if (mode === 'save-fails') return json({error:'unavailable'},503);
    if (refuseNextSave) {
      refuseNextSave = false;
      return json({error:'draft_changed',message:'This count changed somewhere else since this screen loaded it.',
        lines:otherPhone,linesHash:'server2'},409);
    }
    qa.lines=body.lines;
    storedLines=body.lines.map(line=>{
      const resolved=resolveCountQuantity(line);
      // The actual backend converter, then the numeric-string representation
      // returned by Postgres. Nothing touches a live database in this fixture.
      return {...line,...resolved,qtyUnits:String(resolved.qtyUnits),
        enteredCases:resolved.enteredCases===null?null:String(resolved.enteredCases),
        enteredPacks:resolved.enteredPacks===null?null:String(resolved.enteredPacks)};
    });
    return json({upserted:body.lines.length,...(mode === 'stale' ? {linesHash:`saved${++saves}`} : {})});
  }
  throw new Error('Unexpected beer fixture request: '+path);
};
function Preview() {
  const flushRef=useRef(null);
  const [version,setVersion]=useState(0);
  qa.flush=() => flushRef.current?.();
  qa.reopen=() => setVersion(value=>value+1);
  return <div className="lq-app"><header className="lq-header"><span className="lq-brand">COGS · Beer QA</span></header>
    <main className="lq-main"><section className="lq-kc-section">
      <div className="lq-kc-head"><span className="lq-kc-title">Bottled beer</span></div>
      <div className="lq-kc-body"><BottledBeer key={version} embedded embedFlushRef={flushRef} onEmbedState={s => {qa.state=s;}} /></div>
    </section></main></div>;
}
createRoot(document.getElementById('root')).render(<Preview />);
