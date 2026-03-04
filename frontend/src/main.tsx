import "./index.css";
import React, {
  createContext, useContext, useReducer, useEffect, useState, useRef,
  useCallback, useLayoutEffect, ReactNode
} from 'react';
import ReactDOM from 'react-dom/client';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const themeColors = {
  purple: { primary: 'text-purple-400', bg: 'bg-purple-500', bgOpacity: 'bg-purple-500/50', via: 'via-purple-500/50' },
  cyan: { primary: 'text-cyan-400', bg: 'bg-cyan-500', bgOpacity: 'bg-cyan-500/50', via: 'via-cyan-500/50' },
  green: { primary: 'text-green-400', bg: 'bg-green-500', bgOpacity: 'bg-green-500/50', via: 'via-green-500/50' },
  amber: { primary: 'text-amber-400', bg: 'bg-amber-500', bgOpacity: 'bg-amber-500/50', via: 'via-amber-500/50' },
  mono: { primary: 'text-gray-300', bg: 'bg-gray-500', bgOpacity: 'bg-gray-500/50', via: 'via-gray-500/50' },
  hell: { primary: 'text-red-500', bg: 'bg-red-600', bgOpacity: 'bg-red-600/50', via: 'via-red-600/50' },
};

// === TYPES ===
export interface Message { id: string; role: 'user' | 'ai' | 'assistant'; content: string; }
export interface Episode { id: string; name: string; description?: string; context: string; }
export interface Show { id: string; name: string; description: string; lore: string; profile: string; episodes: Episode[]; }
export interface InstanceSummary { episodeName: string; summary: string; timestamp: string; }
export interface Instance { id: string; showId: string; showName: string; currentEpisodeIndex: number; messages: Message[]; lastPlayed: string; lore: string; profile: string; episodes: Episode[]; summaryHistory: InstanceSummary[]; }
export interface Settings { model: string; summarizationModel: string; systemPrompt: string; apiKey: string; backendUrl: string; colorTheme: 'purple' | 'cyan' | 'green' | 'amber' | 'mono' | 'hell'; crtEffects: boolean; enablePerspective: boolean; scanlines: boolean; fishbowlIntensity: number; soundEnabled: boolean; flickerEnabled: boolean; }
export interface AppState {
  activePanel: string;
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
  backendReady: boolean;
}

// === API ===
export class APIService {
  private ac: AbortController | null = null;
  
  private getBase() {
    try {
      const saved = localStorage.getItem('cristol-v4');
      if (saved) {
        const p = JSON.parse(saved);
        if (p.settings?.backendUrl) return p.settings.backendUrl;
      }
    } catch {}
    return 'http://localhost:5000';
  }

  private async hr(r: Response) { if (!r.ok) { const t = await r.text(); throw new Error(`API Error ${r.status}: ${t || r.statusText}`); } return r.json(); }
  stop() { if (this.ac) { this.ac.abort(); this.ac = null; } }

  async *chat(req: any): AsyncGenerator<string> {
    this.ac = new AbortController();
    try {
      const payload = { ...req, system_prompt: req.systemPrompt, instance_id: req.instanceId };
      const r = await fetch(`${this.getBase()}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: this.ac.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const reader = r.body?.getReader(); if (!reader) throw new Error('No body');
      const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const l of lines) { 
          if (l.startsWith('data: ')) { 
            const d = l.slice(6); 
            if (d.trim() === '[DONE]') return; 
            try { const p = JSON.parse(d); if (p.token !== undefined) yield p.token; } catch { yield d; } 
          } 
        }
      }
    } catch (e) { if ((e as Error).name === 'AbortError') return; throw e; } finally { this.ac = null; }
  }

  async summarizeText(text: string) { return this.hr(await fetch(`${this.getBase()}/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })); }

  async getShows(): Promise<Show[]> { try { const r = await fetch(`${this.getBase()}/shows`); return r.ok ? r.json() : []; } catch { return[]; } }
  async createShow(d: Partial<Show>) { return this.hr(await fetch(`${this.getBase()}/shows`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })); }
  async updateShow(id: string, d: Partial<Show>) { return this.hr(await fetch(`${this.getBase()}/shows/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })); }
  async deleteShow(id: string) { await fetch(`${this.getBase()}/shows/${id}`, { method: 'DELETE' }); }
  async getInstances(): Promise<Instance[]> { try { const r = await fetch(`${this.getBase()}/instances`); return r.ok ? r.json() :[]; } catch { return[]; } }
  async createInstance(showId: string) { return this.hr(await fetch(`${this.getBase()}/instances`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showId }) })); }
  async updateInstance(id: string, d: Partial<Instance>) { return this.hr(await fetch(`${this.getBase()}/instances/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })); }
  async deleteInstance(id: string) { await fetch(`${this.getBase()}/instances/${id}`, { method: 'DELETE' }); }
  async advanceInstance(id: string, m: Message[], model: string, summary: string) { return this.hr(await fetch(`${this.getBase()}/instances/${id}/advance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: m, model, summary }) })); }

  async updateEnvSettings(s: any) {
    try {
      await fetch(`${this.getBase()}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: s.model, system_prompt: s.systemPrompt, summarization_model: s.summarizationModel, api_key: s.apiKey }) });
    } catch {}
  }

  async getEnvSettings() {
    try {
      const r = await fetch(`${this.getBase()}/settings`);
      if (r.ok) { const d = await r.json(); return { model: d.model, systemPrompt: d.system_prompt || d.systemPrompt, summarizationModel: d.summarization_model || d.summarizationModel, apiKey: d.api_key || d.apiKey || '' }; }
      return {};
    } catch { return {}; }
  }
  async healthCheck() { try { return (await fetch(`${this.getBase()}/health`)).ok; } catch { return false; } }
}
export const api = new APIService();

// === HOOKS ===
function useSound(enabled: boolean) {
  const ref = useRef<AudioContext | null>(null);
  const ctx = useCallback(() => { if (!ref.current) ref.current = new AudioContext(); return ref.current; },[]);
  const playKeyClick = useCallback(() => { if (!enabled) return; const c = ctx(); const o = c.createOscillator(); const g = c.createGain(); o.type = 'square'; o.frequency.value = 1200; g.gain.setValueAtTime(0.05, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.05); }, [enabled, ctx]);
  const playMessageSent = useCallback(() => { if (!enabled) return; const c = ctx(); const o = c.createOscillator(); const g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(600, c.currentTime); o.frequency.setValueAtTime(800, c.currentTime + 0.05); g.gain.setValueAtTime(0.08, c.currentTime); g.gain.setValueAtTime(0.001, c.currentTime + 0.1); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.1); }, [enabled, ctx]);
  return { playKeyClick, playMessageSent };
}

// === CONTEXT ===
const STORAGE_KEY = 'cristol-v4';
const defaultSettings: Settings = { model: '', summarizationModel: '', systemPrompt: 'You are a creative narrator for an interactive story. Respond in character, be descriptive and engaging.', apiKey: '', backendUrl: 'http://localhost:5000', colorTheme: 'green', crtEffects: true, enablePerspective: true, scanlines: true, fishbowlIntensity: 0.15, soundEnabled: true, flickerEnabled: true };
export const initialState: AppState = {
  messages:[], currentInstance: null, isGenerating: false, streamingText: '',
  tokenUsage: { prompt: 0, response: 0, total: 0 }, settings: defaultSettings,
  activePanel: 'instances', lore: '', profile: '', shows:[], instances:[],
  editingShow: undefined,
  backendReady: false
};

function initAppState(initial: AppState): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { const parsed = JSON.parse(saved); if (parsed.settings) return { ...initial, settings: { ...initial.settings, ...parsed.settings } }; }
  } catch {}
  return initial;
}

