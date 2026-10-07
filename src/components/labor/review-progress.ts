import type {LaborReview, PendingReview} from "./api";

/** Missing saved history stays unknown; the all-review count is not limited
 * to the two links retained in a frozen packet. Live fields take precedence. */
export function reviewProgress(review:LaborReview|null) {
  const forward=review?.packet.forwardFeedback;
  const previous=review?.previousReviewStatus??review?.packet.previousReview;
  const pending:PendingReview[]=forward
    ? review?.pendingReviewsStatus??review?.packet.pendingReviews??[]
    : previous?.unanswered?[previous]:[];
  const oldCount=forward
    ? review?.forwardOutstandingCount!==undefined?review.forwardOutstandingCount:forward.outstanding
    : previous?.unanswered??0;
  const current=review?.questions.filter(q=>!q.response).length??0;
  const awaiting=oldCount===null?null:current+oldCount;
  const comparisonPending=Boolean(forward&&forward.status!=="ready");
  const heading=awaiting===null?"Saved context check pending":awaiting>0
    ? `${awaiting===1?"Question":"Questions"} to review`
    : comparisonPending?"Published comparison pending":review?.packet.mode==="report"?"No response needed":"Context is up to date";
  const note=awaiting===null?"Saved question history is unavailable. We have held new questions."
    : awaiting>0?"A short note is enough. Tell us what the numbers missed."
    : comparisonPending?"We will compare the upcoming roster after its publication checks pass."
    : "Saved decisions and follow-ups are below.";
  return {awaiting,heading,note,comparisonPending,pending};
}
