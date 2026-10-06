import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

/** Hold intermediate keyboard text while focused. The caller decides whether
 * a valid answer records a count; blank/negative text never becomes zero. */
export default function FoodNumberInput({ value, onRaw, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | undefined; onRaw: (raw: string) => void;
}) {
  const show = (n: number | undefined) => n == null ? "" : String(Number(n.toPrecision(15)));
  const [text, setText] = useState(() => show(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(show(value)); }, [value]);
  return <input {...props} value={text}
    onFocus={(e) => { focused.current = true; if (text === "0") e.currentTarget.select(); props.onFocus?.(e); }}
    onChange={(e) => { setText(e.target.value); onRaw(e.target.value); }}
    onBlur={(e) => { focused.current = false; setText(show(value)); props.onBlur?.(e); }} />;
}
