const API_BASE = 'http://127.0.0.1:5000';

export interface ChatRequest {
  message: string;
  model: string;
  episode?: {
    id: string;
    name: string;
    context: string;
  };
  history?: Array<{ role: 'user' | 'ai'; content: string }>;
  lore?: string;
  profile?: string;
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
  messages: Array<{ role: 'user' | 'ai'; content: string }>;
  archivedAt: string;
}

export interface FinishEpisodeRequest {
  episodeName: string;
  messages: Array<{ role: 'user' | 'ai'; content: string }>;
  model: string;
}

export interface FinishEpisodeResponse {
  id: string;
  summary: string;
  archivedAt: string;
  episodeName: string;
}

class APIService {
  private abortController: AbortController | null = null;

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

  async getEpisodes(): Promise<Episode[]> {
    try {
      const response = await fetch(`${API_BASE}/episodes`);
      if (!response.ok) throw new Error('Failed to fetch episodes');
      return response.json();
    } catch (error) {
      console.error('Error fetching episodes:', error);
      return [];
    }
  }

  async createEpisode(name: string, description: string, context: string): Promise<Episode> {
    const response = await fetch(`${API_BASE}/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, context }),
    });
    if (!response.ok) throw new Error('Failed to create episode');
    return response.json();
  }

  async updateEpisode(id: string, data: Partial<Episode>): Promise<Episode> {
    const response = await fetch(`${API_BASE}/episodes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update episode');
    return response.json();
  }

  async deleteEpisode(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/episodes/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete episode');
  }

  asyncwb_THOUGHT
  async getArchive(): Promise<ArchivedSession[]> {
    try {
      const response = await fetch(`${API_BASE}/archive`);
      if (!response.ok) throw new Error('Failed to fetch archive');
      return response.json();
    } catch (error) {
      console.error('Error fetching archive:', error);
      return [];
    }
  }

  async finishEpisode(request: FinishEpisodeRequest): Promise<FinishEpisodeResponse> {
    const response = await fetch(`${API_BASE}/finish-episode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error('Failed to finish episode');
    return response.json();
  }

  async getLore(): Promise<string> {
    try {
      const response = await fetch(`${API_BASE}/lore`);
      if (!response.ok) throw new Error('Failed to fetch lore');
      const data = await response.json();
      return data.content;
    } catch (error) { return ''; }
  }

  async updateLore(content: string): Promise<void> {
    await fetch(`${API_BASE}/lore`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  async getProfile(): Promise<string> {
    try {
      const response = await fetch(`${API_BASE}/profile`);
      if (!response.ok) throw new Error('Failed to fetch profile');
      const data = await response.json();
      return data.content;
    } catch (error) { return ''; }
  }

  async updateProfile(content: string): Promise<void> {
    await fetch(`${API_BASE}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE}/models`);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      return data.models;
    } catch { return ['llama3.2']; }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/health`);
      return response.ok;
    } catch { return false; }
  }
}

export const api = new APIService();