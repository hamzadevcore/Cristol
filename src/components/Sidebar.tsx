import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { cn } from '../utils/cn';

export function Sidebar() {
  const { state, dispatch } = useApp();
  const [view, setView] = useState<'play' | 'shows'>('play');

  const handleStartInstance = async (showId: string) => {
    try {
      const instance = await api.createInstance(showId);
      dispatch({ type: 'ADD_INSTANCE', payload: instance });
      dispatch({ type: 'SET_CURRENT_INSTANCE', payload: instance });
      setView('play');
    } catch (e) { console.error(e); }
  };

  const handleDeleteInstance = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(confirm("Delete this save file?")) {
      await api.deleteInstance(id);
      dispatch({ type: 'REMOVE_INSTANCE', payload: id });
    }
  };

  const handleDeleteShow = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(confirm("Delete this blueprint?")) {
        await api.deleteShow(id);
        dispatch({ type: 'REMOVE_SHOW', payload: id });
    }
  };

  return (
    <div className="w-72 h-full bg-black/40 border-r border-[var(--border-color)] flex flex-col z-10 relative backdrop-blur-sm">

      {/* Header */}
      <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-tint)]">
        <div className="text-center">
          <div className="text-lg font-bold tracking-wider mt-1 text-[var(--glow-color)] text-theme-glow">LOREKEEPER</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border-color)]">
        <button onClick={() => setView('play')} className={cn("flex-1 py-3 text-xs font-bold transition-all", view === 'play' ? "bg-white/10 text-white" : "opacity-40 hover:opacity-100")}>
          SAVES
        </button>
        <button onClick={() => setView('shows')} className={cn("flex-1 py-3 text-xs font-bold transition-all", view === 'shows' ? "bg-white/10 text-white" : "opacity-40 hover:opacity-100")}>
          BLUEPRINTS
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {view === 'play' && (
          <>
            {state.instances.length === 0 && <div className="text-center text-xs text-gray-600 mt-8">No active games.</div>}
            {state.instances.map(inst => (
              <div
                key={inst.id}
                onClick={() => dispatch({ type: 'SET_CURRENT_INSTANCE', payload: inst })}
                className={cn(
                  "p-3 border cursor-pointer relative group transition-all",
                  state.currentInstance?.id === inst.id
                    ? "border-[var(--glow-color)] bg-[var(--bg-tint)] text-white shadow-[0_0_10px_var(--bg-tint)]"
                    : "border-gray-800 text-gray-500 hover:border-gray-600"
                )}
              >
                <div className="text-sm font-bold truncate pr-4">{inst.showName}</div>
                <div className="text-xs mt-1 opacity-70">
                   {inst.currentEpisodeIndex >= inst.episodes.length ? "COMPLETE" : `Ep ${inst.currentEpisodeIndex + 1}: ${inst.episodes[inst.currentEpisodeIndex]?.name}`}
                </div>
                <div className="text-[10px] opacity-40 mt-1">{new Date(inst.lastPlayed).toLocaleDateString()}</div>
                <button onClick={(e) => handleDeleteInstance(e, inst.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-500 font-bold">✕</button>
              </div>
            ))}
          </>
        )}

        {view === 'shows' && (
          <>
            <button
                // Set to NULL to create NEW
                onClick={() => dispatch({ type: 'SET_EDITING_SHOW', payload: null })}
                className="w-full py-3 mb-2 border border-[var(--border-color)] text-[var(--glow-color)] text-xs font-bold tracking-wider hover:bg-white/5 transition-colors"
            >
                + CREATE BLUEPRINT
            </button>
            {state.shows.map(show => (
              <div key={show.id} className="p-3 border border-gray-800 text-gray-400 group relative bg-black/20 hover:border-gray-600">
                <div className="font-bold text-sm pr-6 text-gray-300">{show.name}</div>
                <div className="text-xs opacity-50 mb-3">{show.episodes.length} Episodes</div>
                <div className="flex gap-2">
                    <button onClick={() => handleStartInstance(show.id)} className="flex-1 py-1 text-xs border border-[var(--border-color)] text-[var(--glow-color)] font-bold hover:bg-[var(--bg-tint)]">PLAY</button>
                    {/* Set to SHOW OBJECT to EDIT */}
                    <button onClick={() => dispatch({ type: 'SET_EDITING_SHOW', payload: show })} className="flex-1 py-1 text-xs border border-gray-700 hover:text-white">EDIT</button>
                </div>
                <button onClick={(e) => handleDeleteShow(e, show.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-900 hover:text-red-500">✕</button>
              </div>
            ))}
          </>
        )}
      </div>

      {state.currentInstance && (
        <div className="p-2 border-t border-[var(--border-color)] bg-black/60 text-center">
            <button
                onClick={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: state.activePanel === 'lore' ? 'instances' : 'lore' })}
                className="text-xs text-gray-500 hover:text-white w-full py-1"
            >
                VIEW CURRENT LORE
            </button>
        </div>
      )}
    </div>
  );
}