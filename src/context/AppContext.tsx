import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { Message, Show, Instance, Settings, AppState } from '../types';
import { api } from '../services/api';

const STORAGE_KEY = 'roleplay-terminal-save-v7';

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
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_STREAMING_TEXT'; payload: string }
  | { type: 'UPDATE_TOKEN_USAGE'; payload: { prompt: number; response: number } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'SET_ACTIVE_PANEL'; payload: AppState['activePanel'] }
  | { type: 'SET_EDITING_SHOW'; payload: Show | null | undefined }
  | { type: 'SET_MESSAGES'; payload: Message[] };

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_STATE': return { ...state, ...action.payload };

    // Shows
    case 'SET_SHOWS': return { ...state, shows: action.payload };
    case 'ADD_SHOW': return { ...state, shows: [...state.shows, action.payload] };
    case 'UPDATE_SHOW': return { ...state, shows: state.shows.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'REMOVE_SHOW': return { ...state, shows: state.shows.filter(s => s.id !== action.payload) };
    case 'SET_EDITING_SHOW': return { ...state, editingShow: action.payload };

    // Instances
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

    // Chat
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

    case 'SET_GENERATING': return { ...state, isGenerating: action.payload };
    case 'SET_STREAMING_TEXT': return { ...state, streamingText: action.payload };
    case 'UPDATE_TOKEN_USAGE':
      return { ...state, tokenUsage: { prompt: action.payload.prompt, response: action.payload.response, total: state.tokenUsage.total + action.payload.prompt + action.payload.response } };
    case 'UPDATE_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_ACTIVE_PANEL': return { ...state, activePanel: action.payload };

    default: return state;
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const init = async () => {
      console.log("Initializing App...");

      // 1. Fetch Backend Config (ENV variables)
      const config = await api.healthCheck();
      console.log("Backend Config:", config);

      // 2. Load Local Storage
      const savedString = localStorage.getItem(STORAGE_KEY);
      let savedSettings: Partial<Settings> = {};

      if (savedString) {
        try {
          const parsed = JSON.parse(savedString);
          if (parsed.settings) savedSettings = parsed.settings;
        } catch (e) { console.error("Failed to parse settings", e); }
      }

      // 3. Merge Logic: Default -> Backend -> Saved
      // If Saved has an empty string, we want to fallback to Backend
      const mergedSettings = { ...defaultSettings, ...savedSettings };

      if (config) {
        if (!mergedSettings.model) mergedSettings.model = config.default_model;
        if (!mergedSettings.summarizationModel) mergedSettings.summarizationModel = config.default_model;
      }

      console.log("Final Settings Applied:", mergedSettings);
      dispatch({ type: 'UPDATE_SETTINGS', payload: mergedSettings });

      // 4. Load Data
      try {
        const [shows, instances] = await Promise.all([api.getShows(), api.getInstances()]);
        dispatch({ type: 'SET_SHOWS', payload: shows });
        dispatch({ type: 'SET_INSTANCES', payload: instances });
      } catch (e) { console.error("Backend sync failed", e); }
    };
    init();
  }, []);

  // Persistence
  useEffect(() => {
    // Debounce saving slightly or just save on change
    if (state.settings !== defaultSettings) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: state.settings }));
    }
  }, [state.settings]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}