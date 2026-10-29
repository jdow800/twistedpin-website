import type {FinancialResolution, ProvisionalLabor} from './api';

interface FinancialMetric {
  percent:number|null;salesCents:number|null;laborCents:number|null;
  salesReady?:boolean;laborReady?:boolean;hourlyReady?:boolean;salaryReady?:boolean;
  hourlyWagesCents?:number|null;managementSalaryCents?:number|null;
  provisional?:ProvisionalLabor;financialResolution?:FinancialResolution;
}

export const includedUnapproved=(metric:FinancialMetric)=>metric.financialResolution?.includedUnapprovedPunchCount??metric.provisional?.unapprovedPunchCount??0;
export const includesEstimate=(metric:FinancialMetric)=>includedUnapproved(metric)>0||Boolean(metric.financialResolution?.estimateBasis.length);
export const hasUnresolvedWages=(metric:FinancialMetric)=>Boolean(metric.financialResolution?.unresolved.length);
export const hourlyAmountReady=(metric:FinancialMetric)=>!hasUnresolvedWages(metric)&&(metric.hourlyReady??metric.laborReady??true)&&metric.hourlyWagesCents!=null;
export const salaryAmountReady=(metric:FinancialMetric)=>(metric.salaryReady??true)&&metric.managementSalaryCents!=null;
export const hasPendingAmounts=(metric:FinancialMetric)=>hasUnresolvedWages(metric)||metric.salesReady===false||metric.laborReady===false||metric.salesCents===null||metric.laborCents===null;
export const percentDisplay=(metric:FinancialMetric)=>hasPendingAmounts(metric)?'Pending':metric.percent===null?'—':`${metric.percent.toFixed(1)}%`;

export function includedEstimateNote(metric:FinancialMetric):string|null {
  const count=includedUnapproved(metric),overtime=metric.financialResolution?.estimateBasis.includes('overtime_adjustment');
  if(count>0)return `Includes ${count} unapproved ${count===1?'timecard':'timecards'}${overtime?' and estimated overtime':''}.`;
  return overtime?'Includes estimated overtime.':null;
}

export function wageCheckSummary(metric:FinancialMetric):string|null {
  const checks=metric.financialResolution?.unresolved;
  if(!checks?.length)return null;
  const first=checks[0],date=new Date(`${first.date}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  return `${checks.length} wage ${checks.length===1?'check':'checks'}: ${date} · ${first.reason}`;
}
