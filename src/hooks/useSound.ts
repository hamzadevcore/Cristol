import { useCallback, useRef } from 'react';

// Generate sounds using Web Audio API for authentic VHS/CRT feel
export function useSound(enabled: boolean) {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const playStaticNoise = useCallback((duration: number = 0.3) => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.15;
    }
    
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3000;
    
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(ctx.destination);
    source.start();
  }, [enabled, getAudioContext]);

  const playRewindSound = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const duration = 1.5;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // VHS rewind sound - fast tape whirr
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const freq = 200 + Math.sin(t * 50) * 100;
      data[i] = Math.sin(t * freq * Math.PI * 2) * 0.1 * (1 - t / duration);
      data[i] += (Math.random() * 2 - 1) * 0.05;
    }
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }, [enabled, getAudioContext]);

  const playGlitchSound = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const duration = 0.5;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      // Bitcrushed glitch
      data[i] = Math.floor((Math.random() * 2 - 1) * 8) / 8 * 0.2 * (1 - t / duration);
    }
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }, [enabled, getAudioContext]);

  const playKeyClick = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = 'square';
    oscillator.frequency.value = 1200;
    gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.05);
  }, [enabled, getAudioContext]);

  const playMessageSent = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.001, ctx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.1);
  }, [enabled, getAudioContext]);

  return {
    playStaticNoise,
    playRewindSound,
    playGlitchSound,
    playKeyClick,
    playMessageSent
  };
}
