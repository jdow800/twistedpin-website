// VENDORED COPY of @tprs/shared-schemas — source of truth is
// dev/tprs/packages/shared-schemas/src/forms.ts. Keep in lockstep; do not
// hand-edit shapes. See src/tprs/README.md for the sync rule.
//
// Booking-question form schemas per ADR-0030 §5/§5.1 (Slice 2).
//
// GET /api/products/:id/forms — the product's attached, show_in_checkout +
//   active forms as a definition the Astro renderer consumes at runtime
//   (ADR-0030 §5.1 — one generic data-driven renderer; no per-form build).
// POST /api/checkout/convert — the convert body gains an optional `formAnswers`
//   array; answers persist into `booking_form_answers` in the convert tx.
//
// Field casing is camelCase to match the existing /api response convention
// (customer-flow.ts); the ADR prose used snake_case illustratively. These zod
// schemas are the single source of truth consumed by the customer-frontend SPA
// via z.infer per ADR-0012a §4.6 SD6.

import { z } from "zod";

/** Closed field-type palette per ADR-0030 §2 (mirrors the DB pgEnum). */
export const formFieldTypeSchema = z.enum([
  "short_text",
  "long_text",
  "dropdown",
  "radio",
  "checkbox",
  "checkbox_list",
  "rich_text",
  "date",
  "file",
  // 2026-06-13: repeat a single-select N times, N derived from a booking
  // quantity (count_source / count_divisor). The checkout (Path B) renderer
  // does not draw it yet — the birthday flow uses the send-a-form page; the
  // server validator enforces the derived count on both paths.
  "per_unit_select",
]);
export type FormFieldTypeApi = z.infer<typeof formFieldTypeSchema>;

/**
 * One field in a form definition the renderer draws. `options` is the choice
 * list (empty for non-choice types); `minSelections`/`maxSelections` bound a
 * `checkbox_list` (null = unbounded). `rich_text` is display-only (`label` =
 * heading, `helpText` = body) — it captures no answer.
 */
export const formFieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  fieldType: formFieldTypeSchema,
  label: z.string(),
  helpText: z.string(),
  placeholder: z.string(),
  required: z.boolean(),
  options: z.array(z.string()),
  minSelections: z.number().int().nullable(),
  maxSelections: z.number().int().nullable(),
  /**
   * per_unit_select derived-count config (2026-06): the field repeats its
   * single-select N = max(1, ceil(quantity / countDivisor)) times, where
   * quantity is the booking's guest headcount (`guest_count`) or lane count
   * (`lane_count`). NULL on every other field. Exposed so the CHECKOUT renderer
   * can compute N from the lanes/guests already chosen earlier in the wizard
   * (the server still validates the derived count at convert).
   */
  countSource: z.enum(["guest_count", "lane_count"]).nullable(),
  countDivisor: z.number().int().nullable(),
  /**
   * per_unit MULTI-topping mode + its free base option (e.g. "Cheese"), for the
   * send-a-form "toppings per pizza" variant. Mirrored from the DB so the
   * vendored website copy stays a true mirror; checkout is single-select only,
   * so these don't affect the checkout renderer (perUnitMulti=false there).
   */
  perUnitMulti: z.boolean(),
  /** Optional during rollout; a role opts this single choice into lane pairing. */
  perUnitRole: z.enum(["pizza", "pitcher"]).nullable().optional(),
  baseOption: z.string().nullable(),
  displayOrder: z.number().int(),
  /**
   * Conditional visibility: this field renders only when the field with id
   * `visibleWhenFieldId` has an answer in `visibleWhenValues`. NULL = always
   * visible. The renderer hides it (and skips its required-check) when the
   * controlling field's current answer doesn't match; the server enforces the
   * same rule at submit.
   */
  visibleWhenFieldId: z.string().uuid().nullable(),
  visibleWhenValues: z.array(z.string()),
});
export type FormFieldDefinition = z.infer<typeof formFieldDefinitionSchema>;

/** A form a guest fills at checkout — `title` is the customer-facing heading. */
export const formDefinitionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  thankYouCopy: z.string(),
  fields: z.array(formFieldDefinitionSchema),
});
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/** Response for `GET /api/products/:id/forms`. */
export const productFormsResponseSchema = z.object({
  forms: z.array(formDefinitionSchema),
});
export type ProductFormsResponse = z.infer<typeof productFormsResponseSchema>;

/**
 * A single captured answer in the convert payload's `formAnswers` array
 * (ADR-0030 §5). One entry per answered field; a `checkbox_list` contributes
 * ONE ENTRY PER CHECKED VALUE (repeated `formFieldId`), matching the
 * one-row-per-value storage in `booking_form_answers`.
 */
export const formAnswerInputSchema = z.object({
  formFieldId: z.string().uuid(),
  value: z.string().min(1).max(5000),
  unitIndex: z.number().int().positive().optional(),
});
export type FormAnswerInput = z.infer<typeof formAnswerInputSchema>;
