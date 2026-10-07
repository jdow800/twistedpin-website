import { useEffect, useRef } from "react";

/** This reminder belongs to one entry into food inventory, before a count mounts. */
export default function FoodCountWasteChoice({ onUpload, onProceed, onHome }: {
  onUpload: () => void; onProceed: () => void; onHome: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className="lq-count-entry lq-food-waste-entry" aria-labelledby="food-waste-entry-heading">
    <h2 id="food-waste-entry-heading" className="lq-h2" ref={heading} tabIndex={-1}>Before counting food</h2>
    <p>Have you uploaded the waste log for this count?</p>
    <div className="lq-count-entry-actions">
      <button type="button" className="lq-btn lq-btn-primary" onClick={onUpload}>Upload waste log</button>
      <button type="button" className="lq-btn" onClick={onProceed}>Already uploaded</button>
      <button type="button" className="lq-btn" onClick={onProceed}>No waste to upload</button>
      <button type="button" className="lq-linkbtn" onClick={onHome}>Home</button>
    </div>
  </section>;
}
