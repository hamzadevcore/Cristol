import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { cn } from '../utils/cn';

interface FinishEpisodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FinishEpisodeModal({ isOpen, onClose }: FinishEpisodeModalProps) {
  const { state, dispatch } = useApp();
  const [phase, setPhase] = useState<'generating' | 'preview' | 'complete'>('generating');
  const [summary, setSummary] = useState('');
  const [archiveId, setArchiveId] = useState('');

  const textColor = state.settings.colorTheme === 'purple' ? 'text-purple-400' :
                   state.settings.colorTheme === 'cyan' ? 'text-cyan-400' :
                   state.settings.colorTheme === 'green' ? 'text-green-400' : 'text-amber-400';

  const borderColor = state.settings.colorTheme === 'purple' ? 'border-purple-500' :
                     state.settings.colorTheme === 'cyan' ? 'border-cyan-500' :
                     state.settings.colorTheme === 'green' ? 'border-green-500' : 'border-amber-500';

  useEffect(() => {
    if (isOpen) {
      setPhase('generating');
      setSummary('');
      generateSummary();
    }
  }, [isOpen]);

  const generateSummary = async () => {
    try {
      const response = await api.finishEpisode({
        episodeName: state.currentEpisode?.name || 'Unknown Episode',
        messages: state.messages,
        model: state.settings.model // Pass the custom model
      });

      setSummary(response.summary);
      setArchiveId(response.id || Date.now().toString());
      setPhase('preview');
    } catch (e) {
      console.error(e);
      setSummary("Error generating summary. Please try again.");
      setPhase('preview');
    }
  };

  const handleConfirmArchive = () => {
    dispatch({
      type: 'ADD_TO_ARCHIVE',
      payload: {
        id: archiveId,
        episodeName: state.currentEpisode?.name || 'Unknown Episode',
        summary,
        messages: state.messages,
        archivedAt: new Date().toISOString(),
      },
    });

    dispatch({ type: 'CLEAR_SESSION' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={phase !== 'generating' ? onClose : undefined}
      />

      <div className={cn("relative w-full max-w-lg bg-gray-950 border-2", borderColor)}>
        {/* Header */}
        <div className={cn("p-4 border-b border-gray-800", textColor)}>
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold tracking-wider">◈ FINISH EPISODE</div>
            {phase !== 'generating' && (
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl">✕</button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {phase === 'generating' && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin-slow mb-4">
                <svg className={cn("w-12 h-12", textColor)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="10" />
                </svg>
              </div>
              <div className={cn("text-lg tracking-wider", textColor)}>GENERATING SUMMARY</div>
              <div className="text-sm text-gray-500 mt-2 animate-pulse">Reading transcript...</div>
            </div>
          )}

          {phase === 'preview' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500 tracking-wider mb-2">EPISODE</div>
                <div className={cn("text-lg font-bold", textColor)}>{state.currentEpisode?.name}</div>
              </div>

              <div>
                <div className="text-xs text-gray-500 tracking-wider mb-2">AI SUMMARY</div>
                <div className="p-3 bg-black/50 border border-gray-800 text-gray-300 text-sm font-mono leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                  {summary}
                </div>
              </div>

              <div className="text-xs text-gray-600 text-center">
                {state.messages.length} messages will be archived
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'preview' && (
          <div className="p-4 border-t border-gray-800 flex gap-2">
            <button
              onClick={handleConfirmArchive}
              className={cn("flex-1 py-2 text-sm font-mono tracking-wider border", borderColor, textColor, "hover:bg-white/5")}
            >
              CONFIRM ARCHIVE
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 text-sm font-mono tracking-wider border border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
            >
              CANCEL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}