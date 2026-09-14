import { createRequire } from 'node:module';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const site = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${site}/package.json`);
const { build } = require('esbuild');
const source = `
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Confirmation from './src/components/tprs/steps/ConfirmationStep.tsx';
const sessions = [['11:00',90,'11:00 AM – 12:30 PM'],['13:00',90,'1:00 PM – 2:30 PM'],['15:00',90,'3:00 PM – 4:30 PM'],['17:00',120,'5:00 PM – 7:00 PM'],['19:30',120,'7:30 PM – 9:30 PM'],['22:00',150,'10:00 PM – 12:30 AM']];
const props = {
  product: {name:'NYE Party',durationMinutes:90,durationOverrides:sessions.map(([startTime,durationMinutes])=>({date:'2026-12-31',startTime,durationMinutes}))},
  date:'2026-12-31',laneQty:2,showEndTime:true,guestCount:null,addOns:[],booking:null,totalCents:43990,guestEmail:'test@example.com',onReset:()=>{},
};
for(const [time,,label] of sessions) {
  const html=renderToStaticMarkup(React.createElement(Confirmation,{...props,slot:{time,priceCents:21995,available:true}}));
  assert.ok(html.includes(label), label);
  assert.ok(html.includes('Thursday, December 31'));
  assert.ok(html.includes('2 lanes'));
  assert.ok(html.includes('$439.90'));
}
const startOnly=renderToStaticMarkup(React.createElement(Confirmation,{...props,showEndTime:false,slot:{time:'22:00',priceCents:21995,available:true}}));
assert.ok(!startOnly.includes('12:30 AM'));
console.log('Actual ConfirmationStep SSR: all six ranges, date, two lanes, amount and start-only mode passed.');
`;
const result=await build({stdin:{contents:source,resolveDir:site,sourcefile:'nye-confirmation-render.tsx',loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic'});
const path=join(tmpdir(), `nye-confirmation-${randomUUID()}.cjs`);
try {
  await writeFile(path,result.outputFiles[0].text);
  process.stdout.write(execFileSync(process.execPath,[path],{encoding:'utf8'}));
} finally {
  await unlink(path);
}
