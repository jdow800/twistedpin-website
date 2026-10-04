import React from 'react';
import {createRoot} from 'react-dom/client';
// Set the mocked transport before importing LiquorApp: its real module-scope
// parser consumes the destination and removes query parameters immediately.
const params=new URL(location.href).searchParams, linked=params.get('count'), kind=params.get('kind')||'older', calls=[];
const submitted=kind.startsWith('food-')||kind==='bar-submitted', walkSection=kind.startsWith('food-')?'food':kind==='bar-submitted'?'bar':params.get('section')||'bar';
let authenticated=params.get('login')!=='1';
const actor={id:'signed-in-actor',displayName:'Signed-in counter',permissions:['bar.read','bar.count']};
const newer={id:'newer-unrelated-count',countedBy:'Signed-in counter',isFullCount:true,startedAt:'2026-10-03T15:00:00Z',submittedAt:'2026-10-03T16:00:00Z',lineCount:1};
window.deepLinksQa={calls,linked};
window.fetch=async(url,options={})=>{
 const u=new URL(url,location.href), path=u.pathname.replace(/\/$/,''), method=options.method||'GET', body=options.body?JSON.parse(options.body):null;
 calls.push({path,method,query:Object.fromEntries(u.searchParams),body});
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 if(path.endsWith('/me'))return authenticated?json({actor}):json({error:'not_authenticated'},401);
 if(path.endsWith('/pin-login')&&method==='POST'){authenticated=true;return json({actor});}
 if(path.endsWith('/counts/history'))return json({counts:[newer]});
 if(path.endsWith('/keg-counts/history'))return json({counts:[]});
 if(path.endsWith('/variance'))return json({error:'report_not_yet_written'},404);
 if(method==='GET'&&path===`/mock/admin/bar/counts/${linked}`)return json({session:{id:linked,...(kind==='food-legacy'?{}:{section:walkSection}),status:submitted?'submitted':'draft',isFullCount:kind!=='partial',note:'Linked read-only count',startedAt:kind==='older'?'2026-09-01T15:00:00Z':'2026-10-03T15:00:00Z',submittedAt:submitted?'2026-10-03T16:00:00Z':null,countedBy:kind==='other'?'Another counter':'Signed-in counter'},lines:[{zoneId:'exact-linked-zone',zoneName:'Exact linked shelf',skuId:'exact-linked-sku',skuName:`Exact ${kind} linked ${submitted?'count':'draft'} item`,sizeMl:null,qtyUnits:'3',enteredCases:null,caseSizeAtEntry:null,source:'grid'}],corrections:[],correctable:submitted&&walkSection==='food',canCorrect:submitted&&walkSection==='food'});
 // A wrong walk route would request open/latest drafts, zones and catalog,
 // create a new count, or save another one. Every such request fails here.
 throw Error(`Unexpected draft-destination request ${method} ${path}`);
};
void import('../../src/components/liquor/LiquorApp.tsx').then(({default:LiquorApp})=>createRoot(document.getElementById('root')).render(<LiquorApp/>));
