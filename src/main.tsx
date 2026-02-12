import "./index.css";
import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  ReactNode
} from 'react';
import ReactDOM from 'react-dom/client';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ==========================================
// 1. UTILS & CONSTANTS
// ==========================================

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const themeColors = {
  purple: { primary: 'text-purple-400', secondary: 'text-purple-500', bg: 'bg-purple-500', bgOpacity: 'bg-purple-500/50', via: 'via-purple-500/50' },
  cyan: { primary: 'text-cyan-400', secondary: 'text-cyan-500', bg: 'bg-cyan-500', bgOpacity: 'bg-cyan-500/50', via: 'via-cyan-500/50' },
  green: { primary: 'text-green-400', secondary: 'text-green-500', bg: 'bg-green-500', bgOpacity: 'bg-green-500/50', via: 'via-green-500/50' },
  amber: { primary: 'text-amber-400', secondary: 'text-amber-500', bg: 'bg-amber-500', bgOpacity: 'bg-amber-500/50', via: 'via-amber-500/50' },
  hell: { primary: 'text-red-500', secondary: 'text-red-600', bg: 'bg-red-600', bgOpacity: 'bg-red-600/50', via: 'via-red-600/50' },
};

// ==========================================
// 2. TYPES
// ==========================================

export interface Message {
  id: string;
  role: 'user' | 'ai' | 'assistant';
  content: string;
}

export interface Episode {
  id: string;
  name: string;
  description?: string;
  context: string;
}

export interface Show {
  id: string;
  name: string;
  description: string;
  lore: string;
  profile: string;
  episodes: Episode[];
}

export interface InstanceSummary {
  episodeName: string;
  summary: string;
  timestamp: string;
}

export interface Instance {
  id: string;
  showId: string;
  showName: string;
  currentEpisodeIndex: number;
  messages: Message[];
  lastPlayed: string;
  lore: string;
  profile: string;
  episodes: Episode[];
  summaryHistory: InstanceSummary[];
}

export interface Settings {
  model: string;
  summarizationModel: string;
  colorTheme: 'purple' | 'cyan' | 'green' | 'amber' | 'hell';
  crtEffects: boolean;
  enablePerspective: boolean;
  scanlines: boolean;
  fishbowlIntensity: number;
  soundEnabled: boolean;
  flickerEnabled: boolean;
}

export interface AppState {
  activePanel: 'instances' | 'shows' | 'lore' | 'profile';
  shows: Show[];
  instances: Instance[];
  currentInstance: Instance | null;
  messages: Message[];
  isGenerating: boolean;
  streamingText: string;
  tokenUsage: { prompt: number; response: number; total: number };
  settings: Settings;
  editingShow: Show | null | undefined;
  lore: string;
  profile: string;
}

// ==========================================
// 3. API SERVICE
// ==========================================

const API_BASE = 'http://127.0.0.1:5000';

class APIService {
  private abortController: AbortController | null = null;

