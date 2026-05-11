import { useState, useRef, useLayoutEffect, ReactNode } from "react";
import { Info } from "lucide-react";

type Side = "top" | "bottom" | "left" | "right";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  delay?: number;
  className?: string;
};

/**
 * Hover tooltip. Fixed-positioned so it escapes scroll containers.
 * Keyboard-accessible (focus + Esc to close). Clamped to the viewport.
 */
export function Tooltip({ content, children, side = "top", delay = 120, className = "" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !tipRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    const gap = 10;
    let top = 0, left = 0;
    if (side === "top")    { top = r.top - t.height - gap; left = r.left + r.width / 2 - t.width / 2; }
    if (side === "bottom") { top = r.bottom + gap;          left = r.left + r.width / 2 - t.width / 2; }
    if (side === "left")   { top = r.top + r.height / 2 - t.height / 2; left = r.left - t.width - gap; }
    if (side === "right")  { top = r.top + r.height / 2 - t.height / 2; left = r.right + gap; }
    left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
    top  = Math.max(8, Math.min(top,  window.innerHeight - t.height - 8));
    setPos({ top, left });
  }, [open, side]);

  return (
    <span
      ref={wrapRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => e.key === "Escape" && hide()}
      className={`inline-flex ${className}`}
    >
      {children}
      {open && (
        <div
          ref={tipRef}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[1200] max-w-[280px] px-3 py-2 rounded-lg
                     text-[11px] leading-relaxed text-omni-text
                     border border-white/[0.10] bg-[#0a0e1c]/95 backdrop-blur-md
                     shadow-glass animate-fade-in pointer-events-none"
        >
          {content}
        </div>
      )}
    </span>
  );
}

/** Small (i) icon. Hover/focus shows the tooltip. */
export function InfoHint({ children, side = "top" }: { children: ReactNode; side?: Side }) {
  return (
    <Tooltip content={children} side={side}>
      <span
        tabIndex={0}
        className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full
                   text-omni-mute hover:text-omni-glow focus:text-omni-glow
                   cursor-help align-[1px] focus:outline-none"
        aria-label="More info"
      >
        <Info className="h-3 w-3" />
      </span>
    </Tooltip>
  );
}
