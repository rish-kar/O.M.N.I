/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette: midnight blue + crimson red + black + smoke
        omni: {
          // Black + smoke (canvas)
          void:     "#03060e",
          black:    "#070a14",
          smoke:    "#0b101c",
          smoke2:   "#11172a",
          ash:      "#181f36",
          fog:      "#252e4a",
          mist:     "#363f5f",

          // Midnight blue (cool)
          midnight: "#0a1633",
          navy:     "#0f2147",
          royal:    "#15346e",
          blue:     "#1e4a9e",
          ice:      "#5ba3f5",

          // Crimson (warm)
          blood:    "#7f1d1d",     // deepest red
          crimson:  "#b91c1c",
          ember:    "#dc2626",     // primary crimson accent
          flame:    "#ef4444",     // hover / brighter
          glow:     "#fca5a5",     // pinky highlight

          // Status (functional)
          ok:       "#10b981",
          warn:     "#f59e0b",
          danger:   "#ef4444",

          // Text
          text:     "#f1f5f9",
          textDim:  "#cbd5e1",
          mute:     "#7a8499",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        // Signature gradient: midnight → crimson
        "fire":          "linear-gradient(135deg, #0f2147 0%, #15346e 35%, #b91c1c 100%)",
        "fire-strong":   "linear-gradient(135deg, #15346e 0%, #b91c1c 50%, #dc2626 100%)",
        "fire-soft":     "linear-gradient(135deg, rgba(91,163,245,0.14) 0%, rgba(220,38,38,0.16) 100%)",
        "fire-text":     "linear-gradient(135deg, #5ba3f5 0%, #fca5a5 100%)",
        "smoke-fade":    "linear-gradient(180deg, rgba(17,23,42,0) 0%, rgba(7,10,20,0.85) 100%)",
      },
      boxShadow: {
        "ice":     "0 0 28px rgba(91, 163, 245, 0.30)",
        "ember":   "0 0 28px rgba(220, 38, 38, 0.40)",
        "fire":    "0 0 36px rgba(91, 163, 245, 0.18), 0 0 36px rgba(220, 38, 38, 0.30)",
        "glass":   "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 12px 36px rgba(0, 0, 0, 0.55)",
        "glass-hi":"inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 16px 50px rgba(0, 0, 0, 0.6)",
      },
      animation: {
        "spin-slow":    "spin 28s linear infinite",
        "spin-fast":    "spin 9s linear infinite",
        "drift-1":      "drift-1 28s ease-in-out infinite",
        "drift-2":      "drift-2 36s ease-in-out infinite",
        "drift-3":      "drift-3 32s ease-in-out infinite",
        "drift-4":      "drift-4 40s ease-in-out infinite",
        "drift-5":      "drift-5 26s ease-in-out infinite",
        "drift-6":      "drift-6 44s ease-in-out infinite",
        "smoke-rise":   "smoke-rise 24s linear infinite",
        "shimmer":      "shimmer 12s linear infinite",
        "pulse-slow":   "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "fade-in":      "fade-in 0.25s ease-out",
        "scan-line":    "scan-line 8s linear infinite",
      },
      keyframes: {
        "drift-1": {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "33%":     { transform: "translate(8%, -10%) scale(1.15)" },
          "66%":     { transform: "translate(-6%, 8%) scale(0.92)" },
        },
        "drift-2": {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%":     { transform: "translate(-12%, 12%) scale(1.20)" },
        },
        "drift-3": {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "33%":     { transform: "translate(12%, 6%) scale(0.90)" },
          "66%":     { transform: "translate(-8%, -10%) scale(1.10)" },
        },
        "drift-4": {
          "0%,100%": { transform: "translate(0,0) scale(1) rotate(0)" },
          "50%":     { transform: "translate(6%, -10%) scale(1.18) rotate(20deg)" },
        },
        "drift-5": {
          "0%,100%": { transform: "translate(0, 0) scale(1)" },
          "50%":     { transform: "translate(-8%, -6%) scale(1.12)" },
        },
        "drift-6": {
          "0%,100%": { transform: "translate(0, 0) scale(1) rotate(0)" },
          "50%":     { transform: "translate(10%, 8%) scale(0.95) rotate(-15deg)" },
        },
        "smoke-rise": {
          "0%":   { transform: "translateY(40%) translateX(0%)", opacity: "0.0" },
          "20%":  { opacity: "0.55" },
          "85%":  { opacity: "0.40" },
          "100%": { transform: "translateY(-50%) translateX(6%)", opacity: "0.0" },
        },
        "shimmer": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%":     { backgroundPosition: "100% 50%" },
        },
        "fade-in": {
          "from": { opacity: "0", transform: "translateY(4px)" },
          "to":   { opacity: "1", transform: "translateY(0)" },
        },
        "scan-line": {
          "0%":   { transform: "translateY(-20%)" },
          "100%": { transform: "translateY(120%)" },
        },
      },
    },
  },
  plugins: [],
};
