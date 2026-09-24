import type {StaffingProposal,ReviewShift} from './api';
import {scheduleCoverage,scheduleRows,scheduleTime,shiftTime} from './schedule-comparison';

const span=(s:ReviewShift|undefined,changed:boolean)=>s?<><span>{shiftTime(s)}</span>{changed?<small>{Number(((s.endMinute-s.startMinute)/60).toFixed(2))} hours</small>:null}</>:<span>No shift</span>;

export default function ScheduleComparison({proposal:p}:{proposal:StaffingProposal}) {
  const rows=scheduleRows(p),coverage=scheduleCoverage(p),context=p.scheduleContext;
  const department={desk:'Front desk',kitchen:'Kitchen',bar:'Bar'}[p.department];
  return <section className="lr-schedule-comparison" aria-label={`${department}: scheduled, worked and proposed shifts`}>
    <h4>{department} · Full shift comparison</h4>
    <p className="lr-small">{p.basisLabel}</p>
    <table className="lr-schedule-table">
      <caption className="lr-visually-hidden">{department} shift arrangement. Highlighted rows are the proposed changes.</caption>
      <thead><tr><th scope="col">Role</th><th scope="col">Scheduled</th><th scope="col">Worked</th><th scope="col">Proposed</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.key} className={r.changed?'lr-schedule-changed':''}>
        <th scope="row">{r.label}{r.changed?<small>Change</small>:null}</th><td>{span(r.current,r.changed)}</td>
        <td>{!p.worked?<span>Not loaded</span>:r.worked?.length?r.worked.map(s=><span className="lr-worked-span" key={s.key}>{shiftTime(s)}</span>):<span>No matched punch</span>}</td>
        <td>{span(r.proposed,r.changed)}</td>
      </tr>)}</tbody>
    </table>
    {p.worked?<><p className="lr-small">{p.worked.basisLabel}{p.worked.coverageStatus==='partial'?' Recorded coverage is incomplete.':null}</p>{p.worked.changeNote?<p className="lr-worked-note">{p.worked.changeNote}</p>:null}</>:<p className="lr-small">Worked times have not been loaded for this review. Scheduled hours are not clocked hours.</p>}
    <h4>{department} · Who remains on the schedule</h4>
    {context?<p className="lr-cutoffs">{context.serviceEndMinute!==undefined?<span>{p.department==='kitchen'?'Food sales end':'Department sales end'} <strong>{scheduleTime(context.serviceEndMinute)}</strong></span>:null}<span>Building closes <strong>{scheduleTime(context.buildingCloseMinute)}</strong></span></p>:null}
    <p className="lr-small">{department} coverage only, including the lead shifts shown above.</p>
    <table className="lr-coverage-table">
      <caption className="lr-visually-hidden">{department} coverage by period, including any lead within the count.</caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Scheduled</th><th scope="col">Proposed</th></tr></thead>
      <tbody>{coverage.map(c=><tr key={c.start} className={c.current.length!==c.proposed.length?'lr-schedule-changed':''}>
        <th scope="row">{scheduleTime(c.start)}–{scheduleTime(c.end)}</th>
        <td>{c.current.length}</td><td>{c.proposed.length}{c.proposed.length===0?<small>No shift scheduled</small>:null}</td>
      </tr>)}</tbody>
    </table>
    {context?<div className="lr-closing-context"><strong>{department} · Closing coverage</strong><p>{context.closingNote}</p></div>:<p className="lr-small">Counts include the roles shown above. Closing duties and any help from other departments need their own check.</p>}
  </section>;
}
