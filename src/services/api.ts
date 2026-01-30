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
      return res.json();
    } catch { return []; }
  }

  async createShow(data: Partial<Show>): Promise<Show> {
    const res = await fetch(`${API_BASE}/shows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async updateShow(id: string, data: Partial<Show>): Promise<Show> {
    const res = await fetch(`${API_BASE}/shows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async deleteShow(id: string): Promise<void> {
    await fetch(`${API_BASE}/shows/${id}`, { method: 'DELETE' });
  }

  // --- Instances (Active Games) ---
  async getInstances(): Promise<Instance[]> {
    try {
      const res = await fetch(`${API_BASE}/instances`);
      return res.json();
    } catch { return []; }
  }

  async createInstance(showId: string): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId }),
    });
    return res.json();
  }

  async updateInstance(id: string, data: Partial<Instance>): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
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
    return res.json();
  }

  async healthCheck(): Promise<boolean> {
    try { return (await fetch(`${API_BASE}/health`)).ok; }
    catch { return false; }
  }
}



export const api = new APIService();