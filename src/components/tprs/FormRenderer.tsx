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

interface Props {
  productId: string;
  onAnswersChange: (answers: FormAnswerInput[]) => void;
  /** Reports whether every required, currently-visible field is satisfied — the
   *  guest can't reach payment until this is true (server backstops at convert). */
  onValidityChange?: (complete: boolean) => void;
}

/** Internal answer state: fieldId → selected/entered values (array form). */
type AnswerMap = Record<string, string[]>;

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
  onValidityChange,
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

  // Every required, visible field satisfied? (Loading → true; near-instant fetch,
  // and the server is the authoritative backstop at convert.)
  const formComplete = useMemo(() => {
    if (!forms) return true;
    for (const form of forms) {
      for (const field of form.fields) {
        if (!field.required || !fieldVisible(field, answers)) continue;
        if (!requiredSatisfied(field, answers[field.id] ?? [])) return false;
      }
    }
    return true;
  }, [forms, answers]);
  useEffect(() => {
    onValidityChange?.(formComplete);
  }, [formComplete, onValidityChange]);

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
        {field.label}
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
            {field.label && <h4>{field.label}</h4>}
            {field.helpText && <p>{field.helpText}</p>}
          </div>
        );

      case "short_text":
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help">{field.helpText}</p>}
            <input
              id={field.id}
              className="tprs-input"
              type="text"
              placeholder={field.placeholder}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
          </div>
        );

      case "long_text":
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help">{field.helpText}</p>}
            <textarea
              id={field.id}
              className="tprs-textarea"
              placeholder={field.placeholder}
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
          </div>
        );

      case "date":
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help">{field.helpText}</p>}
            <input
              id={field.id}
              className="tprs-input"
              type="date"
              value={val[0] ?? ""}
              onChange={(e) => setSingle(field.id, e.currentTarget.value)}
            />
          </div>
        );

      case "dropdown":
        return (
          <div className="tprs-field" key={field.id}>
            {labelEl}
            {field.helpText && <p className="tprs-help">{field.helpText}</p>}
            <select
              id={field.id}
              className="tprs-select"
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
          <fieldset className="tprs-field" key={field.id}>
            <legend className="tprs-label">
              {field.label}
              {field.required ? <span className="tprs-req"> *</span> : null}
            </legend>
            {field.helpText && <p className="tprs-help">{field.helpText}</p>}
            {field.options.map((opt) => (
              <label className="tprs-choice" key={opt}>
                <input
                  type="radio"
                  name={field.id}
                  value={opt}
                  checked={val[0] === opt}
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
          <div className="tprs-field" key={field.id}>
            <label className="tprs-choice">
              <input
                type="checkbox"
                checked={val[0] === "true"}
                onChange={(e) =>
                  setSingle(field.id, e.currentTarget.checked ? "true" : "")
                }
              />
              <span>
                {field.label}
                {field.required ? <span className="tprs-req"> *</span> : null}
              </span>
            </label>
            {field.helpText && <p className="tprs-help">{field.helpText}</p>}
          </div>
        );

      case "checkbox_list": {
        const bounds =
          field.minSelections !== null || field.maxSelections !== null
            ? ` (choose ${field.minSelections ?? 0}–${field.maxSelections ?? field.options.length})`
            : "";
        return (
          <fieldset className="tprs-field" key={field.id}>
            <legend className="tprs-label">
              {field.label}
              {field.required ? <span className="tprs-req"> *</span> : null}
              {bounds && <span className="tprs-opt">{bounds}</span>}
            </legend>
            {field.helpText && <p className="tprs-help">{field.helpText}</p>}
            {field.options.map((opt) => (
              <label className="tprs-choice" key={opt}>
                <input
                  type="checkbox"
                  value={opt}
                  checked={val.includes(opt)}
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
            {field.helpText && <p className="tprs-help">{field.helpText}</p>}
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
                className="tprs-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
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
