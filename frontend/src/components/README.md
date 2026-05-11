# `frontend/src/components/` — UI building blocks

React + TypeScript + Tailwind. Each component is self-contained and reads
state from the Zustand store (`../store.ts`).

## Components

| File | Responsibility |
| --- | --- |
| `Background.tsx` | Fullscreen animated gradient + drifting blobs + grid texture. Sits behind everything with `z-index: -1`. |
| `Logo.tsx` | The OMNI logo. Orbital ring, omega glyph, blue→orange gradient. Optional slow rotation. |
| `Sidebar.tsx` | Session controls, browser connect, permission toggles, paths. Every control has a tooltip and an info-icon explainer. |
| `StatusBar.tsx` | Top-right pills: Ollama, Chrome mode, orchestrator state, active model. Hover for details. |
| `Dashboard.tsx` | Job-search input, lead list, audit feed. Centre-stage panel. |
| `ChatPanel.tsx` | Conversation with OMNI. Type or hold the mic. Recording → WebM → 16k mono PCM WAV → `/voice/transcribe` → `/chat` → optional `/voice/speak` playback. |
| `Tooltip.tsx` | `<Tooltip>` (rich hover text) and `<InfoHint>` (the small (i) icon next to every label). Fixed-position so it escapes scroll containers. |
| `OnboardingTour.tsx` | First-run guided tour (5 steps + tips). Re-launchable from the help button in the header. |
| `SettingsModal.tsx` | Personality (name/tone/humor/verbosity/custom-instructions) + Voice (voice picker, auto-speak, push-to-talk, STT model). Save patches `/config`. |
| `PermissionToasts.tsx` | Bottom-right stack of permission prompts and toasts. The user approves / skips here. |

## State

Everything lives in `../store.ts` (Zustand). Components subscribe via
`useStore((s) => s.field)` and never own server state directly. Server pushes
arrive via the `connectEvents` WebSocket in `App.tsx` and call
`store.applyEvent(...)`.

## Theme

Colours and animations come from `tailwind.config.js`. The signature look:

- **Glass panels** — `.panel`, `.panel-soft`, `.ring-gradient` classes in
  `styles.css` add backdrop blur, soft inset highlight, a subtle 1px gradient
  border (when wanted).
- **Gradient text** — `.gradient-text` paints the OMNI wordmark in the
  blue→orange ramp.
- **Animated background** — `.omni-bg` plus three drifting `.omni-blob`s and a
  grid-of-pixels texture. Disabled when the user prefers reduced motion.

## Adding a new tooltip

```tsx
import { Tooltip, InfoHint } from "./Tooltip";

<Tooltip content="Quick hover text" side="top">
  <button className="btn">…</button>
</Tooltip>

// or for the small (i) icon next to a label
<label className="flex items-center gap-1">
  Resume
  <InfoHint>Your master .docx — never overwritten.</InfoHint>
</label>
```
