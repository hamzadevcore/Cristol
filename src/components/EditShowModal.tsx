import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api, Show, Episode } from '../services/api';
import { cn } from '../utils/cn';

interface EditShowModalProps {
  isOpen: boolean;
  onClose: () => void;
  show?: Show | null;
}

type Tab = 'general' | 'lore' | 'profile' | 'episodes' | 'import';

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

  // Save & Error State
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Import State
  const [importText, setImportText] = useState('');

  // Drag State
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
      setDraggedId(null);
      setDragOverId(null);
      setIsSaving(false);
      setErrorMsg(null);
      setImportText('');
    }
  }, [isOpen, show]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("CAMPAIGN TITLE REQUIRED");
      setActiveTab('general');
      return;
    }

    setIsSaving(true);

    try {
      const showData = { name, description, lore, profile, episodes };
      console.log("Saving Blueprint:", showData);

      if (show) {
        const updated = await api.updateShow(show.id, showData);
        dispatch({ type: 'UPDATE_SHOW', payload: updated });
      } else {
        const created = await api.createShow(showData);
        dispatch({ type: 'ADD_SHOW', payload: created });
      }
      onClose();
    } catch (e: any) {
      console.error("Save failed:", e);
      setErrorMsg(e.message || "CONNECTION FAILED");
    } finally {
      setIsSaving(false);
    }
  };

  // --- PARSER LOGIC ---
  const handleProcessImport = () => {
    if (!importText.trim()) return;

    const lines = importText.split('\n');
    let newName = name;
    let newEpisodes: Episode[] = [];

    let currentEp: Partial<Episode> | null = null;
    let buffer: string[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();

      // H1: Campaign Title
      if (line.startsWith('# ')) {
        newName = line.replace('# ', '').trim();
      }
      // H2: New Episode
      else if (line.startsWith('## ')) {
        // Save previous episode if exists
        if (currentEp) {
          currentEp.context = buffer.join('\n').trim();
          newEpisodes.push(currentEp as Episode);
        }

        // Start new episode
        buffer = [];
        currentEp = {
          id: Date.now().toString() + Math.random().toString().slice(2,6),
          name: line.replace('## ', '').trim(),
          context: ''
        };
      }
      // Content
      else {
        // Only add to buffer if we are inside an episode block
        if (currentEp) {
          buffer.push(line);
        }
      }
    });

    // Push the final episode
    if (currentEp) {
      currentEp.context = buffer.join('\n').trim();
      newEpisodes.push(currentEp as Episode);
    }

    if (newEpisodes.length > 0) {
      if (confirm(`Parsed ${newEpisodes.length} episodes. Replace existing chapters?`)) {
        setName(newName);
        setEpisodes(newEpisodes);
        setSelectedEpisodeId(newEpisodes[0].id);
        setActiveTab('episodes');
        setImportText('');
      }
    } else {
      alert("No episodes found. Make sure to use '## Episode Name' to start chapters.");
    }
  };

  // --- EPISODE MANAGEMENT ---
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

  // --- DRAG HANDLERS ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setTimeout(() => {
      const element = e.target as HTMLElement;
      element.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const element = e.target as HTMLElement;
    element.style.opacity = '1';
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== draggedId && id !== dragOverId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      setDragOverId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const dragIndex = episodes.findIndex(ep => ep.id === draggedId);
    const dropIndex = episodes.findIndex(ep => ep.id === targetId);
    if (dragIndex === -1 || dropIndex === -1) return;

    const newEpisodes = [...episodes];
    const [draggedItem] = newEpisodes.splice(dragIndex, 1);
    newEpisodes.splice(dropIndex, 0, draggedItem);

    setEpisodes(newEpisodes);
    setDraggedId(null);
    setDragOverId(null);
  };

  const moveEpisode = (id: string, direction: 'up' | 'down') => {
    const index = episodes.findIndex(ep => ep.id === id);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= episodes.length) return;
    const newEpisodes = [...episodes];
    [newEpisodes[index], newEpisodes[newIndex]] = [newEpisodes[newIndex], newEpisodes[index]];
    setEpisodes(newEpisodes);
  };

  const activeEpisode = episodes.find(e => e.id === selectedEpisodeId);

  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-black animate-fade-in">

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

      {/* Main Content Area */}
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

            <div className="p-3 text-xs font-bold text-gray-600 border-b border-gray-900 border-t mt-4 flex justify-between items-center bg-gray-900/30">
              <span>CHAPTERS ({episodes.length})</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTab('import')}
                  className={cn(
                    "text-[10px] border border-gray-700 px-1.5 py-0.5 transition-colors",
                    activeTab === 'import' ? "bg-white text-black" : "text-gray-400 hover:text-white hover:bg-white/10"
                  )}
                  title="Paste Script"
                >
                  IMPORT
                </button>
                <button onClick={handleAddEpisode} className="hover:text-white text-[10px] border border-gray-700 px-1.5 py-0.5 hover:bg-white/10 transition-colors">
                  ADD +
                </button>
              </div>
            </div>

            <div className="px-3 py-1 text-[10px] text-gray-600 border-b border-gray-900/50">
              ↕ Drag to reorder
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {episodes.map((ep, index) => (
                <div
                  key={ep.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, ep.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, ep.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, ep.id)}
                  onClick={() => { setActiveTab('episodes'); setSelectedEpisodeId(ep.id); }}
                  className={cn(
                    "w-full text-left px-4 py-3 text-xs font-mono border-l-4 cursor-grab group flex justify-between items-center transition-all border-b border-gray-900/50 select-none",
                    (activeTab === 'episodes' && selectedEpisodeId === ep.id)
                      ? "border-[var(--glow-color)] bg-[var(--bg-tint)] text-[var(--glow-color)]"
                      : "border-transparent text-gray-500 hover:bg-white/5",
                    draggedId === ep.id && "opacity-50 cursor-grabbing",
                    dragOverId === ep.id && draggedId !== ep.id && "bg-[var(--glow-color)]/20 border-[var(--glow-color)]/50"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-gray-600 group-hover:text-gray-400 cursor-grab shrink-0">⋮⋮</span>
                    <span className="text-gray-600 text-[10px] shrink-0">{index + 1}.</span>
                    <span className="truncate">{ep.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveEpisode(ep.id, 'up'); }}
                      disabled={index === 0}
                      className={cn("px-1 hover:text-white transition-colors", index === 0 && "opacity-30 cursor-not-allowed")}
                    >↑</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveEpisode(ep.id, 'down'); }}
                      disabled={index === episodes.length - 1}
                      className={cn("px-1 hover:text-white transition-colors", index === episodes.length - 1 && "opacity-30 cursor-not-allowed")}
                    >↓</button>
                    <button
                      onClick={(e) => handleDeleteEpisode(e, ep.id)}
                      className="hover:text-red-500 font-bold px-1"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Editor */}
        <div className="flex-1 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] p-8 overflow-y-auto custom-scrollbar relative">

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

          {activeTab === 'import' && (
             <div className="h-full flex flex-col animate-fade-in relative z-10">
                <div className="mb-4 space-y-2">
                    <h3 className="text-[var(--glow-color)] font-bold tracking-widest">BULK SCRIPT IMPORT</h3>
                    <div className="text-xs text-gray-500 font-mono bg-black/50 p-3 border border-gray-800">
                        FORMAT GUIDE:<br/>
                        <span className="text-gray-300"># Campaign Title</span> (Optional)<br/>
                        <span className="text-gray-300">## Episode Title</span><br/>
                        Episode context/prompt here...<br/>
                        <span className="text-gray-300">## Next Episode</span><br/>
                        Next context...
                    </div>
                </div>
                <textarea
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    className="flex-1 bg-black/80 border border-gray-700 focus:border-[var(--glow-color)] p-6 text-xs font-mono text-green-400 focus:outline-none resize-none leading-relaxed shadow-inner font-bold"
                    placeholder="# My Epic Saga&#10;&#10;## Chapter 1: The Beginning&#10;You are standing in a tavern..."
                />
                <button
                    onClick={handleProcessImport}
                    className="mt-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold tracking-widest text-xs"
                >
                    PROCESS & OVERWRITE CHAPTERS
                </button>
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
                    <div className="text-[10px] text-gray-600">POSITION: {episodes.findIndex(e => e.id === activeEpisode.id) + 1} / {episodes.length}</div>
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
        <div className="mr-auto text-xs font-mono">
           {errorMsg ? (
             <span className="text-red-500 font-bold animate-pulse">ERROR: {errorMsg.toUpperCase()}</span>
           ) : (
             <span className="text-gray-500">// SYSTEM_STATUS: {episodes.length} CHAPTERS_READY</span>
           )}
        </div>
        <button
          onClick={onClose}
          disabled={isSaving}
          className="px-6 py-2 border border-transparent text-gray-500 hover:text-white hover:border-gray-700 text-xs tracking-wider transition-all"
        >
          DISCARD CHANGES
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            "px-8 py-2 bg-[var(--border-color)] text-white text-xs font-bold tracking-wider shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all",
            isSaving
              ? "opacity-50 cursor-wait"
              : "hover:bg-[var(--glow-color)] hover:shadow-[0_0_20px_var(--glow-color)] hover:scale-105 active:scale-95",
            errorMsg && "border border-red-500"
          )}
        >
          {isSaving ? "SAVING..." : (errorMsg ? "RETRY SAVE" : "SAVE BLUEPRINT")}
        </button>
      </div>
    </div>
  );
}