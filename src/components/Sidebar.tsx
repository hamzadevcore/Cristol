import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, Episode } from '../services/api';
import { cn } from '../utils/cn';
import { CreateEpisodeModal } from './CreateEpisodeModal';
import { EditEpisodeModal } from './EditEpisodeModal';

export function Sidebar() {
  const { state, dispatch } = useApp();
  const [editingLore, setEditingLore] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [tempLore, setTempLore] = useState(state.lore);
  const [tempProfile, setTempProfile] = useState(state.profile);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);

  const accentColor = {
    purple: 'border-purple-500 text-purple-400 bg-purple-500/10',
    cyan: 'border-cyan-500 text-cyan-400 bg-cyan-500/10',
    green: 'border-green-500 text-green-400 bg-green-500/10',
    amber: 'border-amber-500 text-amber-400 bg-amber-500/10',
  }[state.settings.colorTheme];

  const handleDeleteEpisode = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this scenario?')) {
      await api.deleteEpisode(id);
      dispatch({ type: 'REMOVE_EPISODE', payload: id });
      if (state.currentEpisode?.id === id) {
        dispatch({ type: 'SET_CURRENT_EPISODE', payload: null });
      }
    }
  };

  const handleEditClick = (e: React.MouseEvent, episode: Episode) => {
    e.stopPropagation();
    setEditingEpisode(episode);
  };

  const panels = [
    { id: 'episodes', label: '◈ EPISODES' },
    { id: 'archive', label: '◈ ARCHIVE' },
    { id: 'lore', label: '◈ LORE' },
    { id: 'profile', label: '◈ PROFILE' },
  ] as const;

  return (
    <div className="w-72 h-full bg-gray-950/80 border-r-2 border-gray-700 flex flex-col overflow-hidden">
      <CreateEpisodeModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      {editingEpisode && (
        <EditEpisodeModal
          isOpen={true}
          onClose={() => setEditingEpisode(null)}
          episode={editingEpisode}
        />
      )}

      {/* Header */}
      <div className={cn("p-4 border-b-2 border-gray-700", accentColor)}>
        <div className="text-center">
          <div className="text-xs tracking-[0.3em] opacity-70">▣ SYSTEM</div>
          <div className="text-lg font-bold tracking-wider mt-1">LOREKEEPER</div>
          <div className="text-xs tracking-[0.2em] opacity-50">TERMINAL v1.0</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-800">
        {panels.map((panel) => (
          <button
            key={panel.id}
            onClick={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: panel.id })}
            className={cn(
              "flex-1 min-w-[45%] px-2 py-1.5 text-xs font-mono transition-all border",
              state.activePanel === panel.id ? accentColor : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500"
            )}
          >
            {panel.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {state.activePanel === 'episodes' && (
          <div className="space-y-2">
            <button
              onClick={() => setIsCreateOpen(true)}
              className={cn("w-full py-2 mb-3 border text-xs font-bold tracking-wider hover:bg-white/5 transition-colors", accentColor)}
            >
              + NEW SCENARIO
            </button>
            {state.episodes.map((episode) => (
              <div
                key={episode.id}
                onClick={() => dispatch({ type: 'SET_CURRENT_EPISODE', payload: episode })}
                className={cn(
                  "relative group w-full text-left p-3 border transition-all cursor-pointer",
                  state.currentEpisode?.id === episode.id ? accentColor : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                )}
              >
                <div className="font-bold text-sm pr-12">{episode.name}</div>
                <div className="text-xs opacity-60 mt-1 line-clamp-2">{episode.description}</div>

                {/* Actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleEditClick(e, episode)}
                    className="text-gray-500 hover:text-white"
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => handleDeleteEpisode(e, episode.id)}
                    className="text-red-500 hover:text-red-300"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {state.activePanel === 'archive' && (
          <div className="space-y-2">
            {state.archive.map((session) => (
              <div key={session.id} className="p-3 border border-gray-700 hover:border-gray-500 transition-all group">
                <div className="font-bold text-sm text-gray-300">{session.episodeName}</div>
                <div className="text-xs text-gray-500 mt-1 line-clamp-2">{session.summary}</div>
                <button
                  onClick={() => dispatch({ type: 'DELETE_FROM_ARCHIVE', payload: session.id })}
                  className="text-xs text-red-500 hover:text-red-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕ DELETE
                </button>
              </div>
            ))}
          </div>
        )}

        {state.activePanel === 'lore' && (
          <div>
            {editingLore ? (
              <div className="space-y-2">
                <textarea
                  value={tempLore}
                  onChange={(e) => setTempLore(e.target.value)}
                  className="w-full h-64 bg-black/50 border border-gray-700 text-gray-300 p-2 text-xs font-mono resize-none focus:outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => { dispatch({ type: 'UPDATE_LORE', payload: tempLore }); api.updateLore(tempLore); setEditingLore(false); }} className={cn("flex-1 py-1 text-xs border", accentColor)}>SAVE</button>
                  <button onClick={() => { setTempLore(state.lore); setEditingLore(false); }} className="flex-1 py-1 text-xs border border-gray-600 text-gray-400">CANCEL</button>
                </div>
              </div>
            ) : (
              <div>
                <button onClick={() => setEditingLore(true)} className={cn("w-full py-1 mb-3 text-xs border", accentColor)}>✎ EDIT LORE</button>
                <div className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{state.lore}</div>
              </div>
            )}
          </div>
        )}

        {state.activePanel === 'profile' && (
          <div>
            {editingProfile ? (
              <div className="space-y-2">
                <textarea
                  value={tempProfile}
                  onChange={(e) => setTempProfile(e.target.value)}
                  className="w-full h-64 bg-black/50 border border-gray-700 text-gray-300 p-2 text-xs font-mono resize-none focus:outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => { dispatch({ type: 'UPDATE_PROFILE', payload: tempProfile }); api.updateProfile(tempProfile); setEditingProfile(false); }} className={cn("flex-1 py-1 text-xs border", accentColor)}>SAVE</button>
                  <button onClick={() => { setTempProfile(state.profile); setEditingProfile(false); }} className="flex-1 py-1 text-xs border border-gray-600 text-gray-400">CANCEL</button>
                </div>
              </div>
            ) : (
              <div>
                <button onClick={() => setEditingProfile(true)} className={cn("w-full py-1 mb-3 text-xs border", accentColor)}>✎ EDIT PROFILE</button>
                <div className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{state.profile}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}