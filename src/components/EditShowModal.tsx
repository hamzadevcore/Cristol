import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api, Show, Episode } from '../services/api';
import { cn } from '../utils/cn';

interface EditShowModalProps {
  isOpen: boolean;
  onClose: () => void;
  show?: Show | null;
}

type Tab = 'general' | 'lore' | 'profile' | 'episodes';

export function EditShowModal({ isOpen, onClose, show }: EditShowModalProps) {
  const { state, dispatch } = useApp();

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lore, setLore] = useState('');
  const [profile, setProfile] = useState('');
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (show) {
        setName(show.name);
        setDescription(show.description);
        setLore(show.lore);
        setProfile(show.profile);
        setEpisodes(show.episodes);
        if(show.episodes.length > 0) setSelectedEpisodeId(show.episodes[0].id);
      } else {
        setName('New Campaign');
        setDescription('A new adventure begins...');
        setLore('The world is vast and unknown...');
        setProfile('You are a traveler...');
        const newEp = { id: Date.now().toString(), name: 'Chapter 1', context: 'You start here.' };
        setEpisodes([newEp]);
        setSelectedEpisodeId(newEp.id);
      }
      setActiveTab('general');
    }
  }, [isOpen, show]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name) return;
    try {
      const showData = { name, description, lore, profile, episodes };
      if (show) {
        const updated = await api.updateShow(show.id, showData);
        dispatch({ type: 'UPDATE_SHOW', payload: updated });
      } else {
        const created = await api.createShow(showData);
        dispatch({ type: 'ADD_SHOW', payload: created });
      }
      onClose();
    } catch (e) { console.error(e); }
  };

  // Episode Management
  const handleAddEpisode = () => {
    const newEp = { id: Date.now().toString(), name: 'New Chapter', context: '' };
    setEpisodes([...episodes, newEp]);
    setSelectedEpisodeId(newEp.id);
    setActiveTab('episodes');
  };

  const handleDeleteEpisode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newList = episodes.filter(ep => ep.id !== id);
    setEpisodes(newList);
    if (selectedEpisodeId === id) setSelectedEpisodeId(newList[0]?.id || null);
  };

  const updateEpisode = (id: string, field: keyof Episode, value: string) => {
    setEpisodes(episodes.map(ep => ep.id === id ? { ...ep, [field]: value } : ep));
  };

  const activeEpisode = episodes.find(e => e.id === selectedEpisodeId);

  return (
    // FULL COVERAGE: Absolute inset-0 covers the flex container (Sidebar + Chat) completely
    // bg-black ensures we don't see the chat underneath
    <div className="absolute inset-0 z-50 flex flex-col bg-black animate-fade-in">

      {/* Header Bar */}
      <div className="h-12 border-b border-[var(--border-color)] bg-[var(--bg-tint)] flex items-center justify-between px-4 select-none shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[var(--glow-color)] animate-pulse shadow-[0_0_10px_var(--glow-color)]" />
          <span className="font-bold tracking-widest text-[var(--glow-color)] text-theme-glow uppercase text-lg">
            {show ? `BLUEPRINT: ${show.name}` : 'NEW_BLUEPRINT // SYSTEM'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-1 hover:bg-white/10 text-gray-500 hover:text-white transition-colors border border-transparent hover:border-gray-600"
        >
          [CLOSE EDITOR]
        </button>
      </div>

      {/* Main Content Area - Split View */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT SIDEBAR: Navigation */}
        <div className="w-64 border-r border-[var(--border-color)] bg-black/30 flex flex-col shrink-0">
          <div className="p-0 flex flex-col h-full">
            <div className="p-3 text-xs font-bold text-gray-600 border-b border-gray-900">CONFIGURATION</div>
            {['general', 'lore', 'profile'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as Tab)}
                className={cn(
                  "w-full text-left px-4 py-3 text-xs font-mono border-l-4 transition-all uppercase tracking-wider",
                  activeTab === tab
                    ? "border-[var(--glow-color)] bg-[var(--bg-tint)] text-white font-bold"
                    : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
              >
                {tab}
              </button>
            ))}

            <div className="p-3 text-xs font-bold text-gray-600 border-b border-gray-900 border-t mt-4 flex justify-between items-center">
              <span>CHAPTERS ({episodes.length})</span>
              <button onClick={handleAddEpisode} className="hover:text-white text-xs border border-gray-700 px-2 py-0.5 hover:bg-white/10 transition-colors">ADD +</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {episodes.map(ep => (
                <div
                  key={ep.id}
                  onClick={() => { setActiveTab('episodes'); setSelectedEpisodeId(ep.id); }}
                  className={cn(
                    "w-full text-left px-4 py-3 text-xs font-mono border-l-4 cursor-pointer group flex justify-between items-center transition-all border-b border-gray-900/50",
                    (activeTab === 'episodes' && selectedEpisodeId === ep.id)
                      ? "border-[var(--glow-color)] bg-[var(--bg-tint)] text-[var(--glow-color)]"
                      : "border-transparent text-gray-500 hover:bg-white/5"
                  )}
                >
                  <span className="truncate w-32">{ep.name}</span>
                  <button
                    onClick={(e) => handleDeleteEpisode(e, ep.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-500 font-bold px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Editor */}
        <div className="flex-1 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] p-8 overflow-y-auto custom-scrollbar relative">

          {/* Subtle scanline overlay just for editor area */}
          <div className="pointer-events-none absolute inset-0 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))]" style={{backgroundSize: "100% 2px, 3px 100%"}} />

          {activeTab === 'general' && (
            <div className="max-w-3xl space-y-6 animate-fade-in relative z-10">
              <div className="space-y-2">
                <label className="text-xs text-[var(--glow-color)] font-bold tracking-widest block">CAMPAIGN TITLE</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-black/50 border border-gray-700 focus:border-[var(--glow-color)] p-4 text-2xl font-mono text-white focus:outline-none transition-all shadow-lg"
                  placeholder="Enter title..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-500 font-bold tracking-widest block">BRIEF DESCRIPTION</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full h-40 bg-black/50 border border-gray-700 focus:border-[var(--glow-color)] p-4 text-sm font-mono text-gray-300 focus:outline-none transition-all resize-none shadow-lg"
                  placeholder="What is this story about?"
                />
              </div>
            </div>
          )}

          {(activeTab === 'lore' || activeTab === 'profile') && (
            <div className="h-full flex flex-col animate-fade-in relative z-10">
              <div className="flex justify-between items-end mb-2">
                <label className="text-xs text-[var(--glow-color)] font-bold tracking-widest uppercase">{activeTab} DATA</label>
                <span className="text-[10px] text-gray-600">MARKDOWN SUPPORTED</span>
              </div>
              <textarea
                value={activeTab === 'lore' ? lore : profile}
                onChange={e => activeTab === 'lore' ? setLore(e.target.value) : setProfile(e.target.value)}
                className="flex-1 bg-black/80 border border-gray-700 focus:border-[var(--glow-color)] p-6 text-sm font-mono text-gray-300 focus:outline-none transition-all resize-none leading-relaxed shadow-inner"
                spellCheck={false}
              />
            </div>
          )}

          {activeTab === 'episodes' && activeEpisode && (
            <div className="h-full flex flex-col animate-fade-in space-y-4 relative z-10">
              <div className="flex items-center gap-4 shrink-0 p-4 border border-gray-800 bg-black/40">
                 <div className="flex-1">
                    <label className="text-[10px] text-gray-500 font-bold tracking-widest mb-1 block">CHAPTER TITLE</label>
                    <input
                      value={activeEpisode.name}
                      onChange={e => updateEpisode(activeEpisode.id, 'name', e.target.value)}
                      className="w-full bg-transparent border-b border-gray-700 focus:border-[var(--glow-color)] py-2 text-xl font-mono text-white focus:outline-none"
                    />
                 </div>
                 <div className="text-right">
                    <div className="text-[10px] text-gray-600">ID: {activeEpisode.id}</div>
                    <div className="text-[10px] text-[var(--glow-color)] animate-pulse">● EDITING</div>
                 </div>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="text-[10px] text-gray-500 font-bold tracking-widest mb-2 block">CONTEXT / PROMPT</label>
                <textarea
                  value={activeEpisode.context}
                  onChange={e => updateEpisode(activeEpisode.id, 'context', e.target.value)}
                  className="flex-1 bg-black/80 border border-gray-700 focus:border-[var(--glow-color)] p-6 text-sm font-mono text-gray-300 focus:outline-none resize-none leading-relaxed shadow-inner"
                  placeholder="Describe the scene, the location, and the immediate situation..."
                />
              </div>
            </div>
          )}

          {activeTab === 'episodes' && !activeEpisode && (
             <div className="h-full flex items-center justify-center opacity-30">
                <div className="text-center">
                  <div className="text-6xl mb-4 text-[var(--glow-color)]">←</div>
                  <div className="tracking-widest">SELECT A CHAPTER TO BEGIN</div>
                </div>
             </div>
          )}

        </div>
      </div>

      {/* Footer Actions */}
      <div className="h-16 border-t border-[var(--border-color)] bg-[var(--bg-tint)] flex items-center justify-end px-6 gap-4 shrink-0">
        <div className="mr-auto text-xs text-gray-500 font-mono">
           // SYSTEM_STATUS: {episodes.length} CHAPTERS_READY
        </div>
        <button
          onClick={onClose}
          className="px-6 py-2 border border-transparent text-gray-500 hover:text-white hover:border-gray-700 text-xs tracking-wider transition-all"
        >
          DISCARD CHANGES
        </button>
        <button
          onClick={handleSave}
          className="px-8 py-2 bg-[var(--border-color)] text-white hover:bg-[var(--glow-color)] text-xs font-bold tracking-wider shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_20px_var(--glow-color)] transition-all hover:scale-105 active:scale-95"
        >
          SAVE BLUEPRINT
        </button>
      </div>
    </div>
  );
}