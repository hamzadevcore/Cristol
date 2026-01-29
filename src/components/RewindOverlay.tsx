import { useEffect, useState } from 'react';
import { useSound } from '../hooks/useSound';
import { useApp } from '../context/AppContext';
import { cn } from '../utils/cn';

interface RewindOverlayProps {
  isActive: boolean;
  onComplete: () => void;
  colorTheme: 'purple' | 'cyan' | 'green' | 'amber';
}

const themeColors = {
  purple: {
    primary: 'text-purple-400',
    secondary: 'text-purple-500',
    bg: 'bg-purple-500',
    bgOpacity: 'bg-purple-500/50',
    via: 'via-purple-500/50',
  },
  cyan: {
    primary: 'text-cyan-400',
    secondary: 'text-cyan-500',
    bg: 'bg-cyan-500',
    bgOpacity: 'bg-cyan-500/50',
    via: 'via-cyan-500/50',
  },
  green: {
    primary: 'text-green-400',
    secondary: 'text-green-500',
    bg: 'bg-green-500',
    bgOpacity: 'bg-green-500/50',
    via: 'via-green-500/50',
  },
  amber: {
    primary: 'text-amber-400',
    secondary: 'text-amber-500',
    bg: 'bg-amber-500',
    bgOpacity: 'bg-amber-500/50',
    via: 'via-amber-500/50',
  },
};

export function RewindOverlay({ isActive, onComplete, colorTheme }: RewindOverlayProps) {
  const { state } = useApp();
  const { playRewindSound, playStaticNoise } = useSound(state.settings.soundEnabled);
  const [phase, setPhase] = useState<'rewind' | 'static' | 'none'>('none');

  const colors = themeColors[colorTheme];

  useEffect(() => {
    if (isActive) {
      setPhase('rewind');
      playRewindSound();
      
      // VHS rewind phase
      const staticTimeout = setTimeout(() => {
        setPhase('static');
        playStaticNoise(0.5);
      }, 1200);

      // Complete
      const completeTimeout = setTimeout(() => {
        setPhase('none');
        onComplete();
      }, 1700);

      return () => {
        clearTimeout(staticTimeout);
        clearTimeout(completeTimeout);
      };
    }
  }, [isActive, onComplete, playRewindSound, playStaticNoise]);

  if (phase === 'none') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90">
      {phase === 'rewind' && (
        <>
          {/* VHS tracking lines effect */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Horizontal VHS distortion bars */}
            {[...Array(8)].map((_, i) => (
              <div
                key={`bar-${i}`}
                className={cn("absolute h-2 w-full opacity-60", colors.bgOpacity)}
                style={{
                  top: `${12 + i * 12}%`,
                  animation: `vhs-bar 0.15s linear infinite`,
                  animationDelay: `${i * 0.02}s`,
                  transform: `translateX(${Math.sin(i) * 20}px)`,
                }}
              />
            ))}
            
            {/* Fast moving scan lines */}
            {[...Array(20)].map((_, i) => (
              <div
                key={`line-${i}`}
                className={cn(
                  "absolute h-0.5 w-full",
                  "bg-gradient-to-r from-transparent",
                  colors.via,
                  "to-transparent animate-vhs-line"
                )}
                style={{
                  top: `${(i * 5) + Math.random() * 10}%`,
                  animationDelay: `${i * 0.05}s`,
                  animationDuration: '0.3s',
                }}
              />
            ))}
          </div>
          
          {/* Rewind icon - large VHS style */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className={cn("flex items-center gap-1 animate-pulse", colors.primary)}>
              {/* Double rewind arrows */}
              <svg className="w-20 h-20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
              </svg>
              <svg className="w-20 h-20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
              </svg>
            </div>
            
            {/* VHS style counter */}
            <div className={cn(
              "font-mono text-3xl tracking-[0.3em] animate-blink",
              colors.primary
            )}>
              ◄◄ REW ◄◄
            </div>
            
            {/* VHS timestamp style */}
            <div className="font-mono text-sm text-gray-500 tracking-widest">
              --:--:--
            </div>
          </div>

          {/* Screen distortion - horizontal shift */}
          <div 
            className="absolute inset-0 animate-screen-shake opacity-30 pointer-events-none"
            style={{ 
              background: `repeating-linear-gradient(
                0deg, 
                transparent, 
                transparent 2px, 
                rgba(128, 90, 213, 0.05) 2px, 
                rgba(128, 90, 213, 0.05) 4px
              )` 
            }} 
          />
          
          {/* Color aberration effect */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-red-500/5 animate-glitch-r" />
            <div className="absolute inset-0 bg-blue-500/5 animate-glitch-b" />
          </div>
        </>
      )}

      {phase === 'static' && (
        <div className="absolute inset-0 animate-static-noise">
          {/* TV static noise */}
          <div 
            className="w-full h-full opacity-80"
            style={{
              background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />
          {/* Colored tint over static */}
          <div className={cn("absolute inset-0 opacity-20", colors.bg)} />
        </div>
      )}
    </div>
  );
}
