import type {ReviewShift,StaffingProposal} from './api';

export function scheduleTime(minute:number):string {
  const h=Math.floor(minute/60)%24, m=minute%60;
  if(h===0&&m===0)return 'midnight';
  if(h===12&&m===0)return 'noon';
  return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''}${h<12?'am':'pm'}`;
}
export const shiftTime=(s:ReviewShift)=>`${scheduleTime(s.startMinute)}–${scheduleTime(s.endMinute)}`;
export function scheduleRows(p:StaffingProposal) {
  const keys=[...new Set([...p.current.map(s=>s.key),...p.proposed.map(s=>s.key)])];
  const matched=keys.map(key=>{
    const current=p.current.find(s=>s.key===key),proposed=p.proposed.find(s=>s.key===key);
    return {key,label:(current??proposed)!.label,current,proposed,
      worked:p.worked?.spans.filter(s=>s.scheduledKey===key),
      changed:!current||!proposed||current.startMinute!==proposed.startMinute||current.endMinute!==proposed.endMinute||current.role!==proposed.role};
  });
  const unmatched=(p.worked?.spans??[]).filter(s=>!s.scheduledKey).map(s=>({
    key:`worked-${s.key}`,label:s.label,current:undefined,proposed:undefined,worked:[s],changed:false,
  }));
  return [...matched,...unmatched];
}
export function scheduleCoverage(p:StaffingProposal) {
  const spans=[...p.current,...p.proposed],context=p.scheduleContext;
  const low=context?.coverageStartMinute??Math.min(...spans.map(s=>s.startMinute));
  const high=Math.max(context?.buildingCloseMinute??0,...spans.map(s=>s.endMinute));
  const boundaries=[...new Set([low,high,...spans.flatMap(s=>[s.startMinute,s.endMinute]),
    ...(context?[context.buildingCloseMinute,...(context.serviceEndMinute!==undefined?[context.serviceEndMinute]:[])]:[])])]
    .filter(t=>t>=low&&t<=high).sort((a,b)=>a-b);
  return boundaries.slice(0,-1).map((start,i)=>({start,end:boundaries[i+1]!,
    current:p.current.filter(s=>s.startMinute<=start&&s.endMinute>start),
    proposed:p.proposed.filter(s=>s.startMinute<=start&&s.endMinute>start)}));
}