export type Action =
  | { type: 'SET_SHOWS'; payload: Show[] } | { type: 'ADD_SHOW'; payload: Show } | { type: 'UPDATE_SHOW'; payload: Show } | { type: 'REMOVE_SHOW'; payload: string }
  | { type: 'SET_INSTANCES'; payload: Instance[] } | { type: 'ADD_INSTANCE'; payload: Instance } | { type: 'UPDATE_INSTANCE'; payload: Instance } | { type: 'REMOVE_INSTANCE'; payload: string }
  | { type: 'SET_CURRENT_INSTANCE'; payload: Instance | null }
  | { type: 'ADD_MESSAGE'; payload: Message } | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } } | { type: 'DELETE_MESSAGE'; payload: string } | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'SET_GENERATING'; payload: boolean } | { type: 'SET_STREAMING_TEXT'; payload: string }
  | { type: 'UPDATE_TOKEN_USAGE'; payload: { prompt: number; response: number } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'SET_BACKEND_READY'; payload: boolean }
  | { type: 'SET_EDITING_SHOW'; payload: Show | null | undefined };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_BACKEND_READY': return { ...state, backendReady: action.payload };
    case 'SET_SHOWS': return { ...state, shows: action.payload };
    case 'ADD_SHOW': return { ...state, shows:[...state.shows, action.payload] };
    case 'UPDATE_SHOW': return { ...state, shows: state.shows.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'REMOVE_SHOW': return { ...state, shows: state.shows.filter(s => s.id !== action.payload) };
    case 'SET_EDITING_SHOW': return { ...state, editingShow: action.payload };
    case 'SET_INSTANCES': return { ...state, instances: action.payload };
    case 'ADD_INSTANCE': return { ...state, instances:[action.payload, ...state.instances] };
    case 'UPDATE_INSTANCE': {
      const isCurrent = state.currentInstance?.id === action.payload.id;
      return { 
        ...state, 
        instances: state.instances.map(i => i.id === action.payload.id ? action.payload : i), 
        currentInstance: isCurrent ? action.payload : state.currentInstance, 
        lore: isCurrent ? action.payload.lore : state.lore, 
        profile: isCurrent ? action.payload.profile : state.profile,
        messages: isCurrent ? action.payload.messages : state.messages
      };
    }
    case 'REMOVE_INSTANCE': return { ...state, instances: state.instances.filter(i => i.id !== action.payload), currentInstance: state.currentInstance?.id === action.payload ? null : state.currentInstance };
    case 'SET_CURRENT_INSTANCE': return { ...state, currentInstance: action.payload, messages: action.payload ? action.payload.messages :[], lore: action.payload ? action.payload.lore : '', profile: action.payload ? action.payload.profile : '' };
    case 'ADD_MESSAGE': { 
      const m =[...state.messages, action.payload]; 
      if (state.currentInstance) api.updateInstance(state.currentInstance.id, { messages: m }); 
      return { 
        ...state, 
        messages: m,
        currentInstance: state.currentInstance ? { ...state.currentInstance, messages: m } : null,
        instances: state.instances.map(i => i.id === state.currentInstance?.id ? { ...i, messages: m } : i)
      }; 
    }
    case 'UPDATE_MESSAGE': { 
      const m = state.messages.map(x => x.id === action.payload.id ? { ...x, content: action.payload.content } : x); 
      if (state.currentInstance) api.updateInstance(state.currentInstance.id, { messages: m }); 
      return { 
        ...state, 
        messages: m,
        currentInstance: state.currentInstance ? { ...state.currentInstance, messages: m } : null,
        instances: state.instances.map(i => i.id === state.currentInstance?.id ? { ...i, messages: m } : i)
      }; 
    }
    case 'DELETE_MESSAGE': { 
      const m = state.messages.filter(x => x.id !== action.payload); 
      if (state.currentInstance) api.updateInstance(state.currentInstance.id, { messages: m }); 
      return { 
        ...state, 
        messages: m,
        currentInstance: state.currentInstance ? { ...state.currentInstance, messages: m } : null,
        instances: state.instances.map(i => i.id === state.currentInstance?.id ? { ...i, messages: m } : i)
      }; 
    }
    case 'SET_MESSAGES': { 
      if (state.currentInstance) api.updateInstance(state.currentInstance.id, { messages: action.payload }); 
      return { 
        ...state, 
        messages: action.payload,
        currentInstance: state.currentInstance ? { ...state.currentInstance, messages: action.payload } : null,
        instances: state.instances.map(i => i.id === state.currentInstance?.id ? { ...i, messages: action.payload } : i)
      }; 
    }
    case 'SET_GENERATING': return { ...state, isGenerating: action.payload };
    case 'SET_STREAMING_TEXT': return { ...state, streamingText: action.payload };
    case 'UPDATE_TOKEN_USAGE': return { ...state, tokenUsage: { prompt: action.payload.prompt, response: action.payload.response, total: state.tokenUsage.total + action.payload.prompt + action.payload.response } };
    case 'UPDATE_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
    default: return state;
  }
}

export const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState, initAppState);

  useEffect(() => {
    let cancelled = false;
    let timer: any;

    const loadData = async () => {
      try {
        const env = await api.getEnvSettings();
        const payload: Partial<Settings> = {};
        if (env.model) payload.model = env.model;
        if (env.systemPrompt) payload.systemPrompt = env.systemPrompt;
        if (env.summarizationModel) payload.summarizationModel = env.summarizationModel;
        if (env.apiKey !== undefined) payload.apiKey = env.apiKey;
        if (Object.keys(payload).length > 0) dispatch({ type: 'UPDATE_SETTINGS', payload });

        const [sh, inst] = await Promise.all([api.getShows(), api.getInstances()]);
        dispatch({ type: 'SET_SHOWS', payload: sh });
        dispatch({ type: 'SET_INSTANCES', payload: inst });
      } catch {}
    };

    const poll = async () => {
      if (cancelled) return;
      if (await api.healthCheck()) {
        dispatch({ type: 'SET_BACKEND_READY', payload: true });
        await loadData();
      } else {
        dispatch({ type: 'SET_BACKEND_READY', payload: false });
        timer = setTimeout(poll, 2000);
      }
    };

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  },[state.settings.backendUrl]); 

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: state.settings }));
  }, [state.settings]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() { const c = useContext(AppContext); if (!c) throw new Error('useApp must be used within AppProvider'); return c; }

// === ELECTRON API TYPES ===
declare global {
  interface Window {
    electronAPI?: {
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onWindowStateChanged: (callback: (state: string) => void) => void;
    };
  }
}

// === ICONS ===
function CloseIcon({ size = 12 }: { size?: number }) { return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function SettingsIcon({ size = 16 }: { size?: number }) { return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>; }

// === SMALL COMPONENTS ===
function CloseButton({ onClick, large }: { onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; large?: boolean }) { return <button onClick={onClick} className={cn("close-btn", large && "close-btn-lg")} aria-label="Close"><CloseIcon size={large ? 14 : 12} /></button>; }
function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) { return <button onClick={() => !disabled && onChange(!checked)} className={cn("toggle-switch", checked && "active", disabled && "opacity-30 cursor-not-allowed")} role="switch" aria-checked={checked} />; }

function ParaDivider() {
  return (
    <div className="para-divider my-2">
      <div className="para-divider-shard" />
      <div className="para-divider-center" />
      <div className="para-divider-shard" />
    </div>
  );
}

function ParaProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="para-progress">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={cn("para-progress-seg", i < current && "para-progress-seg-fill")} />
      ))}
    </div>
  );
}

// === OVERLAYS ===
function CRTOverlay() {
  const { state } = useApp();
  const { crtEffects, scanlines, fishbowlIntensity, flickerEnabled } = state.settings;
  if (!crtEffects) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {scanlines && <div className="absolute inset-0 z-50" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)', backgroundSize: '100% 4px' }} />}
      {flickerEnabled && <div className="absolute inset-0 z-50 animate-flicker-overlay" style={{ background: 'rgba(255,255,255,0.02)' }} />}
      {fishbowlIntensity > 0 && <div className="absolute inset-0 z-40" style={{ boxShadow: `inset 0 0 ${100 * fishbowlIntensity}px rgba(0,0,0,0.9)` }} />}
    </div>
  );
}

