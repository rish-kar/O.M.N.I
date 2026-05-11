/**
 * Smoky animated backdrop. Layers (back to front):
 *   1. Conic light sweep slowly rotating around centre.
 *   2. 8 drifting blurred radial gradients (the "smoke clouds") tinted with
 *      midnight blue, royal blue, blood red, crimson, and pinkish glow.
 *   3. 6 vertical "smoke-rising" plumes drifting upward.
 *   4. SVG turbulence noise grain (analog smoke texture).
 *   5. Horizontal scan band slowly drifting top-to-bottom.
 *   6. Film-grain scan lines + edge vignette.
 *
 * Honors prefers-reduced-motion (animations are killed).
 */
export default function Background() {
  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter id="omni-noise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="2"
              stitchTiles="stitch"
              seed="3"
            />
            <feColorMatrix
              values="0 0 0 0 0.55
                      0 0 0 0 0.40
                      0 0 0 0 0.45
                      0 0 0 0.13 0"
            />
          </filter>
        </defs>
      </svg>

      <div className="omni-bg" aria-hidden>
        <div className="conic" />

        {/* Smoke clouds */}
        <div className="smoke royal   smoke-1" />
        <div className="smoke crimson smoke-2" />
        <div className="smoke blue    smoke-3" />
        <div className="smoke ember   smoke-4" />
        <div className="smoke blue    smoke-5" />
        <div className="smoke blood   smoke-6" />
        <div className="smoke glow    smoke-7" />
        <div className="smoke crimson smoke-8" />

        {/* Vertical rising plumes */}
        <div className="streak s1" />
        <div className="streak s2" />
        <div className="streak s3" />
        <div className="streak s4" />
        <div className="streak s5" />
        <div className="streak s6" />

        <div className="scan-band" />
        <div className="grain" />
        <div className="scan" />
        <div className="vignette" />
      </div>
    </>
  );
}
