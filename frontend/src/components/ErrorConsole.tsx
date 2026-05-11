import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon, ChevronUp, ChevronDown, Trash2, X } from "lucide-react";
import { useStore } from "../store";

/**
 * Bottom-left error console. Collapsed: a small button with the error count.
 * Expanded: scrollable history with timestamps, copy, clear.
 *
 * Errors are pushed by api.ts / components into store.errorLog.
 */
export default function ErrorConsole() {
  const errors = useStore((s) => s.errorLog);
  const clear  = useStore((s) => s.clearErrors);
  const [open, setOpen]       = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const count = errors.length;

  return (
    <div className="fixed bottom-4 left-4 z-[60] pointer-events-none">
      <AnimatePresence mode="wait">
        {open ? (
          <motion.div
            key="open"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="panel-hi w-[22rem] max-h-[26rem] flex flex-col pointer-events-auto"
          >
            <div className="flex items-center gap-2 px-3 h-10 border-b border-white/[0.07]">
              <AlertOctagon className="h-3.5 w-3.5 text-omni-danger" />
              <span className="text-xs font-semibold tracking-tight">Errors</span>
              <span className="chip text-omni-mute">{count}</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  className="btn btn-icon-sm"
                  onClick={clear}
                  disabled={count === 0}
                  aria-label="Clear all errors"
                  title="Clear all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <button
                  className="btn btn-icon-sm"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  title="Close"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {count === 0 ? (
                <div className="p-4 text-[11px] text-omni-mute italic">
                  No errors. OMNI's running clean.
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {errors.map((e) => {
                    const isOpen = expanded === e.id;
                    return (
                      <li key={e.id} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] uppercase tracking-wider text-omni-mute flex items-center gap-1.5">
                              <span>{new Date(e.ts).toLocaleTimeString()}</span>
                              {e.source && <>· <span>{e.source}</span></>}
                            </div>
                            <div className="text-xs text-omni-text mt-0.5 leading-snug">
                              {e.message}
                            </div>
                            {isOpen && e.detail && (
                              <pre className="text-[10px] font-mono mt-1.5 px-2 py-1.5 rounded bg-black/40
                                              border border-white/[0.05] text-omni-textDim whitespace-pre-wrap break-words">
                                {e.detail}
                              </pre>
                            )}
                          </div>
                          {e.detail && (
                            <button
                              className="text-omni-mute hover:text-omni-text p-0.5 -m-0.5 shrink-0"
                              onClick={() => setExpanded(isOpen ? null : e.id)}
                              aria-label={isOpen ? "Hide details" : "Show details"}
                            >
                              {isOpen
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(true)}
            className={`pointer-events-auto h-9 px-3 rounded-lg
                        inline-flex items-center gap-2 text-xs font-medium
                        backdrop-blur-md transition-all
                        ${count > 0
                          ? "border border-omni-danger/40 bg-omni-danger/10 text-omni-danger hover:bg-omni-danger/20"
                          : "border border-white/10 bg-black/40 text-omni-mute hover:bg-black/55 hover:text-omni-text"}`}
            aria-label="Open error console"
            title="Error console"
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            <span>{count > 0 ? `${count} error${count === 1 ? "" : "s"}` : "Errors"}</span>
            {count > 0 && (
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-omni-danger animate-pulse" />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
