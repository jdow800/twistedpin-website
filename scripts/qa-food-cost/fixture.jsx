import React from 'react';
import {createRoot} from 'react-dom/client';
const params=new URL(location.href).searchParams,mode=params.get('mode')||'normal',calls=[];
const skuId='00000000-0000-0000-0000-000000000041',otherId='00000000-0000-0000-0000-000000000042';
let authenticated=params.get('pin')!=='1';
const item={id:skuId,name:'Cheese sauce',active:true,discontinuedAt:null,countUnit:'case',unitLabel:'case',unitsPerCase:4,recipeUnit:'oz',yield:200,
 costPerCountUnit:null,costBasisProblem:'cost_count_unit_or_package_changed',physicalBasisValid:true,yieldRevision:'y'.repeat(64),costRevision:'a'.repeat(64)};
const recipe={id:'recipe-1',namespace:'gotab',productKey:'dish-1',optionLabel:'',labelText:null,kind:'dish',productName:'Case cheese dip',basis:'Owner reviewed',note:'',active:true,
 revision:'r'.repeat(64),name:'Case cheese dip',key:'gotab:dish-1',lines:[{id:'line-1',skuId,skuName:item.name,qty:10,unit:'oz',via:'',basis:'Measured',note:''}]};
const actor={id:'owner',displayName:'Owner',permissions:params.get('admin')==='0'?['bar.read']:['bar.read','bar.manage']};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.foodCostQa={calls,skuId,item};
window.fetch=async(url,init={})=>{
 const path=new URL(url,location.href).pathname.replace(/\/$/,''),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;calls.push({path,method,body});
 if(path.endsWith('/me'))return authenticated?json({actor}):json({error:'unauthenticated'},401);
 if(path.endsWith('/pin-login')){authenticated=true;return json({actor});}
 if(path.endsWith('/food-recipes')&&method==='GET')return json({recipes:[recipe],items:[item,{...item,id:otherId,costPerCountUnit:1,costBasisProblem:null}],problems:[]});
 if(path.endsWith('/ops-inbox'))return json({findings:[{key:`food-cost-basis:${skuId}`,source:'food_basis',title:'Cheese sauce: physical cost needs review',detail:'Saved bag dollars do not prove case cost.',href:`/cogs/?view=foodrecipes&sku=${skuId}&review=cost`,capability:'bar.manage',since:null,evidence:'old-bag-cost',impact:{cents:null,basis:'unknown',window:null}}],total:1,nextOffset:null,allClear:false,sources:[{name:'food_basis',state:'ready',checkedAt:'2026-10-03T12:00Z'}],note:'Review the owning record.'});
 if(path.endsWith('/food-cost')&&method==='PATCH'){
   if(mode==='capacity-held')return json({error:'physical_cost_unusable',costBasisProblem:'bottle_capacity_unproven',message:'Cost remains held. Review the current physical capacity or container contents before confirming cost.'},409);
   if(mode==='null-result'||mode==='missing-result')return json(mode==='null-result'?{costPerCountUnit:null,costBasisProblem:'container_contents_unproven'}:{});
   if(mode==='stale'){item.costRevision='b'.repeat(64);item.unitsPerCase=8;item.yield=400;return json({error:'stale_cost',message:'The cost or physical unit changed. Reload before confirming cost.'},409);}
   if(path!==`/mock/admin/bar/skus/${skuId}/food-cost`||body.expectedRevision!==item.costRevision||body.expectedCountUnit!=='case'||body.expectedUnitLabel!=='case'||body.expectedUnitsPerCase!==4||body.physicalBasisConfirmed!==true)throw Error('Wrong exact item or physical confirmation');
   item.costPerCountUnit=body.costPerCountUnit;item.costBasisProblem=null;item.costRevision='c'.repeat(64);return json({skuId,costPerCountUnit:item.costPerCountUnit,costBasisProblem:null,costRevision:item.costRevision});
 }
 throw Error(`Unmocked request ${method} ${path}`);
};
// Import only after the fixture captures query options and installs the API.
// The real app consumes/strips deep links before its PIN bootstrap.
import('../../src/components/liquor/LiquorApp.tsx').then(({default:App})=>createRoot(document.getElementById('root')).render(<App/>));
