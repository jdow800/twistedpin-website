import type {DraftChange} from './api';

type Span={startMinute:number;endMinute:number};
export interface ChangedInterval {startMinute:number;endMinute:number;originalCount:number;scheduledCount:number;delta:number}
export const departmentName={desk:'Front desk',kitchen:'Kitchen',bar:'Bar'} as const;

/** The same department-coverage comparison the backend asks about (tprs forward-question-quality.ts):
 * role labels and shift partitions never create a change; adjacent equal steps merge. */
export function changedIntervals(original:readonly Span[],scheduled:readonly Span[]):ChangedInterval[] {
  const cuts=[...new Set([...original,...scheduled].flatMap(s=>[s.startMinute,s.endMinute]))].sort((a,b)=>a-b);
  const count=(rows:readonly Span[],minute:number)=>rows.filter(s=>s.startMinute<=minute&&minute<s.endMinute).length;
  const out:ChangedInterval[]=[];
  for(let i=0;i<cuts.length-1;i++){
    const startMinute=cuts[i]!,endMinute=cuts[i+1]!,originalCount=count(original,startMinute),scheduledCount=count(scheduled,startMinute),delta=scheduledCount-originalCount;
    if(!delta)continue;
    const prior=out.at(-1);
    if(prior&&prior.endMinute===startMinute&&prior.originalCount===originalCount&&prior.scheduledCount===scheduledCount)prior.endMinute=endMinute;
    else out.push({startMinute,endMinute,originalCount,scheduledCount,delta});
  }
  return out;
}

/** Chicago wall-clock label for elapsed minutes from the operating day's midnight; "*" marks a time after a
 * clock change. Mirrors tprs forwardClock so the page and the email print the same times. */
export function clockLabel(iso:string,minute:number){
  const utc=new Date(iso+'T09:00:00Z');
  const parts=(d:Date)=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
  const p=parts(utc),wall=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));
  const anchor=Date.parse(iso+'T04:00:00Z')-(wall-utc.getTime());
  const real=new Date(anchor+(minute-240)*60000),clock=parts(real),h=Number(clock.hour),m=Number(clock.minute);
  const wallMinute=(Date.parse(`${clock.year}-${clock.month}-${clock.day}T12:00:00Z`)-Date.parse(iso+'T12:00:00Z'))/86400000*1440+h*60+m;
  return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''}${h<12?'am':'pm'}${minute!==wallMinute?'*':''}`;
}
export const spanLabel=(iso:string,s:Span)=>`${clockLabel(iso,s.startMinute)}–${clockLabel(iso,s.endMinute)}`;
export const changeDay=(c:Pick<DraftChange,'date'|'department'>)=>`${new Date(c.date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'})} · ${departmentName[c.department]}`;
export function changeHeadline(netPersonMinutes:number){
  const hours=Number((Math.abs(netPersonMinutes)/60).toFixed(2));
  return netPersonMinutes?`${netPersonMinutes>0?'+':'−'}${hours} staff ${hours===1?'hour':'hours'} vs the AI draft`:'Same staff hours as the AI draft, different times';
}