  private async handleResponse(res: Response) {
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  async *chat(request: any): AsyncGenerator<string> {
    this.abortController = new AbortController();
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) yield parsed.token;
            } catch { yield data; }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      throw error;
    }
  }

  // --- Shows ---
  async getShows(): Promise<Show[]> {
    try {
      const res = await fetch(`${API_BASE}/shows`);
      return res.ok ? res.json() : [];
    } catch { return []; }
  }

  async createShow(data: Partial<Show>): Promise<Show> {
    const res = await fetch(`${API_BASE}/shows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.handleResponse(res);
  }

  async updateShow(id: string, data: Partial<Show>): Promise<Show> {
    const res = await fetch(`${API_BASE}/shows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.handleResponse(res);
  }

  async deleteShow(id: string): Promise<void> {
    await fetch(`${API_BASE}/shows/${id}`, { method: 'DELETE' });
  }

  // --- Instances ---
  async getInstances(): Promise<Instance[]> {
    try {
      const res = await fetch(`${API_BASE}/instances`);
      return res.ok ? res.json() : [];
    } catch { return []; }
  }

  async createInstance(showId: string): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId }),
    });
    return this.handleResponse(res);
  }

  async updateInstance(id: string, data: Partial<Instance>): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.handleResponse(res);
  }

  async deleteInstance(id: string): Promise<void> {
    await fetch(`${API_BASE}/instances/${id}`, { method: 'DELETE' });
  }

  async advanceInstance(id: string, messages: Message[], model: string) {
    const res = await fetch(`${API_BASE}/instances/${id}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model }),
    });
    return this.handleResponse(res);
  }

  async healthCheck(): Promise<boolean> {
    try { const res = await fetch(`${API_BASE}/health`); return res.ok; }
    catch { return false; }
  }
}

const api = new APIService();

// ==========================================
// 4. HOOKS
// ==========================================

function useSound(enabled: boolean) {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  }, []);

  const playStaticNoise = useCallback((duration: number = 0.3) => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3000;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(ctx.destination);
    source.start();
  }, [enabled, getAudioContext]);

  const playRewindSound = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const duration = 1.5;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const freq = 200 + Math.sin(t * 50) * 100;
      data[i] = Math.sin(t * freq * Math.PI * 2) * 0.1 * (1 - t / duration);
      data[i] += (Math.random() * 2 - 1) * 0.05;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }, [enabled, getAudioContext]);

  const playGlitchSound = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const duration = 0.5;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      data[i] = Math.floor((Math.random() * 2 - 1) * 8) / 8 * 0.2 * (1 - t / duration);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }, [enabled, getAudioContext]);

  const playKeyClick = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 1200;
    gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.05);
  }, [enabled, getAudioContext]);

  const playMessageSent = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.001, ctx.currentTime + 0.1);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.1);
  }, [enabled, getAudioContext]);

  return { playStaticNoise, playRewindSound, playGlitchSound, playKeyClick, playMessageSent };
}

// ==========================================
// 5. CONTEXT
// ==========================================

const STORAGE_KEY = 'cristol-terminal-save-v1';

const defaultSettings: Settings = {
  model: '',
  summarizationModel: '',
  colorTheme: 'green',
  crtEffects: true,
  enablePerspective: true,
  scanlines: true,
  fishbowlIntensity: 0.15,
  soundEnabled: true,
  flickerEnabled: true,
};

const initialState: AppState = {
  messages: [],
  currentInstance: null,
  isGenerating: false,
  streamingText: '',
  tokenUsage: { prompt: 0, response: 0, total: 0 },
  settings: defaultSettings,
  activePanel: 'instances',
  lore: '',
  profile: '',
  shows: [],
  instances: [],
  editingShow: undefined,
};

type Action =
  | { type: 'LOAD_STATE'; payload: Partial<AppState> }
  | { type: 'SET_SHOWS'; payload: Show[] }
  | { type: 'ADD_SHOW'; payload: Show }
  | { type: 'UPDATE_SHOW'; payload: Show }
  | { type: 'REMOVE_SHOW'; payload: string }
  | { type: 'SET_INSTANCES'; payload: Instance[] }
  | { type: 'ADD_INSTANCE'; payload: Instance }
  | { type: 'UPDATE_INSTANCE'; payload: Instance }
  | { type: 'REMOVE_INSTANCE'; payload: string }
  | { type: 'SET_CURRENT_INSTANCE'; payload: Instance | null }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'CLEAR_SESSION' }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_STREAMING_TEXT'; payload: string }
  | { type: 'UPDATE_TOKEN_USAGE'; payload: { prompt: number; response: number } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'SET_EDITING_SHOW'; payload: Show | null | undefined };

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_STATE': return { ...state, ...action.payload };
    case 'SET_SHOWS': return { ...state, shows: action.payload };
    case 'ADD_SHOW': return { ...state, shows: [...state.shows, action.payload] };
    case 'UPDATE_SHOW': return { ...state, shows: state.shows.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'REMOVE_SHOW': return { ...state, shows: state.shows.filter(s => s.id !== action.payload) };
    case 'SET_EDITING_SHOW': return { ...state, editingShow: action.payload };
    case 'SET_INSTANCES': return { ...state, instances: action.payload };
    case 'ADD_INSTANCE': return { ...state, instances: [action.payload, ...state.instances] };
    case 'UPDATE_INSTANCE':
      return {
        ...state,
        instances: state.instances.map(i => i.id === action.payload.id ? action.payload : i),
        currentInstance: state.currentInstance?.id === action.payload.id ? action.payload : state.currentInstance,
        lore: state.currentInstance?.id === action.payload.id ? action.payload.lore : state.lore,
        profile: state.currentInstance?.id === action.payload.id ? action.payload.profile : state.profile,
      };
    case 'REMOVE_INSTANCE':
      return {
        ...state,
        instances: state.instances.filter(i => i.id !== action.payload),
        currentInstance: state.currentInstance?.id === action.payload ? null : state.currentInstance
      };
    case 'SET_CURRENT_INSTANCE':
      return {
        ...state,
        currentInstance: action.payload,
        messages: action.payload ? action.payload.messages : [],
        lore: action.payload ? action.payload.lore : '',
        profile: action.payload ? action.payload.profile : ''
      };
    case 'ADD_MESSAGE': {
      const newMessages = [...state.messages, action.payload];
      if (state.currentInstance) api.updateInstance(state.currentInstance.id, { messages: newMessages });
      return { ...state, messages: newMessages };
    }
    case 'UPDATE_MESSAGE': {
      const newMessages = state.messages.map(m => m.id === action.payload.id ? { ...m, content: action.payload.content } : m);
      if (state.currentInstance) api.updateInstance(state.currentInstance.id, { messages: newMessages });
      return { ...state, messages: newMessages };
    }
    case 'DELETE_MESSAGE': {
      const newMessages = state.messages.filter(m => m.id !== action.payload);
      if (state.currentInstance) api.updateInstance(state.currentInstance.id, { messages: newMessages });
      return { ...state, messages: newMessages };
    }
    case 'SET_MESSAGES': {
      if (state.currentInstance) api.updateInstance(state.currentInstance.id, { messages: action.payload });
      return { ...state, messages: action.payload };
    }
    case 'CLEAR_SESSION': return { ...state, currentInstance: null, messages: [] };
    case 'SET_GENERATING': return { ...state, isGenerating: action.payload };
    case 'SET_STREAMING_TEXT': return { ...state, streamingText: action.payload };
    case 'UPDATE_TOKEN_USAGE':
      return { ...state, tokenUsage: { prompt: action.payload.prompt, response: action.payload.response, total: state.tokenUsage.total + action.payload.prompt + action.payload.response } };
    case 'UPDATE_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
    default: return state;
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const init = async () => {
      // 1. Health check & Settings
      await api.healthCheck();
      const savedString = localStorage.getItem(STORAGE_KEY);
      let savedSettings: Partial<Settings> = {};
      if (savedString) {
        try { savedSettings = JSON.parse(savedString).settings || {}; } catch (e) { console.error(e); }
      }
      dispatch({ type: 'UPDATE_SETTINGS', payload: { ...defaultSettings, ...savedSettings } });

      // 2. Load Data
      try {
        const [shows, instances] = await Promise.all([api.getShows(), api.getInstances()]);
        dispatch({ type: 'SET_SHOWS', payload: shows });
        dispatch({ type: 'SET_INSTANCES', payload: instances });
      } catch (e) { console.error("Backend sync failed", e); }
    };
    init();
  }, []);

  useEffect(() => {
    if (state.settings !== defaultSettings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: state.settings }));
    }
  }, [state.settings]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}

// ==========================================
// 6. COMPONENTS
// ==========================================

function RewindOverlay({ isActive, onComplete, colorTheme, mode = 'rewind' }: any) {
  const { state } = useApp();
  const { playRewindSound, playStaticNoise, playGlitchSound } = useSound(state.settings.soundEnabled);
  const [phase, setPhase] = useState<'rewind' | 'static' | 'none'>('none');
  const colors = themeColors[colorTheme as keyof typeof themeColors];

  useEffect(() => {
    if (isActive) {
      if (mode === 'rewind') {
        setPhase('rewind');
        playRewindSound();
        const staticTimeout = setTimeout(() => { setPhase('static'); playStaticNoise(0.5); }, 1200);
        const completeTimeout = setTimeout(() => { setPhase('none'); onComplete(); }, 1700);
        return () => { clearTimeout(staticTimeout); clearTimeout(completeTimeout); };
      } else {
        setPhase('static');
        playGlitchSound();
        const completeTimeout = setTimeout(() => { setPhase('none'); onComplete(); }, 400);
        return () => { clearTimeout(completeTimeout); };
      }
    } else { setPhase('none'); }
  }, [isActive, onComplete, playRewindSound, playStaticNoise, playGlitchSound, mode]);

  if (phase === 'none') return null;

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90">
      {phase === 'rewind' && (
        <>
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(8)].map((_, i) => (
              <div key={`bar-${i}`} className={cn("absolute h-2 w-full opacity-60", colors.bgOpacity)}
                style={{ top: `${12 + i * 12}%`, animation: `vhs-bar 0.15s linear infinite`, animationDelay: `${i * 0.02}s`, transform: `translateX(${Math.sin(i) * 20}px)` }} />
            ))}
            {[...Array(20)].map((_, i) => (
              <div key={`line-${i}`} className={cn("absolute h-0.5 w-full bg-gradient-to-r from-transparent to-transparent animate-vhs-line", colors.via)}
                style={{ top: `${(i * 5) + Math.random() * 10}%`, animationDelay: `${i * 0.05}s`, animationDuration: '0.3s' }} />
            ))}
          </div>
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className={cn("flex items-center gap-4 animate-pulse text-6xl font-bold", colors.primary)}><span>{"<<"}</span><span>{"<<"}</span></div>
            <div className={cn("font-mono text-3xl tracking-[0.3em] animate-blink", colors.primary)}>{mode === 'rewind' ? '<< REW <<' : '!! GLITCH !!'}</div>
            <div className="font-mono text-sm text-gray-500 tracking-widest">--:--:--</div>
          </div>
          <div className="absolute inset-0 animate-screen-shake opacity-30 pointer-events-none" style={{ background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(128, 90, 213, 0.05) 2px, rgba(128, 90, 213, 0.05) 4px)` }} />
          <div className="absolute inset-0 pointer-events-none"><div className="absolute inset-0 bg-red-500/5 animate-glitch-r" /><div className="absolute inset-0 bg-blue-500/5 animate-glitch-b" /></div>
        </>
      )}
      {phase === 'static' && (
        <div className="absolute inset-0 animate-static-noise">
          <div className="w-full h-full opacity-80" style={{ background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }} />
          <div className={cn("absolute inset-0 opacity-20", colors.bg)} />
        </div>
      )}
    </div>
  );
}

