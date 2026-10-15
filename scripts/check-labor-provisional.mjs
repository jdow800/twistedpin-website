// Offline rendering of the actual components; no production requests or writes.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},esbuild:{jsx:'automatic'},server:{middlewareMode:true},logLevel:'error'});
try {
 const {WeeklyLaborMetric}=await server.ssrLoadModule('/src/components/labor/ReviewPilot.tsx');
 const {default:WeeklyOverview}=await server.ssrLoadModule('/src/components/labor/WeeklyOverview.tsx');
 const metric={percent:28.2,estimate:true,label:'Estimated earned labor',exclusions:'Employer taxes and benefits excluded.',issues:[],salesCents:100000,laborCents:28200};
 const daily=(date,hourly,provisional)=>({date,percent:hourly/1000+5,salesCents:100000,hourlyWagesCents:hourly,managementSalaryCents:5000,laborCents:hourly+5000,salesReady:true,laborReady:true,issues:[],...(provisional?{provisional}:{} )});
 const renderMetric=value=>renderToStaticMarkup(createElement(WeeklyLaborMetric,{metric:value}));
 const renderDays=value=>renderToStaticMarkup(createElement(WeeklyOverview,{days:value}));

 test('weekly provisional amount is visibly distinct from a verified or ordinary estimate',()=>{
  const input={...metric,provisional:{unapprovedPunchCount:18,hourlyWagesCents:12345}},before=structuredClone(input);
  const html=renderMetric(input);
  assert.match(html,/>Provisional<\/span>/);assert.match(html,/28\.2%/);
  assert.match(html,/\$282 labor on \$1,000 building sales/);assert.match(html,/18 timecards not approved yet\./);
  assert.doesNotMatch(html,/>Verified inputs<|>Estimated</);assert.deepEqual(input,before);
 });
 test('legacy weekly responses preserve estimated, verified and pending states',()=>{
  assert.match(renderMetric(metric),/>Estimated<\/span>/);
  assert.match(renderMetric({...metric,estimate:false}),/>Verified inputs<\/span>/);
  const pending=renderMetric({...metric,percent:null,laborCents:null});
  assert.match(pending,/>Data checks pending<\/span>/);assert.match(pending,/>Pending<\/strong>/);assert.match(pending,/Pending labor on \$1,000/);
  assert.doesNotMatch(renderMetric(metric),/Provisional|not approved yet/);
  assert.doesNotMatch(renderMetric({...metric,provisional:{unapprovedPunchCount:0,hourlyWagesCents:0}}),/Provisional|not approved yet/);
 });
 test('one provisional entry uses singular copy while blocked totals remain pending',()=>{
  const html=renderMetric({...metric,percent:null,laborCents:null,provisional:{unapprovedPunchCount:1,hourlyWagesCents:1500}});
  assert.match(html,/>Provisional<\/span>/);assert.match(html,/>Pending<\/strong>/);
  assert.match(html,/1 timecard not approved yet\./);assert.doesNotMatch(html,/28\.2%/);
 });
 test('provisional days remain plotted and marked, and no day is ranked',()=>{
  const days=[daily('2026-10-05',60000,{unapprovedPunchCount:3,hourlyWagesCents:25000}),daily('2026-10-06',25000),daily('2026-10-07',20000)],before=structuredClone(days);
  const html=renderDays(days);
  assert.match(html,/Mon: 60\.0% hourly wages plus 5\.0% salary; provisional/);
  assert.match(html,/<span>65\.0%\*<\/span><\/div>/);
  assert.match(html,/\* has unapproved timecards/);
  assert.doesNotMatch(html,/Highest|highest|lr-high-share|#c38526/);
  // Jon Oct15: "I like the table - visual elements are good." The daily table is shown, not tucked under a tap.
  assert.doesNotMatch(html,/<details|<summary/);
  assert.match(html,/<th scope="row">Mon<\/th><td>\$1,000<\/td><td>\$600\*<\/td><td>\$50<\/td><td>\$650\*<small>65\.0%\*/);
  assert.deepEqual(days,before);
 });
 test('all provisional days never invent missing amounts',()=>{
  const blocked={...daily('2026-10-05',20000,{unapprovedPunchCount:1,hourlyWagesCents:5000}),percent:null,hourlyWagesCents:null,laborCents:null,laborReady:false};
  const html=renderDays([blocked]);
  assert.match(html,/Mon: pending inputs; provisional/);assert.match(html,/<span>Pending\*<\/span>/);
  assert.match(html,/<td>Pending\*<\/td>/);assert.doesNotMatch(html,/\$200|20\.0%/);
 });
 test('legacy daily responses keep numbers without provisional marks',()=>{
  const html=renderDays([daily('2026-10-05',30000),daily('2026-10-06',20000)]);
  assert.match(html,/<span>35\.0%<\/span>/);assert.match(html,/<span>25\.0%<\/span>/);
  assert.doesNotMatch(html,/Provisional|unapproved|\$300\*/);
  assert.equal(renderDays([]),'');
 });
} finally { await server.close(); }
