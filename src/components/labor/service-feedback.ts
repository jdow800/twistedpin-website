import type {ReviewResponse, ServiceFeedback} from './api';

export const serviceOutcomes: [ServiceFeedback['overall'], string][] = [
  ['handled', 'The crew handled it'],
  ['strained', 'Strained, but kept up'],
  ['fell_behind', 'Fell behind / guests waited'],
  ['need_to_check', 'I need to check with the team'],
];
export const departmentLabels = {desk:'Front desk', kitchen:'Kitchen', bar:'Bar'} as const;
export const answerLabel = (value: ServiceFeedback['overall']) => serviceOutcomes.find(([key])=>key===value)?.[1] ?? value;
export const yesNoLabel = (value: ServiceFeedback['managerHelp']) => value==='yes'?'Yes':value==='no'?'No':'Not sure';

/** The legacy decision is transport only; this answer never creates a trial. */
export function serviceResponse(note: string, feedback: ServiceFeedback, followUpDate: string): ReviewResponse {
  const complete=feedback.overall!=='need_to_check';
  return {decision:feedback.overall==='handled'?'keep':'consider',context:[],note:note.trim(),action:'',followUpDate,
    outcome:complete?answerLabel(feedback.overall):'',status:complete?'closed':'follow_up',serviceFeedback:feedback};
}
