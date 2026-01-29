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

  // FIX: Update local state whenever the modal opens or global settings change
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(state.settings);
    }
  }, [isOpen, state.settings]);

  const textColor = state.settings.colorTheme === 'purple' ? 'text-purple-400' :
                   state.settings.colorTheme === 'cyan' ? 'text-cyan-400' :
                   state.settings.colorTheme === 'green' ? 'text-green-400' : 'text-amber-400';

  const borderColor = state.settings.colorTheme === 'purple' ? 'border-purple-500' :
                     state.settings.colorTheme === 'cyan' ? 'border-cyan-500' :
                     state.settings.colorTheme === 'green' ? 'border-green-500' : 'border-amber-500';

  if (!isOpen) return null;

  const handleSave = () => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: localSettings });
    onClose();
  };

  const colorOptions: { value: Settings['colorTheme']; label: string; class: string }[] = [
    { value: 'purple', label: 'PURPLE', class: 'bg-purple-500' },
    { value: 'cyan', label: 'CYAN', class: 'bg-cyan-500' },
    { value: 'green', label: 'GREEN', class: 'bg-green-500' },
    { value: 'amber', label: 'AMBER', class: 'bg-amber-500' },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={cn("relative w-full max-w-lg bg-gray-950 border-2", borderColor)}>
        <div className={cn("p-4 border-b border-gray-800", textColor)}>
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold tracking-wider">◈ SETTINGS</div>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl">✕</button>
          </div>
        </div>

        <div className="p-4 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-3">
            <div className={cn("text-sm font-bold tracking-wider", textColor)}>▸ OLLAMA MODEL</div>
            <input
              type="text"
              value={localSettings.model}
              onChange={(e) => setLocalSettings({ ...localSettings, model: e.target.value })}
              className="w-full bg-black/50 border border-gray-700 text-gray-300 p-2 text-sm font-mono focus:outline-none focus:border-cyan-500"
              placeholder="llama3.2"
            />
          </div>

          <div className="space-y-3">
            <div className={cn("text-sm font-bold tracking-wider", textColor)}>▸ SUMMARIZATION MODEL</div>
            <input
              type="text"
              value={localSettings.summarizationModel}
              onChange={(e) => setLocalSettings({ ...localSettings, summarizationModel: e.target.value })}
              className="w-full bg-black/50 border border-gray-700 text-gray-300 p-2 text-sm font-mono focus:outline-none focus:border-cyan-500"
              placeholder="llama3.2"
            />
          </div>

          <div className="space-y-3">
            <div className={cn("text-sm font-bold tracking-wider", textColor)}>▸ COLOR THEME</div>
            <div className="flex gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setLocalSettings({ ...localSettings, colorTheme: color.value })}
                  className={cn(
                    "flex-1 py-2 text-xs font-mono border transition-all",
                    localSettings.colorTheme === color.value
                      ? cn("border-white", color.class, "text-black font-bold")
                      : "border-gray-700 text-gray-500 hover:border-gray-500"
                  )}
                >
                  {color.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className={cn("text-sm font-bold tracking-wider", textColor)}>▸ CRT EFFECTS</div>
            <label className="flex items-center justify-between p-2 border border-gray-800 hover:border-gray-700 cursor-pointer">
              <span className="text-sm text-gray-400">Enable CRT Effects</span>
              <input type="checkbox" checked={localSettings.crtEffects} onChange={(e) => setLocalSettings({ ...localSettings, crtEffects: e.target.checked })} className="w-4 h-4 accent-cyan-500" />
            </label>
            <label className="flex items-center justify-between p-2 border border-gray-800 hover:border-gray-700 cursor-pointer">
              <span className="text-sm text-gray-400">Scanlines</span>
              <input type="checkbox" checked={localSettings.scanlines} onChange={(e) => setLocalSettings({ ...localSettings, scanlines: e.target.checked })} className="w-4 h-4 accent-cyan-500" />
            </label>
            <label className="flex items-center justify-between p-2 border border-gray-800 hover:border-gray-700 cursor-pointer">
              <span className="text-sm text-gray-400">Screen Flicker</span>
              <input type="checkbox" checked={localSettings.flickerEnabled} onChange={(e) => setLocalSettings({ ...localSettings, flickerEnabled: e.target.checked })} className="w-4 h-4 accent-cyan-500" />
            </label>
            <div className="p-2 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Fishbowl Intensity</span>
                <span className="text-xs text-gray-600 font-mono">{(localSettings.fishbowlIntensity * 100).toFixed(0)}%</span>
              </div>
              <input type="range" min="0" max="1" step="0.1" value={localSettings.fishbowlIntensity} onChange={(e) => setLocalSettings({ ...localSettings, fishbowlIntensity: parseFloat(e.target.value) })} className="w-full accent-cyan-500" />
            </div>
          </div>

          <div className="space-y-3">
            <div className={cn("text-sm font-bold tracking-wider", textColor)}>▸ AUDIO</div>
            <label className="flex items-center justify-between p-2 border border-gray-800 hover:border-gray-700 cursor-pointer">
              <span className="text-sm text-gray-400">Sound Effects</span>
              <input type="checkbox" checked={localSettings.soundEnabled} onChange={(e) => setLocalSettings({ ...localSettings, soundEnabled: e.target.checked })} className="w-4 h-4 accent-cyan-500" />
            </label>
          </div>
        </div>

        <div className="p-4 border-t border-gray-800 flex gap-2">
          <button onClick={handleSave} className={cn("flex-1 py-2 text-sm font-mono tracking-wider border", borderColor, textColor, "hover:bg-white/5")}>SAVE SETTINGS</button>
          <button onClick={onClose} className="flex-1 py-2 text-sm font-mono tracking-wider border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300">CANCEL</button>
        </div>
      </div>
    </div>
  );
}