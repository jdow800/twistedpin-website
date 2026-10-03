import React from 'react';
import {createRoot} from 'react-dom/client';
import RecipeBuilder from 'qa:recipes';
import 'qa:styles';

const params = new URL(location.href).searchParams;
const mode = params.get('mode') || 'reuse';
// ?label= names the option being built (with mode=cocktail, the drink).
const label = params.get('label') || 'Green Tea Shot';
const audit = [];
const catalog = [{id:'jameson',name:'Jameson',category:'Whiskey'},{id:'tanqueray',name:'Tanqueray',category:'Gin'},{id:'titos',name:"Tito's",category:'Vodka'}]
  .map(s => ({...s,sizeMl:1000,trackingMode:'variance',active:true,aliases:[]}));
const template = {recipeId:'saved',productName:'Bar Mods',recipeName:'Green Tea Shot',
  sources:[{productId:'cordials',productName:'Bar Mods',optionLabel:'Green Tea Shot',categoryName:'Liqueurs / Cordials'}],
  components:[{skuId:'jameson',skuName:'Jameson',sizeMl:1000,oz:1}]};
// mode=pair: a saved two-bottle recipe whose pours match no label's.
const pair = {...template,recipeId:'pair',recipeName:'Vesper',
  components:[{skuId:'tanqueray',skuName:'Tanqueray',sizeMl:1000,oz:1.25},{skuId:'titos',skuName:"Tito's",sizeMl:1000,oz:0.75}]};
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch = async (input,init={}) => {
  const url=new URL(String(input),location.origin), path=url.pathname;
  audit.push(`${init.method||'GET'} ${path}${init.body?' '+init.body:''}`);
  document.getElementById('audit').textContent=audit.join('\n');
  if(path.endsWith('/catalog')) return json({items:catalog});
  if(path.endsWith('/recipe-gaps')) return json({pours:[],missingRecipes:mode==='cocktail'?[{productId:'shot',name:label,category:'Shots'}]:[],
    needsClassify:mode==='cocktail'?[]:[{alertKey:`option:vodkas:${label.toLowerCase()}`,productId:'vodkas',productName:'Bar Mods',optionLabel:label,count:3,likelySubstitution:null}]});
  if(path.endsWith('/recipe-templates')) {
    if(mode==='lookup-failure') return json({error:'offline'},500);
    return json({targetCategory:'Vodkas (TP)',matches:mode==='none'?[]:mode==='pair'?[pair]:mode==='conflicting'?
      [template,{...template,recipeId:'double',components:[{...template.components[0],oz:2}]}]:[template]});
  }
  if(path.endsWith('/option-recipes')) return mode==='save-failure'?json({error:'offline'},500):json({recipeId:'new'});
  if(path.endsWith('/unclassify')) return json({ok:true});
  throw new Error('Unexpected fixture request: '+path);
};
createRoot(document.getElementById('root')).render(<div className="lq-app">
  <header className="lq-header">LOCAL TEST: saved recipe reuse and pour defaults</header>
  <main className="lq-main"><RecipeBuilder onDone={()=>{}} /></main>
  <pre id="audit" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}} />
</div>);