// === CUSTOM CONFIRM MODAL ===
export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = "CONFIRM", cancelText = "CANCEL", isDanger = false }: {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop" onClick={onCancel} />
      <div className="relative w-full max-w-sm bezel-frame p-6 space-y-5 animate-fade-in-scale para-corner-tl para-corner-br">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("para-badge", isDanger ? "para-badge-danger" : "para-badge-glow")}><span>{title}</span></div>
          </div>
          <CloseButton onClick={onCancel} />
        </div>
        <ParaDivider />
        <div className="text-center py-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {message}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { onConfirm(); onCancel(); }} className={cn("para-btn flex-1 py-3", isDanger ? "para-btn-danger" : "para-btn-primary")}><span>{confirmText}</span></button>
          <button onClick={onCancel} className="para-btn py-3"><span>{cancelText}</span></button>
        </div>
      </div>
    </div>
  );
}

// === EDIT SHOW MODAL ===
export function EditShowModal({ isOpen, onClose, show }: { isOpen: boolean; onClose: () => void; show?: Show | null }) {
  const { dispatch } = useApp();
  const[name, setName] = useState(''); const [description, setDescription] = useState(''); const[lore, setLore] = useState(''); const[profile, setProfile] = useState('');
  const [episodes, setEpisodes] = useState<Episode[]>([]); const [activeTab, setActiveTab] = useState<string>('general');
  const[selEpId, setSelEpId] = useState<string | null>(null); const[isSaving, setIsSaving] = useState(false); const [err, setErr] = useState<string | null>(null);
  const[importText, setImportText] = useState(''); const [draggedId, setDraggedId] = useState<string | null>(null); const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{nn: string, ne: Episode[]} | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (show) { setName(show.name); setDescription(show.description); setLore(show.lore); setProfile(show.profile); setEpisodes(show.episodes); if (show.episodes.length > 0) setSelEpId(show.episodes[0].id); }
      else { setName('New Campaign'); setDescription('A new adventure...'); setLore('The world is vast...'); setProfile('You are a traveler...'); const e = { id: Date.now().toString() + Math.random().toString().slice(2, 6), name: 'Chapter 1', context: 'You start here.' }; setEpisodes([e]); setSelEpId(e.id); }
      setActiveTab('general'); setIsSaving(false); setErr(null); setImportText(''); setPendingImport(null);
    }
  },[isOpen, show]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setErr(null); if (!name.trim()) { setErr("TITLE REQUIRED"); setActiveTab('general'); return; }
    setIsSaving(true);
    try { const d = { name, description, lore, profile, episodes }; if (show) { dispatch({ type: 'UPDATE_SHOW', payload: await api.updateShow(show.id, d) }); } else { dispatch({ type: 'ADD_SHOW', payload: await api.createShow(d) }); } onClose(); }
    catch (e: any) { setErr(e.message || "FAILED"); } finally { setIsSaving(false); }
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    const lines = importText.split('\n'); let nn = name; let ne: Episode[] =[]; let cur: Partial<Episode> | null = null; let buf: string[] =[];
    for (const l of lines) { if (l.startsWith('# ')) nn = l.replace('# ', '').trim(); else if (l.startsWith('## ')) { if (cur) { cur.context = buf.join('\n').trim(); ne.push(cur as Episode); } buf =[]; cur = { id: Date.now().toString() + Math.random().toString().slice(2, 6), name: l.replace('## ', '').trim(), context: '' }; } else if (cur) buf.push(l); }
    if (cur) { cur.context = buf.join('\n').trim(); ne.push(cur as Episode); }
    if (ne.length > 0) {
      setPendingImport({ nn, ne });
    }
  };

  const moveEp = (id: string, dir: 'up' | 'down') => { const i = episodes.findIndex(e => e.id === id); const ni = dir === 'up' ? i - 1 : i + 1; if (ni < 0 || ni >= episodes.length) return; const n = [...episodes];[n[i], n[ni]] = [n[ni], n[i]]; setEpisodes(n); };
  const updateEp = (id: string, f: keyof Episode, v: string) => setEpisodes(episodes.map(e => e.id === id ? { ...e, [f]: v } : e));
  const activeEp = episodes.find(e => e.id === selEpId);
  const handleDrop = (e: React.DragEvent, tid: string) => { e.preventDefault(); if (!draggedId || draggedId === tid) { setDraggedId(null); setDragOverId(null); return; } const di = episodes.findIndex(ep => ep.id === draggedId); const ti = episodes.findIndex(ep => ep.id === tid); if (di === -1 || ti === -1) return; const n = [...episodes]; const [d] = n.splice(di, 1); n.splice(ti, 0, d); setEpisodes(n); setDraggedId(null); setDragOverId(null); };

  const tabs =[{ key: 'general', label: 'GENERAL' }, { key: 'lore', label: 'LORE' }, { key: 'profile', label: 'PROFILE' }];

  return (
    <>
      <ConfirmModal
        isOpen={!!pendingImport}
        title="OVERWRITE CHAPTERS"
        message={pendingImport ? `Parsed ${pendingImport.ne.length} episodes. Replace existing chapters?` : ''}
        confirmText="REPLACE"
        isDanger={true}
        onConfirm={() => {
          if (pendingImport) {
            setName(pendingImport.nn);
            setEpisodes(pendingImport.ne);
            setSelEpId(pendingImport.ne[0].id);
            setActiveTab('episodes');
            setImportText('');
          }
        }}
        onCancel={() => setPendingImport(null)}
      />
      <div className="absolute inset-0 z-[100] flex flex-col animate-fade-in-scale" style={{ background: 'var(--surface-1)' }}>
        <div className="bezel-toolbar h-12 flex items-center justify-between px-4 select-none shrink-0 para-header">
          <div className="flex items-center gap-3 relative z-10">
            <div className="bezel-led animate-led-pulse" />
            <span className="text-sm font-semibold tracking-wider text-emboss uppercase" style={{ color: 'var(--text-primary)' }}>{show ? `EDIT: ${show.name}` : 'NEW BLUEPRINT'}</span>
            <div className="para-badge-glow para-badge"><span>EDITOR</span></div>
          </div>
          <CloseButton onClick={onClose} large />
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-56 flex flex-col shrink-0 bezel-raised" style={{ borderRight: '2px solid rgba(0,0,0,0.5)' }}>
            <div className="p-3 space-y-1">
              <div className="text-[9px] font-bold tracking-[0.2em] text-engrave px-2 py-2" style={{ color: 'var(--text-dim)' }}>CONFIG</div>
              <div className="flex flex-col gap-1">
                {tabs.map(t => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    className={cn("para-tab w-full", activeTab === t.key && "para-tab-active")}>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <ParaDivider />

            <div className="px-3 pb-2">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-[9px] font-bold tracking-[0.2em] text-engrave" style={{ color: 'var(--text-dim)' }}>CHAPTERS ({episodes.length})</span>
                <div className="flex gap-1">
                  <button onClick={() => setActiveTab('import')} className={cn("para-btn para-btn-sm", activeTab === 'import' && "para-tab-active")}><span>IMP</span></button>
                  <button onClick={() => { const e = { id: Date.now().toString() + Math.random().toString().slice(2, 6), name: 'New Chapter', context: '' }; setEpisodes([...episodes, e]); setSelEpId(e.id); setActiveTab('episodes'); }} className="para-btn para-btn-sm"><span>+</span></button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-1">
              {episodes.map((ep, i) => (
                <div key={ep.id} draggable
                  onDragStart={() => setDraggedId(ep.id)}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                  onDragOver={e => { e.preventDefault(); if (ep.id !== draggedId) setDragOverId(ep.id); }}
                  onDrop={e => handleDrop(e, ep.id)}
                  onClick={() => { setActiveTab('episodes'); setSelEpId(ep.id); }}
                  className={cn(
                    "w-full text-left px-2 py-2 text-[10px] cursor-grab group flex justify-between items-center transition-all select-none relative",
                    (activeTab === 'episodes' && selEpId === ep.id) ? "btn btn-pressed !border-[var(--border-color)]" : "btn btn-ghost",
                    draggedId === ep.id && "opacity-40", dragOverId === ep.id && draggedId !== ep.id && "!border-[var(--accent)]"
                  )}>
                  {(activeTab === 'episodes' && selEpId === ep.id) && <div className="para-accent absolute left-0 top-1 bottom-1" />}
                  <div className="flex items-center gap-2 flex-1 min-w-0 ml-2">
                    <span className="font-mono opacity-40" style={{ color: 'var(--text-dim)', fontSize: '9px' }}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="truncate font-medium">{ep.name}</span>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                    <button onClick={e => { e.stopPropagation(); moveEp(ep.id, 'up'); }} disabled={i === 0} className="btn btn-ghost btn-sm !p-0.5 disabled:opacity-20">↑</button>
                    <button onClick={e => { e.stopPropagation(); moveEp(ep.id, 'down'); }} disabled={i === episodes.length - 1} className="btn btn-ghost btn-sm !p-0.5 disabled:opacity-20">↓</button>
                    <button onClick={e => { e.stopPropagation(); setEpisodes(episodes.filter(x => x.id !== ep.id)); }} className="btn btn-ghost btn-sm !p-0.5 hover:!text-red-400">×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar" style={{ background: 'var(--surface-1)' }}>
            <div className="bezel-well p-6 h-full">
              {activeTab === 'general' && (
                <div className="max-w-2xl space-y-6 animate-fade-in">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="para-accent-wide" style={{ height: '20px' }} />
                    <span className="text-xs font-bold tracking-[0.15em] text-emboss uppercase" style={{ color: 'var(--accent)' }}>General Settings</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>Campaign Title</label>
                    <input value={name} onChange={e => setName(e.target.value)} className="input-field w-full text-lg font-semibold" placeholder="Enter title..." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>Description</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} className="textarea-field font-story w-full h-40" placeholder="What is this story about?" />
                  </div>
                </div>
              )}
              {(activeTab === 'lore' || activeTab === 'profile') && (
                <div className="h-full flex flex-col animate-fade-in">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-3">
                      <div className="para-accent-wide" style={{ height: '20px' }} />
                      <span className="text-xs font-bold tracking-[0.15em] text-emboss uppercase" style={{ color: 'var(--accent)' }}>{activeTab} Data</span>
                    </div>
                    <div className="para-badge"><span>MARKDOWN</span></div>
                  </div>
                  <textarea value={activeTab === 'lore' ? lore : profile} onChange={e => activeTab === 'lore' ? setLore(e.target.value) : setProfile(e.target.value)} className="textarea-field font-story flex-1" spellCheck={false} />
                </div>
              )}
              {activeTab === 'import' && (
                <div className="h-full flex flex-col animate-fade-in">
                  <div className="flex items-center gap-3 mb-3"><div className="para-accent-wide" style={{ height: '20px' }} /><span className="text-xs font-bold tracking-[0.15em] text-emboss uppercase" style={{ color: 'var(--accent)' }}>Bulk Import</span></div>
                  <textarea value={importText} onChange={e => setImportText(e.target.value)} className="textarea-field font-story flex-1" style={{ color: '#22c55e' }} placeholder="# My Saga&#10;&#10;## Chapter 1&#10;You begin..." />
                  <button onClick={handleImport} className="para-btn para-btn-primary mt-4 w-full py-3"><span>PROCESS & OVERWRITE CHAPTERS</span></button>
                </div>
              )}
              {activeTab === 'episodes' && activeEp && (
                <div className="h-full flex flex-col animate-fade-in space-y-4">
                  <div className="bezel-raised p-4 flex items-center justify-between para-corner-tl para-corner-br relative">
                    <div className="flex-1">
                      <label className="text-[9px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>Chapter Title</label>
                      <input value={activeEp.name} onChange={e => updateEp(activeEp.id, 'name', e.target.value)} className="input-field w-full text-lg font-semibold mt-1" />
                    </div>
                    <div className="text-right ml-4 space-y-1">
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>POS: {episodes.findIndex(e => e.id === activeEp.id) + 1}/{episodes.length}</div>
                      <ParaProgress current={episodes.findIndex(e => e.id === activeEp.id) + 1} total={episodes.length} />
                      <div className="flex items-center gap-1.5 mt-1 justify-end"><div className="bezel-led animate-led-pulse" /><span className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>EDITING</span></div>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <label className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--text-dim)' }}>Context / Prompt</label>
                    <textarea value={activeEp.context} onChange={e => updateEp(activeEp.id, 'context', e.target.value)} className="textarea-field font-story flex-1" placeholder="Describe the scene..." />
                  </div>
                </div>
              )}
              {activeTab === 'episodes' && !activeEp && (
                <div className="h-full flex items-center justify-center opacity-20"><div className="text-center"><div className="text-4xl mb-4" style={{ color: 'var(--accent)' }}>←</div><div className="tracking-widest text-sm text-emboss">SELECT A CHAPTER</div></div></div>
              )}
            </div>
          </div>
        </div>

        <div className="bezel-statusbar h-14 flex items-center justify-end px-5 gap-3 shrink-0">
          <div className="mr-auto text-[11px] font-mono">{err ? <span className="text-red-400 font-bold animate-blink">⚠ {err}</span> : <span style={{ color: 'var(--text-dim)' }}>{episodes.length} chapters ready</span>}</div>
          <button onClick={onClose} disabled={isSaving} className="para-btn"><span>DISCARD</span></button>
          <button onClick={handleSave} disabled={isSaving} className={cn("para-btn para-btn-primary", isSaving && "opacity-50")}><span>{isSaving ? "SAVING..." : err ? "RETRY" : "SAVE"}</span></button>
        </div>
      </div>
    </>
  );
}

// === INJECT PRIOR SUMMARY MODAL ===
export function InjectSummaryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const[text, setText] = useState('');
  const[loading, setLoading] = useState(false);

  useEffect(() => { if (isOpen) setText(''); }, [isOpen]);
  if (!isOpen || !state.currentInstance) return null;

  const handleSave = async () => {
    if (!state.currentInstance) return;
    setLoading(true);
    try {
      const newHist =[...(state.currentInstance.summaryHistory || []), { episodeName: 'Injected Context', summary: text, timestamp: new Date().toISOString() }];
      const updated = await api.updateInstance(state.currentInstance.id, { summaryHistory: newHist });
      dispatch({ type: 'UPDATE_INSTANCE', payload: updated });
      onClose();
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop" onClick={onClose} />
      <div className="relative w-full max-w-lg bezel-frame p-6 animate-fade-in-scale space-y-4">
        <div className="flex justify-between items-center"><span className="text-xs font-bold text-emboss" style={{ color: 'var(--accent)' }}>INJECT PRIOR SUMMARY</span><CloseButton onClick={onClose} /></div>
        <textarea value={text} onChange={e => setText(e.target.value)} className="textarea-field font-story w-full h-48 text-sm" placeholder="Paste established events from a prior session/website to catch the Narrator up..." autoFocus />
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={loading || !text.trim()} className={cn("para-btn para-btn-primary flex-1 py-3", (loading || !text.trim()) && "opacity-50")}><span>SAVE & APPLY</span></button>
          <button onClick={onClose} className="para-btn py-3"><span>CANCEL</span></button>
        </div>
      </div>
    </div>
  );
}

// === FINISH EPISODE MODAL ===
export function FinishEpisodeModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'prompt' | 'edit'>('prompt');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (isOpen) { setStep('prompt'); setSummary(''); setLoading(false); }
  },[isOpen, state.currentInstance]);

  if (!isOpen || !state.currentInstance) return null;
  const ep = state.currentInstance.episodes[state.currentInstance.currentEpisodeIndex];
  if (!ep) return null;
  const isLast = state.currentInstance.currentEpisodeIndex >= state.currentInstance.episodes.length - 1;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const transcript = state.messages.map(m => `${m.role === 'user' ? 'USER' : 'STORY'}:\n${m.content}`).join('\n\n');
      const res = await api.summarizeText(transcript);
      setSummary(res.summary);
      setStep('edit');
    } catch {
      setSummary("[Summary generation failed. Write manually.]");
      setStep('edit');
    } finally {
      setLoading(false);
    }
  };

  const handleAdvance = async () => {
    if (!state.currentInstance) return;
    setLoading(true);
    try {
      const r = await api.advanceInstance(state.currentInstance.id, state.messages, state.settings.model, summary);
      if (r.success || r) {
        const newHist = [...(state.currentInstance.summaryHistory || []), { episodeName: ep.name, summary: summary, timestamp: new Date().toISOString() }];
        const newInstance = { 
          ...state.currentInstance, 
          currentEpisodeIndex: state.currentInstance.currentEpisodeIndex + 1, 
          messages: [], 
          summaryHistory: newHist 
        };
        dispatch({ type: 'UPDATE_INSTANCE', payload: newInstance });
        onClose();
      }
    } catch {} finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop" onClick={onClose} />
      <div className="relative w-full max-w-lg bezel-frame p-6 space-y-5 animate-fade-in-scale para-corner-tl para-corner-br">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="para-badge-danger para-badge"><span>EPISODE COMPLETE</span></div></div>
          <CloseButton onClick={onClose} />
        </div>
        <ParaDivider />

        {step === 'prompt' ? (
          <div className="text-center py-2 space-y-4">
            <div className="text-xl font-bold text-emboss" style={{ color: 'var(--text-primary)' }}>"{ep.name}"</div>
            <ParaProgress current={state.currentInstance.currentEpisodeIndex + 1} total={state.currentInstance.episodes.length} />
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{isLast ? "This completes the campaign. Ready to finalize?" : "Proceed to next chapter?"}</div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleGenerate} disabled={loading} className={cn("para-btn para-btn-primary flex-1 py-3", loading && "opacity-50")}><span>{loading ? 'GENERATING...' : 'GENERATE SUMMARY'}</span></button>
              <button onClick={onClose} disabled={loading} className="para-btn py-3"><span>CANCEL</span></button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-[10px] tracking-widest font-bold uppercase" style={{ color: 'var(--accent)' }}>REVIEW SUMMARY</div>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} className="textarea-field font-story w-full h-48 text-sm" />
            <div className="flex gap-2">
              <button onClick={handleAdvance} disabled={loading || !summary.trim()} className={cn("para-btn para-btn-danger flex-1 py-3", (loading || !summary.trim()) && "opacity-50")}><span>{loading ? 'PROCESSING...' : isLast ? 'FINISH SAGA ■' : 'CONFIRM & NEXT ▶'}</span></button>
              <button onClick={() => setStep('prompt')} disabled={loading} className="para-btn py-3"><span>BACK</span></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// === SETTINGS MODAL ===
export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const [local, setLocal] = useState<Settings>(state.settings);
  const [tab, setTab] = useState<'theme' | 'model' | 'effects'>('theme');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (isOpen) { setLocal(state.settings); setTab('theme'); } },[isOpen, state.settings]);
  if (!isOpen) return null;

  const colors: { value: Settings['colorTheme']; label: string; swatch: string }[] =[
    { value: 'purple', label: 'PURPLE', swatch: '#a855f7' }, { value: 'cyan', label: 'CYAN', swatch: '#06b6d4' },
    { value: 'green', label: 'GREEN', swatch: '#22c55e' }, { value: 'amber', label: 'AMBER', swatch: '#f59e0b' },
    { value: 'mono', label: 'MONO', swatch: '#888' }, { value: 'hell', label: 'HELL', swatch: '#ef4444' },
  ];
  const presets =[{ label: 'GPT-4o', value: 'gpt-4o' }, { label: 'GPT-4o Mini', value: 'gpt-4o-mini' }, { label: 'Claude Sonnet', value: 'claude-3-5-sonnet-20241022' }, { label: 'Llama 3.1 70B', value: 'llama-3.1-70b' }, { label: 'Custom', value: '' }];
  
  const handleSave = async () => { 
    setSaving(true); 
    dispatch({ type: 'UPDATE_SETTINGS', payload: local }); 
    await api.updateEnvSettings({ model: local.model, systemPrompt: local.systemPrompt, summarizationModel: local.summarizationModel, apiKey: local.apiKey }); 
    setSaving(false); 
    onClose(); 
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop" onClick={onClose} />
      <div className="relative w-full max-w-xl bezel-frame animate-fade-in-scale overflow-hidden">
        <div className="bezel-toolbar flex items-center justify-between px-5 py-3 para-header">
          <div className="flex items-center gap-3 relative z-10"><div className="bezel-led animate-led-pulse" /><h2 className="text-sm font-bold tracking-wider text-emboss" style={{ color: 'var(--text-primary)' }}>SETTINGS</h2></div>
          <CloseButton onClick={onClose} large />
        </div>

        <div className="flex px-4 py-2 gap-1" style={{ background: 'var(--surface-2)', borderBottom: '1px solid rgba(0,0,0,0.4)' }}>
          {[{ k: 'theme', l: 'THEME' }, { k: 'model', l: 'MODEL & AI' }, { k: 'effects', l: 'EFFECTS' }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k as any)} className={cn("para-tab flex-1", tab === t.k && "para-tab-active")}><span>{t.l}</span></button>
          ))}
        </div>

        <div className="p-5 max-h-[55vh] overflow-y-auto custom-scrollbar" style={{ background: 'var(--surface-1)' }}>
          <div className="bezel-well p-5 space-y-5">
            {tab === 'theme' && (
              <div className="animate-fade-in space-y-4">
                <div className="flex items-center gap-3"><div className="para-accent-wide" style={{ height: '16px' }} /><span className="text-[10px] font-bold tracking-[0.15em] text-engrave uppercase" style={{ color: 'var(--text-dim)' }}>Color Theme</span></div>
                <div className="grid grid-cols-3 gap-2">
                  {colors.map(c => (
                    <button key={c.value} onClick={() => setLocal({ ...local, colorTheme: c.value })}
                      className={cn("btn h-14 flex flex-col items-center justify-center gap-1 relative overflow-hidden", local.colorTheme === c.value && "btn-pressed !border-[var(--border-color)]")}>
                      <div className="w-4 h-4" style={{ background: c.swatch, border: '1px solid rgba(0,0,0,0.4)', boxShadow: local.colorTheme === c.value ? `0 0 6px ${c.swatch}, 0 0 12px ${c.swatch}40` : 'inset 0 1px 2px rgba(0,0,0,0.3)' }} />
                      <span className="text-[8px] tracking-widest">{c.label}</span>
                      {local.colorTheme === c.value && <div className="absolute right-0 top-0 bottom-0 w-3 opacity-50" style={{ background: c.swatch, transform: 'skewX(var(--skew))' }} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab === 'model' && (
              <div className="animate-fade-in space-y-5">
                <div>
                  <div className="flex items-center gap-3 mb-2"><div className="para-accent" style={{ height: '14px' }} /><label className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>Backend URL</label></div>
                  <input value={local.backendUrl} onChange={e => setLocal({ ...local, backendUrl: e.target.value })} className="input-field input-mono w-full text-[12px]" placeholder="http://localhost:5000" />
                </div>
                <ParaDivider />
                <div>
                  <div className="flex items-center gap-3 mb-2"><div className="para-accent" style={{ height: '14px' }} /><label className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>OpenRouter API Key</label></div>
                  <input type="password" value={local.apiKey} onChange={e => setLocal({ ...local, apiKey: e.target.value })} className="input-field input-mono w-full text-[12px]" placeholder="sk-or-v1-..." />
                </div>
                <ParaDivider />
                <div>
                  <div className="flex items-center gap-3 mb-2"><div className="para-accent" style={{ height: '14px' }} /><label className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>Chat Model</label></div>
                  <select value={presets.find(p => p.value === local.model) ? local.model : ''} onChange={e => { if (e.target.value !== '') setLocal({ ...local, model: e.target.value }); }} className="select-field w-full mb-2">{presets.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
                  <input value={local.model} onChange={e => setLocal({ ...local, model: e.target.value })} className="input-field input-mono w-full text-[12px]" placeholder="Or custom model ID..." />
                </div>
                <ParaDivider />
                <div>
                  <div className="flex items-center gap-3 mb-2"><div className="para-accent" style={{ height: '14px' }} /><label className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>Summarization Model</label></div>
                  <input value={local.summarizationModel} onChange={e => setLocal({ ...local, summarizationModel: e.target.value })} className="input-field input-mono w-full text-[12px]" placeholder="Leave empty for chat model..." />
                </div>
                <ParaDivider />
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-3"><div className="para-accent" style={{ height: '14px' }} /><label className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-dim)' }}>System Prompt</label></div>
                    <div className="para-badge-glow para-badge"><span>ENV</span></div>
                  </div>
                  <textarea value={local.systemPrompt} onChange={e => setLocal({ ...local, systemPrompt: e.target.value })} className="textarea-field font-editor w-full h-28 text-sm" placeholder="You are..." />
                  <p className="text-[9px] mt-1" style={{ color: 'var(--text-dim)' }}>Base prompt. Lore/profile appended per instance.</p>
                </div>
              </div>
            )}
            {tab === 'effects' && (
              <div className="animate-fade-in space-y-2">
                {[
                  { label: 'CRT Visual Effects', key: 'crtEffects' as const, desc: 'Master VFX toggle' },
                  { label: '3D Perspective', key: 'enablePerspective' as const, desc: 'Subtle tilt', p: 'crtEffects' as const },
                  { label: 'Scanlines', key: 'scanlines' as const, desc: 'Horizontal lines', p: 'crtEffects' as const },
                  { label: 'Screen Flicker', key: 'flickerEnabled' as const, desc: 'Brightness variation', p: 'crtEffects' as const },
                  { label: 'Sound Effects', key: 'soundEnabled' as const, desc: 'UI sounds' },
                ].map(item => (
                  <div key={item.key} className={cn("bezel-raised flex items-center justify-between p-3 relative overflow-hidden", item.p && !local[item.p] && "opacity-30", item.p && "ml-5")}>
                    {local[item.key] && <div className="para-accent absolute left-0 top-1 bottom-1" />}
                    <div className="ml-3">
                      <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{item.desc}</div>
                    </div>
                    <ToggleSwitch checked={local[item.key] as boolean} onChange={v => setLocal({ ...local, [item.key]: v })} disabled={!!(item.p && !local[item.p])} />
                  </div>
                ))}
                <div className={cn("bezel-raised p-3", !local.crtEffects && "opacity-30 pointer-events-none")}>
                  <div className="flex justify-between text-[11px] mb-2"><span style={{ color: 'var(--text-secondary)' }}>Fishbowl</span><span className="font-mono" style={{ color: 'var(--text-dim)' }}>{(local.fishbowlIntensity * 100).toFixed(0)}%</span></div>
                  <input type="range" min="0" max="0.5" step="0.05" value={local.fishbowlIntensity} onChange={e => setLocal({ ...local, fishbowlIntensity: parseFloat(e.target.value) })} className="w-full" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bezel-statusbar flex gap-2 px-5 py-3">
          <button onClick={handleSave} disabled={saving} className={cn("para-btn para-btn-primary flex-1 py-2.5", saving && "opacity-50")}><span>{saving ? 'SAVING...' : 'SAVE'}</span></button>
          <button onClick={onClose} className="para-btn flex-1 py-2.5"><span>CANCEL</span></button>
        </div>
      </div>
    </div>
  );
}

// === CHAT MESSAGE ===
function ChatMessage({ message, isStreaming, streamingText, onEdit, onDelete, onRegenerate }: {
  message: Message | { id: string; role: string; content: string };
  isStreaming: boolean;
  streamingText: string;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
}) {
  const[editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const content = isStreaming ? streamingText : message.content;
  const isUser = message.role === 'user';

  return (
    <div className={cn("relative group transition-all")} style={{ background: isUser ? 'var(--surface-2)' : 'var(--bg-tint)' }}>
      <div className="px-5 py-5">
        {!editing && (
          <div className="sticky top-3 float-right z-20 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ml-2">
            <button onClick={() => onRegenerate(message.id)} disabled={isStreaming} className={cn("para-btn para-btn-sm", isStreaming && "opacity-30 cursor-not-allowed")}><span>↻</span></button>
            <button onClick={() => { setEditContent(message.content); setEditing(true); }} disabled={isStreaming} className={cn("para-btn para-btn-sm", isStreaming && "opacity-30 cursor-not-allowed")}><span>✎</span></button>
            <button onClick={() => onDelete(message.id)} disabled={isStreaming} className={cn("para-btn para-btn-sm para-btn-danger", isStreaming && "opacity-30 cursor-not-allowed")}><span>✕</span></button>
          </div>
        )}

        <div className={cn("text-[9px] font-bold tracking-[0.2em] mb-3 uppercase flex items-center gap-2 select-none", isUser ? 'text-engrave' : 'glow-text')}>
          <div className={cn("w-2 h-2", isUser ? "bezel-led-off" : "bezel-led animate-led-pulse")} />
          <span style={{ color: isUser ? 'var(--text-dim)' : 'var(--accent)' }}>{isUser ? 'PLAYER' : 'NARRATOR'}</span>
          {!isUser && <div className="para-badge"><span>AI</span></div>}
          {isStreaming && <span className="animate-blink" style={{ color: 'var(--accent)' }}>▊</span>}
        </div>

        {editing ? (
          <div className="space-y-3 animate-fade-in">
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="textarea-field w-full custom-scrollbar" style={{ height: '60vh', fontFamily: 'var(--font-sans)', fontSize: '15px', lineHeight: '1.75', color: 'var(--text-primary)' }} autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { onEdit(message.id, editContent); setEditing(false); }} className="para-btn para-btn-primary para-btn-sm"><span>SAVE</span></button>
              <button onClick={() => setEditing(false)} className="para-btn para-btn-sm"><span>CANCEL</span></button>
            </div>
          </div>
        ) : (
          <div className="prose-chat max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown></div>
        )}
      </div>
      <div className="bezel-separator mx-0" />
    </div>
  );
}

// === SIDEBAR ===
function Sidebar() {
  const { state, dispatch } = useApp();
  const [view, setView] = useState<'play' | 'shows'>('play');
  const [confirmState, setConfirmState] = useState<{title: string, message: string, action: () => void} | null>(null);

  return (
    <>
      <ConfirmModal
        isOpen={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmText="DELETE"
        isDanger={true}
        onConfirm={() => confirmState?.action()}
        onCancel={() => setConfirmState(null)}
      />
      <div className="w-72 h-full flex flex-col z-10 relative bezel-raised" style={{ borderRight: '2px solid rgba(0,0,0,0.5)' }}>
        <div className="bezel-toolbar p-4 para-header">
          <div className="flex items-center gap-3 relative z-10">
            <div className="bezel-frame w-9 h-9 flex items-center justify-center"><span className="text-sm font-bold glow-text-strong" style={{ color: 'var(--accent)' }}>◈</span></div>
            <div>
              <div className="text-sm font-bold tracking-wider text-emboss" style={{ color: 'var(--text-primary)' }}>LOREKEEPER</div>
              <div className="text-[8px] tracking-[0.2em] font-mono" style={{ color: 'var(--text-dim)' }}>TERMINAL v4.2</div>
            </div>
          </div>
        </div>

        <div className="flex p-2 gap-1" style={{ background: 'var(--surface-2)', borderBottom: '1px solid rgba(0,0,0,0.4)' }}>
          <button onClick={() => setView('play')} className={cn("para-tab flex-1", view === 'play' && "para-tab-active")}><span>SAVES</span></button>
          <button onClick={() => setView('shows')} className={cn("para-tab flex-1", view === 'shows' && "para-tab-active")}><span>BLUEPRINTS</span></button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar" style={{ background: 'var(--surface-1)' }}>
          <div className="bezel-well p-2 space-y-2 h-full">
            {view === 'play' && (
              <>
                {state.instances.length === 0 && <div className="text-center mt-12" style={{ color: 'var(--text-dim)' }}><div className="text-2xl opacity-30 mb-2">◇</div><div className="text-[11px] text-engrave">No active games</div></div>}
                {state.instances.map(inst => {
                  const isActive = state.currentInstance?.id === inst.id;
                  const epCount = inst.episodes.length;
                  const currentIdx = inst.currentEpisodeIndex;
                  return (
                    <div key={inst.id} onClick={() => dispatch({ type: 'SET_CURRENT_INSTANCE', payload: inst })}
                      className={cn("card p-3 cursor-pointer group relative overflow-hidden", isActive && "card-active")}>
                      <div className="para-stripe" />
                      <div className="flex items-start justify-between relative z-10">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{inst.showName}</div>
                          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                            {currentIdx >= epCount ? <div className="para-badge-glow para-badge"><span>COMPLETE</span></div> : `Ep ${currentIdx + 1}: ${inst.episodes[currentIdx]?.name}`}
                          </div>
                          {currentIdx < epCount && <div className="mt-2"><ParaProgress current={currentIdx + 1} total={epCount} /></div>}
                          <div className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-dim)' }}>{inst.lastPlayed ? new Date(inst.lastPlayed).toLocaleDateString() : 'Unknown Date'}</div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <CloseButton onClick={(e) => {
                            e.stopPropagation();
                            setConfirmState({
                              title: 'DELETE SAVE',
                              message: `Are you sure you want to delete "${inst.showName}"?`,
                              action: () => { api.deleteInstance(inst.id); dispatch({ type: 'REMOVE_INSTANCE', payload: inst.id }); }
                            });
                          }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {view === 'shows' && (
              <>
                <button onClick={() => dispatch({ type: 'SET_EDITING_SHOW', payload: null })} className="para-btn w-full py-3 mb-1" style={{ color: 'var(--accent)' }}><span>+ NEW BLUEPRINT</span></button>
                {state.shows.map(show => (
                  <div key={show.id} className="card p-3 group relative overflow-hidden">
                    <div className="para-stripe" />
                    <div className="flex items-start justify-between relative z-10">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{show.name}</div>
                        <div className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-dim)' }}>{show.episodes.length} chapters</div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <CloseButton onClick={(e) => {
                          e.stopPropagation();
                          setConfirmState({
                            title: 'DELETE BLUEPRINT',
                            message: `Are you sure you want to delete blueprint "${show.name}"?`,
                            action: () => { api.deleteShow(show.id); dispatch({ type: 'REMOVE_SHOW', payload: show.id }); }
                          });
                        }} />
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-3 relative z-10">
                      <button onClick={() => dispatch({ type: 'SET_EDITING_SHOW', payload: show })} className="para-btn para-btn-sm flex-1"><span>EDIT</span></button>
                      <button onClick={async () => { const i = await api.createInstance(show.id); dispatch({ type: 'ADD_INSTANCE', payload: i }); dispatch({ type: 'SET_CURRENT_INSTANCE', payload: i }); setView('play'); }} className="para-btn para-btn-sm para-btn-primary flex-1"><span>PLAY</span></button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="bezel-statusbar px-3 py-2 flex items-center gap-2">
    <div className={cn("bezel-led", state.backendReady ? "animate-led-pulse" : "bezel-led-off")} />
    <span className="text-[8px] font-mono tracking-widest" style={{ color: 'var(--text-dim)' }}>
      {state.backendReady ? 'SYSTEM ONLINE' : 'CONNECTING...'}
    </span>
    <div className="flex-1" />
    <div className="flex gap-1 opacity-30">
      <div style={{ width: 8, height: 4, background: 'var(--accent)', transform: 'skewX(var(--skew))' }} />
      <div style={{ width: 4, height: 4, background: 'var(--accent)', transform: 'skewX(var(--skew))', opacity: 0.5 }} />
    </div>
  </div>
      </div>
    </>
  );
}

// === CHAT AREA ===
export function ChatArea() {
  const { state, dispatch } = useApp();
  const[input, setInput] = useState('');
  const [injOpen, setInjOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const { playMessageSent, playKeyClick } = useSound(state.settings.soundEnabled);
  const colors = themeColors[state.settings.colorTheme as keyof typeof themeColors];

  const onScroll = useCallback(() => { if (ref.current) { const { scrollTop, scrollHeight, clientHeight } = ref.current; atBottom.current = scrollHeight - scrollTop - clientHeight < 10; } },[]);
  useLayoutEffect(() => { if (atBottom.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight; },[state.messages, state.streamingText]);

  const sendToAPI = useCallback(async (msg: string, hist?: any[]) => {
    dispatch({ type: 'SET_GENERATING', payload: true }); let full = '';
    try {
      const h = hist || state.messages.map(m => ({ role: m.role, content: m.content }));
      for await (const t of api.chat({ message: msg, model: state.settings.model, systemPrompt: state.settings.systemPrompt, instanceId: state.currentInstance?.id, history: h, lore: state.lore, profile: state.profile })) { full += t; dispatch({ type: 'SET_STREAMING_TEXT', payload: full }); }
      dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'ai', content: full } });
    } catch (e) { if ((e as Error).name !== 'AbortError') dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'ai', content: "Error: Backend unreachable." } }); else if (full) dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'ai', content: full + " [STOPPED]" } }); }
    dispatch({ type: 'SET_STREAMING_TEXT', payload: '' }); dispatch({ type: 'SET_GENERATING', payload: false });
  },[dispatch, state.currentInstance, state.messages, state.lore, state.profile, state.settings.model, state.settings.systemPrompt]);

  const handleRegenerate = useCallback((id: string) => {
    if (state.isGenerating || !state.currentInstance) return;
    const idx = state.messages.findIndex(m => m.id === id); if (idx === -1) return;
    
    let nm;
    const msg = state.messages[idx]; 
    if (msg.role === 'ai') { 
      nm = state.messages.slice(0, idx); 
    } else { 
      nm = state.messages.slice(0, idx + 1); 
    }

    const ui = [...nm].reverse().findIndex(m => m.role === 'user');
    let lum = '';
    let hist: any[] = [];
    
    if (ui !== -1) { 
      const actualUi = nm.length - 1 - ui;
      lum = nm[actualUi].content;
      hist = nm.slice(0, actualUi).map(m => ({ role: m.role, content: m.content }));
    } else {
      hist = nm.map(m => ({ role: m.role, content: m.content }));
    }

    dispatch({ type: 'SET_MESSAGES', payload: nm });
    setTimeout(() => sendToAPI(lum, hist), 100);
  },[state.isGenerating, state.currentInstance, state.messages, dispatch, sendToAPI]);

  const handleSend = () => { if (!input.trim() || state.isGenerating || !state.currentInstance) return; playMessageSent(); atBottom.current = true; const m = input.trim(); setInput(''); dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'user', content: m } }); setTimeout(() => sendToAPI(m), 100); };

  const ep = state.currentInstance ? state.currentInstance.episodes[state.currentInstance.currentEpisodeIndex] : null;
  const done = state.currentInstance && !ep;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative" style={{ background: 'var(--surface-1)' }}>
      {state.currentInstance && (
        <div className="bezel-toolbar px-5 py-2.5 flex justify-between items-center select-none shrink-0">
          <div className="flex items-center gap-3">
            <div className="bezel-led animate-led-pulse" />
            <div className="para-badge"><span>INSTANCE</span></div>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{state.currentInstance.showName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="para-badge"><span>EPISODE</span></div>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{ep ? ep.name : <span className="para-badge-glow para-badge"><span>COMPLETE</span></span>}</span>
            {ep && <div className="w-24"><ParaProgress current={state.currentInstance.currentEpisodeIndex + 1} total={state.currentInstance.episodes.length} /></div>}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden p-3">
        <div ref={ref} onScroll={onScroll} className="bezel-well h-full overflow-y-auto custom-scrollbar">
          {!state.currentInstance ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="text-center space-y-4">
                <div className="text-4xl glow-text-strong" style={{ color: 'var(--accent)' }}>◈</div>
                <div className="text-lg font-bold tracking-[0.2em] text-emboss" style={{ color: 'var(--text-primary)' }}>CRISTOL</div>
                <ParaDivider />
                <div className="text-[10px] tracking-widest text-engrave" style={{ color: 'var(--text-dim)' }}>SELECT OR START A CAMPAIGN</div>
              </div>
            </div>
          ) : done ? (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="text-center space-y-3"><div className="text-4xl glow-text-strong" style={{ color: '#22c55e' }}>✦</div><div className="text-xl font-bold text-emboss" style={{ color: '#22c55e' }}>COMPLETE</div><ParaDivider /><div className="text-sm" style={{ color: 'var(--text-muted)' }}>Journey finished.</div></div>
            </div>
          ) : state.messages.length === 0 && !state.isGenerating ? (
            <div className="p-10 text-center mt-10 animate-fade-in">
              <div className={cn("text-base mb-4 font-bold tracking-wider glow-text", colors.primary)}>{ep?.name}</div>
              <ParaDivider />
              <div className="italic max-w-lg mx-auto leading-relaxed text-sm mt-4 font-story" style={{ color: 'var(--text-secondary)' }}>{ep?.context}</div>
              
              <div className="mt-8 flex flex-col items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="bezel-led animate-led-pulse" />
                  <span className="text-[10px] tracking-widest" style={{ color: 'var(--text-dim)' }}>Awaiting input...</span>
                </div>
                <button onClick={() => setInjOpen(true)} className="para-btn">
                  <span>INJECT PRIOR SUMMARY</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-4">
              {state.messages.map(m => <ChatMessage key={m.id} message={m} isStreaming={false} streamingText="" onEdit={(id: string, c: string) => dispatch({ type: 'UPDATE_MESSAGE', payload: { id, content: c } })} onDelete={(id: string) => dispatch({ type: 'DELETE_MESSAGE', payload: id })} onRegenerate={handleRegenerate} />)}
              {state.streamingText && <ChatMessage message={{ id: 'stream', role: 'ai', content: state.streamingText }} isStreaming streamingText={state.streamingText} onEdit={() => {}} onDelete={() => {}} onRegenerate={() => {}} />}
            </div>
          )}
        </div>
      </div>

      {state.currentInstance && !done && (
        <div className="bezel-statusbar px-4 py-3 shrink-0">
          <div className="flex gap-2 relative">
            <div className="absolute -top-2 left-0 flex items-center gap-2">
              {state.isGenerating ? <><div className="bezel-led animate-led-pulse" style={{ width: 5, height: 5 }} /><span className="text-[8px] font-mono tracking-wider" style={{ color: 'var(--text-dim)' }}>STREAMING</span></> : <span className="text-[8px] font-mono tracking-wider" style={{ color: 'var(--text-dim)' }}>READY</span>}
            </div>
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { if (!state.isGenerating) handleSend(); } else playKeyClick(); }} className={cn("textarea-field flex-1 h-20 text-sm font-story custom-scrollbar", state.isGenerating && "opacity-60")} placeholder={state.isGenerating ? "Streaming..." : "Enter action... (Ctrl+Enter)"} autoFocus />
            {state.isGenerating ? (
              <button onClick={() => { api.stop(); dispatch({ type: 'SET_GENERATING', payload: false }); }} className="para-btn para-btn-danger self-stretch"><span>STOP</span></button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()} className={cn("para-btn self-stretch", input.trim() ? "para-btn-primary" : "")} style={!input.trim() ? { color: 'var(--text-dim)' } : {}}><span>SEND</span></button>
            )}
          </div>
        </div>
      )}

      <InjectSummaryModal isOpen={injOpen} onClose={() => setInjOpen(false)} />
    </div>
  );
}

function TitleBar({ onOpenSettings, onFinishEpisode }: { onOpenSettings: () => void; onFinishEpisode: () => void; }) {
  const { state } = useApp();
  const[isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized);
      window.electronAPI.onWindowStateChanged((s) => setIsMaximized(s === 'maximized'));
    }
  },[]);

  return (
    <div className="title-bar flex items-center justify-between shrink-0 select-none">
      <div className="title-bar-drag flex items-center gap-2 pl-3 flex-1 h-full">
        <span className="text-[11px] glow-text-strong font-bold" style={{ color: 'var(--accent)' }}>◈</span>
        <span className="text-[10px] font-bold tracking-[0.15em] text-emboss" style={{ color: 'var(--text-secondary)' }}>CRISTOL</span>
        <div className="para-badge ml-1"><span>v4.2</span></div>
        {state.settings.model && (
          <span className="text-[8px] font-mono ml-2 hidden sm:inline" style={{ color: 'var(--text-dim)' }}>
            {state.settings.model}
          </span>
        )}
        <div className="hidden md:flex gap-1 ml-3 opacity-20">
          {[10, 6, 4].map((w, i) => (
            <div key={i} style={{ width: w, height: 3, background: 'var(--accent)', transform: 'skewX(var(--skew))' }} />
          ))}
        </div>
      </div>

      <div className="title-bar-controls flex items-center gap-2 pr-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

        {state.currentInstance && state.messages.length > 0 && (
          <button onClick={onFinishEpisode} className="para-btn para-btn-sm mr-1"
            style={{ color: 'var(--accent)' }}>
            <span>FINISH EP</span>
          </button>
        )}

        <button onClick={onOpenSettings} className="window-ctrl window-ctrl-util" title="Settings">
          <div><SettingsIcon size={12} /></div>
        </button>

        {/* Traffic lights: Minimize (yellow), Maximize (green), Close (red) */}
        <div className="traffic-lights"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => window.electronAPI?.minimize()}
            className="traffic-light traffic-light-minimize"
            title="Minimize"
          />
          <button
            onClick={() => window.electronAPI?.maximize()}
            className="traffic-light traffic-light-maximize"
            title={isMaximized ? 'Restore' : 'Maximize'}
          />
          <button
            onClick={() => window.electronAPI?.close()}
            className="traffic-light traffic-light-close"
            title="Close"
          />
        </div>
      </div>
    </div>
  );
}

