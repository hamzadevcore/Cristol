export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export interface Episode {
  id: string;
  name: string;
  description: string;
  context: string;
}

export interface ArchivedSession {
  id: string;
  episodeName: string;
  summary: string;
  messages: Message[];
  archivedAt: string;
}

export interface Settings {
  model: string;
  summarizationModel: string;
  colorTheme: 'purple' | 'cyan' | 'green' | 'amber';
  crtEffects: boolean;
  scanlines: boolean;
  fishbowlIntensity: number;
  soundEnabled: boolean;
  flickerEnabled: boolean;
}

export interface AppState {
  messages: Message[];
  currentEpisode: Episode | null;
  isGenerating: boolean;
  streamingText: string;
  tokenUsage: {
    prompt: number;
    response: number;
    total: number;
  };
  settings: Settings;
  activePanel: 'episodes' | 'archive' | 'lore' | 'profile';
  lore: string;
  profile: string;
  episodes: Episode[];
  archive: ArchivedSession[];
}
