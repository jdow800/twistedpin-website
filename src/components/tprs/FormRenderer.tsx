// ADR-0030 §5.1 — the ONE generic, data-driven booking-question form renderer.
// It draws whatever GET /api/products/:id/forms returns (no per-form build) and
// emits the convert payload's `formAnswers` shape: a flat [{formFieldId, value}]
// list, one entry per answered field, and ONE ENTRY PER CHECKED VALUE for a
// checkbox_list (repeated formFieldId), matching booking_form_answers storage.
//
// Slice-1 reality: no bookable product currently has an attached
// show_in_checkout form, so getProductForms returns 0 forms and this renders
// nothing. It's wired now so it lights up automatically the moment a form is
// attached (the renderer is its only intended home). Validation here is
// light/advisory (required markers + checkbox_list min/max guards); the server
// is authoritative at convert (form_answer_invalid 400) in Slice 2.

import { useEffect, useMemo, useState } from "react";
import {
  formUploadUrl,
  getProductForms,
  uploadFormImage,
} from "../../tprs/client";
import type {
  FormDefinition,
  FormFieldDefinition,
  FormAnswerInput,
} from "../../tprs/schemas";
// Same text dialect product copy uses (**bold**, *italic*, <u>, <font color>,
// [link](url), <br>) so admin-authored form labels + help text render markup
// instead of literal asterisks. Backend speaks the same dialect (emails/Stripe).
import Markdown from "./Markdown";

interface Props {
  productId: string;
  onAnswersChange: (answers: FormAnswerInput[]) => void;
  /** Required+visible+unsatisfied field ids, in DISPLAY order (empty = complete).
   *  Replaces the old boolean onValidityChange — the wizard needs the ids (not
   *  just "complete?") so a failed Continue can scroll to the FIRST missed field.
   *  The server still backstops the full set at convert (form_answer_invalid). */
  onInvalidIdsChange?: (ids: string[]) => void;
  /** Bumped by a failed Continue → reveal ALL form errors at once (mirrors the
   *  guest step's reveal). 0 = nothing attempted yet. */
  submitAttempt?: number;
}

/** Internal answer state: fieldId → selected/entered values (array form). */
type AnswerMap = Record<string, string[]>;

/** Stable empty reference so the "nothing invalid" case (the common one) keeps
 *  the same identity across recomputes — the onInvalidIdsChange effect then
 *  bails instead of re-rendering the wizard on every keystroke once forms ship. */
const EMPTY_IDS: string[] = [];

function flatten(map: AnswerMap): FormAnswerInput[] {
  const out: FormAnswerInput[] = [];
  for (const [formFieldId, values] of Object.entries(map)) {
    for (const value of values) {
      if (value !== "") out.push({ formFieldId, value });
    }
  }
  return out;
}

/** A field shows only when its controlling field's answer ∈ visibleWhenValues. */
function fieldVisible(field: FormFieldDefinition, answers: AnswerMap): boolean {
  if (!field.visibleWhenFieldId) return true;
  const controlling = answers[field.visibleWhenFieldId] ?? [];
  return controlling.some((a) => field.visibleWhenValues.includes(a));
}

/** Is a required field's answer present? (Mirrors the server's convert check.) */
function requiredSatisfied(field: FormFieldDefinition, values: string[]): boolean {
  switch (field.fieldType) {
    case "rich_text":
      return true; // display-only, never an answer
    case "checkbox":
      return values[0] === "true"; // acknowledgement must be checked
    case "checkbox_list":
      return values.length >= Math.max(1, field.minSelections ?? 1);
    default:
      return (values[0] ?? "") !== "";
  }
}

