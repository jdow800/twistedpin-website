import { useEffect, useState } from 'react';
import { eventStartMs } from './builderContract';
import { millisecondsToCentralMidnight } from './useCentralDay';

/** Re-render at eligibility boundaries and after a sleeping/backgrounded tab wakes. */
export function useEventClock(date: string, time: string): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      const start = eventStartMs(date, time);
      const boundaries = [millisecondsToCentralMidnight(current) + 20];
      if (start !== null) for (const instant of [start - 6 * 3600000 + 1, start]) {
        if (instant > current.getTime()) boundaries.push(instant - current.getTime());
      }
      timer = setTimeout(refresh, Math.min(...boundaries));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [date, time]);
  return now;
}
