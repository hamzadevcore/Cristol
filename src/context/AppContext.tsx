import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { Message, Episode, ArchivedSession, Settings, AppState } from '../types';
import { api } from '../services/api';

const STORAGE_KEY = 'roleplay-terminal-save-v1';

const defaultSettings: Settings = {
  model: 'llama3.2',
  summarizationModel: 'llama3.2',
  colorTheme: 'purple',
  crtEffects: true,
  scanlines: true,
  fishbowlIntensity: 0.3,
  soundEnabled: true,
  flickerEnabled: true,
};

const initialState: AppState = {
  messages: [],
  currentEpisode: null,
  isGenerating: false,
  streamingText: '',
  tokenUsage: { prompt: 0, response: 0, total: 0 },
  settings: defaultSettings,
  activePanel: 'episodes',
  lore: '',
  profile: '',
  episodes: [],
  archive: [],
};

type Action =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'REWIND_TO_MESSAGE'; payload: string }
  | { type: 'SET_CURRENT_EPISODE'; payload: Episode | null }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_STREAMING_TEXT'; payload: string }
  | { type: 'UPDATE_TOKEN_USAGE'; payload: { prompt: number; response: number } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'SET_ACTIVE_PANEL'; payload: AppState['activePanel'] }
  | { type: 'UPDATE_LORE'; payload: string }
  | { type: 'UPDATE_PROFILE'; payload: string }
  | { type: 'CLEAR_SESSION' }
  | { type: 'ADD_TO_ARCHIVE'; payload: ArchivedSession }
  | { type: 'DELETE_FROM_ARCHIVE'; payload: string }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'LOAD_STATE'; payload: AppState }
  | { type: 'SET_EPISODES'; payload: Episode[] }
  | { type: 'ADD_EPISODE'; payload: Episode }
  | { type: 'UPDATE_EPISODE'; payload: Episode }
  | { type: 'REMOVE_EPISODE'; payload: string };

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_STATE': return { ...state, ...action.payload };
    case 'ADD_MESSAGE': return { ...state, messages: [...state.messages, action.payload] };
    case 'UPDATE_MESSAGE': return { ...state, messages: state.messages.map(m => m.id === action.payload.id ? { ...m, content: action.payload.content } : m) };
    case 'DELETE_MESSAGE': return { ...state, messages: state.messages.filter(m => m.id !== action.payload) };
    case 'REWIND_TO_MESSAGE':
      const index = state.messages.findIndex(m => m.id === action.payload);
      return { ...state, messages: state.messages.slice(0, index + 1) };
    case 'SET_CURRENT_EPISODE': return { ...state, currentEpisode: action.payload, messages: [] };
    case 'SET_GENERATING': return { ...state, isGenerating: action.payload };
    case 'SET_STREAMING_TEXT': return { ...state, streamingText: action.payload };
    case 'UPDATE_TOKEN_USAGE':
      return { ...state, tokenUsage: { prompt: action.payload.prompt, response: action.payload.response, total: state.tokenUsage.total + action.payload.prompt + action.payload.response } };
    case 'UPDATE_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_ACTIVE_PANEL': return { ...state, activePanel: action.payload };
    case 'UPDATE_LORE': return { ...state, lore: action.payload };
    case 'UPDATE_PROFILE': return { ...state, profile: action.payload };
    case 'CLEAR_SESSION': return { ...state, messages: [], streamingText: '', currentEpisode: null };
    case 'ADD_TO_ARCHIVE': return { ...state, archive: [...state.archive, action.payload] };
    case 'DELETE_FROM_ARCHIVE': return { ...state, archive: state.archive.filter(a => a.id !== action.payload) };
    case 'SET_MESSAGES': return { ...state, messages: action.payload };
    case 'SET_EPISODES': return { ...state, episodes: action.payload };
    case 'ADD_EPISODE': return { ...state, episodes: [...state.episodes, action.payload] };
    case 'UPDATE_EPISODE': {
      const updatedEpisodes = state.episodes.map(e => e.id === action.payload.id ? action.payload : e);
      // If the currently playing episode is the one we updated, update it live
      const currentEpisode = state.currentEpisode?.id === action.payload.id ? action.payload : state.currentEpisode;
      return { ...state, episodes: updatedEpisodes, currentEpisode };
    }
    case 'REMOVE_EPISODE': return { ...state, episodes: state.episodes.filter(e => e.id !== action.payload) };
    default: return state;
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Initial Load
  useEffect(() => {
    const init = async () => {
      // 1. Load Client State from Browser (Settings, Active Chat)
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const { episodes, lore, profile, archive, ...clientState } = parsed;
          dispatch({ type: 'LOAD_STATE', payload: { ...initialState, ...clientState } });
        } catch (e) { console.error(e); }
      }

      // 2. Load Server State from Backend (Episodes, Lore, Profile)
      try {
        const episodes = await api.getEpisodes();
        dispatch({ type: 'SET_EPISODES', payload: episodes });

        const lore = await api.getLore();
        dispatch({ type: 'UPDATE_LORE', payload: lore });

        const profile = await api.getProfile();
        dispatch({ type: 'UPDATE_PROFILE', payload: profile });

        const archive = await api.getArchive();
      } catch (e) { console.error("Backend sync failed", e); }
    };
    init();
  }, []);

  // Save to Storage
  useEffect(() => {
    const stateToSave = {
      messages: state.messages,
      currentEpisode: state.currentEpisode,
      settings: state.settings,
      activePanel: state.activePanel,
      tokenUsage: state.tokenUsage
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [state.messages, state.currentEpisode, state.settings, state.activePanel, state.tokenUsage]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}