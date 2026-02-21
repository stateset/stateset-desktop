import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
  end: number;
  duration?: number;
  formatLocale?: boolean;
}

export function useCountUp({
  end,
  duration = 500,
  formatLocale = true,
}: UseCountUpOptions): string {
  const [current, setCurrent] = useState(end);
  const prevEnd = useRef(end);

  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') {
      setCurrent(end);
      prevEnd.current = end;
      return;
    }

    const reduceMotion = document.documentElement.dataset.reduceMotion === 'true';
    if (reduceMotion) {
      setCurrent(end);
      prevEnd.current = end;
      return;
    }

    const startVal = prevEnd.current;
    prevEnd.current = end;
    const diff = end - startVal;
    if (diff === 0) return;

    let startTime: number | null = null;
    let rafId: number;

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    function animate(timestamp: number) {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOut(progress);

      setCurrent(Math.round(startVal + diff * easedProgress));

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    }

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [end, duration]);

  return formatLocale ? current.toLocaleString() : String(current);
}
