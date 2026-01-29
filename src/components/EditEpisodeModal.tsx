import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api, Episode } from '../services/api';
import { cn } from '../utils/cn';

interface EditEpisodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  episode: Episode;
}

export function EditEpisodeModal({ isOpen, onClose, episode }: EditEpisodeModalProps) {
  const { state, dispatch } = useApp();
  const [name, setName] = useState(episode.name);
  const [description, setDescription] = useState(episode.description);
  const [context, setContext] = useState(episode.context);
  const [loading, setLoading] = useState(false);

  // Reset fields when the episode changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(episode.name);
      setDescription(episode.description);
      setContext(episode.context);
    }
  }, [isOpen, episode]);

  const textColor = state.settings.colorTheme === 'purple' ? 'text-purple-400' :
                   state.settings.colorTheme === 'cyan' ? 'text-cyan-400' :
                   state.settings.colorTheme === 'green' ? 'text-green-400' : 'text-amber-400';

  const borderColor = state.settings.colorTheme === 'purple' ? 'border-purple-500' :
                     state.settings.colorTheme === 'cyan' ? 'border-cyan-500' :
                     state.settings.colorTheme === 'green' ? 'border-green-500' : 'border-amber-500';

  const handleUpdate = async () => {
    if (!name || !context) return;
    setLoading(true);
    try {
      const updatedEpisode = await api.updateEpisode(episode.id, {
        name,
        description,
        context
      });
      dispatch({ type: 'UPDATE_EPISODE', payload: updatedEpisode });
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
      <div className={cn("relative w-full max-w-2xl bg-gray-950 border-2 p-6 space-y-4 max-h-[90vh] flex flex-col", borderColor)}>
        <h2 className={cn("text-lg font-bold tracking-wider mb-2", textColor)}>◈ EDIT SCENARIO</h2>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500">NAME</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-black/50 border border-gray-700 p-2 text-gray-300 focus:border-cyan-500 outline-none"
            placeholder="Episode Name"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500">DESCRIPTION (Short)</label>
          <input
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full bg-black/50 border border-gray-700 p-2 text-gray-300 focus:border-cyan-500 outline-none"
            placeholder="Brief summary..."
          />
        </div>

        <div className="space-y-2 flex-1 flex flex-col">
          <label className="text-xs font-bold text-gray-500">CONTEXT (Script / Prompt)</label>
          <textarea
            value={context} onChange={e => setContext(e.target.value)}
            className="flex-1 min-h-[300px] w-full bg-black/50 border border-gray-700 p-2 text-gray-300 focus:border-cyan-500 outline-none resize-none font-mono text-xs leading-relaxed"
            placeholder="Paste your full transcript or prompt here..."
          />
        </div>

        <div className="flex gap-2 pt-4">
          <button
            onClick={handleUpdate} disabled={loading}
            className={cn("flex-1 py-2 border font-bold hover:bg-white/10", borderColor, textColor)}
          >
            {loading ? 'SAVING...' : 'SAVE CHANGES'}
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