import { BarApiError, gatedJson } from "./api";

export interface FoodQuestion {
  id: string; key: string; namespace: "gotab" | "tprs"; productKey: string;
  productName: string; optionLabel: string | null; kind: "dish" | "option";
  source?: "missing_recipe" | "clarification";
  prompt: string; qty: number; status: "unanswered" | "answered" | "resolved";
  answer: string | null; answeredAt: string | null; revision: string;
  recipeHref: string; currentRecipeId: string | null; reviewNote: string | null;
}
export interface FoodQuestionBatchSummary {
  id: string; scheduledDate: string; createdAt: string; questionCount: number;
  unanswered: number; answered: number; resolved: number;
}
export interface FoodQuestionIndex {
  batches: FoodQuestionBatchSummary[]; pendingReview: FoodQuestion[]; queuedQuestions?: FoodQuestion[]; canReview: boolean;
}
export interface FoodQuestionBatch {
  batch: { id: string; scheduledDate: string; createdAt: string };
  questions: FoodQuestion[]; canReview: boolean;
}
const ROOT = "/admin/bar/food-questions";
/** A timeout is an uncertain write, never permission to retry automatically. */
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      gatedJson<T>(path, { method, signal: controller.signal, ...(body == null ? {} : {
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }) }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new BarApiError("The request timed out", 408));
      }, 30_000); }),
    ]);
  } finally { clearTimeout(timer); }
}
export const listFoodQuestions = () => request<FoodQuestionIndex>(ROOT);
export const getFoodQuestionBatch = (id: string) => request<FoodQuestionBatch>(`${ROOT}/batches/${encodeURIComponent(id)}`);
export const getFoodQuestion = (id: string) => request<{ question: FoodQuestion; canReview: boolean }>(`${ROOT}/${encodeURIComponent(id)}`);
export const answerFoodQuestion = (id: string, revision: string, answer: string) =>
  request<{ question: FoodQuestion }>(`${ROOT}/${encodeURIComponent(id)}/answer`, "PUT", { revision, answer });
export const reviewFoodQuestion = (id: string, revision: string, action: "resolve" | "reopen", reason: string) =>
  request<{ question: FoodQuestion }>(`${ROOT}/${encodeURIComponent(id)}/review`, "POST", { revision, action, reason });
export const queueFoodQuestion = (question: { namespace: "gotab" | "tprs"; productKey: string; productName: string; optionLabel?: string; prompt: string; reason: string }) =>
  request<{ question: FoodQuestion }>(ROOT, "POST", question);
