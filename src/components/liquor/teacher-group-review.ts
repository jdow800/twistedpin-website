import type { TeacherGroupUpload } from "./api";

/** Use the issued packet's whole-night summary, not a partial upload's rows. */
export function teacherGroupReview(u: TeacherGroupUpload) {
  const review = u.packetReview;
  const count = review && Number.isSafeInteger(review.foodDecisionCount) && review.foodDecisionCount >= 0
    ? review.foodDecisionCount : null;
  const food = count === null ? "See the cover sheet" : count === 0 ? "No answers needed" : `${count} decision${count === 1 ? "" : "s"} to settle`;
  // Legacy outcomes predate complete-night verification. Applied holds alone
  // cannot prove that an old lane conflict or missing shift was resolved.
  const laneState = review?.reservationStatus ?? "not_checked";
  return { food, needsReview: count !== 0 || laneState !== "checked", reservations: laneState === "checked" ? "Checked" : "Manager review needed", managerLines: review?.managerLines ?? [] };
}
