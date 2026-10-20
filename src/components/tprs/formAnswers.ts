import type { FormAnswerInput, FormDefinition, FormFieldDefinition } from "../../tprs/schemas";

export type AnswerMap = Record<string, string[]>;

/** Only the server's explicit fixed-choice opt-in carries purchased-pair identity. */
export function isIndexedField(field: FormFieldDefinition): boolean {
  return (field.perUnitRole === "pizza" || field.perUnitRole === "pitcher") &&
    field.fieldType === "per_unit_select" && !field.perUnitMulti &&
    field.countSource === "lane_count" && field.countDivisor === 1;
}

/** Reopening a draft never compacts an unanswered middle pair. */
export function answerMapFromInput(input: FormAnswerInput[], forms: FormDefinition[]): AnswerMap {
  const map: AnswerMap = {};
  for (const field of forms.flatMap((form) => form.fields)) {
    const rows = input.filter((a) => a.formFieldId === field.id);
    if (!rows.length) continue;
    if (isIndexedField(field)) {
      // Only a complete old draft may be unindexed. Preserve its submitted order
      // here; persisted legacy NULL rows are handled explicitly by the backend.
      const legacy = rows.every((a) => a.unitIndex === undefined);
      const values: string[] = [];
      rows.forEach((answer, i) => {
        const index = legacy ? i : (answer.unitIndex ?? 0) - 1;
        if (index < 0 || !Number.isInteger(index)) return;
        while (values.length <= index) values.push("");
        values[index] = answer.value;
      });
      map[field.id] = values;
    } else {
      map[field.id] = rows.map((a) => a.value);
    }
  }
  return map;
}

export function flattenAnswers(map: AnswerMap, forms: FormDefinition[]): FormAnswerInput[] {
  const out: FormAnswerInput[] = [];
  for (const field of forms.flatMap((form) => form.fields)) {
    (map[field.id] ?? []).forEach((value, index) => {
      if (value !== "") out.push({
        formFieldId: field.id,
        value,
        ...(isIndexedField(field) ? { unitIndex: index + 1 } : {}),
      });
    });
  }
  return out;
}

export function fieldVisible(field: FormFieldDefinition, answers: AnswerMap): boolean {
  if (!field.visibleWhenFieldId) return true;
  return (answers[field.visibleWhenFieldId] ?? []).some((a) => field.visibleWhenValues.includes(a));
}

/** Reconcile only after definitions load; loading must never erase the draft. */
export function reconcileAnswers(
  map: AnswerMap,
  forms: FormDefinition[],
  unitCounts: Record<string, number>,
): AnswerMap {
  const next: AnswerMap = {};
  for (const field of forms.flatMap((form) => form.fields)) {
    if (!fieldVisible(field, map)) continue;
    const values = map[field.id] ?? [];
    next[field.id] = field.fieldType === "per_unit_select"
      ? values.slice(0, unitCounts[field.id] ?? 1)
      : values;
  }
  return next;
}

export function indexedAnswersComplete(field: FormFieldDefinition, input: FormAnswerInput[], count: number): boolean {
  const rows = input.filter((a) => a.formFieldId === field.id);
  if (rows.length !== count) return false;
  const seen = new Set<number>();
  for (const row of rows) {
    if (!row.unitIndex || row.unitIndex > count || !Number.isInteger(row.unitIndex) ||
        seen.has(row.unitIndex) || !field.options.includes(row.value)) return false;
    seen.add(row.unitIndex);
  }
  return seen.size === count;
}

/** A semantic pair, independent of labels or their editable display order. */
export function nyePairFields(form: FormDefinition, productCode?: number) {
  if (productCode !== 124 && productCode !== 126) return null;
  const pizzas = form.fields.filter((f) => isIndexedField(f) && f.perUnitRole === "pizza");
  const pitchers = form.fields.filter((f) => isIndexedField(f) && f.perUnitRole === "pitcher");
  return pizzas.length === 1 && pitchers.length === 1
    ? { pizza: pizzas[0], pitcher: pitchers[0] }
    : null;
}

export const unitControlId = (fieldId: string, index: number) => `${fieldId}-pair-${index + 1}`;
