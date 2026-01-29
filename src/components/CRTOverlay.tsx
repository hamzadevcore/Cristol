import { useApp } from '../context/AppContext';

export function CRTOverlay() {
  const { state } = useApp();
  const { crtEffects, scanlines, fishbowlIntensity, flickerEnabled } = state.settings;

  if (!crtEffects) return null;

  return (
    <>
      {/* Scanlines */}
      {scanlines && (
        <div
          className="pointer-events-none fixed inset-0 z-50"
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.15) 2px,
              rgba(0, 0, 0, 0.15) 4px
            )`,
          }}
        />
      )}
      
      {/* CRT vignette and glow */}
      <div
        className="pointer-events-none fixed inset-0 z-50"
        style={{
          background: `radial-gradient(
            ellipse at center,
            transparent 0%,
            transparent 60%,
            rgba(0, 0, 0, 0.4) 100%
          )`,
        }}
      />

      {/* Screen flicker */}
      {flickerEnabled && (
        <div
          className="pointer-events-none fixed inset-0 z-50 animate-flicker opacity-[0.02]"
          style={{ background: 'white' }}
        />
      )}

      {/* Fishbowl curvature overlay */}
      {fishbowlIntensity > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-40"
          style={{
            boxShadow: `inset 0 0 ${100 * fishbowlIntensity}px ${50 * fishbowlIntensity}px rgba(0, 0, 0, 0.5)`,
            borderRadius: `${20 * fishbowlIntensity}%`,
          }}
        />
      )}

      {/* RGB split effect on edges */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-30"
        style={{
          background: `
            linear-gradient(90deg, rgba(255, 0, 0, 0.1) 0%, transparent 3%, transparent 97%, rgba(0, 0, 255, 0.1) 100%)
          `,
        }}
      />

      {/* VHS tracking lines - subtle */}
      <div className="pointer-events-none fixed inset-0 z-50 animate-vhs-tracking opacity-[0.03]" />
    </>
  );
}
