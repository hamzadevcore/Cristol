import { useEffect, useState } from 'react';
import { useSound } from '../hooks/useSound';
import { useApp } from '../context/AppContext';
import { cn } from '../utils/cn';

interface RegenerateOverlayProps {
  isActive: boolean;
  onComplete: () => void;
  colorTheme: 'purple' | 'cyan' | 'green' | 'amber';
}

const themeColors = {
  purple: {
    primary: 'text-purple-400',
    border: 'border-purple-400',
    bg: 'bg-purple-500',
    bgOpacity: 'bg-purple-500/30',
  },
  cyan: {
    primary: 'text-cyan-400',
    border: 'border-cyan-400',
    bg: 'bg-cyan-500',
    bgOpacity: 'bg-cyan-500/30',
  },
  green: {
    primary: 'text-green-400',
    border: 'border-green-400',
    bg: 'bg-green-500',
    bgOpacity: 'bg-green-500/30',
  },
  amber: {
    primary: 'text-amber-400',
    border: 'border-amber-400',
    bg: 'bg-amber-500',
    bgOpacity: 'bg-amber-500/30',
  },
};

export function RegenerateOverlay({ isActive, onComplete, colorTheme }: RegenerateOverlayProps) {
  const { state } = useApp();
  const { playGlitchSound, playStaticNoise } = useSound(state.settings.soundEnabled);
  const [phase, setPhase] = useState<'glitch' | 'static' | 'reset' | 'none'>('none');

  const colors = themeColors[colorTheme];

  useEffect(() => {
    if (isActive) {
      setPhase('glitch');
      playGlitchSound();
      
      const staticTimeout = setTimeout(() => {
        setPhase('static');
        playStaticNoise(0.3);
      }, 400);

      const resetTimeout = setTimeout(() => {
        setPhase('reset');
      }, 700);

      const completeTimeout = setTimeout(() => {
        setPhase('none');
        onComplete();
      }, 1000);

      return () => {
        clearTimeout(staticTimeout);
        clearTimeout(resetTimeout);
        clearTimeout(completeTimeout);
      };
    }
  }, [isActive, onComplete, playGlitchSound, playStaticNoise]);

  if (phase === 'none') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
      {phase === 'glitch' && (
        <>
          {/* RGB split glitch effect with theme colors */}
          <div className="absolute inset-0 overflow-hidden">
            <div className={cn("absolute inset-0 opacity-20 animate-glitch-r", colors.bg)} />
            <div className="absolute inset-0 bg-blue-500/20 animate-glitch-b" style={{ animationDelay: '0.05s' }} />
          </div>
          
          {/* Glitch blocks with theme color */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className={cn("absolute animate-glitch-block", colors.bgOpacity)}
              style={{
                width: `${15 + Math.random() * 35}%`,
                height: `${2 + Math.random() * 6}%`,
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 80}%`,
                animationDelay: `${Math.random() * 0.2}s`,
              }}
            />
          ))}
          
          {/* Digital corruption text */}
          <div className={cn("relative z-10 font-mono text-2xl tracking-widest animate-blink", colors.primary)}>
            ██ RESET ██
          </div>
        </>
      )}

      {phase === 'static' && (
        <div className="absolute inset-0 animate-static-noise">
          <div 
            className="w-full h-full opacity-90"
            style={{
              background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />
          {/* Theme-colored tint over static */}
          <div className={cn("absolute inset-0 opacity-20", colors.bg)} />
        </div>
      )}

      {phase === 'reset' && (
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          {/* Spinning refresh icon with theme colors */}
          <div className={cn(
            "w-20 h-20 border-4 rounded-full flex items-center justify-center animate-spin-slow",
            colors.border
          )}>
            <svg className={cn("w-10 h-10", colors.primary)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </div>
          <div className={cn("font-mono text-xl tracking-widest", colors.primary)}>
            REGENERATING...
          </div>
        </div>
      )}
    </div>
  );
}
