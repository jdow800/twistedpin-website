import { defineMiddleware } from "astro:middleware";
import { isJingleReviewPath, jingleReviewGate, JINGLE_REVIEW_HEADERS } from "./lib/jingle-review-auth";

export const onRequest = defineMiddleware(async (context, next) => {
  if (!isJingleReviewPath(context.url.pathname) || context.isPrerendered) return next();
  const denied = await jingleReviewGate(context.request);
  if (denied) return denied;
  const response = await next();
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(JINGLE_REVIEW_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
