import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Settings } from '../types';
import { cn } from '../utils/cn';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { state, dispatch } = useApp();
  const [localSettings, setLocalSettings] = useState<Settings>(state.settings);

  useEffect(() => { if (isOpen) setLocalSettings(state.settings); }, [isOpen, state.settings]);

  if (!isOpen) return null;

  const colorOptions: { value: Settings['colorTheme']; label: string; class: string }[] = [
    { value: 'purple', label: 'PURPLE', class: 'bg-purple-600' },
    { value: 'cyan', label: 'CYAN', class: 'bg-cyan-600' },
    { value: 'green', label: 'GREEN', class: 'bg-green-600' },
    { value: 'amber', label: 'AMBER', class: 'bg-amber-600' },
    { value: 'hell', label: 'HELL', class: 'bg-[#ff0000] shadow-[0_0_10px_red]' },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-950 border-2 border-gray-700 p-6 space-y-6 text-gray-300 shadow-2xl">
        <h2 className="text-xl font-bold tracking-wider border-b border-gray-800 pb-2">SETTINGS</h2>

        <div className="space-y-4">
            <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">COLOR THEME</label>
                <div className="flex gap-2">
                    {colorOptions.map(c => (
                        <button
                            key={c.value}
                            onClick={() => setLocalSettings({...localSettings, colorTheme: c.value})}
                            className={cn("h-10 flex-1 border border-gray-800 transition-all", c.class, localSettings.colorTheme === c.value ? "ring-2 ring-white scale-105 opacity-100" : "opacity-40 hover:opacity-80")}
                        />
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-4">
                <label className="flex items-center justify-between cursor-pointer col-span-2 bg-white/5 p-2 rounded">
                    <span className="text-sm font-bold">Enable Visual Effects (CRT)</span>
                    <input type="checkbox" checked={localSettings.crtEffects} onChange={e => setLocalSettings({...localSettings, crtEffects: e.target.checked})} className="accent-gray-500 scale-125" />
                </label>

                <label className="flex items-center justify-between cursor-pointer bg-white/5 p-2 rounded">
                    <span className="text-sm">3D Perspective</span>
                    <input
                      type="checkbox"
                      checked={localSettings.enablePerspective}
                      onChange={e => setLocalSettings({...localSettings, enablePerspective: e.target.checked})}
                      disabled={!localSettings.crtEffects}
                      className="accent-gray-500 scale-125 disabled:opacity-50"
                    />
                </label>

                <label className="flex items-center justify-between cursor-pointer bg-white/5 p-2 rounded">
                    <span className="text-sm">Scanlines</span>
                    <input type="checkbox" checked={localSettings.scanlines} onChange={e => setLocalSettings({...localSettings, scanlines: e.target.checked})} disabled={!localSettings.crtEffects} className="accent-gray-500 scale-125 disabled:opacity-50" />
                </label>
            </div>

            <div className={cn("transition-opacity", !localSettings.crtEffects && "opacity-30 pointer-events-none")}>
                 <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>FISHBOWL INTENSITY</span>
                    <span>{(localSettings.fishbowlIntensity * 100).toFixed(0)}%</span>
                 </div>
                 <input type="range" min="0" max="0.5" step="0.05" value={localSettings.fishbowlIntensity} onChange={e => setLocalSettings({...localSettings, fishbowlIntensity: parseFloat(e.target.value)})} className="w-full" />
            </div>

            <div className="pt-2 border-t border-gray-800">
                <label className="text-xs font-bold text-gray-500 mb-1 block">CHAT MODEL ID</label>
                <input value={localSettings.model} onChange={e => setLocalSettings({...localSettings, model: e.target.value})} className="w-full bg-black/50 border border-gray-700 p-2 text-sm font-mono text-gray-400" />
            </div>
        </div>

        <div className="flex gap-2 pt-4">
            <button onClick={() => { dispatch({type: 'UPDATE_SETTINGS', payload: localSettings}); onClose(); }} className="flex-1 py-3 bg-white/10 hover:bg-white/20 font-bold border border-white/10">SAVE CHANGES</button>
            <button onClick={onClose} className="flex-1 py-3 border border-gray-700 text-gray-500 hover:text-white">CANCEL</button>
        </div>
      </div>
    </div>
  );
}