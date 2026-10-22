// ADR-0030 §5.1 — the ONE generic, data-driven booking-question form renderer.
// It draws whatever GET /api/products/:id/forms returns (no per-form build) and
// emits a flat answer list, one entry per choice. Server-configured NYE fields
// also carry one-based unitIndex so a pizza and pitcher share purchased-pair
// identity. The existing wizard owns that draft across step changes.
// Server validation remains authoritative at convert; this component does not
// change the separate payment preflight/recovery boundary.

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  answerMapFromInput, flattenAnswers, fieldVisible, reconcileAnswers,
  isIndexedField, nyePairFields, unitControlId, type AnswerMap, type PairedFoodPresentation,
} from "./formAnswers";

/** Booking quantities a per_unit_select field's N is derived from. */
export type UnitQuantities = { guest_count: number; lane_count: number };

interface Props {
  /** Already-validated definitions owned by a flow that requires forms before payment. */
  definitions?: FormDefinition[];
  hideTitle?: boolean;
  /** Presentation-only helper copy for exact short_text fields. Definitions and answers stay unchanged. */
  helpTextOverrides?: Readonly<Record<string, string>>;
  pairedPresentation?: PairedFoodPresentation;
  /** Explicit event opt-in. Ordinary renderers retain the NYE-only default. */
  pairedProductCodes?: readonly number[];
  productId: string;
  productCode?: number;
  answers: FormAnswerInput[];
  onAnswersChange: (answers: FormAnswerInput[]) => void;
  /** Required+visible+unsatisfied control ids, in DISPLAY order (empty = complete).
   *  Replaces the old boolean onValidityChange — the wizard needs the ids (not
   *  just "complete?") so a failed Continue can scroll to the FIRST missed field.
   *  The server still backstops the full set at convert (form_answer_invalid). */
  onInvalidIdsChange?: (ids: string[]) => void;
  /** Bumped by a failed Continue → reveal ALL form errors at once (mirrors the
   *  guest step's reveal). 0 = nothing attempted yet. */
  submitAttempt?: number;
  /** Lanes / guests already chosen earlier in the wizard. A per_unit_select
   *  field repeats its picker N = ceil(quantity / countDivisor) times from
   *  these (NYE: one pizza + one soda per lane). Absent on mounts with no such
   *  field; perUnitCount then floors N at 1. */
  unitQuantities?: UnitQuantities;
}

/** Stable empty reference avoids validity callback loops. */
const EMPTY_IDS: string[] = [];

/**
 * How many pickers a `per_unit_select` field renders: `max(1, ceil(quantity /
 * countDivisor))`, where quantity is the chosen lanes or guests. Mirrors the
 * server's `unitsForField` so the checkout renderer draws exactly the count the
 * convert validator will enforce. (NYE: lane_count ÷ 1 → one per lane.)
 */
export function perUnitCount(field: FormFieldDefinition, q: UnitQuantities): number {
  const div = Math.max(1, field.countDivisor ?? 1);
  const base =
    field.countSource === "lane_count"
      ? q.lane_count
      : field.countSource === "guest_count"
        ? q.guest_count
        : 0;
  return Math.max(1, Math.ceil(base / div));
}

/** Is a required field's answer present? (Mirrors the server's convert check.) */
function requiredSatisfied(
  field: FormFieldDefinition,
  values: string[],
  perUnitN?: number,
): boolean {
  switch (field.fieldType) {
    case "rich_text":
      return true; // display-only, never an answer
    case "checkbox":
      return values[0] === "true"; // acknowledgement must be checked
    case "checkbox_list":
      return values.length >= Math.max(1, field.minSelections ?? 1);
    case "per_unit_select":
      // Each of the N lane/guest pickers must be chosen (duplicates allowed).
      return Array.from({ length: perUnitN ?? 1 }, (_, i) => values[i] ?? "")
        .every((value) => value !== "" && (!isIndexedField(field) || field.options.includes(value)));
    default:
      return (values[0] ?? "") !== "";
  }
}

