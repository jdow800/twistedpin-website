import React from 'react';
import {createRoot} from 'react-dom/client';
import FoodRecipes,{foodRecipeCost} from '../../src/components/liquor/views/FoodRecipes.tsx';
import '../../src/components/liquor/liquor.css';
const params=new URL(location.href).searchParams, calls=[];
const R='r-pizza', CHEESE='sku-cheese', FRIES='sku-fries', MISSING='sku-missing';
const recipes=[{id:R,namespace:'gotab',productKey:'123',optionLabel:'',labelText:null,kind:'dish',productName:'Pizza',basis:'Jon measured',note:'Keep source history',active:true,revision:'a'.repeat(64),name:'Pizza',key:'gotab:123',
  lines:[{id:'line-cheese',skuId:CHEESE,skuName:'Cheese',qty:8,unit:'oz',via:'pizza prep',basis:'Opsi recipe reviewed',note:'Full portion'}]},
  {id:'r-option',namespace:'gotab',productKey:'123',optionLabel:'extra cheese (1st)',labelText:'Extra Cheese (1st)',kind:'change',productName:'Pizza',basis:'Jon reviewed option',note:'Keep the half-pizza tag',active:true,revision:'8'.repeat(64),name:'Pizza: Extra Cheese (1st)',key:'gotab:123::extra cheese (1st)',
    lines:[{id:'line-option',skuId:CHEESE,skuName:'Cheese',qty:4,unit:'oz',via:'',basis:'portion measured',note:'Half pie'}]}];
const items=[{id:CHEESE,name:'Cheese',active:true,discontinuedAt:null,countUnit:'each',unitLabel:'bag',unitsPerCase:6,recipeUnit:'oz',yield:80,costPerCountUnit:20,yieldRevision:'b'.repeat(64)},
  {id:FRIES,name:'Fries unreferenced',active:true,discontinuedAt:null,countUnit:'each',unitLabel:'bag',unitsPerCase:4,recipeUnit:'oz',yield:32,costPerCountUnit:8,yieldRevision:'c'.repeat(64)},
  {id:MISSING,name:'Missing cost ingredient',active:false,discontinuedAt:null,countUnit:'each',unitLabel:'jar',unitsPerCase:null,recipeUnit:'oz',yield:null,costPerCountUnit:null,yieldRevision:'d'.repeat(64)}];
if(params.get('mode')==='cup'){recipes[0].lines[0]={...recipes[0].lines[0],qty:1,unit:'cup'};items[0]={...items[0],recipeUnit:'floz',yield:32,costPerCountUnit:8};}
if(params.get('mode')==='invalid-basis')items[0]={...items[0],countUnit:'case',unitLabel:null,physicalBasisValid:false};
const frozen={countUnit:'each',unitLabel:'bag',unitsPerCase:6,recipeUnit:'oz',yield:80};
let corrections={sessionId:'count-b',priorSessionId:'count-a',periodStart:'2026-10-06T15:00:00Z',periodEnd:'2026-10-13T15:00:00Z',varianceVersion:1,cogsVersion:2,revision:'e'.repeat(64),
  items:[{skuId:CHEESE,name:'Cheese',opening:frozen,closing:{...frozen,unitsPerCase:4},current:frozen,previous:null,canCorrect:true,unavailableReason:null,revision:'f'.repeat(64)},
    {skuId:FRIES,name:'Changed package',opening:frozen,closing:{...frozen,unitLabel:'box'},current:frozen,previous:null,canCorrect:false,unavailableReason:'The frozen count units and current physical unit do not match.',revision:'9'.repeat(64)}]};
window.frQa={calls,foodRecipeCost,recipes,items,otherAdminEdits:()=>{recipes[0]={...recipes[0],revision:'6'.repeat(64),lines:[{...recipes[0].lines[0],qty:12}]};}};
window.fetch=async (url,options={})=>{
  const path=new URL(url,location.href).pathname.replace(/\/$/,''), method=options.method||'GET', body=options.body?JSON.parse(options.body):null;
  calls.push({path,method,body});
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  if(method==='GET' && path.endsWith('/food-recipes')) return json({recipes,items,problems:[]});
  if(method==='GET' && path.includes('/report-corrections/')) return json(corrections);
  if(params.get('mode')==='conflict' && method!=='GET') return json({error:'stale_recipe',message:'This record changed. Reload before saving.'},409);
  if(method==='PUT' && path.endsWith('/food-recipes')) {
    const old=recipes.find(r=>r.id===body.recipeId), id=old?.id||'new-recipe';
    if(old&&body.expectedRevision!==old.revision)return json({error:'stale_recipe',message:'This recipe changed. Reload it before saving.'},409);
    const recipe={...old,...body,id,active:old?.active??true,revision:'1'.repeat(64),name:body.productName,key:`${body.namespace}:${body.productKey}${body.optionLabel?'::'+body.optionLabel:''}`};
    if(old) recipes.splice(recipes.indexOf(old),1,recipe); else recipes.push(recipe);
    return json({recipe});
  }
  if(method==='PATCH' && path.endsWith('/active')) {recipes[0]={...recipes[0],active:body.active,revision:'2'.repeat(64)};return json(recipes[0]);}
  if(method==='PATCH' && path.endsWith('/yield')) {items[0]={...items[0],recipeUnit:body.recipeUnit,yield:body.yield,yieldRevision:'3'.repeat(64)};return json(items[0]);}
  if(method==='POST' && path.includes('/report-corrections/')) {corrections={...corrections,varianceVersion:2,cogsVersion:3,revision:'4'.repeat(64)};return json({ok:true,varianceVersion:2,cogsVersion:3});}
  throw Error(`Unexpected request ${method} ${path}`);
};
createRoot(document.getElementById('root')).render(<div className="lq-app"><main className="lq-main"><FoodRecipes onDone={()=>{}} canManage={params.get('admin')!=='0'} initialRecipeId={params.get('key')?null:R}
  initialRecipeKey={params.get('key')} initialSkuId={params.get('yield')?CHEESE:null} initialCountId={params.get('count')} /></main></div>);
