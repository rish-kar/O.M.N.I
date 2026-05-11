type Props = { size?: number; animated?: boolean; className?: string };

/**
 * OMNI logo. Angular Decepticon-inspired AI-mind face:
 *   - Sharp helmet silhouette with two top horns and a pointed jaw.
 *   - Dark inner mask cavity giving the face depth.
 *   - Central horizontal "visor eye" (the AI consciousness) lit in crimson.
 *   - Painted with the project's midnight blue → crimson gradient.
 *
 * `animated` = the visor pulses / outer halo rotates gently.
 */
export default function Logo({ size = 36, animated = true, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="OMNI logo"
    >
      <defs>
        <linearGradient id="omni-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"  stopColor="#5ba3f5" />
          <stop offset="55%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#b91c1c" />
        </linearGradient>
        <linearGradient id="omni-eye" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#fca5a5" />
          <stop offset="50%"  stopColor="#dc2626" />
          <stop offset="100%" stopColor="#fca5a5" />
        </linearGradient>
        <radialGradient id="omni-halo" cx="50%" cy="40%" r="60%">
          <stop offset="0%"   stopColor="#dc2626" stopOpacity="0.55" />
          <stop offset="45%"  stopColor="#3b82f6" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <filter id="omni-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Halo behind the face */}
      <circle cx="32" cy="32" r="30" fill="url(#omni-halo)" />

      {/* Outer angular helmet silhouette - sharp horns top, pointed jaw bottom */}
      <path
        d="
          M 6 18
          L 16 8
          L 24 14
          L 32 4
          L 40 14
          L 48 8
          L 58 18
          L 52 30
          L 56 38
          L 44 42
          L 32 60
          L 20 42
          L 8 38
          L 12 30
          Z
        "
        fill="url(#omni-grad)"
        filter="url(#omni-glow)"
      />

      {/* Inner mask cavity (creates the dark face depth) */}
      <path
        d="
          M 14 22
          L 22 18
          L 32 14
          L 42 18
          L 50 22
          L 46 32
          L 32 50
          L 18 32
          Z
        "
        fill="#03060e"
        fillOpacity="0.65"
      />

      {/* Brow notch above the eye */}
      <path
        d="M 24 22 L 32 18 L 40 22 L 38 25 L 32 22 L 26 25 Z"
        fill="url(#omni-grad)"
        opacity="0.85"
      />

      {/* Central visor "eye" line */}
      <g className={animated ? "animate-pulse-slow" : ""}>
        <rect
          x="20" y="27.5" width="24" height="3.5" rx="1.5"
          fill="url(#omni-eye)"
          filter="url(#omni-glow)"
        />
        <rect x="22" y="28.5" width="20" height="1.5" fill="#fff" fillOpacity="0.65" />
      </g>

      {/* Angular cheek accents */}
      <path d="M 14 36 L 22 38 L 20 42 L 12 40 Z" fill="url(#omni-grad)" opacity="0.55" />
      <path d="M 50 36 L 42 38 L 44 42 L 52 40 Z" fill="url(#omni-grad)" opacity="0.55" />

      {/* Lower jaw V */}
      <path d="M 26 46 L 32 56 L 38 46 L 32 50 Z" fill="#03060e" fillOpacity="0.55" />
    </svg>
  );
}