function MainLayout() {
  const { state, dispatch } = useApp();
  const[sOpen, setSOpen] = useState(false);
  const[fOpen, setFOpen] = useState(false);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}
      data-theme={state.settings.colorTheme}
      data-vfx={state.settings.crtEffects ? 'enabled' : 'disabled'}
    >
      <CRTOverlay />
      <SettingsModal isOpen={sOpen} onClose={() => setSOpen(false)} />
      <EditShowModal
        isOpen={state.editingShow !== undefined}
        onClose={() => dispatch({ type: 'SET_EDITING_SHOW', payload: undefined })}
        show={state.editingShow}
      />
      <FinishEpisodeModal isOpen={fOpen} onClose={() => setFOpen(false)} />

      <div className="flex flex-col w-full h-full p-1.5 gap-1">
        <TitleBar onOpenSettings={() => setSOpen(true)} onFinishEpisode={() => setFOpen(true)} />
        <div className="flex flex-1 overflow-hidden gap-1">
          <Sidebar />
          <ChatArea />
        </div>
        <div className="bezel-statusbar h-5 flex items-center justify-center shrink-0">
          <div className="para-divider w-1/3">
            <div className="para-divider-shard" />
            <div className="para-divider-center" />
            <div className="para-divider-shard" />
          </div>
        </div>
      </div>
    </div>
  );
}

// === APP ROOT ===
function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

// === MOUNT ===
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
