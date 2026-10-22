import { defineMiddleware } from "astro:middleware";
import { isJingleReviewPath, isJinglePublicPath, isJingleBookingPath, jingleReviewGate, JINGLE_REVIEW_HEADERS, JINGLE_BOOKING_HEADERS } from "./lib/jingle-review-auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const publicPath = isJinglePublicPath(context.url.pathname);
  if ((!publicPath && !isJingleReviewPath(context.url.pathname)) || context.isPrerendered) return next();
  const denied = await jingleReviewGate(context.request);
  if (denied) return denied;
  const response = await next();
  if (publicPath && !isJingleBookingPath(context.url.pathname)) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(publicPath ? JINGLE_BOOKING_HEADERS : JINGLE_REVIEW_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
