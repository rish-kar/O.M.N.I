import { LayoutGrid, MessageSquare, Terminal } from "lucide-react";
import { useStore, type Layout } from "../store";
import { Tooltip } from "./Tooltip";

const OPTIONS: Array<{ id: Layout; label: string; icon: any; tip: string }> = [
  {
    id: "studio",
    label: "Studio",
    icon: LayoutGrid,
    tip: "Studio — sidebar, jobs / activity dashboard, chat. The full cockpit.",
  },
  {
    id: "focus",
    label: "Focus",
    icon: MessageSquare,
    tip: "Focus — chat-only, full width. Best for conversation and voice.",
  },
  {
    id: "command",
    label: "Compact",
    icon: Terminal,
    tip: "Compact — single-column condensed layout. Sidebar collapses.",
  },
];

export default function LayoutSwitcher() {
  const layout    = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);

  return (
    <div className="inline-flex items-center gap-1 rounded-lg p-0.5 border border-white/10 bg-white/[0.04]">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = layout === o.id;
        return (
          <Tooltip key={o.id} content={o.tip} side="bottom">
            <button
              onClick={() => setLayout(o.id)}
              aria-label={o.label}
              aria-pressed={active}
              className={`h-7 w-7 inline-flex items-center justify-center rounded-md transition-all
                          ${active
                            ? "text-white shadow-ember"
                            : "text-omni-mute hover:text-omni-text hover:bg-white/[0.06]"}`}
              style={active
                ? { backgroundImage: "linear-gradient(135deg, #15346e 0%, #b91c1c 100%)" }
                : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
