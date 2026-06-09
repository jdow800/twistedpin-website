// Wires the booking wizard's step into the browser History API so the browser /
// OS Back button (the primary nav on mobile, where ~90% of traffic is) steps BACK
// through the flow instead of leaving the page and dumping the cart. State-only —
// the URL stays /reserve-preview/ the whole time; nothing visible changes.
//
// Model: every step we ENTER gets one history entry tagged {tprsId, tprsStep}.
//   - Forward step  → pushState (arms a Back; the add-ons skip pushes ONE entry,
//     so a single Back mirrors the single skip).
//   - Browser/OS Back (popstate) → dispatch to the entry we landed on.
//   - In-wizard Back button → history.back(), so both Backs are ONE mechanism and
//     the step ↔ history mirror can't drift.
//   - Backward JUMPs (Remove lane → main, Edit → detail) → history.go() to the
//     matching earlier entry so Back stays intuitive after the jump.
//   - Terminal confirmation (paid): Back never reopens the charged steps — once a
//     booking exists, a Back resets to a fresh start.
//   - Safety net: `resolveStep` never lands on a step the state can't render
//     (stray entries after a reset, a refresh, a hand-edited URL) — it falls back
//     toward `main`, so a Back press can be a harmless no-op but never a broken
//     half-rendered screen.

import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import {
  STEP_ORDER,
  guestComplete,
  type WizardState,
  type WizardStep,
  type WizardAction,
} from "./state";

interface Entry {
  id: number;
  step: WizardStep;
}

const idxOf = (s: WizardStep) => STEP_ORDER.indexOf(s); // -1 for confirmation (terminal)

/** The deepest step ≤ `target` the current state can actually render. */
function resolveStep(target: WizardStep, s: WizardState): WizardStep {
  const canRender = (step: WizardStep): boolean => {
    switch (step) {
      case "main":
        return true;
      case "detail":
        return !!(s.date && s.product);
      case "addons":
        return !!s.product;
      case "guest":
        return !!(s.product && s.date && s.slot);
      case "payment":
        // Mirror the forward gate — never resolve onto Pay with a blanked guest
        // (e.g. OS-Forward after deleting the email); fall back to guest instead.
        return !!(s.product && s.date && s.slot && guestComplete(s.guest));
      case "confirmation":
        return !!(s.booking && s.product && s.date);
      default:
        return false;
    }
  };
  if (target === "confirmation") {
    return canRender("confirmation") ? "confirmation" : "main";
  }
  for (let i = idxOf(target); i >= 0; i--) {
    if (canRender(STEP_ORDER[i])) return STEP_ORDER[i];
  }
  return "main";
}

