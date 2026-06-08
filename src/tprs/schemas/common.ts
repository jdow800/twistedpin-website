// VENDORED COPY of @tprs/shared-schemas — source of truth is
// dev/tprs/packages/shared-schemas/src/common.ts. Keep in lockstep; do not
// hand-edit shapes. See src/tprs/README.md for the sync rule.
//
// The TPRS backend is a separate repo deploying nowhere this Astro site can
// reach at build time, so the contract is vendored (not a `file:` workspace
// import that would break the Vercel build). Types are consumed via z.infer.

import { z } from "zod";

/**
 * Standard error response shape across all API routes.
 */
export const errorResponseSchema = z.object({
  error: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
