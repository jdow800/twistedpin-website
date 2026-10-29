// Render the real components. Offline; no production requests or writes.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {financialFixture,resolution} from './labor-financial-fixture.mjs';

const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},esbuild:{jsx:'automatic'},server:{middlewareMode:true},logLevel:'error'});
try {
 const {WeeklyLaborMetric}=await server.ssrLoadModule('/src/components/labor/ReviewPilot.tsx');
 const {default:WeeklyOverview}=await server.ssrLoadModule('/src/components/labor/WeeklyOverview.tsx');
 const renderMetric=metric=>renderToStaticMarkup(createElement(WeeklyLaborMetric,{metric}));
 const renderDays=days=>renderToStaticMarkup(createElement(WeeklyOverview,{days}));

 test('ordinary unapproved costs remain in the full number and are labelled included exactly once',()=>{
  const f=financialFixture(),before=structuredClone(f),html=renderMetric(f.metric);
  assert.match(html,/>30\.0%<\/strong>/);assert.match(html,/\$4,200 labor on \$14,000 building sales/);
  assert.match(html,/Includes 2 unapproved timecards\./);assert.match(html,/>Provisional</);
  assert.doesNotMatch(html,/Pending|not approved yet|Partial/);assert.deepEqual(f,before);
 });
 test('unresolved costs outrank included estimates and retain explicit partial wages plus known salary',()=>{
  const f=financialFixture('partial'),before=structuredClone(f),html=renderMetric(f.metric);
  assert.match(html,/>Data checks pending</);assert.match(html,/>Pending<\/strong>/);
  assert.match(html,/Partial hourly wages \$3,250/);assert.match(html,/Manager salary \$700/);
  assert.match(html,/Includes 2 unapproved timecards\./);assert.match(html,/1 wage check: Oct 20 · Missing clock-out\./);
  assert.match(html,/href="#labor-calculation"/);assert.doesNotMatch(html,/>Provisional<|30\.0%|at least/);assert.deepEqual(f,before);
 });
 test('daily partial wages are labelled and are never used as full labor or a percentage',()=>{
  const f=financialFixture('partial'),html=renderDays([f.daily[1]]);
  assert.match(html,/<td>\$250\*<small>Partial<\/small><\/td><td>\$100<\/td><td>Pending<small>Pending<\/small>/);
  assert.match(html,/Tue: pending inputs/);assert.doesNotMatch(html,/30\.0%|\$600|Pending\*/);
 });
 test('premium-only estimates have provisional status even without unapproved punches in the displayed period',()=>{
  const f=financialFixture('premium'),html=renderMetric(f.metric),daily=renderDays([f.daily[0]]);
  assert.match(html,/>Provisional</);assert.match(html,/Includes estimated overtime\./);
  assert.doesNotMatch(html,/0 unapproved|Verified inputs/);assert.match(daily,/<span>30\.0%\*<\/span>/);
  assert.match(daily,/\$500\*/);assert.doesNotMatch(daily,/\$515/);
 });
 test('included count and estimate basis use new metadata rather than stale legacy provisional values',()=>{
  const f=financialFixture();f.metric.provisional={unapprovedPunchCount:9,hourlyWagesCents:10000};
  assert.match(renderMetric(f.metric),/Includes 2 unapproved timecards/);
  f.metric.financialResolution=resolution({resolvedHourlyWagesCents:350000});
  assert.doesNotMatch(renderMetric(f.metric),/unapproved|Provisional/);
 });
 test('unavailable source does not turn into a zero subtotal and known salary remains available',()=>{
  const f=financialFixture('unavailable'),html=renderMetric(f.metric),daily=renderDays([f.daily[0]]);
  assert.match(html,/Hourly wages Pending · Manager salary \$700/);assert.doesNotMatch(html,/Partial|\$0/);
  assert.match(daily,/<td>Pending<\/td><td>\$100<\/td>/);assert.doesNotMatch(daily,/\$0/);
 });
 test('known hourly wages remain visible when salary alone is unresolved',()=>{
  const f=financialFixture(),d={...f.daily[0],percent:null,laborCents:null,laborReady:false,salaryReady:false,managementSalaryCents:null};
  const html=renderDays([d]);assert.match(html,/<td>\$500\*<\/td><td>Pending<\/td><td>Pending/);
  assert.doesNotMatch(html,/Partial|30\.0%/);
 });
 test('known hourly wages and salary survive a missing sales source without a percentage',()=>{
  const f=financialFixture(),d={...f.daily[0],percent:null,salesCents:null,salesReady:false};
  const html=renderDays([d]);assert.match(html,/<td>Pending<\/td><td>\$500\*<\/td><td>\$100<\/td><td>\$600\*/);
  assert.doesNotMatch(html,/30\.0%/);
 });
 test('zero-sales days and weeks keep known amounts and show a dash, not an invented ratio or a data hold',()=>{
  const f=financialFixture();Object.assign(f.metric,{salesCents:0,percent:null});Object.assign(f.daily[0],{salesCents:0,percent:null});
  const html=renderMetric(f.metric),daily=renderDays([f.daily[0]]);
  assert.match(html,/>—<\/strong>/);assert.doesNotMatch(html,/Pending|Data checks pending|Infinity|NaN/);
  assert.match(daily,/Mon: no sales percentage/);assert.match(daily,/<small>—\*<\/small>/);assert.doesNotMatch(daily,/Pending|Infinity|NaN/);
 });
 test('a known zero subtotal remains explicitly partial when another punch is unresolved',()=>{
  const f=financialFixture('partial'),d=f.daily[1];d.financialResolution.resolvedHourlyWagesCents=0;
  assert.match(renderDays([d]),/<td>\$0\*<small>Partial<\/small>/);
 });
 test('unresolved metadata always blocks a complete ratio even if a stale number remains present',()=>{
  const f=financialFixture('partial');f.metric.percent=30;f.daily[1].percent=30;
  assert.doesNotMatch(renderMetric(f.metric),/30\.0%/);assert.doesNotMatch(renderDays([f.daily[1]]),/30\.0%/);
 });
}finally{await server.close();}