export function useStepHistory(
  state: WizardState,
  dispatch: Dispatch<WizardAction>,
) {
  // Our mirror of the history entries we own (index 0 = the entry the wizard
  // first mounted on). Kept in sync 1:1 with the browser stack we pushed.
  const stack = useRef<Entry[]>([]);
  const nextId = useRef(1);
  const fromPop = useRef(false);
  const prevStep = useRef<WizardStep>(state.step);
  // Always-fresh state for the (mount-time) popstate closure.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Mount: tag the entry the wizard loaded on, seed the mirror, listen for Back.
  useEffect(() => {
    safe(() =>
      history.replaceState(
        { ...(history.state ?? {}), tprsId: 0, tprsStep: state.step },
        "",
      ),
    );
    stack.current = [{ id: 0, step: state.step }];
    prevStep.current = state.step;

    const onPop = (e: PopStateEvent) => {
      const st = (e.state ?? {}) as { tprsId?: number; tprsStep?: WizardStep };
      // No tag → the user backed out past the wizard's first entry; let the
      // browser leave the page (nothing to dispatch).
      if (typeof st.tprsId !== "number") return;
      const i = stack.current.findIndex((x) => x.id === st.tprsId);
      if (i >= 0) stack.current = stack.current.slice(0, i + 1);
      const cur = stateRef.current;

      // A completed booking must never reopen the charged steps. Rebuild a clean
      // single entry HERE (not via the reconcile effect — the RESET that follows
      // lands on `main`, which equals prevStep, so the effect early-returns).
      if (cur.booking && st.tprsStep !== "confirmation") {
        const id = nextId.current++;
        stack.current = [{ id, step: "main" }];
        prevStep.current = "main";
        fromPop.current = false;
        safe(() => history.replaceState({ tprsId: id, tprsStep: "main" }, ""));
        dispatch({ type: "RESET" });
        return;
      }

      const resolved = resolveStep(st.tprsStep ?? "main", cur);
      // No step-VALUE change — a backward JUMP (Remove lane / Edit) already moved
      // the step before its history.go(), or a stray entry resolves to where we
      // already are. The [state.step] effect won't re-run, so consume the flag
      // HERE and push nothing; otherwise fromPop leaks and swallows the next
      // forward push (→ the next Back would leave the page and dump the cart).
      if (resolved === cur.step) {
        prevStep.current = resolved;
        fromPop.current = false;
        return;
      }
      // A genuine browser-Back step change → arm the reconcile effect to SKIP the
      // push (this is a back, not a forward), then dispatch.
      fromPop.current = true;
      dispatch({ type: "GO_STEP", step: resolved });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile browser history whenever the step changes via a NON-popstate move
  // (SELECT_PRODUCT, handleNext, REMOVE_LANE, onEdit, CONVERTED, RESET).
  useEffect(() => {
    if (fromPop.current) {
      fromPop.current = false;
      prevStep.current = state.step;
      return;
    }
    const prev = prevStep.current;
    if (state.step === prev) return;
    prevStep.current = state.step;

    const cIdx = idxOf(state.step);
    const pIdx = idxOf(prev);

    // Terminal confirmation: replace the (payment) head so Back can't reopen it.
    if (state.step === "confirmation") {
      const head = stack.current[stack.current.length - 1];
      const id = head ? head.id : nextId.current++;
      stack.current[Math.max(0, stack.current.length - 1)] = {
        id,
        step: "confirmation",
      };
      safe(() => history.replaceState({ tprsId: id, tprsStep: "confirmation" }, ""));
      return;
    }
    // Leaving confirmation via "Book another" (RESET → main): add a fresh entry
    // on top. We can't truly collapse — replaceState can't remove the funnel
    // entries beneath the (paid) confirmation screen — so keep the mirror
    // TRUTHFUL and let resolveStep turn any Back through the dead funnel into a
    // safe no-op rather than desyncing the mirror.
    if (pIdx === -1) {
      const id = nextId.current++;
      stack.current.push({ id, step: state.step });
      safe(() => history.pushState({ tprsId: id, tprsStep: state.step }, ""));
      return;
    }
    if (cIdx > pIdx) {
      // Forward (incl. the add-ons skip detail→guest) → one new entry.
      const id = nextId.current++;
      stack.current.push({ id, step: state.step });
      safe(() => history.pushState({ tprsId: id, tprsStep: state.step }, ""));
      return;
    }
    // Backward JUMP not via popstate (Remove lane → main, Edit → detail). Pop the
    // browser to the matching earlier entry; its popstate truncates + dispatches.
    for (let i = stack.current.length - 2; i >= 0; i--) {
      if (stack.current[i].step === state.step) {
        safe(() => history.go(i - (stack.current.length - 1))); // negative delta
        return;
      }
    }
    // No matching earlier entry → degrade gracefully, but NEVER retag index 0
    // (the mount/escape entry, whose Back must be able to leave the page).
    if (stack.current.length <= 1) return;
    const head = stack.current[stack.current.length - 1];
    if (head) {
      head.step = state.step;
      safe(() => history.replaceState({ tprsId: head.id, tprsStep: state.step }, ""));
    }
  }, [state.step, dispatch]);
}

/** History calls can throw in locked-down embeddings; never let that break nav. */
function safe(fn: () => void) {
  try {
    fn();
  } catch {
    /* no-op */
  }
}
