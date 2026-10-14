// The package-size question on a phone, in a real Chromium, with fictional food only.
// Needs `node serve.mjs --food-voice` running (port 4177) and a Chromium path in
// FOOD_QA_CHROME (or INVOICE_QA_CHROME). It never records, uploads or saves anything.
//   FOOD_UNIT_SIZE_SHOTS=<dir>   also write a phone screenshot of each state there
//   FOOD_UNIT_SIZE_LABEL=before  name the shots "before-..." and only record the
//                                text (for the build from before the change)
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const executable=process.env.FOOD_QA_CHROME??process.env.INVOICE_QA_CHROME;
assert.ok(executable,'Set FOOD_QA_CHROME to the Chromium executable');
const shots=process.env.FOOD_UNIT_SIZE_SHOTS, label=process.env.FOOD_UNIT_SIZE_LABEL??'after', before=label==='before';
const dist=fileURLToPath(new URL('./dist/',import.meta.url));
const profile=await mkdtemp(join(dist,'food-browser-'));
if (shots) await mkdir(shots,{recursive:true});
const chrome=spawn(executable,['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
const seen={};
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error('Browser startup timed out')),15000);
    chrome.once('error',reject);chrome.stderr.on('data',data=>{output+=data;const m=output.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
  });
  socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=e=>{const m=JSON.parse(e.data),r=pending.get(m.id);if(r){pending.delete(m.id);m.error?r.reject(Error(JSON.stringify(m.error))):r.resolve(m.result);}};
  const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await command('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
  const send=(method,params)=>command(method,params,sessionId);
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const waitFor=(condition,what='Screen')=>evaluate(`new Promise((resolve,reject)=>{let n=0;const tick=()=>{if(${condition})return resolve();if(++n>200)return reject(Error(${JSON.stringify(what)}+' did not load: '+document.body.innerText.slice(0,1800)));setTimeout(tick,20);};tick();})`);
  const type=async (selector,text)=>{
    // Select what is already in the box so the new text replaces it, as a retype does.
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.select();})()`);
    await send('Input.insertText',{text});
    for (const type of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  };
  const shoot=async name=>{
    if (!shots) return;
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(join(shots,`${label}-${name}.png`),Buffer.from(shot.data,'base64'));
  };
  await send('Page.enable');
  const rowOf=name=>`[...document.querySelectorAll('.lq-fc-voice-review-row')].find(r=>r.textContent.includes(${JSON.stringify(name)}))`;
  const hear=async (transcript,items)=>{
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Talk through')).click()`);
    await waitFor('foodQa.recorder');
    await evaluate(`foodQa.recorder.segment(${JSON.stringify(transcript)},0)`);
    await waitFor('foodQa.extracts.length===1');
    await evaluate(`foodQa.extracts[0].succeed(${JSON.stringify(items)})`);
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Stop & review'))",'Stop');
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Stop & review')).click()`);
    await new Promise(resolve=>setTimeout(resolve,150));
    await evaluate(`foodQa.recorder.finish(${JSON.stringify(transcript)})`);
    await waitFor("document.querySelector('.lq-fc-voice-review-row')",'Review');
  };
  const state=async name=>evaluate(`(()=>{const row=${rowOf(name)};if(!row)return null;
    const box=el=>{const r=el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};};
    const input=row.querySelector('input[aria-label^="Package size for"]'), change=[...row.querySelectorAll('button')].find(b=>/Change package size/.test(b.textContent));
    return {text:row.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1,blocked:row.classList.contains('lq-fc-rev-row-block'),
      question:row.querySelector('.lq-fc-rev-ask label')?.textContent??null,hint:row.querySelector('.lq-fc-rev-ask .lq-rev-hint')?.textContent??null,
      described:input?(input.getAttribute('aria-describedby')||'').split(' ').map(id=>document.getElementById(id)?.textContent).join(' '):null,
      input:input?box(input):null,readback:change?.parentElement.textContent??null,change:change?box(change):null,asks:row.querySelectorAll('.lq-fc-rev-ask').length};})()`);
  const openShelf=async ()=>{
    await send('Page.navigate',{url:'http://127.0.0.1:4177/?unit-size&pausecuts=0'});
    await waitFor("document.querySelector('.lq-fc-row,.lq-count-entry')");
    // An unfinished count asks first; the fictional draft is empty.
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Continue count')?.click()`);
    await waitFor("document.querySelector('.lq-fc-row')");
  };
  // Scroll the row to just under whatever is stuck to the top of the screen.
  const show=async name=>evaluate(`(()=>{${rowOf(name)}.scrollIntoView({block:'start'});const stuck=Math.max(0,...[...document.querySelectorAll('*')].filter(e=>{const p=getComputedStyle(e).position,r=e.getBoundingClientRect();return (p==='sticky'||p==='fixed')&&r.top<200&&r.bottom<400;}).map(e=>e.getBoundingClientRect().bottom));window.scrollBy(0,-(stuck+8));})()`);

  for (const width of [320,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:2,mobile:true});

    // 1. "Cheese curds, three pounds": bags, no pound entry. Ounces of a pound-counted item need no question.
    await openShelf();
    await hear('cheese curds three pounds. pork carnitas eight ounces. fryer oil two quarts',[
      {spoken:'cheese curds three pounds',cases:0,units:3,spokenUnit:'lb',quantityKnown:true,match:{id:'curds'},candidates:[]},
      {spoken:'pork carnitas eight ounces',cases:0,units:8,spokenUnit:'ounces',quantityKnown:true,match:{id:'carnitas'},candidates:[]},
      {spoken:'fryer oil two quarts',cases:0,units:2,spokenUnit:'quarts',quantityKnown:true,match:{id:'oil'},candidates:[]},
    ]);
    await waitFor(`${rowOf('Cheese Curds')}`);
    await show('Cheese Curds');
    let curds=await state('Cheese Curds'), carnitas=await state('Pork Carnitas'), oil=await state('Fryer Oil');
    seen[`${width} curds asks`]=curds.question;
    assert.equal(curds.overflow,false,`${width}px: horizontal overflow while asking`);
    if (!before) {
      assert.equal(curds.question,'How many lb in one bag?',`${width}px: curds question`);
      assert.equal(curds.hint,'Example: for a 5 lb bag, enter 5.',`${width}px: curds example`);
      assert.equal(curds.described,'How many lb in one bag? Example: for a 5 lb bag, enter 5.',`${width}px: question and example describe the input`);
      assert.equal(curds.blocked,true,`${width}px: an unanswered size blocks the row`);
      assert.ok(curds.input.h>=44,`${width}px: input is ${curds.input.h}px tall`);
      assert.equal(carnitas.asks,0,`${width}px: ounces of a pound-counted item ask nothing`);
      assert.match(carnitas.text,/8 ounces = 0\.5 lb/,`${width}px: the pound row says what the ounces came to`);
      assert.match(oil.text,/2 quarts = 0\.5 gal/,`${width}px: the gallon row says what the quarts came to`);
      assert.equal(carnitas.blocked,false,`${width}px: carnitas is ready`);
      assert.equal(oil.asks,0,`${width}px: quarts of a gallon-counted item ask nothing`);
      assert.equal(oil.blocked,false,`${width}px: oil is ready`);
    }
    await shoot(`curds-${width}-asking`);
    if (!before) {
      await type('input[aria-label="Package size for Cheese Curds"]','5');
      await waitFor(`!(${rowOf('Cheese Curds')}).querySelector('input[aria-label^="Package size for"]')`,'Answer');
      await show('Cheese Curds');
      curds=await state('Cheese Curds');
      assert.equal(curds.overflow,false,`${width}px: horizontal overflow after answering`);
      assert.equal(curds.blocked,false,`${width}px: an answered size frees the row`);
      assert.match(curds.readback,/3 lb = 0\.6 bags \(1 bag = 5 lb\)/,`${width}px: readback`);
      assert.ok(curds.change.h>=44,`${width}px: Change package size is ${curds.change.h}px tall`);
      await shoot(`curds-${width}-answered`);
      // Change package size brings the question back, empty.
      await evaluate(`[...(${rowOf('Cheese Curds')}).querySelectorAll('button')].find(b=>/Change package size/.test(b.textContent)).click()`);
      await waitFor(`(${rowOf('Cheese Curds')}).querySelector('input[aria-label="Package size for Cheese Curds"]')?.value===''`,'Change');
    }

    // 2. Containers: four packets of pizza circles (counted each), five boxes of gloves (counted in cases).
    await openShelf();
    await hear('four packets of pizza circles. five boxes of gloves',[
      {spoken:'four packets of pizza circles',cases:0,units:4,spokenUnit:'packet',quantityKnown:true,match:{id:'circles'},candidates:[]},
      {spoken:'five boxes of gloves',cases:0,units:5,spokenUnit:'box',quantityKnown:true,match:{id:'gloves'},candidates:[]},
    ]);
    await show('Cardboard Pizza Circle');
    const circles=await state('Cardboard Pizza Circle'), gloves=await state('Glove, Vinyl');
    seen[`${width} circles asks`]=circles.question;seen[`${width} gloves asks`]=gloves.question;
    assert.equal(circles.overflow,false,`${width}px: horizontal overflow (containers)`);
    if (!before) {
      assert.equal(circles.question,'How many in one packet?',`${width}px: circles question`);
      assert.equal(circles.hint,null,`${width}px: no example for a container`);
      assert.equal(circles.described,'How many in one packet?',`${width}px: circles input is described by its question`);
      assert.equal(gloves.question,'How many boxes in one case?',`${width}px: gloves question`);
    }
    await shoot(`containers-${width}-asking`);
    if (!before) {
      await type('input[aria-label="Package size for Cardboard Pizza Circle 14\\""]','25');
      await type('input[aria-label="Package size for Glove, Vinyl, Extra Large"]','10');
      await waitFor(`!document.querySelector('input[aria-label^="Package size for"]')`,'Answers');
      await show('Cardboard Pizza Circle');
      assert.match((await state('Cardboard Pizza Circle')).readback,/4 packet = 100 each \(1 packet = 25 each\)/,`${width}px: circles readback`);
      assert.match((await state('Glove, Vinyl')).readback,/5 box = 0\.5 cases \(1 case = 10 boxes\)/,`${width}px: gloves readback`);
      await shoot(`containers-${width}-answered`);
    }
    // 3. A count of shells in a bag cannot be under one: the refusal fits, and so does the answer after it.
    await openShelf();
    await hear('fifty taco shells',[{spoken:'fifty taco shells',cases:0,units:50,spokenUnit:'shells',quantityKnown:true,match:{id:'shells'},candidates:[]}]);
    await show('Taco Shells');
    let shells=await state('Taco Shells');
    seen[`${width} shells asks`]=shells.question;
    if (!before) {
      assert.equal(shells.question,'How many shells in one bag?',`${width}px: shells question`);
      assert.equal(shells.hint,null,`${width}px: no pound example for shells`);
      await type('input[aria-label="Package size for Taco Shells, Hard"]','0.04');
      await waitFor(`(${rowOf('Taco Shells')}).textContent.includes('Enter 1 or more.')`,'Refusal');
      await show('Taco Shells');
      shells=await state('Taco Shells');
      assert.equal(shells.overflow,false,`${width}px: horizontal overflow with the refusal`);
      assert.equal(shells.blocked,true,`${width}px: a refused size leaves the row blocked`);
      assert.match(shells.described,/Enter 1 or more\./,`${width}px: the refusal describes the input`);
      await shoot(`shells-${width}-refused`);
      await type('input[aria-label="Package size for Taco Shells, Hard"]','25');
      await waitFor(`!(${rowOf('Taco Shells')}).querySelector('input[aria-label^="Package size for"]')`,'Shells answer');
      await show('Taco Shells');
      shells=await state('Taco Shells');
      assert.match(shells.readback,/50 shells = 2 bags \(1 bag = 25 shells\)/,`${width}px: shells readback`);
      assert.doesNotMatch(shells.text,/Enter 1 or more/,`${width}px: the refusal clears once answered`);
    }
    console.log(`PASS ${width}px: ${before?'recorded':'curds, ounces, quarts, packets, boxes and shells'} questions fit, no horizontal overflow`);
  }
  if (shots) await writeFile(join(shots,`${label}-questions.json`),JSON.stringify(seen,null,2));
} finally {
  socket?.close();if(chrome.exitCode===null){chrome.kill();await new Promise(resolve=>chrome.once('exit',resolve));}
}
