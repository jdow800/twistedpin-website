import type {ReviewResponse, ServiceFeedback} from './api';

export const serviceOutcomes: [ServiceFeedback['overall'], string][] = [
  ['handled', 'Kept up'],
  ['strained', 'Stretched'],
  ['fell_behind', 'Fell behind'],
  ['need_to_check', 'Need to check with the team'],
];
/** Jon 2026-11-09 ("give him some buttons ... quick painless"): the three one-tap answers. */
export const quickOutcomes = serviceOutcomes.filter(([key]) => key !== 'need_to_check');
/** Earlier wording of the same answers, so a saved note that only repeats one is not shown twice. */
const legacyLabels = ['The crew handled it', 'Strained, but kept up', 'Fell behind / guests waited', 'I need to check with the team'];
/** The note as typed. A note that is only the button's words reads as empty. */
export const typedNote = (note: string | undefined | null) => {
  const text = (note ?? '').trim();
  return serviceOutcomes.some(([, label]) => label === text) || legacyLabels.includes(text) ? '' : text;
};
export const departmentLabels = {desk:'Front desk', kitchen:'Kitchen', bar:'Bar'} as const;
export const answerLabel = (value: ServiceFeedback['overall']) => serviceOutcomes.find(([key])=>key===value)?.[1] ?? value;
export const yesNoLabel = (value: ServiceFeedback['managerHelp']) => value==='yes'?'Yes':value==='no'?'No':'Not sure';

/** The legacy decision is transport only; this answer never creates a trial. */
export function serviceResponse(note: string, feedback: ServiceFeedback, followUpDate: string): ReviewResponse {
  const complete=feedback.overall!=='need_to_check';
  return {decision:feedback.overall==='handled'?'keep':'consider',context:[],note:note.trim(),action:'',followUpDate,
    outcome:complete?answerLabel(feedback.overall):'',status:complete?'closed':'follow_up',serviceFeedback:feedback};
}
