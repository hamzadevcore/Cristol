import { useApp } from '../context/AppContext';

export function CRTOverlay() {
  const { state } = useApp();
  const { crtEffects, scanlines, fishbowlIntensity, flickerEnabled } = state.settings;

  if (!crtEffects) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 rounded-[inherit] overflow-hidden">
      {/* Scanlines */}
      {scanlines && (
        <div
          className="absolute inset-0 z-50"
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.3) 2px,
              rgba(0, 0, 0, 0.3) 4px
            )`,
            backgroundSize: '100% 4px'
          }}
        />
      )}

      {/* Vignette */}
      <div
        className="absolute inset-0 z-50"
        style={{
          background: `radial-gradient(
            circle at center,
            transparent 50%,
            rgba(0, 0, 0, 0.4) 100%
          )`,
        }}
      />

      {/* Screen flicker (Safe opacity) */}
      {flickerEnabled && (
        <div
          className="absolute inset-0 z-50 animate-flicker-overlay"
          style={{ background: 'rgba(255, 255, 255, 0.02)' }}
        />
      )}

      {/* Fishbowl curvature shadow */}
      {fishbowlIntensity > 0 && (
        <div
          className="absolute inset-0 z-40"
          style={{
            boxShadow: `inset 0 0 ${100 * fishbowlIntensity}px rgba(0, 0, 0, 0.9)`,
          }}
        />
      )}

      {/* RGB split edge effect */}
      <div
        className="absolute inset-0 z-50 opacity-10"
        style={{
          background: `
            linear-gradient(90deg, rgba(255, 0, 0, 0.2) 0%, transparent 2%, transparent 98%, rgba(0, 0, 255, 0.2) 100%)
          `,
        }}
      />
    </div>
  );
}