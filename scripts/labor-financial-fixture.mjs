// Fictional UI fixtures only. No retained employee or production wage data.
export function resolution(overrides={}) {
 return {version:1,resolvedHourlyWagesCents:60000,includedUnapprovedPunchCount:0,estimatedOvertimeAdjustmentCents:0,estimateBasis:[],unresolved:[],...overrides};
}
export function financialFixture(scenario='included') {
 const dates=Array.from({length:7},(_,i)=>`2026-10-${19+i}`);
 const daily=dates.map((date,i)=>({date,percent:30,salesCents:200000,hourlyWagesCents:50000,managementSalaryCents:10000,laborCents:60000,salesReady:true,laborReady:true,hourlyReady:true,salaryReady:true,amountsReady:true,issues:[],financialResolution:resolution({resolvedHourlyWagesCents:50000,includedUnapprovedPunchCount:i<2?1:0,estimateBasis:i<2?['unapproved_punches']:[]})}));
 const metric={percent:30,estimate:true,label:'Estimated earned labor',exclusions:'Employer taxes and benefits excluded.',issues:[],salesCents:1400000,hourlyWagesCents:350000,managementSalaryCents:70000,laborCents:420000,salesReady:true,laborReady:true,hourlyReady:true,salaryReady:true,amountsReady:true,financialResolution:resolution({resolvedHourlyWagesCents:350000,includedUnapprovedPunchCount:2,estimateBasis:['unapproved_punches']})};
 if(scenario==='partial'){
  const check={date:dates[1],punchId:900001,code:'open_punch',reason:'Missing clock-out.'};
  Object.assign(daily[1],{percent:null,hourlyWagesCents:null,laborCents:null,laborReady:false,hourlyReady:false,amountsReady:false,issues:['Fictional missing clock-out.'],financialResolution:resolution({resolvedHourlyWagesCents:25000,includedUnapprovedPunchCount:1,estimateBasis:['unapproved_punches'],unresolved:[check]})});
  Object.assign(metric,{percent:null,hourlyWagesCents:null,laborCents:null,laborReady:false,hourlyReady:false,amountsReady:false,issues:['Fictional missing clock-out.'],financialResolution:resolution({resolvedHourlyWagesCents:325000,includedUnapprovedPunchCount:2,estimateBasis:['unapproved_punches'],unresolved:[check]})});
 }
 if(scenario==='premium'){
  for(const d of daily)d.financialResolution=resolution({resolvedHourlyWagesCents:50000});
  daily[0].financialResolution=resolution({resolvedHourlyWagesCents:50000,estimatedOvertimeAdjustmentCents:1500,estimateBasis:['overtime_adjustment']});
  metric.financialResolution=resolution({resolvedHourlyWagesCents:350000,estimatedOvertimeAdjustmentCents:1500,estimateBasis:['overtime_adjustment']});
 }
 if(scenario==='unavailable'){
  for(const value of [...daily,metric]){
   Object.assign(value,{percent:null,hourlyWagesCents:null,laborCents:null,laborReady:false,hourlyReady:false,amountsReady:false,issues:['Fictional wage source unavailable.']});delete value.financialResolution;
  }
 }
 return {id:'fictional-financial-review',packet:{version:2,mode:'report',forwardFeedback:{targetWeek:'2026-11-03',status:'ready',outstanding:0,held:[],candidateCount:0},weekStart:dates[0],basisNotes:'Fictional UI fixture. Labor is hourly wages plus manager salary.',generatedAt:'2026-10-29T17:00:00Z'},questions:[],daily,metric};
}
