import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { cn } from '../utils/cn';

interface FinishEpisodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FinishEpisodeModal({ isOpen, onClose }: FinishEpisodeModalProps) {
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState(false);

  if (!isOpen || !state.currentInstance) return null;

  const currentEp = state.currentInstance.episodes[state.currentInstance.currentEpisodeIndex];
  const isLast = state.currentInstance.currentEpisodeIndex >= state.currentInstance.episodes.length - 1;

  const handleAdvance = async () => {
    if (!state.currentInstance) return;
    setLoading(true);
    try {
        const res = await api.advanceInstance(state.currentInstance.id, state.messages, state.settings.model);
        if (res.success) {
            // Optimistic update
            const updated = { ...state.currentInstance };
            updated.currentEpisodeIndex += 1;
            updated.messages = [];
            updated.summaryHistory.push({
                episodeName: currentEp.name,
                summary: res.summary,
                timestamp: new Date().toISOString()
            });

            dispatch({ type: 'UPDATE_INSTANCE', payload: updated });
            onClose();
        }
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gray-950 border-2 border-red-900/50 p-6 space-y-6">
        <div className="text-center space-y-2">
            <div className="text-2xl font-bold tracking-widest text-red-500">EPISODE COMPLETE</div>
            <div className="text-gray-400">"{currentEp.name}"</div>
        </div>

        <div className="text-sm text-gray-500 text-center">
            {loading ? (
                <div className="animate-pulse">Analyzing session and generating summary...</div>
            ) : (
                isLast
                ? "This is the final episode. Advancing will mark the campaign as complete."
                : "Proceed to the next chapter? Current chat history will be summarized and cleared."
            )}
        </div>

        <div className="flex gap-2">
            <button
                onClick={handleAdvance}
                disabled={loading}
                className={cn("flex-1 py-3 font-bold text-sm tracking-wider bg-red-900/20 border border-red-600 text-red-500 hover:bg-red-600 hover:text-black transition-all", loading && "opacity-50")}
            >
                {loading ? 'PROCESSING...' : (isLast ? 'FINISH CAMPAIGN' : 'NEXT EPISODE ▶')}
            </button>
            <button onClick={onClose} disabled={loading} className="px-4 border border-gray-700 text-gray-500 hover:text-white">
                CANCEL
            </button>
        </div>
      </div>
    </div>
  );
}