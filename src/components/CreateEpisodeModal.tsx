import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { cn } from '../utils/cn';

interface CreateEpisodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateEpisodeModal({ isOpen, onClose }: CreateEpisodeModalProps) {
  const { state, dispatch } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);

  const textColor = state.settings.colorTheme === 'purple' ? 'text-purple-400' :
                   state.settings.colorTheme === 'cyan' ? 'text-cyan-400' :
                   state.settings.colorTheme === 'green' ? 'text-green-400' : 'text-amber-400';

  const borderColor = state.settings.colorTheme === 'purple' ? 'border-purple-500' :
                     state.settings.colorTheme === 'cyan' ? 'border-cyan-500' :
                     state.settings.colorTheme === 'green' ? 'border-green-500' : 'border-amber-500';

  const handleCreate = async () => {
    if (!name || !context) return;
    setLoading(true);
    try {
      const episode = await api.createEpisode(name, description, context);
      dispatch({ type: 'ADD_EPISODE', payload: episode });
      setName(''); setDescription(''); setContext('');
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full max-w-lg bg-gray-950 border-2 p-6 space-y-4", borderColor)}>
        <h2 className={cn("text-lg font-bold tracking-wider mb-4", textColor)}>◈ NEW SCENARIO</h2>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500">NAME</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-black/50 border border-gray-700 p-2 text-gray-300 focus:border-cyan-500 outline-none"
            placeholder="E.g. The Lost City"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500">DESCRIPTION (Short)</label>
          <input
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full bg-black/50 border border-gray-700 p-2 text-gray-300 focus:border-cyan-500 outline-none"
            placeholder="A brief summary..."
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500">CONTEXT (The AI Prompt)</label>
          <textarea
            value={context} onChange={e => setContext(e.target.value)}
            className="w-full h-32 bg-black/50 border border-gray-700 p-2 text-gray-300 focus:border-cyan-500 outline-none resize-none"
            placeholder="Describe the starting situation, environment, and immediate goal..."
          />
        </div>

        <div className="flex gap-2 pt-4">
          <button
            onClick={handleCreate} disabled={loading}
            className={cn("flex-1 py-2 border font-bold hover:bg-white/10", borderColor, textColor)}
          >
            {loading ? 'CREATING...' : 'CREATE SCENARIO'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}