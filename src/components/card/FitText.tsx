"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Starting (maximum) font size in card pixels. */
  max: number;
  min?: number;
  /** Changes whenever the content changes, so the size is recomputed. */
  fitKey: string;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
  /** Keep on one line and shrink to the box width. */
  singleLine?: boolean;
};

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Shrinks the font size until the content fits its box. */
export function FitText({ children, max, min = 14, fitKey, className, innerClassName, style, singleLine }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(0);

  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, []);

  useIsoLayoutEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    let size = max;
    i.style.fontSize = `${size}px`;
    const overflows = () =>
      i.scrollHeight > b.clientHeight + 1 || i.scrollWidth > b.clientWidth + 1;
    while (overflows() && size > min) {
      size = Math.max(min, Math.floor(size * 0.94));
      i.style.fontSize = `${size}px`;
    }
  }, [fitKey, max, min, fontsReady]);

  return (
    <div ref={box} className={className} style={style}>
      <div
        ref={inner}
        className={innerClassName}
        style={{ fontSize: max, whiteSpace: singleLine ? "nowrap" : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
