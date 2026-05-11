import { useEffect, useRef, useState } from "react";
import { History, Plus, Trash2, Edit2 } from "lucide-react";
import { api } from "../api";
import { useStore } from "../store";
import { Tooltip } from "./Tooltip";

export default function ChatHistoryButton() {
  const sessions            = useStore((s) => s.sessions);
  const currentSessionId    = useStore((s) => s.currentSessionId);
  const setSessions         = useStore((s) => s.setSessions);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const setMessages         = useStore((s) => s.setMessages);
  const pushToast           = useStore((s) => s.pushToast);

  const [open, setOpen]               = useState(false);
  const [renamingId, setRenamingId]   = useState<number | null>(null);
  const [renameText, setRenameText]   = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const refreshSessions = async () => {
    try {
      const data = await api.chatSessions();
      setSessions(data?.sessions || []);
    } catch {}
  };

  useEffect(() => { if (open) refreshSessions(); }, [open]);

  const switchSession = async (id: number) => {
    setCurrentSessionId(id);
    try { localStorage.setItem("omni.currentSessionId", String(id)); } catch {}
    try {
      const data = await api.chatHistory(id, 500);
      setMessages((data?.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
        ts: new Date(String(m.ts).replace(" ", "T") + "Z").getTime(),
      })));
    } catch {
      pushToast("error", "Couldn't load that chat.");
    }
    setOpen(false);
  };

  const newChat = () => {
    // Defer real session creation until the first message is sent —
    // avoids ghost empty sessions cluttering the list.
    setCurrentSessionId(null);
    try { localStorage.removeItem("omni.currentSessionId"); } catch {}
    setMessages([]);
    setOpen(false);
  };

  const deleteSession = async (id: number) => {
    if (!window.confirm("Delete this chat? This can't be undone.")) return;
    try {
      await api.deleteChatSession(id);
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([]);
        try { localStorage.removeItem("omni.currentSessionId"); } catch {}
      }
      await refreshSessions();
    } catch {
      pushToast("error", "Couldn't delete chat.");
    }
  };

  const submitRename = async (id: number) => {
    const title = renameText.trim();
    if (!title) { setRenamingId(null); return; }
    try {
      await api.renameChatSession(id, title);
      setRenamingId(null);
      await refreshSessions();
    } catch {
      pushToast("error", "Couldn't rename chat.");
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Tooltip side="bottom" content="Browse past conversations. Click + to start a new chat.">
        <button
          className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[11px]
                     border border-white/10 bg-white/[0.04] text-omni-mute hover:text-omni-text
                     hover:bg-white/[0.08] transition-all whitespace-nowrap"
          onClick={() => setOpen(!open)}
        >
          <History className="h-3 w-3" />
          Chats
        </button>
      </Tooltip>
      {open && (
        <div
          className="absolute top-full right-0 mt-1.5 w-72 z-50 panel py-1.5
                     max-h-96 overflow-y-auto shadow-2xl"
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs
                       text-omni-flame hover:bg-omni-flame/10 transition-colors"
            onClick={newChat}
          >
            <Plus className="h-3.5 w-3.5" /> New Chat
          </button>
          <div className="h-px bg-white/[0.06] my-1" />
          {sessions.length === 0 && (
            <div className="px-3 py-4 text-xs text-omni-mute italic text-center">
              No past chats yet. Send a message to start one.
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors
                          ${currentSessionId === s.id
                            ? "bg-omni-flame/10 text-omni-flame"
                            : "text-omni-text hover:bg-white/[0.04]"}`}
            >
              {renamingId === s.id ? (
                <input
                  className="input flex-1 h-6 text-xs"
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitRename(s.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => submitRename(s.id)}
                />
              ) : (
                <>
                  <button
                    className="flex-1 text-left truncate min-w-0"
                    onClick={() => switchSession(s.id)}
                  >
                    <div className="truncate">{s.title}</div>
                    <div className="text-[9px] text-omni-mute mt-0.5">
                      {s.message_count} msg{s.message_count === 1 ? "" : "s"} · {formatDate(s.updated_at)}
                    </div>
                  </button>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity shrink-0">
                    <button
                      title="Rename"
                      className="p-1 hover:text-omni-flame transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(s.id);
                        setRenameText(s.title);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      title="Delete"
                      className="p-1 hover:text-omni-danger transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(ts: string): string {
  try {
    const d = new Date(String(ts).replace(" ", "T") + "Z");
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const day = 86400000;
    if (diff < day) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 7 * day) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