export default function FormRenderer({
  definitions,
  hideTitle = false,
  helpTextOverrides,
  pairedPresentation,
  pairedProductCodes,
  productId,
  productCode,
  answers: inputAnswers,
  onAnswersChange,
  onInvalidIdsChange,
  submitAttempt,
  unitQuantities,
}: Props) {
  const [forms, setForms] = useState<FormDefinition[] | null>(definitions ?? null);
  // Unconfigured legacy per-unit fields still have no index on the wire. Keep
  // their empty local positions while editing, exactly as before this change.
  // NYE opted-in answers need no local copy: the wizard stores their indices.
  const [legacySlots, setLegacySlots] = useState<AnswerMap>({});
  const answers = useMemo(
    () => ({ ...answerMapFromInput(inputAnswers, forms ?? []), ...legacySlots }),
    [inputAnswers, forms, legacySlots],
  );
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});

  // Primitive deps so a fresh `unitQuantities` object on each parent render
  // doesn't churn the per_unit memos/effects below (the wizard passes a new
  // object literal every render).
  const laneCount = unitQuantities?.lane_count ?? 0;
  const guestCount = unitQuantities?.guest_count ?? 0;

  useEffect(() => {
    if (definitions) { setForms(definitions); setLegacySlots({}); return; }
    const ctrl = new AbortController();
    setForms(null);
    setLegacySlots({});
    getProductForms(productId, ctrl.signal)
      .then((res) => { if (!ctrl.signal.aborted) setForms(res.forms); })
      .catch(() => { if (!ctrl.signal.aborted) setForms([]); }); // forms are optional — never block on failure
    return () => ctrl.abort();
  }, [productId, definitions]);

  // How many pickers each per_unit_select field needs, from the lanes/guests
  // chosen earlier. Keyed on primitive counts (not the object) so it only
  // recomputes when a count actually changes.
  const unitCounts = useMemo<Record<string, number>>(() => {
    if (!forms) return {};
    const q: UnitQuantities = { guest_count: guestCount, lane_count: laneCount };
    const m: Record<string, number> = {};
    for (const form of forms) {
      for (const field of form.fields) {
        if (field.fieldType === "per_unit_select") {
          m[field.id] = perUnitCount(field, q);
        }
      }
    }
    return m;
  }, [forms, guestCount, laneCount]);
  // Async uploads may finish after another answer changed. Apply their update
  // to the current draft rather than the render that started the upload.
  const draftRef = useRef({ answers, forms, unitCounts });
  draftRef.current = { answers, forms, unitCounts };

  useEffect(() => {
    setLegacySlots((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const field of forms?.flatMap((form) => form.fields) ?? []) {
        if (next[field.id] && !fieldVisible(field, answers)) {
          delete next[field.id];
          changed = true;
        }
      }
      for (const [id, n] of Object.entries(unitCounts)) {
        if ((next[id]?.length ?? 0) > n) {
          next[id] = next[id].slice(0, n);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [unitCounts, forms, answers]);

  // One existing wizard draft is authoritative. Reconcile after definitions load
  // and when quantity/visibility changes; a remount never emits an empty draft.
  useEffect(() => {
    if (!forms?.length) return;
    const next = flattenAnswers(reconcileAnswers(answers, forms, unitCounts), forms);
    if (JSON.stringify(next) !== JSON.stringify(inputAnswers)) onAnswersChange(next);
  }, [answers, forms, unitCounts, inputAnswers, onAnswersChange]);

  function setAnswers(update: (prev: AnswerMap) => AnswerMap) {
    const current = draftRef.current;
    if (!current.forms) return;
    onAnswersChange(flattenAnswers(reconcileAnswers(update(current.answers), current.forms, current.unitCounts), current.forms));
  }

  // Required+visible+unsatisfied control ids, in DISPLAY order. Sorted by
  // displayOrder to MATCH the render loop below — a boolean could iterate
  // unsorted, but "first invalid" (the scroll target) must be the visually
  // first one. (Loading → []; near-instant fetch + server backstop at convert.)
  const invalidIds = useMemo<string[]>(() => {
    if (!forms) return EMPTY_IDS;
    const ids: string[] = [];
    for (const form of forms) {
      const pair = nyePairFields(form, productCode, pairedProductCodes);
      const visiblePair = pair && fieldVisible(pair.pizza, answers) && fieldVisible(pair.pitcher, answers) ? pair : null;
      let pairChecked = false;
      for (const field of [...form.fields].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      )) {
        if (visiblePair && (field.id === visiblePair.pizza.id || field.id === visiblePair.pitcher.id)) {
          if (!pairChecked) {
            for (let i = 0; i < (unitCounts[visiblePair.pizza.id] ?? 1); i++) {
              for (const paired of [visiblePair.pizza, visiblePair.pitcher]) {
                if (paired.required && !paired.options.includes(answers[paired.id]?.[i] ?? "")) ids.push(unitControlId(paired.id, i));
              }
            }
            pairChecked = true;
          }
          continue;
        }
        if (!field.required || !fieldVisible(field, answers)) continue;
        if (!requiredSatisfied(field, answers[field.id] ?? [], unitCounts[field.id])) {
          ids.push(field.id);
        }
      }
    }
    return ids.length ? ids : EMPTY_IDS;
  }, [forms, answers, unitCounts, productCode, pairedProductCodes]);
  useEffect(() => {
    onInvalidIdsChange?.(invalidIds);
  }, [invalidIds, onInvalidIdsChange]);

  // A failed Continue (submitAttempt > 0) reveals every required field's error
  // at once — mirrors the guest step. Pure-derived from the prop; no local flag.
  const showAll = (submitAttempt ?? 0) > 0;
  const fieldInvalid = (field: FormFieldDefinition): boolean =>
    showAll &&
    field.required &&
    fieldVisible(field, answers) &&
    !requiredSatisfied(field, answers[field.id] ?? [], unitCounts[field.id]);

  // Type-appropriate "what you missed" line under a revealed-invalid field — so
  // the reveal isn't colour-only (WCAG 1.4.1) and the guest knows exactly what's
  // needed. The single required checkbox (VIP/NYE booking agreement) is the
  // common live case; it has no label/legend, so this message + the reddened
  // choice row are its only visible signal.
  function invalidMessage(field: FormFieldDefinition): string {
    switch (field.fieldType) {
      case "checkbox":
        return "Please check this to continue.";
      case "checkbox_list": {
        const min = Math.max(1, field.minSelections ?? 1);
        return min === 1 ? "Choose at least one." : `Choose at least ${min}.`;
      }
      case "dropdown":
      case "radio":
        return "Please choose an option.";
      case "per_unit_select":
        return field.countSource === "guest_count"
          ? "Please choose for every guest."
          : "Please choose for every lane.";
      default:
        return "Required.";
    }
  }
  const errorEl = (field: FormFieldDefinition) =>
    fieldInvalid(field) ? (
      <p className="tprs-field-error" id={`${field.id}-err`}>
        {invalidMessage(field)}
      </p>
    ) : null;
  // aria-describedby target for a field's control(s) — links the inline message
  // so a screen reader reads it on focus (parity with the guest fields).
  const describedBy = (field: FormFieldDefinition) =>
    fieldInvalid(field) ? `${field.id}-err` : undefined;

  const hasForms = useMemo(() => (forms?.length ?? 0) > 0, [forms]);
  if (!forms || !hasForms) return null;

  function setSingle(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value === "" ? [] : [value] }));
  }

  // One slot of a per_unit_select field (slot `index` = lane/guest #index+1).
  // Blank slots stay dense; flattenAnswers assigns the ordinal before filtering.
  function setPerUnitSlot(fieldId: string, index: number, value: string) {
    const field = forms?.flatMap((form) => form.fields).find((f) => f.id === fieldId);
    if (field && !isIndexedField(field)) {
      const cur = [...(answers[fieldId] ?? [])];
      while (cur.length <= index) cur.push("");
      cur[index] = value;
      setLegacySlots((prev) => ({ ...prev, [fieldId]: cur }));
    }
    setAnswers((prev) => {
      const cur = [...(prev[fieldId] ?? [])];
      while (cur.length <= index) cur.push("");
      cur[index] = value;
      return { ...prev, [fieldId]: cur };
    });
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
    const overrideHelpText = field.fieldType === "short_text" ? helpTextOverrides?.[field.id] : undefined;
    const shortTextHelp = overrideHelpText ?? field.helpText;
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
            {shortTextHelp && <p className="tprs-help" id={overrideHelpText !== undefined ? `${field.id}-help` : undefined}><Markdown text={shortTextHelp} /></p>}
            <input
              id={field.id}
              className={`tprs-input${fieldInvalid(field) ? " is-invalid" : ""}`}
              type="text"
              placeholder={field.placeholder}
              aria-invalid={fieldInvalid(field) || undefined}
              aria-describedby={overrideHelpText ? [`${field.id}-help`, describedBy(field)].filter(Boolean).join(" ") : describedBy(field)}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
            {errorEl(field)}
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
              aria-describedby={describedBy(field)}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
            {errorEl(field)}
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
              aria-describedby={describedBy(field)}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
            {errorEl(field)}
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
              aria-describedby={describedBy(field)}
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
            {errorEl(field)}
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
                  aria-describedby={i === 0 ? describedBy(field) : undefined}
                  onChange={() => setSingle(field.id, opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
            {errorEl(field)}
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
                aria-describedby={describedBy(field)}
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
            {errorEl(field)}
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
                  aria-describedby={i === 0 ? describedBy(field) : undefined}
                  onChange={(e) =>
                    toggleInList(field, opt, e.currentTarget.checked)
                  }
                />
                <span>{opt}</span>
              </label>
            ))}
            {errorEl(field)}
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
                aria-describedby={describedBy(field)}
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
            {errorEl(field)}
          </div>
        );
      }

      case "per_unit_select": {
        // One single-select per lane/guest (N from the chosen quantity). NYE:
        // one pizza + one pitcher per lane. Each picker's value lives in slot i
        // of the answer array; the server re-derives N and validates at convert.
        // NOTE: checkout renders SINGLE-SELECT per unit only. perUnitMulti
        // (toppings-per-pizza, with unitIndex) is a send-a-form-page feature —
        // such a field must NOT be show_in_checkout (it would render as plain
        // dropdowns here and 400 at convert on the unit_index grouping).
        const n = unitCounts[field.id] ?? 1;
        const unitWord = field.countSource === "guest_count" ? "Guest" : "Lane";
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
            <div className="tprs-per-unit">
              {Array.from({ length: n }, (_, i) => {
                const slotEmpty = (val[i] ?? "") === "";
                return (
                  <div className="tprs-per-unit-row" key={i}>
                    <label
                      className="tprs-per-unit-num"
                      /* Must match the select's actual id — slot 0's select is
                         id=field.id (the scroll/focus target), not -u0. */
                      htmlFor={i === 0 ? field.id : `${field.id}-u${i}`}
                    >
                      {unitWord} {i + 1}
                    </label>
                    <select
                      /* id on the first slot so scrollFocusInvalid(field.id)
                         can target the group. */
                      id={i === 0 ? field.id : `${field.id}-u${i}`}
                      className={`tprs-select${fieldInvalid(field) && slotEmpty ? " is-invalid" : ""}`}
                      aria-invalid={(i === 0 && fieldInvalid(field)) || undefined}
                      aria-describedby={i === 0 ? describedBy(field) : undefined}
                      value={val[i] ?? ""}
                      onChange={(e) =>
                        setPerUnitSlot(field.id, i, e.currentTarget.value)
                      }
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
              })}
            </div>
            {errorEl(field)}
          </fieldset>
        );
      }

      default:
        return null;
    }
  }

  function renderPairs(pizza: FormFieldDefinition, pitcher: FormFieldDefinition) {
    const n = unitCounts[pizza.id] ?? 1;
    const intro = pairedPresentation?.intro ?? "All pizzas include cheese. Choose from the included options below. Food substitutions aren't available for NYE packages.";
    return (
      <section className="tprs-nye-pairs" key={`pairs-${pizza.id}`} aria-label="Your pizza and pitcher choices">
        {intro && <p className="tprs-help">{intro}</p>}
        {Array.from({ length: n }, (_, i) => {
          const pizzaId = unitControlId(pizza.id, i);
          const pitcherId = unitControlId(pitcher.id, i);
          const pizzaValue = answers[pizza.id]?.[i] ?? "";
          const pitcherValue = answers[pitcher.id]?.[i] ?? "";
          const pizzaInvalid = showAll && pizza.required && !pizza.options.includes(pizzaValue);
          const pitcherInvalid = showAll && pitcher.required && !pitcher.options.includes(pitcherValue);
          return (
            <section className="tprs-nye-pair" key={i} aria-labelledby={`${pizzaId}-title`}>
              <h4 id={`${pizzaId}-title`}>{pairedPresentation?.unitLabel ?? 'Pizza & pitcher'} {i + 1} of {n}</h4>
              <fieldset className={`tprs-field${pizzaInvalid ? " is-invalid" : ""}`}>
                <legend className="tprs-label">{pairedPresentation?.controlLabels?.pizza ? <>{pairedPresentation.controlLabels.pizza}<span className="sr-only"> — <Markdown text={pizza.label} inline/></span></> : pairedPresentation?.useFieldLabels ? <Markdown text={pizza.label} inline/> : <>Pizza {i + 1}</>}{pizza.required && <span className="tprs-req"> *</span>}</legend>
                {pairedPresentation?.showFieldHelp && pizza.helpText && <p className="tprs-help" id={`${pizzaId}-help`}><Markdown text={pizza.helpText} inline/></p>}
                <div className="tprs-choice-grid">
                {pizza.options.map((option, j) => (
                  <label className="tprs-choice" key={option}>
                    <input
                      id={j === 0 ? pizzaId : `${pizzaId}-option-${j}`}
                      name={pizzaId}
                      type="radio"
                      value={option}
                      checked={pizzaValue === option}
                      aria-invalid={pizzaInvalid || undefined}
                      aria-describedby={[pairedPresentation?.showFieldHelp && pizza.helpText ? `${pizzaId}-help` : '', pizzaInvalid ? `${pizzaId}-err` : ''].filter(Boolean).join(' ') || undefined}
                      onChange={() => setPerUnitSlot(pizza.id, i, option)}
                    />
                    <span>{option === "Cheese" ? "Cheese only" : option}</span>
                  </label>
                ))}
                </div>
                {pizzaInvalid && <p className="tprs-field-error" id={`${pizzaId}-err`}>Choose pizza {i + 1}.</p>}
              </fieldset>
              <div className="tprs-field">
                <label className="tprs-label" htmlFor={pitcherId}>{pairedPresentation?.controlLabels?.pitcher ? <>{pairedPresentation.controlLabels.pitcher}<span className="sr-only"> — <Markdown text={pitcher.label} inline/></span></> : pairedPresentation?.useFieldLabels ? <Markdown text={pitcher.label} inline/> : <>Pitcher {i + 1}</>}{pitcher.required && <span className="tprs-req"> *</span>}</label>
                {pairedPresentation?.showFieldHelp && pitcher.helpText && <p className="tprs-help" id={`${pitcherId}-help`}><Markdown text={pitcher.helpText} inline/></p>}
                <select
                  id={pitcherId}
                  className={`tprs-select${pitcherInvalid ? " is-invalid" : ""}`}
                  value={pitcherValue}
                  aria-invalid={pitcherInvalid || undefined}
                  aria-describedby={[pairedPresentation?.showFieldHelp && pitcher.helpText ? `${pitcherId}-help` : '', pitcherInvalid ? `${pitcherId}-err` : ''].filter(Boolean).join(' ') || undefined}
                  onChange={(e) => setPerUnitSlot(pitcher.id, i, e.currentTarget.value)}
                >
                  <option value="">Choose your soda</option>
                  {pitcher.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                {pitcherInvalid && <p className="tprs-field-error" id={`${pitcherId}-err`}>Choose soda for pitcher {i + 1}.</p>}
              </div>
            </section>
          );
        })}
        {pairedPresentation?.laneNote && <p className="tprs-pair-note">{pairedPresentation.laneNote}</p>}
      </section>
    );
  }

  return (
    <>
      {forms.map((form) => {
        const pair = nyePairFields(form, productCode, pairedProductCodes);
        const visiblePair = pair && isFieldVisible(pair.pizza) && isFieldVisible(pair.pitcher) ? pair : null;
        const fields = [...form.fields].sort((a, b) => a.displayOrder - b.displayOrder).filter(isFieldVisible);
        const firstPairId = fields.find((f) => visiblePair && (f.id === visiblePair.pizza.id || f.id === visiblePair.pitcher.id))?.id;
        const reservationInfo = visiblePair && pairedPresentation?.reservationInfo;
        const infoFields = reservationInfo ? fields.filter((field) => field.fieldType === 'rich_text') : [];
        return (
          <div className="tprs-form-block" key={form.id}>
            {!hideTitle && form.title && <h3 className="tprs-form-title">{form.title}</h3>}
            {fields.map((field) => {
              if (visiblePair && (field.id === visiblePair.pizza.id || field.id === visiblePair.pitcher.id)) {
                return field.id === firstPairId ? renderPairs(visiblePair.pizza, visiblePair.pitcher) : null;
              }
              if (reservationInfo && field.fieldType === 'rich_text') {
                if (field.id !== infoFields[0]?.id) return null;
                return <section className="tprs-reservation-info" key={`info-${form.id}`} aria-labelledby={`reservation-info-${form.id}`}>
                  <h3 id={`reservation-info-${form.id}`}>{reservationInfo.heading}</h3>
                  <ul>{reservationInfo.essentials.map((text) => <li key={text}>{text}</li>)}</ul>
                  <details className="tprs-reservation-details">
                    <summary>{reservationInfo.detailsLabel}</summary>
                    <div className="tprs-reservation-details-copy">{infoFields.map(renderField)}</div>
                  </details>
                </section>;
              }
              return renderField(field);
            })}
          </div>
        );
      })}
    </>
  );
}
