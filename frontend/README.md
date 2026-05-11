# OMNI frontend

Tauri 2 + React 18 + TypeScript + Tailwind 3. Dark glass UI with an
orange ↔ blue gradient identity, drifting blob background, and a slow-rotating
orbital logo.

## Layout

```
frontend/
├── index.html              Vite entry point (loads /src/main.tsx)
├── public/
│   └── icon.svg            Source of truth for the OMNI logo
├── src/
│   ├── main.tsx            React mount
│   ├── App.tsx             Header (logo + status + help + settings) + layout
│   ├── api.ts              fetch / WebSocket / voice helpers
│   ├── store.ts            Zustand store
│   ├── styles.css          Tailwind + animated background + glass panel + scrollbar
│   └── components/         UI building blocks (Logo, Background, Sidebar,
│                           Dashboard, ChatPanel, StatusBar, PermissionToasts,
│                           OnboardingTour, SettingsModal, Tooltip)
├── src-tauri/              Rust shell, tray, sidecar, generated icons
├── tailwind.config.js      Theme — colours, gradients, animations, keyframes
├── postcss.config.js
├── tsconfig.json / tsconfig.node.json
├── vite.config.ts
├── package.json
└── package-lock.json
```

Each folder has its own README — open them for the per-directory map.

## Run

```powershell
# From repo root:
.\run-dev.ps1
# or, just the UI (assumes the backend is already up):
cd frontend
npm install   # first time only
npm run tauri dev
```

## Theming

The full theme lives in `tailwind.config.js`:

- **Accents** — `omni.accent` (electric blue `#3aa9ff`), `omni.accent2`
  (warm orange `#ff8a3d`).
- **Gradients** — `bg-omni-gradient`, `bg-omni-gradient-strong`,
  `bg-omni-gradient-text`.
- **Animations** — `animate-spin-slow`, `animate-blob-a/b/c`,
  `animate-gradient-shift`, `animate-pulse-slow`, `animate-float-slow`.
- **Glass** — every `.panel` uses `backdrop-blur-xl`, a soft inset highlight,
  and a 1px white/10 border. `.ring-gradient` adds a 1px gradient border.

## Voice mode

`ChatPanel.tsx` records via `MediaRecorder` (WebM/Opus), converts to 16 kHz
mono PCM WAV in the browser via `OfflineAudioContext`, then POSTs the WAV
blob to `/voice/transcribe`. The transcript is sent to `/chat`, and the
assistant reply is auto-spoken via `/voice/speak` (toggle in the chat header
or in **Settings → Voice → Auto-speak**).

## Settings → Personality

Edit name / tone / humor / verbosity / how-to-address / custom instructions,
hit Save, and OMNI rebuilds its system prompt on the next chat call. No
restart needed.

## Tray

The tray menu is built in `src-tauri/src/lib.rs`:
*Open OMNI*, *Pause*, *Resume*, *Emergency stop*, *Quit*. Closing the main
window hides it instead of quitting; the tray keeps the agent alive.
