import { useCallback, useRef } from "react";

/** Error text and Android text size can make the fixed footer taller. Reserve
 *  its actual height so the last quantity never sits underneath the actions. */
export function useCountFooter() {
  const observerRef = useRef<ResizeObserver | null>(null);
  return useCallback((footer: HTMLDivElement | null) => {
    // The loading screen has no footer. Observe when React attaches it, and
    // release the observer when submitting or leaving unmounts it.
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!footer || typeof ResizeObserver === "undefined") return;
    const owner = footer.parentElement;
    const measure = () => owner?.style.setProperty("--lq-count-footer-h", `${footer.getBoundingClientRect().height}px`);
    measure();
    observerRef.current = new ResizeObserver(measure);
    observerRef.current.observe(footer);
  }, []);
}
