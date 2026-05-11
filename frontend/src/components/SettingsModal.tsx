import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Sparkles, Mic2, Volume2, ChevronDown, ChevronRight, Download, Trash2, Check, Loader2 } from "lucide-react";
import { api, ApiError } from "../api";
import { useStore } from "../store";
import { InfoHint } from "./Tooltip";

const TONES = [
  { id: "friendly", label: "Friendly",  desc: "Warm, approachable" },
  { id: "playful",  label: "Playful",   desc: "Witty, jokes, energetic" },
  { id: "concise",  label: "Concise",   desc: "Curt, action-only" },
  { id: "formal",   label: "Formal",    desc: "Precise, professional" },
  { id: "mentor",   label: "Mentor",    desc: "Explanatory, teaches" },
];

const STT_QUALITY = [
  { id: "tiny.en",   label: "Fastest",  desc: "Snappy, less accurate (recommended for live chat)" },
  { id: "base.en",   label: "Balanced", desc: "Good speed, good accuracy" },
  { id: "medium.en", label: "Best",     desc: "Most accurate, a bit slower" },
];

type VoiceEntry = {
  id: string;
  label: string;
  locale: string;
  gender: string;
  quality: string;
  notes: string;
  installed: boolean;
};

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const personality = useStore((s) => (s as any).personality) || {};
  const voice       = useStore((s) => (s as any).voice) || {};
  const setStatus   = useStore((s) => s.setStatus);
  const pushToast   = useStore((s) => s.pushToast);
  const pushError   = useStore((s) => s.pushError);

  const [name, setName]               = useState(personality.name || "OMNI");
  const [tone, setTone]               = useState(personality.tone || "friendly");
  const [humor, setHumor]             = useState(personality.humor ?? 4);
  const [verbosity, setVerbosity]     = useState(personality.verbosity ?? 4);
  const [addressAs, setAddressAs]     = useState(personality.address_user_as || "");
  const [extras, setExtras]           = useState(personality.custom_instructions || "");

  const [voiceId, setVoiceId]         = useState(voice.voice_id || "en_US-lessac-medium");
  const [autoSpeak, setAutoSpeak]     = useState(voice.auto_speak_replies ?? true);
  const [rate, setRate]               = useState<number>(voice.rate ?? 1.15);
  const [sttModel, setSttModel]       = useState(voice.stt_model || "tiny.en");
  const [voiceInstructions, setVoiceInstructions] = useState(
    voice.instructions
      ?? "You're talking, not typing. Reply in 1-2 short sentences. Plain conversational text only — no markdown, no emojis, no bullet lists, no headings, no code blocks. Skip preambles and just answer."
  );

  const [voices, setVoices]           = useState<VoiceEntry[]>([]);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [busy, setBusy] = useState(false);
  const [tab, setTab]   = useState<"personality" | "voice">("personality");

  const refreshVoices = async () => {
    try {
      const r: any = await api.voices();
      setVoices(r.voices || []);
    } catch {}
  };

  useEffect(() => { refreshVoices(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.patchConfig({
        personality: { name, tone, humor, verbosity, address_user_as: addressAs, custom_instructions: extras },
        voice: { voice_id: voiceId, auto_speak_replies: autoSpeak, rate, stt_model: sttModel, instructions: voiceInstructions },
      });
      const status = await api.status();
      setStatus(status);
      pushToast("info", "Settings saved");
      onClose();
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message || "Save failed");
      pushToast("error", msg);
      pushError(msg, e instanceof ApiError ? e.detail : String(e), "settings");
    } finally {
      setBusy(false);
    }
  };

  // Preview the *currently selected* voice with the *currently chosen* rate
  // — even before the user clicks Save. Without these per-call overrides the
  // preview always uses the saved settings, which is why earlier tweaks felt
  // like a no-op.
  const tryVoice = async (vid?: string) => {
    const target = vid || voiceId;
    if (!target) return;
    try {
      const sample = `Hi, I'm ${name || "OMNI"}. This is the ${prettyVoiceName(target)} voice at ${rate.toFixed(2)}x speed.`;
      const blob = await api.speakBlob(sample, target, rate);
      const url  = URL.createObjectURL(blob);
      const a    = new Audio(url);
      a.onended  = () => URL.revokeObjectURL(url);
      a.onerror  = () => URL.revokeObjectURL(url);
      a.play();
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message || "Preview failed");
      pushToast("error", msg);
      pushError(msg, e instanceof ApiError ? e.detail : String(e), "voice");
    }
  };

  const downloadVoice = async (vid: string) => {
    setDownloading((d) => ({ ...d, [vid]: true }));
    try {
      await api.downloadVoice(vid);
      pushToast("info", `Downloaded ${prettyVoiceName(vid)}`);
      await refreshVoices();
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message || "Download failed");
      pushToast("error", msg);
      pushError(msg, e instanceof ApiError ? e.detail : String(e), "voice");
    } finally {
      setDownloading((d) => { const c = { ...d }; delete c[vid]; return c; });
    }
  };

  const deleteVoice = async (vid: string) => {
    try {
      await api.deleteVoice(vid);
      pushToast("info", `Removed ${prettyVoiceName(vid)}`);
      if (voiceId === vid) setVoiceId("en_US-lessac-medium");
      await refreshVoices();
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message || "Delete failed");
      pushToast("error", msg);
      pushError(msg, e instanceof ApiError ? e.detail : String(e), "voice");
    }
  };

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative panel-hi ring-fire w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold gradient-text">Settings</h2>
            <p className="text-[11px] text-omni-mute mt-0.5">
              Personality and voice. Saved to <code className="font-mono">data/config.json</code>.
            </p>
          </div>
          <button onClick={onClose} className="text-omni-mute hover:text-omni-text p-1 -m-1" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 mb-5 border-b border-white/[0.08] pb-3">
          <TabBtn active={tab === "personality"} onClick={() => setTab("personality")} icon={Sparkles}>
            Personality
          </TabBtn>
          <TabBtn active={tab === "voice"} onClick={() => setTab("voice")} icon={Mic2}>
            Voice
          </TabBtn>
        </div>

        {tab === "personality" && (
          <div className="space-y-4">
            <Field label="Name" hint="What OMNI calls itself in conversation.">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <Field label="Tone" hint="How OMNI talks. Rebuilt into the system prompt on every chat.">
              <div className="grid grid-cols-5 gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    title={t.desc}
                    className={`h-8 inline-flex items-center justify-center text-[11px] rounded-lg border transition-all whitespace-nowrap
                                ${tone === t.id
                                  ? "border-transparent text-white shadow-ember"
                                  : "border-white/10 bg-white/[0.04] text-omni-textDim hover:bg-white/[0.10] hover:text-omni-text"}`}
                    style={tone === t.id ? { backgroundImage: "linear-gradient(135deg, #15346e 0%, #b91c1c 100%)" } : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`Humor — ${humor}/10`} hint="0 = strictly serious. 10 = comedy mode.">
              <input type="range" min={0} max={10} value={humor}
                onChange={(e) => setHumor(Number(e.target.value))}
                className="w-full accent-omni-ember" />
            </Field>

            <Field label={`Verbosity — ${verbosity}/10`} hint="0 = one-liners. 10 = full essays.">
              <input type="range" min={0} max={10} value={verbosity}
                onChange={(e) => setVerbosity(Number(e.target.value))}
                className="w-full accent-omni-ice" />
            </Field>

            <Field label="Address you as" hint="Optional. OMNI uses your name when natural.">
              <input className="input" placeholder="(optional)" value={addressAs}
                onChange={(e) => setAddressAs(e.target.value)} />
            </Field>

            <Field label="Custom instructions" hint="Free-form. Appended to the system prompt for every chat.">
              <textarea className="input min-h-[80px] py-2"
                placeholder="e.g. always include a salary range when scoring jobs"
                value={extras} onChange={(e) => setExtras(e.target.value)} />
            </Field>
          </div>
        )}

        {tab === "voice" && (
          <div className="space-y-4">
            <Field
              label="Voice"
              hint="Click Test to preview before saving. Download adds more voices from the Piper catalog."
            >
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 -mr-1">
                {voices.length === 0 && (
                  <p className="text-[11px] text-omni-mute italic">Loading voice catalog…</p>
                )}
                {voices.map((v) => (
                  <VoiceRow
                    key={v.id}
                    voice={v}
                    selected={voiceId === v.id}
                    busy={!!downloading[v.id]}
                    onSelect={() => v.installed && setVoiceId(v.id)}
                    onTest={() => tryVoice(v.id)}
                    onDownload={() => downloadVoice(v.id)}
                    onDelete={() => deleteVoice(v.id)}
                  />
                ))}
              </div>
            </Field>

            <Field
              label={`Speech speed — ${rate.toFixed(2)}x`}
              hint="How fast OMNI speaks. 1.0x is the voice's natural rate. Click Test on any installed voice to hear the change."
            >
              <input
                type="range" min={0.7} max={1.6} step={0.05} value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-full accent-omni-flame"
              />
              <div className="flex justify-between text-[10px] text-omni-mute mt-1">
                <span>0.7x slow</span><span>1.0x natural</span><span>1.6x fast</span>
              </div>
            </Field>

            <Field
              label="Auto-speak replies"
              hint="When ON, every reply OMNI sends is read out loud. Live mode forces this on regardless."
            >
              <PillToggle value={autoSpeak} onChange={setAutoSpeak} on="On — read replies aloud" off="Off — text only" />
            </Field>

            <Field
              label="Voice instructions"
              hint="Extra instructions for voice mode only. Layered on top of the personality. Keep it tight — long replies make for long audio."
            >
              <textarea
                className="input min-h-[90px] py-2 text-[12px]"
                placeholder="e.g. reply in one sentence. Plain text. No emojis."
                value={voiceInstructions}
                onChange={(e) => setVoiceInstructions(e.target.value)}
              />
            </Field>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-omni-mute hover:text-omni-text"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced
            </button>

            {showAdvanced && (
              <Field
                label="Speech recognition quality"
                hint="Trade-off between speed and accuracy. Tiny.en (Fastest) is best for live conversation."
              >
                <div className="grid grid-cols-3 gap-1.5">
                  {STT_QUALITY.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setSttModel(q.id)}
                      title={q.desc}
                      className={`h-9 px-2 inline-flex items-center justify-center rounded-lg border text-[11px]
                                  whitespace-nowrap transition-all
                                  ${sttModel === q.id
                                    ? "border-transparent text-white shadow-ember"
                                    : "border-white/10 bg-white/[0.04] text-omni-textDim hover:bg-white/[0.10] hover:text-omni-text"}`}
                      style={sttModel === q.id ? { backgroundImage: "linear-gradient(135deg, #15346e 0%, #b91c1c 100%)" } : undefined}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <p className="text-[11px] text-omni-mute leading-relaxed">
              Voice runs entirely offline. STT via{" "}
              <span className="text-omni-ice">faster-whisper</span>; TTS via{" "}
              <span className="text-omni-flame">Piper</span>. No data leaves your machine.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6 border-t border-white/[0.08] pt-4">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function VoiceRow({ voice: v, selected, busy, onSelect, onTest, onDownload, onDelete }: {
  voice: VoiceEntry;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onTest: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const isDefault = v.id === "en_US-lessac-medium";
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all
                  ${selected
                    ? "border-omni-flame/50 bg-omni-flame/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
    >
      <button
        onClick={onSelect}
        disabled={!v.installed}
        className={`flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <div className="text-[12px] font-medium flex items-center gap-1.5">
          {v.label}
          {selected && <Check className="h-3 w-3 text-omni-flame" />}
          {!v.installed && (
            <span className="text-[9px] uppercase tracking-wider text-omni-mute border border-white/15 rounded px-1 py-0.5">
              not installed
            </span>
          )}
        </div>
        <div className="text-[10px] text-omni-mute leading-snug">
          {[v.locale, v.gender, v.quality].filter(Boolean).join(" · ")}
          {v.notes && ` — ${v.notes}`}
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        {v.installed ? (
          <>
            <button
              onClick={onTest}
              title="Preview this voice"
              className="h-7 w-7 inline-flex items-center justify-center rounded
                         border border-white/10 bg-white/[0.04] hover:bg-white/[0.10] text-omni-textDim hover:text-omni-text"
            >
              <Volume2 className="h-3.5 w-3.5" />
            </button>
            {!isDefault && (
              <button
                onClick={onDelete}
                title="Remove voice file from disk"
                className="h-7 w-7 inline-flex items-center justify-center rounded
                           border border-white/10 bg-white/[0.04] hover:bg-omni-danger/15 hover:border-omni-danger/40
                           text-omni-mute hover:text-omni-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onDownload}
            disabled={busy}
            title="Download from rhasspy/piper-voices"
            className="h-7 px-2 inline-flex items-center gap-1 rounded text-[11px]
                       border border-omni-flame/35 bg-omni-flame/10 text-omni-flame
                       hover:bg-omni-flame/20 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {busy ? "Downloading…" : "Download"}
          </button>
        )}
      </div>
    </div>
  );
}

function prettyVoiceName(id: string) {
  // "en_US-lessac-medium" → "lessac (en_US, medium)"
  const parts = id.split("-");
  if (parts.length >= 3) {
    const locale = parts[0];
    const speaker = parts[1];
    const quality = parts.slice(2).join("-");
    return `${speaker} (${locale}, ${quality})`;
  }
  return id;
}

function TabBtn({ active, onClick, icon: Icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap
                  ${active
                    ? "text-white shadow-ember"
                    : "text-omni-textDim hover:text-omni-text bg-white/[0.04] hover:bg-white/[0.10] border border-white/10"}`}
      style={active ? { backgroundImage: "linear-gradient(135deg, #15346e 0%, #b91c1c 100%)" } : undefined}
    >
      <Icon className="h-3.5 w-3.5" />{children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-omni-textDim mb-1.5 flex items-center gap-1">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </div>
      {children}
    </div>
  );
}

function PillToggle({ value, onChange, on, off }: {
  value: boolean; onChange: (v: boolean) => void; on: string; off: string;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`h-9 w-full px-3 inline-flex items-center justify-between rounded-lg border text-xs transition-all whitespace-nowrap
                  ${value
                    ? "border-omni-ember/40 bg-omni-ember/10 text-omni-flame"
                    : "border-white/10 bg-white/[0.04] text-omni-text hover:bg-white/[0.10]"}`}
    >
      <span>{value ? on : off}</span>
      <span className={`h-4 w-8 rounded-full relative transition-colors
                        ${value ? "bg-omni-ember" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all
                          ${value ? "left-4" : "left-0.5"}`} />
      </span>
    </button>
  );
}
