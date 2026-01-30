export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export interface Episode {
  id: string;
  name: string;
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
  crtEffects: boolean;       // Master toggle for Scanlines/Flicker/Noise
  enablePerspective: boolean; // New: Toggle for the 3D Slant/Fishbowl
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