import type {LaborReview, PendingReview, ReviewQuestion} from "./api";

export const questionIsActive=(q:Pick<ReviewQuestion,"disposition">)=>q.disposition?.status!=="withdrawn";
export const questionNeedsResponse=(q:Pick<ReviewQuestion,"disposition"|"response">)=>questionIsActive(q)&&!q.response;

/** Missing saved history stays unknown; the all-review count is not limited
 * to the two links retained in a frozen packet. Live fields take precedence. */
export function reviewProgress(review:LaborReview|null) {
  const forward=review?.packet.forwardFeedback;
  const previous=review?.previousReviewStatus??review?.packet.previousReview;
  const livePending=review?.pendingReviewsStatus;
  const pending:PendingReview[]=forward
    ? livePending===undefined?review?.packet.pendingReviews??[]:livePending??[]
    : previous?.unanswered?[previous]:[];
  const oldCount=forward
    ? review?.forwardOutstandingCount!==undefined?review.forwardOutstandingCount
      : livePending===undefined?forward.outstanding
      : livePending===null?null:livePending.reduce((n,p)=>n+p.unanswered,0)
    : previous?.unanswered??0;
  const active=review?.activeQuestionCount??review?.questions.filter(questionIsActive).length??0;
  const withdrawn=review?.withdrawnQuestionCount??review?.questions.filter(q=>!questionIsActive(q)).length??0;
  const current=review?.questions.filter(questionNeedsResponse).length??0;
  const awaiting=oldCount===null||(forward&&livePending===null)?null:current+oldCount;
  const comparisonPending=Boolean(forward&&forward.status!=="ready");
  const heading=awaiting===null?"Saved context check pending":awaiting>0
    ? `${awaiting===1?"Question":"Questions"} to review`
    : comparisonPending?"Published comparison pending":active===0?"No questions to answer":"Context is up to date";
  const note=awaiting===null?"Saved question history is unavailable. We have held new questions."
    : awaiting>0?"A short note is enough. Tell us what the numbers missed."
    : comparisonPending?"We will compare the upcoming roster after its publication checks pass."
    : withdrawn>0&&active===0?"Jon withdrew these questions. The original evidence and saved history remain below."
    : "Saved decisions and follow-ups are below.";
  return {awaiting,heading,note,comparisonPending,pending,active,withdrawn,current};
}
