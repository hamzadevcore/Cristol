import { Instance, Show, Message } from '../types';

const API_BASE = 'http://127.0.0.1:5000';

export interface ChatRequest {
  message: string;
  model: string;
  instanceId?: string;
  history?: Array<{ role: 'user' | 'ai'; content: string }>;
}

class APIService {
  private abortController: AbortController | null = null;

  private async handleResponse(res: Response) {
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  async *chat(request: ChatRequest): AsyncGenerator<string> {
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

  stopGeneration() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async getServerConfig(): Promise<{ default_model: string; status: string } | null> {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) return res.json();
      return null;
    } catch {
      return null;
    }
  }

  // --- Shows (Blueprints) ---
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

  // --- Instances (Active Games) ---
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
    try {
        const res = await fetch(`${API_BASE}/health`);
        return res.ok;
    }
    catch { return false; }
  }
}

export const api = new APIService();

export interface Message {
  id: string;
  role: 'user' | 'ai' | 'assistant';
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