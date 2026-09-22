import React from 'react';
import {createRoot} from 'react-dom/client';
import RecipeBuilder from 'qa:recipes';
import 'qa:styles';

const mode = new URL(location.href).searchParams.get('mode') || 'reuse';
const audit = [];
const catalog = [{id:'jameson',name:'Jameson',sizeMl:1000,category:'Whiskey',trackingMode:'variance',active:true,aliases:[]}];
const template = {recipeId:'saved',productName:'Bar Mods',recipeName:'Green Tea Shot',
  sources:[{productId:'cordials',productName:'Bar Mods',optionLabel:'Green Tea Shot',categoryName:'Liqueurs / Cordials'}],
  components:[{skuId:'jameson',skuName:'Jameson',sizeMl:1000,oz:1}]};
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
window.fetch = async (input,init={}) => {
  const url=new URL(String(input),location.origin), path=url.pathname;
  audit.push(`${init.method||'GET'} ${path}${init.body?' '+init.body:''}`);
  document.getElementById('audit').textContent=audit.join('\n');
  if(path.endsWith('/catalog')) return json({items:catalog});
  if(path.endsWith('/recipe-gaps')) return json({pours:[],missingRecipes:mode==='cocktail'?[{productId:'shot',name:'Green Tea Shot',category:'Shots'}]:[],
    needsClassify:mode==='cocktail'?[]:[{alertKey:'option:vodkas:green tea shot',productId:'vodkas',productName:'Bar Mods',optionLabel:'Green Tea Shot',count:3,likelySubstitution:null}]});
  if(path.endsWith('/recipe-templates')) {
    if(mode==='lookup-failure') return json({error:'offline'},500);
    return json({targetCategory:'Vodkas (TP)',matches:mode==='none'?[]:mode==='conflicting'?
      [template,{...template,recipeId:'double',components:[{...template.components[0],oz:2}]}]:[template]});
  }
  if(path.endsWith('/option-recipes')) return mode==='save-failure'?json({error:'offline'},500):json({recipeId:'new'});
  if(path.endsWith('/unclassify')) return json({ok:true});
  throw new Error('Unexpected fixture request: '+path);
};
createRoot(document.getElementById('root')).render(<div className="lq-app">
  <header className="lq-header">LOCAL TEST: saved recipe reuse</header>
  <main className="lq-main"><RecipeBuilder onDone={()=>{}} /></main>
  <pre id="audit" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}} />
</div>);