function EditShowModal({ isOpen, onClose, show }: { isOpen: boolean; onClose: () => void; show?: Show | null }) {
  const { dispatch } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lore, setLore] = useState('');
  const [profile, setProfile] = useState('');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'lore' | 'profile' | 'episodes' | 'import'>('general');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (show) {
        setName(show.name); setDescription(show.description); setLore(show.lore); setProfile(show.profile); setEpisodes(show.episodes);
        if(show.episodes.length > 0) setSelectedEpisodeId(show.episodes[0].id);
      } else {
        setName('New Campaign'); setDescription('A new adventure begins...'); setLore('The world is vast...'); setProfile('You are a traveler...');
        const newEp = { id: Date.now().toString(), name: 'Chapter 1', context: 'You start here.' };
        setEpisodes([newEp]); setSelectedEpisodeId(newEp.id);
      }
      setActiveTab('general'); setIsSaving(false); setErrorMsg(null); setImportText('');
    }
  }, [isOpen, show]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setErrorMsg(null);
    if (!name.trim()) { setErrorMsg("CAMPAIGN TITLE REQUIRED"); setActiveTab('general'); return; }
    setIsSaving(true);
    try {
      const showData = { name, description, lore, profile, episodes };
      if (show) { const updated = await api.updateShow(show.id, showData); dispatch({ type: 'UPDATE_SHOW', payload: updated }); }
      else { const created = await api.createShow(showData); dispatch({ type: 'ADD_SHOW', payload: created }); }
      onClose();
    } catch (e: any) { console.error("Save failed:", e); setErrorMsg(e.message || "CONNECTION FAILED"); } finally { setIsSaving(false); }
  };

  const handleProcessImport = () => {
    if (!importText.trim()) return;
    const lines = importText.split('\n');
    let newName = name;
    let newEpisodes: Episode[] = [];
    let currentEp: Partial<Episode> | null = null;
    let buffer: string[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (line.startsWith('# ')) { newName = line.replace('# ', '').trim(); }
      else if (line.startsWith('## ')) {
        if (currentEp) { currentEp.context = buffer.join('\n').trim(); newEpisodes.push(currentEp as Episode); }
        buffer = [];
        currentEp = { id: Date.now().toString() + Math.random().toString().slice(2,6), name: line.replace('## ', '').trim(), context: '' };
      } else { if (currentEp) buffer.push(line); }
    });
    if (currentEp) { currentEp.context = buffer.join('\n').trim(); newEpisodes.push(currentEp as Episode); }

    if (newEpisodes.length > 0) {
      if (confirm(`Parsed ${newEpisodes.length} episodes. Replace existing chapters?`)) {
        setName(newName);
        setEpisodes(newEpisodes as Episode[]);
        setSelectedEpisodeId((newEpisodes[0] as Episode).id);
        setActiveTab('episodes');
        setImportText('');
      }
    } else { alert("No episodes found. Make sure to use '## Episode Name' to start chapters."); }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => { setDraggedId(id); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => { (e.target as HTMLElement).style.opacity = '0.5'; }, 0); };
  const handleDragEnd = (e: React.DragEvent) => { (e.target as HTMLElement).style.opacity = '1'; setDraggedId(null); setDragOverId(null); };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    const dragIndex = episodes.findIndex(ep => ep.id === draggedId);
    const dropIndex = episodes.findIndex(ep => ep.id === targetId);
    if (dragIndex === -1 || dropIndex === -1) return;
    const newEpisodes = [...episodes];
    const [draggedItem] = newEpisodes.splice(dragIndex, 1);
    newEpisodes.splice(dropIndex, 0, draggedItem);
    setEpisodes(newEpisodes); setDraggedId(null); setDragOverId(null);
  };
  const moveEpisode = (id: string, dir: 'up' | 'down') => {
    const idx = episodes.findIndex(ep => ep.id === id);
    if (idx === -1) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= episodes.length) return;
    const newEpisodes = [...episodes];
    [newEpisodes[idx], newEpisodes[newIdx]] = [newEpisodes[newIdx], newEpisodes[idx]];
    setEpisodes(newEpisodes);
  };
  const updateEpisode = (id: string, field: keyof Episode, val: string) => setEpisodes(episodes.map(ep => ep.id === id ? { ...ep, [field]: val } : ep));
  const activeEpisode = episodes.find(e => e.id === selectedEpisodeId);

  return (
    <div className="absolute inset-0 z-[100] flex flex-col bg-black animate-fade-in">
      <div className="h-12 border-b border-[var(--border-color)] bg-[var(--bg-tint)] flex items-center justify-between px-4 select-none shrink-0">
        <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-[var(--glow-color)] animate-pulse shadow-[0_0_10px_var(--glow-color)]" /><span className="font-bold tracking-widest text-[var(--glow-color)] text-theme-glow uppercase text-lg">{show ? `BLUEPRINT: ${show.name}` : 'NEW_BLUEPRINT // SYSTEM'}</span></div>
        <button onClick={onClose} className="px-4 py-1 hover:bg-white/10 text-gray-500 hover:text-white transition-colors border border-transparent hover:border-gray-600">[CLOSE EDITOR]</button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r border-[var(--border-color)] bg-black/30 flex flex-col shrink-0">
          <div className="p-0 flex flex-col h-full">
            <div className="p-3 text-xs font-bold text-gray-600 border-b border-gray-900">CONFIGURATION</div>
            {['general', 'lore', 'profile'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={cn("w-full text-left px-4 py-3 text-xs font-mono border-l-4 transition-all uppercase tracking-wider", activeTab === tab ? "border-[var(--glow-color)] bg-[var(--bg-tint)] text-white font-bold" : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5")}>{tab}</button>
            ))}
            <div className="p-3 text-xs font-bold text-gray-600 border-b border-gray-900 border-t mt-4 flex justify-between items-center bg-gray-900/30">
              <span>CHAPTERS ({episodes.length})</span>
              <div className="flex gap-1">
                <button onClick={() => setActiveTab('import')} className={cn("text-[10px] border border-gray-700 px-1.5 py-0.5 transition-colors", activeTab === 'import' ? "bg-white text-black" : "text-gray-400 hover:text-white hover:bg-white/10")}>IMPORT</button>
                <button onClick={() => { const newEp = { id: Date.now().toString(), name: 'New Chapter', context: '' }; setEpisodes([...episodes, newEp]); setSelectedEpisodeId(newEp.id); setActiveTab('episodes'); }} className="hover:text-white text-[10px] border border-gray-700 px-1.5 py-0.5 hover:bg-white/10 transition-colors">ADD +</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {episodes.map((ep, index) => (
                <div key={ep.id} draggable onDragStart={(e) => handleDragStart(e, ep.id)} onDragEnd={handleDragEnd} onDragOver={(e) => { e.preventDefault(); if (ep.id !== draggedId) setDragOverId(ep.id); }} onDrop={(e) => handleDrop(e, ep.id)} onClick={() => { setActiveTab('episodes'); setSelectedEpisodeId(ep.id); }}
                  className={cn("w-full text-left px-4 py-3 text-xs font-mono border-l-4 cursor-grab group flex justify-between items-center transition-all border-b border-gray-900/50 select-none", (activeTab === 'episodes' && selectedEpisodeId === ep.id) ? "border-[var(--glow-color)] bg-[var(--bg-tint)] text-[var(--glow-color)]" : "border-transparent text-gray-500 hover:bg-white/5", draggedId === ep.id && "opacity-50 cursor-grabbing", dragOverId === ep.id && draggedId !== ep.id && "bg-[var(--glow-color)]/20 border-[var(--glow-color)]/50")}>
                  <div className="flex items-center gap-2 flex-1 min-w-0"><span className="text-gray-600 text-[10px] shrink-0">{index + 1}.</span><span className="truncate">{ep.name}</span></div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); moveEpisode(ep.id, 'up'); }} disabled={index === 0} className="px-1 hover:text-white transition-colors disabled:opacity-30">↑</button>
                    <button onClick={(e) => { e.stopPropagation(); moveEpisode(ep.id, 'down'); }} disabled={index === episodes.length - 1} className="px-1 hover:text-white transition-colors disabled:opacity-30">↓</button>
                    <button onClick={(e) => { e.stopPropagation(); setEpisodes(episodes.filter(x => x.id !== ep.id)); }} className="hover:text-red-500 font-bold px-1">×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] p-8 overflow-y-auto custom-scrollbar relative">
          <div className="pointer-events-none absolute inset-0 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))]" style={{backgroundSize: "100% 2px, 3px 100%"}} />
          {activeTab === 'general' && (
            <div className="max-w-3xl space-y-6 animate-fade-in relative z-10">
              <div className="space-y-2"><label className="text-xs text-[var(--glow-color)] font-bold tracking-widest block">CAMPAIGN TITLE</label><input value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/50 border border-gray-700 focus:border-[var(--glow-color)] p-4 text-2xl font-mono text-white focus:outline-none transition-all shadow-lg" placeholder="Enter title..." /></div>
              <div className="space-y-2"><label className="text-xs text-gray-500 font-bold tracking-widest block">BRIEF DESCRIPTION</label><textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full h-40 bg-black/50 border border-gray-700 focus:border-[var(--glow-color)] p-4 text-sm font-mono text-gray-300 focus:outline-none transition-all resize-none shadow-lg" placeholder="What is this story about?" /></div>
            </div>
          )}
          {(activeTab === 'lore' || activeTab === 'profile') && (
            <div className="h-full flex flex-col animate-fade-in relative z-10">
              <div className="flex justify-between items-end mb-2"><label className="text-xs text-[var(--glow-color)] font-bold tracking-widest uppercase">{activeTab} DATA</label><span className="text-[10px] text-gray-600">MARKDOWN SUPPORTED</span></div>
              <textarea value={activeTab === 'lore' ? lore : profile} onChange={e => activeTab === 'lore' ? setLore(e.target.value) : setProfile(e.target.value)} className="flex-1 bg-black/80 border border-gray-700 focus:border-[var(--glow-color)] p-6 text-sm font-mono text-gray-300 focus:outline-none transition-all resize-none leading-relaxed shadow-inner" spellCheck={false} />
            </div>
          )}
          {activeTab === 'import' && (
             <div className="h-full flex flex-col animate-fade-in relative z-10">
                <div className="mb-4 space-y-2"><h3 className="text-[var(--glow-color)] font-bold tracking-widest">BULK SCRIPT IMPORT</h3></div>
                <textarea value={importText} onChange={e => setImportText(e.target.value)} className="flex-1 bg-black/80 border border-gray-700 focus:border-[var(--glow-color)] p-6 text-xs font-mono text-green-400 focus:outline-none resize-none leading-relaxed shadow-inner font-bold" placeholder="# My Epic Saga&#10;&#10;## Chapter 1: The Beginning&#10;You are standing in a tavern..." />
                <button onClick={handleProcessImport} className="mt-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold tracking-widest text-xs">PROCESS & OVERWRITE CHAPTERS</button>
             </div>
          )}
          {activeTab === 'episodes' && activeEpisode && (
            <div className="h-full flex flex-col animate-fade-in space-y-4 relative z-10">
              <div className="flex items-center gap-4 shrink-0 p-4 border border-gray-800 bg-black/40">
                 <div className="flex-1"><label className="text-[10px] text-gray-500 font-bold tracking-widest mb-1 block">CHAPTER TITLE</label><input value={activeEpisode.name} onChange={e => updateEpisode(activeEpisode.id, 'name', e.target.value)} className="w-full bg-transparent border-b border-gray-700 focus:border-[var(--glow-color)] py-2 text-xl font-mono text-white focus:outline-none" /></div>
                 <div className="text-right"><div className="text-[10px] text-gray-600">POSITION: {episodes.findIndex(e => e.id === activeEpisode.id) + 1} / {episodes.length}</div><div className="text-[10px] text-[var(--glow-color)] animate-pulse">● EDITING</div></div>
              </div>
              <div className="flex-1 flex flex-col"><label className="text-[10px] text-gray-500 font-bold tracking-widest mb-2 block">CONTEXT / PROMPT</label><textarea value={activeEpisode.context} onChange={e => updateEpisode(activeEpisode.id, 'context', e.target.value)} className="flex-1 bg-black/80 border border-gray-700 focus:border-[var(--glow-color)] p-6 text-sm font-mono text-gray-300 focus:outline-none resize-none leading-relaxed shadow-inner" placeholder="Describe the scene..." /></div>
            </div>
          )}
          {activeTab === 'episodes' && !activeEpisode && (
             <div className="h-full flex items-center justify-center opacity-30"><div className="text-center"><div className="text-6xl mb-4 text-[var(--glow-color)]">←</div><div className="tracking-widest">SELECT A CHAPTER TO BEGIN</div></div></div>
          )}
        </div>
      </div>
      <div className="h-16 border-t border-[var(--border-color)] bg-[var(--bg-tint)] flex items-center justify-end px-6 gap-4 shrink-0">
        <div className="mr-auto text-xs font-mono">{errorMsg ? <span className="text-red-500 font-bold animate-pulse">ERROR: {errorMsg.toUpperCase()}</span> : <span className="text-gray-500">// SYSTEM_STATUS: {episodes.length} CHAPTERS_READY</span>}</div>
        <button onClick={onClose} disabled={isSaving} className="px-6 py-2 border border-transparent text-gray-500 hover:text-white hover:border-gray-700 text-xs tracking-wider transition-all">DISCARD CHANGES</button>
        <button onClick={handleSave} disabled={isSaving} className={cn("px-8 py-2 bg-[var(--border-color)] text-white text-xs font-bold tracking-wider shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all", isSaving ? "opacity-50 cursor-wait" : "hover:bg-[var(--glow-color)] hover:shadow-[0_0_20px_var(--glow-color)] hover:scale-105 active:scale-95", errorMsg && "border border-red-500")}>{isSaving ? "SAVING..." : (errorMsg ? "RETRY SAVE" : "SAVE BLUEPRINT")}</button>
      </div>
    </div>
  );
}

function FinishEpisodeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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
            const updated = { ...state.currentInstance };
            updated.currentEpisodeIndex += 1;
            updated.messages = [];
            updated.summaryHistory.push({ episodeName: currentEp.name, summary: res.summary, timestamp: new Date().toISOString() });
            dispatch({ type: 'UPDATE_INSTANCE', payload: updated });
            onClose();
        }
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-gray-950 border-2 border-red-900/50 p-6 space-y-6">
        <div className="text-center space-y-2"><div className="text-2xl font-bold tracking-widest text-red-500">EPISODE COMPLETE</div><div className="text-gray-400">"{currentEp.name}"</div></div>
        <div className="text-sm text-gray-500 text-center">{loading ? "Analyzing session..." : isLast ? "Advancing will mark campaign complete." : "Proceed to next chapter? Chat history will be summarized."}</div>
        <div className="flex gap-2">
            <button onClick={handleAdvance} disabled={loading} className={cn("flex-1 py-3 font-bold text-sm tracking-wider bg-red-900/20 border border-red-600 text-red-500 hover:bg-red-600 hover:text-black transition-all", loading && "opacity-50")}>{loading ? 'PROCESSING...' : (isLast ? 'FINISH CAMPAIGN' : 'NEXT EPISODE ▶')}</button>
            <button onClick={onClose} disabled={loading} className="px-4 border border-gray-700 text-gray-500 hover:text-white">CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function CRTOverlay() {
  const { state } = useApp();
  const { crtEffects, scanlines, fishbowlIntensity, flickerEnabled } = state.settings;
  if (!crtEffects) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 rounded-[inherit] overflow-hidden">
      {scanlines && <div className="absolute inset-0 z-50" style={{ background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.3) 2px, rgba(0, 0, 0, 0.3) 4px)`, backgroundSize: '100% 4px' }} />}
      <div className="absolute inset-0 z-50" style={{ background: `radial-gradient(circle at center, transparent 50%, rgba(0, 0, 0, 0.4) 100%)` }} />
      {flickerEnabled && <div className="absolute inset-0 z-50 animate-flicker-overlay" style={{ background: 'rgba(255, 255, 255, 0.02)' }} />}
      {fishbowlIntensity > 0 && <div className="absolute inset-0 z-40" style={{ boxShadow: `inset 0 0 ${100 * fishbowlIntensity}px rgba(0, 0, 0, 0.9)` }} />}
      <div className="absolute inset-0 z-50 opacity-10" style={{ background: `linear-gradient(90deg, rgba(255, 0, 0, 0.2) 0%, transparent 2%, transparent 98%, rgba(0, 0, 255, 0.2) 100%)` }} />
    </div>
  );
}

function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const [localSettings, setLocalSettings] = useState<Settings>(state.settings);
  useEffect(() => { if (isOpen) setLocalSettings(state.settings); }, [isOpen, state.settings]);
  if (!isOpen) return null;
  const colorOptions: { value: Settings['colorTheme']; label: string; class: string }[] = [
    { value: 'purple', label: 'PURPLE', class: 'bg-purple-600' }, { value: 'cyan', label: 'CYAN', class: 'bg-cyan-600' }, { value: 'green', label: 'GREEN', class: 'bg-green-600' }, { value: 'amber', label: 'AMBER', class: 'bg-amber-600' }, { value: 'hell', label: 'HELL', class: 'bg-[#ff0000] shadow-[0_0_10px_red]' },
  ];
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-950 border-2 border-gray-700 p-6 space-y-6 text-gray-300 shadow-2xl">
        <h2 className="text-xl font-bold tracking-wider border-b border-gray-800 pb-2">SETTINGS</h2>
        <div className="space-y-4">
            <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">COLOR THEME</label>
                <div className="flex gap-2">{colorOptions.map(c => (<button key={c.value} onClick={() => setLocalSettings({...localSettings, colorTheme: c.value})} className={cn("h-10 flex-1 border border-gray-800 transition-all", c.class, localSettings.colorTheme === c.value ? "ring-2 ring-white scale-105 opacity-100" : "opacity-40 hover:opacity-80")} />))}</div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-4">
                <label className="flex items-center justify-between cursor-pointer col-span-2 bg-white/5 p-2 rounded"><span className="text-sm font-bold">Enable Visual Effects (CRT)</span><input type="checkbox" checked={localSettings.crtEffects} onChange={e => setLocalSettings({...localSettings, crtEffects: e.target.checked})} className="accent-gray-500 scale-125" /></label>
                <label className="flex items-center justify-between cursor-pointer bg-white/5 p-2 rounded"><span className="text-sm">3D Perspective</span><input type="checkbox" checked={localSettings.enablePerspective} onChange={e => setLocalSettings({...localSettings, enablePerspective: e.target.checked})} disabled={!localSettings.crtEffects} className="accent-gray-500 scale-125 disabled:opacity-50" /></label>
                <label className="flex items-center justify-between cursor-pointer bg-white/5 p-2 rounded"><span className="text-sm">Scanlines</span><input type="checkbox" checked={localSettings.scanlines} onChange={e => setLocalSettings({...localSettings, scanlines: e.target.checked})} disabled={!localSettings.crtEffects} className="accent-gray-500 scale-125 disabled:opacity-50" /></label>
            </div>
            <div className={cn("transition-opacity", !localSettings.crtEffects && "opacity-30 pointer-events-none")}>
                 <div className="flex justify-between text-xs text-gray-500 mb-1"><span>FISHBOWL INTENSITY</span><span>{(localSettings.fishbowlIntensity * 100).toFixed(0)}%</span></div>
                 <input type="range" min="0" max="0.5" step="0.05" value={localSettings.fishbowlIntensity} onChange={e => setLocalSettings({...localSettings, fishbowlIntensity: parseFloat(e.target.value)})} className="w-full" />
            </div>
            <div className="pt-2 border-t border-gray-800"><label className="text-xs font-bold text-gray-500 mb-1 block">CHAT MODEL ID</label><input value={localSettings.model} onChange={e => setLocalSettings({...localSettings, model: e.target.value})} className="w-full bg-black/50 border border-gray-700 p-2 text-sm font-mono text-gray-400" /></div>
        </div>
        <div className="flex gap-2 pt-4"><button onClick={() => { dispatch({type: 'UPDATE_SETTINGS', payload: localSettings}); onClose(); }} className="flex-1 py-3 bg-white/10 hover:bg-white/20 font-bold border border-white/10">SAVE CHANGES</button><button onClick={onClose} className="flex-1 py-3 border border-gray-700 text-gray-500 hover:text-white">CANCEL</button></div>
      </div>
    </div>
  );
}

function ChatMessage({ message, isStreaming, streamingText, onEdit, onDelete, onRegenerate }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const content = isStreaming ? streamingText : message.content;
  return (
    <div className={cn("relative border-l-2 transition-all group", message.role === 'user' ? "border-l-gray-700 bg-white/5" : "border-l-[var(--border-color)] bg-[var(--bg-tint)]")}>
      {!isStreaming && !isEditing && (
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 bg-black/90 backdrop-blur-sm border-b border-gray-800/50">
          <span className={cn("text-xs font-bold tracking-widest uppercase flex items-center gap-2", message.role === 'user' ? 'text-gray-500' : 'text-[var(--glow-color)] text-theme-glow')}>{message.role === 'user' ? '>> PLAYER' : '## NARRATOR'}</span>
          <div className="flex gap-1 text-[10px] font-mono"><button onClick={() => setIsEditing(true)} className="px-1.5 py-0.5 hover:text-white text-gray-600 border border-transparent hover:border-gray-600 transition-colors">EDT</button><button onClick={() => onRegenerate(message.id)} className="px-1.5 py-0.5 hover:text-[var(--glow-color)] text-gray-600 border border-transparent hover:border-[var(--border-color)] transition-colors">RGN</button><button onClick={() => onDelete(message.id)} className="px-1.5 py-0.5 hover:text-red-500 text-gray-600 border border-transparent hover:border-red-500/30 transition-colors">DEL</button></div>
        </div>
      )}
      {isStreaming && (
        <div className="sticky top-0 z-10 flex items-center px-4 py-1.5 bg-black/90 backdrop-blur-sm border-b border-gray-800/50">
          <span className={cn("text-xs font-bold tracking-widest uppercase flex items-center gap-2 text-[var(--glow-color)] text-theme-glow")}>## NARRATOR <span className="inline-block w-2 h-4 bg-[var(--glow-color)] animate-blink" /></span>
        </div>
      )}
      <div className="p-4 pt-3">
        {isEditing ? (
          <div className="space-y-2"><textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full h-32 bg-black border border-gray-700 p-2 text-sm text-gray-300 focus:outline-none font-mono" /><div className="flex gap-2"><button onClick={() => { onEdit(message.id, editContent); setIsEditing(false); }} className="px-2 py-1 border border-gray-600 text-xs hover:bg-white/10">SAVE</button><button onClick={() => setIsEditing(false)} className="px-2 py-1 text-gray-500 text-xs">CANCEL</button></div></div>
        ) : (
          <div className="text-gray-300 text-sm font-mono leading-relaxed prose prose-invert prose-sm max-w-none whitespace-pre-wrap"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>{isStreaming && <span className="inline-block w-2 h-4 bg-[var(--glow-color)] animate-blink align-middle ml-0.5" />}</div>
        )}
      </div>
    </div>
  );
}

function Sidebar() {
  const { state, dispatch } = useApp();
  const [view, setView] = useState<'play' | 'shows'>('play');
  const handleDeleteInstance = async (e: React.MouseEvent, id: string) => { e.stopPropagation(); if(confirm("Delete this save file?")) { await api.deleteInstance(id); dispatch({ type: 'REMOVE_INSTANCE', payload: id }); } };
  return (
    <div className="w-72 h-full bg-black/40 border-r border-[var(--border-color)] flex flex-col z-10 relative backdrop-blur-sm">
      <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-tint)]"><div className="text-center"><div className="text-lg font-bold tracking-wider mt-1 text-[var(--glow-color)] text-theme-glow">LOREKEEPER</div></div></div>
      <div className="flex border-b border-[var(--border-color)]"><button onClick={() => setView('play')} className={cn("flex-1 py-3 text-xs font-bold transition-all", view === 'play' ? "bg-white/10 text-white" : "opacity-40 hover:opacity-100")}>SAVES</button><button onClick={() => setView('shows')} className={cn("flex-1 py-3 text-xs font-bold transition-all", view === 'shows' ? "bg-white/10 text-white" : "opacity-40 hover:opacity-100")}>BLUEPRINTS</button></div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {view === 'play' && (
          <>
            {state.instances.length === 0 && <div className="text-center text-xs text-gray-600 mt-8">No active games.</div>}
            {state.instances.map(inst => (
              <div key={inst.id} onClick={() => dispatch({ type: 'SET_CURRENT_INSTANCE', payload: inst })} className={cn("p-3 border cursor-pointer relative group transition-all", state.currentInstance?.id === inst.id ? "border-[var(--glow-color)] bg-[var(--bg-tint)] text-white shadow-[0_0_10px_var(--bg-tint)]" : "border-gray-800 text-gray-500 hover:border-gray-600")}>
                <div className="text-sm font-bold truncate pr-4">{inst.showName}</div>
                <div className="text-xs mt-1 opacity-70">{inst.currentEpisodeIndex >= inst.episodes.length ? "COMPLETE" : `Ep ${inst.currentEpisodeIndex + 1}: ${inst.episodes[inst.currentEpisodeIndex]?.name}`}</div>
                <div className="text-[10px] opacity-40 mt-1">{new Date(inst.lastPlayed).toLocaleDateString()}</div>
                <button onClick={(e) => handleDeleteInstance(e, inst.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-500 font-bold">✕</button>
              </div>
            ))}
          </>
        )}
        {view === 'shows' && (
          <>
            <button onClick={() => dispatch({ type: 'SET_EDITING_SHOW', payload: null })} className="w-full py-3 mb-2 border border-[var(--border-color)] text-[var(--glow-color)] text-xs font-bold tracking-wider hover:bg-white/5 transition">+ NEW BLUEPRINT</button>
            {state.shows.map(show => (
              <div key={show.id} className="p-3 border border-gray-800 text-gray-500 hover:border-gray-600 relative group">
                <div className="text-sm font-bold truncate pr-6">{show.name}</div>
                <div className="text-[10px] opacity-40 mt-1">{show.episodes.length} Chapters</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => dispatch({ type: 'SET_EDITING_SHOW', payload: show })} className="text-[10px] border border-gray-700 px-2 py-1 hover:text-white">EDIT</button>
                  <button onClick={async () => { const inst = await api.createInstance(show.id); dispatch({ type: 'ADD_INSTANCE', payload: inst }); dispatch({ type: 'SET_CURRENT_INSTANCE', payload: inst }); setView('play'); }} className="text-[10px] border border-gray-700 px-2 py-1 hover:text-white hover:bg-white/10">PLAY</button>
                </div>
                <button onClick={async (e) => { e.stopPropagation(); if(confirm("Delete blueprint?")) { await api.deleteShow(show.id); dispatch({ type: 'REMOVE_SHOW', payload: show.id }); }}} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-500 font-bold">✕</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ChatArea() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState('');
  const [rewindingTo, setRewindingTo] = useState<string | null>(null);
  const [transitionMode, setTransitionMode] = useState<'rewind' | 'regenerate'>('regenerate');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { playMessageSent, playKeyClick } = useSound(state.settings.soundEnabled);
  const colors = themeColors[state.settings.colorTheme as keyof typeof themeColors];
  const borderCol = state.settings.colorTheme === 'purple' ? 'border-purple-500' : state.settings.colorTheme === 'cyan' ? 'border-cyan-500' : state.settings.colorTheme === 'green' ? 'border-green-500' : state.settings.colorTheme === 'amber' ? 'border-amber-500' : 'border-red-600';

  useLayoutEffect(() => { if (messagesContainerRef.current) messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight; }, [state.messages, state.streamingText]);

  const sendToAPI = useCallback(async (userMessage: string, historyOverride?: any[]) => {
    dispatch({ type: 'SET_GENERATING', payload: true });
    let fullResponse = '';
    try {
      const history = historyOverride || state.messages.map(m => ({ role: m.role, content: m.content }));
      const request = { message: userMessage, model: state.settings.model, instanceId: state.currentInstance?.id, history: history, lore: state.lore, profile: state.profile };
      for await (const token of api.chat(request)) { fullResponse += token; dispatch({ type: 'SET_STREAMING_TEXT', payload: fullResponse }); }
      dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'ai', content: fullResponse } });
      dispatch({ type: 'UPDATE_TOKEN_USAGE', payload: { prompt: userMessage.length, response: fullResponse.length } });
    } catch (error) { console.error(error); dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'ai', content: "Error: Backend unreachable." } }); }
    dispatch({ type: 'SET_STREAMING_TEXT', payload: '' }); dispatch({ type: 'SET_GENERATING', payload: false });
  }, [dispatch, state.currentInstance, state.messages, state.lore, state.profile, state.settings.model]);

  const onRewindComplete = useCallback(() => {
    if (!rewindingTo || !state.currentInstance) { setRewindingTo(null); return; }
    const index = state.messages.findIndex(m => m.id === rewindingTo);
    if (index === -1) { setRewindingTo(null); return; }
    const message = state.messages[index];
    let newMessages;
    let lastUserMessage = '';
    if (transitionMode === 'rewind') {
        newMessages = state.messages.slice(0, index + 1);
        dispatch({ type: 'SET_MESSAGES', payload: newMessages });
        setRewindingTo(null);
    } else {
        if (message.role === 'ai') {
            newMessages = state.messages.slice(0, index);
            const lastUserIndex = [...newMessages].reverse().findIndex(m => m.role === 'user');
            if (lastUserIndex !== -1) lastUserMessage = newMessages[newMessages.length - 1 - lastUserIndex].content;
        } else {
            newMessages = state.messages.slice(0, index + 1);
            lastUserMessage = message.content;
        }
        dispatch({ type: 'SET_MESSAGES', payload: newMessages });
        setRewindingTo(null);
        setTimeout(() => sendToAPI(lastUserMessage, newMessages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }))), 100);
    }
  }, [rewindingTo, state.currentInstance, state.messages, dispatch, sendToAPI, transitionMode]);

  const handleSend = () => {
    if (!input.trim() || state.isGenerating || !state.currentInstance) return;
    playMessageSent();
    const msg = input.trim(); setInput('');
    dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'user', content: msg } });
    setTimeout(() => sendToAPI(msg), 100);
  };

  const currentEp = state.currentInstance ? state.currentInstance.episodes[state.currentInstance.currentEpisodeIndex] : null;
  const isFinished = state.currentInstance && !currentEp;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      <RewindOverlay isActive={rewindingTo !== null} onComplete={onRewindComplete} colorTheme={state.settings.colorTheme} mode={transitionMode} />
      {state.currentInstance && (
        <div className={cn("p-2 border-b border-gray-800 flex justify-between items-center", colors.primary)}>
          <div><span className="text-xs opacity-50 tracking-widest mr-2">INSTANCE:</span><span className="font-bold">{state.currentInstance.showName}</span></div>
          <div><span className="text-xs opacity-50 tracking-widest mr-2">EPISODE:</span><span className="font-bold">{currentEp ? currentEp.name : "CAMPAIGN COMPLETE"}</span></div>
        </div>
      )}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto custom-scrollbar relative">
        {!state.currentInstance ? (
          <div className="h-full flex flex-col items-center justify-center opacity-50"><div className="text-4xl mb-4 font-mono tracking-[0.2em] border border-white/20 px-4 py-2">CRISTOL</div><div className="text-xs tracking-widest">SELECT OR START A CAMPAIGN</div></div>
        ) : isFinished ? (
            <div className="h-full flex flex-col items-center justify-center text-green-500"><div className="text-4xl mb-2">COMPLETE</div><div className="text-sm">You have finished this journey.</div></div>
        ) : state.messages.length === 0 && !state.isGenerating ? (
          <div className="p-8 text-center opacity-70 mt-10"><div className={cn("text-xl mb-4 font-bold", colors.primary)}>CONTEXT</div><div className="italic text-gray-400 max-w-lg mx-auto leading-relaxed">{currentEp?.context}</div><div className="mt-8 text-sm animate-pulse">Waiting for input...</div></div>
        ) : (
          <div className="divide-y divide-gray-800/50 pb-4">
             {state.messages.map((m, i) => ( <ChatMessage key={m.id} message={m} onEdit={(id: string,c: string) => dispatch({type: 'UPDATE_MESSAGE', payload: {id, content:c}})} onDelete={(id: string) => dispatch({type: 'DELETE_MESSAGE', payload: id})} onRegenerate={(id: string) => { if (state.isGenerating) return; setTransitionMode('regenerate'); setRewindingTo(id); }} isLast={i === state.messages.length -1} /> ))}
             {state.streamingText && <ChatMessage message={{id:'stream', role:'ai', content: state.streamingText}} isStreaming onEdit={()=>{}} onDelete={()=>{}} onRegenerate={()=>{}} />}
          </div>
        )}
      </div>
      {state.currentInstance && !isFinished && (
        <div className="p-4 border-t border-gray-800 bg-black/40">
           <div className="flex gap-2">
             <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && e.ctrlKey) handleSend(); else playKeyClick(); }} className={cn("flex-1 h-20 bg-black/50 border p-3 text-sm focus:outline-none resize-none", state.isGenerating ? "border-gray-700" : "border-gray-600 focus:" + borderCol)} placeholder="Action... (Ctrl+Enter)" disabled={state.isGenerating} autoFocus />
             <button onClick={handleSend} disabled={!input.trim() || state.isGenerating} className={cn("px-6 border font-bold text-sm hover:bg-white/10", borderCol, colors.primary)}>{state.isGenerating ? "..." : "SEND"}</button>
           </div>
        </div>
      )}
    </div>
  );
}

function Header({ onOpenSettings, onFinishEpisode }: any) {
  const { state, dispatch } = useApp();
  const textColor = state.settings.colorTheme === 'purple' ? 'text-purple-400' : state.settings.colorTheme === 'cyan' ? 'text-cyan-400' : state.settings.colorTheme === 'green' ? 'text-green-400' : state.settings.colorTheme === 'amber' ? 'text-amber-400' : 'text-red-500';
  const borderColor = state.settings.colorTheme === 'purple' ? 'border-purple-500' : state.settings.colorTheme === 'cyan' ? 'border-cyan-500' : state.settings.colorTheme === 'green' ? 'border-green-500' : state.settings.colorTheme === 'amber' ? 'border-amber-500' : 'border-red-600';
  return (
    <div className={cn("h-12 bg-gray-950/90 border-b-2 border-gray-700 flex items-center justify-between px-4")}>
      <div className={cn("flex items-center gap-3", textColor)}><div className="text-lg">◈</div><div className="font-bold tracking-wider">CRISTOL TERMINAL</div><div className="text-xs text-gray-600 tracking-widest">v2.0</div></div>
      <div className="flex items-center gap-2">
        {state.currentInstance && state.messages.length > 0 &&
          <button onClick={onFinishEpisode} className={cn("px-3 py-1.5 text-xs font-mono tracking-wider border border-[var(--border-color)] text-[var(--glow-color)] hover:bg-[var(--bg-tint)]")}>
            FINISH EPISODE
          </button>
        }
        <button onClick={onOpenSettings} className="p-2 hover:bg-white/10 rounded-full transition-all group"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("w-5 h-5 transition-transform group-hover:rotate-90 duration-300", textColor)}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </div>
    </div>
  );
}

function MainLayout() {
  const { state, dispatch } = useApp();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);

  return (
    <div className={cn("flex h-screen w-screen overflow-hidden bg-black text-gray-200 font-sans selection:bg-[var(--glow-color)] selection:text-white", `theme-${state.settings.colorTheme}`)} data-theme={state.settings.colorTheme} data-vfx={state.settings.crtEffects ? "enabled" : "disabled"}>
      <CRTOverlay />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <EditShowModal isOpen={!!state.editingShow} onClose={() => dispatch({ type: 'SET_EDITING_SHOW', payload: null })} show={state.editingShow} />
      <FinishEpisodeModal isOpen={isFinishModalOpen} onClose={() => setIsFinishModalOpen(false)} />

      {state.settings.enablePerspective ? (
        <div className="perspective-container">
          <div className="crt-monitor" style={{ "--tilt-x": "0deg", "--scale": "0.95", "--curve": "10px" } as React.CSSProperties}>
             <div className="monitor-glare" />
             <div className="flex flex-col h-full bg-black relative z-10">
               <Header onOpenSettings={() => setIsSettingsOpen(true)} onFinishEpisode={() => setIsFinishModalOpen(true)} />
               <div className="flex-1 flex overflow-hidden">
                 <Sidebar />
                 <ChatArea />
               </div>
             </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full relative z-10">
          <Header onOpenSettings={() => setIsSettingsOpen(true)} onFinishEpisode={() => setIsFinishModalOpen(true)} />
          <div className="flex-1 flex overflow-hidden">
            <Sidebar />
            <ChatArea />
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <MainLayout />
    </AppProvider>
  </React.StrictMode>
);