export default function FormRenderer({
  productId,
  onAnswersChange,
  onInvalidIdsChange,
  submitAttempt,
}: Props) {
  const [forms, setForms] = useState<FormDefinition[] | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});

  useEffect(() => {
    const ctrl = new AbortController();
    setForms(null);
    setAnswers({});
    getProductForms(productId, ctrl.signal)
      .then((res) => setForms(res.forms))
      .catch(() => setForms([])); // forms are optional — never block on failure
    return () => ctrl.abort();
  }, [productId]);

  // Bubble the flattened answers up whenever they change.
  useEffect(() => {
    onAnswersChange(flatten(answers));
  }, [answers, onAnswersChange]);

  // Clear answers for fields hidden by their condition, so a stale answer from a
  // now-hidden field isn't submitted. Guarded so it converges (only setAnswers
  // when something actually changes).
  useEffect(() => {
    if (!forms) return;
    let changed = false;
    const next: AnswerMap = { ...answers };
    for (const form of forms) {
      for (const field of form.fields) {
        if (!field.visibleWhenFieldId || (next[field.id]?.length ?? 0) === 0)
          continue;
        const controlling = next[field.visibleWhenFieldId] ?? [];
        const visible = controlling.some((a) =>
          field.visibleWhenValues.includes(a),
        );
        if (!visible) {
          next[field.id] = [];
          changed = true;
        }
      }
    }
    if (changed) setAnswers(next);
  }, [answers, forms]);

  // Required+visible+unsatisfied field ids, in DISPLAY order. Sorted by
  // displayOrder to MATCH the render loop below — a boolean could iterate
  // unsorted, but "first invalid" (the scroll target) must be the visually
  // first one. (Loading → []; near-instant fetch + server backstop at convert.)
  const invalidIds = useMemo<string[]>(() => {
    if (!forms) return EMPTY_IDS;
    const ids: string[] = [];
    for (const form of forms) {
      for (const field of [...form.fields].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      )) {
        if (!field.required || !fieldVisible(field, answers)) continue;
        if (!requiredSatisfied(field, answers[field.id] ?? [])) ids.push(field.id);
      }
    }
    return ids.length ? ids : EMPTY_IDS;
  }, [forms, answers]);
  useEffect(() => {
    onInvalidIdsChange?.(invalidIds);
  }, [invalidIds, onInvalidIdsChange]);

  // A failed Continue (submitAttempt > 0) reveals every required field's error
  // at once — mirrors the guest step. Pure-derived from the prop; no local flag.
  // TODO(form-launch): the reveal here is currently border/aria only (no per-
  // field error <p> + aria-describedby like the guest fields, and --tw-danger is
  // low-contrast copper). Before the first real checkout form ships, add a
  // per-field message + a non-color affordance so the reveal isn't color-only
  // (WCAG 1.4.1) — deferred because there's no live form to test against today.
  const showAll = (submitAttempt ?? 0) > 0;
  const fieldInvalid = (field: FormFieldDefinition): boolean =>
    showAll &&
    field.required &&
    fieldVisible(field, answers) &&
    !requiredSatisfied(field, answers[field.id] ?? []);

  const hasForms = useMemo(() => (forms?.length ?? 0) > 0, [forms]);
  if (!forms || !hasForms) return null;

  function setSingle(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value === "" ? [] : [value] }));
  }

  function toggleInList(
    field: FormFieldDefinition,
    optionValue: string,
    checked: boolean,
  ) {
    setAnswers((prev) => {
      const current = prev[field.id] ?? [];
      if (checked) {
        if (
          field.maxSelections !== null &&
          current.length >= field.maxSelections &&
          !current.includes(optionValue)
        ) {
          return prev; // at max — ignore extra check
        }
        return { ...prev, [field.id]: [...new Set([...current, optionValue])] };
      }
      return { ...prev, [field.id]: current.filter((v) => v !== optionValue) };
    });
  }

  // Conditional visibility: a field with `visibleWhenFieldId` shows only when
  // that controlling field's current answer is one of `visibleWhenValues`.
  function isFieldVisible(field: FormFieldDefinition): boolean {
    if (!field.visibleWhenFieldId) return true;
    const controlling = answers[field.visibleWhenFieldId] ?? [];
    return controlling.some((a) => field.visibleWhenValues.includes(a));
  }

  function renderField(field: FormFieldDefinition) {
    const val = answers[field.id] ?? [];
    const labelEl = (
      <label className="tprs-label" htmlFor={field.id}>
        <Markdown text={field.label} inline />
        {field.required ? (
          <span className="tprs-req"> *</span>
        ) : (
          <span className="tprs-opt"> (optional)</span>
        )}
      </label>
    );

    switch (field.fieldType) {
      case "rich_text":
        return (
          <div className="tprs-richtext" key={field.id}>
            {field.label && <h4><Markdown text={field.label} inline /></h4>}
            {field.helpText && <p><Markdown text={field.helpText} /></p>}
          </div>
        );

      case "short_text":
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help"><Markdown text={field.helpText} /></p>}
            <input
              id={field.id}
              className={`tprs-input${fieldInvalid(field) ? " is-invalid" : ""}`}
              type="text"
              placeholder={field.placeholder}
              aria-invalid={fieldInvalid(field) || undefined}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
          </div>
        );

      case "long_text":
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help"><Markdown text={field.helpText} /></p>}
            <textarea
              id={field.id}
              className={`tprs-textarea${fieldInvalid(field) ? " is-invalid" : ""}`}
              placeholder={field.placeholder}
              aria-invalid={fieldInvalid(field) || undefined}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
          </div>
        );

      case "date":
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help"><Markdown text={field.helpText} /></p>}
            <input
              id={field.id}
              className={`tprs-input${fieldInvalid(field) ? " is-invalid" : ""}`}
              type="date"
              aria-invalid={fieldInvalid(field) || undefined}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
          </div>
        );

      case "dropdown":
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help"><Markdown text={field.helpText} /></p>}
            <select
              id={field.id}
              className={`tprs-select${fieldInvalid(field) ? " is-invalid" : ""}`}
              aria-invalid={fieldInvalid(field) || undefined}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            >
              <option value="">{field.placeholder || "Select…"}</option>
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        );

      case "radio":
        return (
          <fieldset
            className={`tprs-field${fieldInvalid(field) ? " is-invalid" : ""}`}
            key={field.id}
          >
            <legend className="tprs-label">
              <Markdown text={field.label} inline />
              {field.required ? <span className="tprs-req"> *</span> : null}
            </legend>
            {field.helpText && <p className="tprs-help"><Markdown text={field.helpText} /></p>}
            {field.options.map((opt, i) => (
              <label className="tprs-choice" key={opt}>
                <input
                  /* id on the first option so scrollFocusInvalid(field.id) can
                     target the group (groups otherwise only carry `name`). */
                  id={i === 0 ? field.id : undefined}
                  type="radio"
                  name={field.id}
                  value={opt}
                  checked={val[0] === opt}
                  aria-invalid={(i === 0 && fieldInvalid(field)) || undefined}
                  onChange={() => setSingle(field.id, opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </fieldset>
        );

      case "checkbox":
        // Single boolean acknowledgement — one answer ("true") when checked.
        return (
          <div
            className={`tprs-field${fieldInvalid(field) ? " is-invalid" : ""}`}
            key={field.id}
          >
            <label className="tprs-choice">
              <input
                id={field.id}
                type="checkbox"
                checked={val[0] === "true"}
                aria-invalid={fieldInvalid(field) || undefined}
                onChange={(e) =>
                  setSingle(field.id, e.currentTarget.checked ? "true" : "")
                }
              />
              <span>
                <Markdown text={field.label} inline />
                {field.required ? <span className="tprs-req"> *</span> : null}
              </span>
            </label>
            {field.helpText && <p className="tprs-help"><Markdown text={field.helpText} /></p>}
          </div>
        );

      case "checkbox_list": {
        const bounds =
          field.minSelections !== null || field.maxSelections !== null
            ? ` (choose ${field.minSelections ?? 0}–${field.maxSelections ?? field.options.length})`
            : "";
        return (
          <fieldset
            className={`tprs-field${fieldInvalid(field) ? " is-invalid" : ""}`}
            key={field.id}
          >
            <legend className="tprs-label">
              <Markdown text={field.label} inline />
              {field.required ? <span className="tprs-req"> *</span> : null}
              {bounds && <span className="tprs-opt">{bounds}</span>}
            </legend>
            {field.helpText && <p className="tprs-help"><Markdown text={field.helpText} /></p>}
            {field.options.map((opt, i) => (
              <label className="tprs-choice" key={opt}>
                <input
                  /* id on the first option so scrollFocusInvalid can target the group. */
                  id={i === 0 ? field.id : undefined}
                  type="checkbox"
                  value={opt}
                  checked={val.includes(opt)}
                  aria-invalid={(i === 0 && fieldInvalid(field)) || undefined}
                  onChange={(e) =>
                    toggleInList(field, opt, e.currentTarget.checked)
                  }
                />
                <span>{opt}</span>
              </label>
            ))}
          </fieldset>
        );
      }

      case "file": {
        const uploadedId = val[0];
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help"><Markdown text={field.helpText} /></p>}
            {uploadedId ? (
              <div className="tprs-upload">
                <img
                  className="tprs-upload-preview"
                  src={formUploadUrl(uploadedId)}
                  alt="Uploaded preview"
                />
                <button
                  type="button"
                  className="tprs-upload-remove"
                  onClick={() => setSingle(field.id, "")}
                >
                  Remove
                </button>
              </div>
            ) : (
              <input
                id={field.id}
                className={`tprs-input${fieldInvalid(field) ? " is-invalid" : ""}`}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-invalid={fieldInvalid(field) || undefined}
                disabled={uploadingId === field.id}
                onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  if (!file) return;
                  setUploadError((m) => ({ ...m, [field.id]: "" }));
                  setUploadingId(field.id);
                  try {
                    setSingle(field.id, await uploadFormImage(file));
                  } catch (err) {
                    setUploadError((m) => ({
                      ...m,
                      [field.id]: (err as Error).message,
                    }));
                  } finally {
                    setUploadingId(null);
                  }
                }}
              />
            )}
            {uploadingId === field.id && (
              <p className="tprs-help">Uploading…</p>
            )}
            {uploadError[field.id] && (
              <p className="tprs-error">{uploadError[field.id]}</p>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  }

  return (
    <>
      {forms.map((form) => (
        <div className="tprs-form-block" key={form.id}>
          {form.title && <h3 className="tprs-form-title">{form.title}</h3>}
          {[...form.fields]
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .filter(isFieldVisible)
            .map(renderField)}
        </div>
      ))}
    </>
  );
}
