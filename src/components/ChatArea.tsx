import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ChatMessage } from './ChatMessage';
import { RewindOverlay } from './RewindOverlay';
import { RegenerateOverlay } from './RegenerateOverlay';
import { useSound } from '../hooks/useSound';
import { api } from '../services/api';
import { cn } from '../utils/cn';

export function ChatArea() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState('');
  const [rewindingTo, setRewindingTo] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [pendingRegenerate, setPendingRegenerate] = useState(false);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { playMessageSent, playKeyClick } = useSound(state.settings.soundEnabled);

  const colorTheme = state.settings.colorTheme;

  const themeColors = {
    purple: {
      text: 'text-purple-400',
      border: 'border-purple-500',
      borderDim: 'border-purple-500/30',
      bg: 'bg-purple-500/10',
      bgHover: 'hover:bg-purple-500/20',
    },
    cyan: {
      text: 'text-cyan-400',
      border: 'border-cyan-500',
      borderDim: 'border-cyan-500/30',
      bg: 'bg-cyan-500/10',
      bgHover: 'hover:bg-cyan-500/20',
    },
    green: {
      text: 'text-green-400',
      border: 'border-green-500',
      borderDim: 'border-green-500/30',
      bg: 'bg-green-500/10',
      bgHover: 'hover:bg-green-500/20',
    },
    amber: {
      text: 'text-amber-400',
      border: 'border-amber-500',
      borderDim: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      bgHover: 'hover:bg-amber-500/20',
    },
  };

  const colors = themeColors[colorTheme];

  // Check backend connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      const connected = await api.healthCheck();
      setBackendConnected(connected);
    };
    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, []);

  useLayoutEffect(() => {
    scrollToBottom();
  }, [state.messages, scrollToBottom]);

  useEffect(() => {
    if (state.streamingText) {
      scrollToBottom();
    }
  }, [state.streamingText, scrollToBottom]);

  // Fallback simulated response
  const simulateAIResponse = useCallback(async (userMessage: string) => {
    const responses = [
      "The corridors stretch before you, dimly lit by **flickering fluorescent tubes**. The air carries a faint metallic tang.\n\n> *Your footsteps echo against the cold concrete.*\n\nYou notice:\n- A damaged security panel\n- Scorch marks on the walls",
      "A terminal flickers to life. Lines of corrupted data scroll across the screen:\n\n```\nSUBJECT STATUS: ANOMALOUS\nCONTAINMENT BREACH DETECTED\n```\n\n**Warning:** The terminal emits a soft beep.",
      "The shadows seem to shift. When you turn to look, there's nothing there.\n\n### Analysis\n\nYour instincts tell you:\n1. The threat is nearby\n2. It's learning your patterns",
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];

    let currentText = '';
    for (let i = 0; i < response.length; i++) {
      currentText += response[i];
      dispatch({ type: 'SET_STREAMING_TEXT', payload: currentText });
      await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 25));
    }

    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        id: Date.now().toString(),
        role: 'ai',
        content: response,
      },
    });

    dispatch({
      type: 'UPDATE_TOKEN_USAGE',
      payload: {
        prompt: userMessage.split(' ').length * 2,
        response: response.split(' ').length * 2,
      },
    });
  }, [dispatch]);

  // Real API call with streaming
  const sendToAPI = useCallback(async (userMessage: string) => {
    dispatch({ type: 'SET_GENERATING', payload: true });

    let fullResponse = '';

    try {
      const chatRequest = {
        message: userMessage,
        model: state.settings.model,
        episode: state.currentEpisode || undefined,
        history: state.messages.map(m => ({ role: m.role, content: m.content })),
        lore: state.lore,
        profile: state.profile,
      };

      for await (const token of api.chat(chatRequest)) {
        fullResponse += token;
        dispatch({ type: 'SET_STREAMING_TEXT', payload: fullResponse });
      }

      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: Date.now().toString(),
          role: 'ai',
          content: fullResponse,
        },
      });

      dispatch({
        type: 'UPDATE_TOKEN_USAGE',
        payload: {
          prompt: userMessage.split(/\s+/).length * 2,
          response: fullResponse.split(/\s+/).length * 2,
        },
      });
    } catch (error) {
      console.error('API Error:', error);
      await simulateAIResponse(userMessage);
    }

    dispatch({ type: 'SET_STREAMING_TEXT', payload: '' });
    dispatch({ type: 'SET_GENERATING', payload: false });
  }, [dispatch, state.currentEpisode, state.messages, state.lore, state.profile, state.settings.model, simulateAIResponse]);

  const handleSend = useCallback(() => {
    if (!input.trim() || state.isGenerating) return;

    playMessageSent();

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input.trim(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    const messageContent = input.trim();
    setInput('');

    setTimeout(() => {
      if (backendConnected) {
        sendToAPI(messageContent);
      } else {
        dispatch({ type: 'SET_GENERATING', payload: true });
        simulateAIResponse(messageContent).then(() => {
          dispatch({ type: 'SET_STREAMING_TEXT', payload: '' });
          dispatch({ type: 'SET_GENERATING', payload: false });
        });
      }
    }, 100);
  }, [input, state.isGenerating, dispatch, playMessageSent, sendToAPI, simulateAIResponse, backendConnected]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (!state.isGenerating && input.trim()) {
        handleSend();
      }
    } else if (!['Enter', 'Shift', 'Control', 'Alt', 'Meta', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      playKeyClick();
    }
  };

  const handleStopGeneration = () => {
    api.stopGeneration();
    dispatch({ type: 'SET_GENERATING', payload: false });
    dispatch({ type: 'SET_STREAMING_TEXT', payload: '' });
  };

  const handleEdit = (id: string, content: string) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id, content } });
  };

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_MESSAGE', payload: id });
  };

  const handleRewind = (id: string) => {
    setRewindingTo(id);
  };

  const handleRewindComplete = () => {
    if (rewindingTo) {
      dispatch({ type: 'REWIND_TO_MESSAGE', payload: rewindingTo });
    }
    setRewindingTo(null);
  };

  const handleRegenerate = () => {
    setIsRegenerating(true);
    setPendingRegenerate(true);
  };

  const handleRegenerateComplete = () => {
    setIsRegenerating(false);
    if (pendingRegenerate && state.messages.length > 0) {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage.role === 'ai') {
        dispatch({ type: 'DELETE_MESSAGE', payload: lastMessage.id });
        const lastUserMessage = [...state.messages].reverse().find(m => m.role === 'user');
        if (lastUserMessage) {
          setTimeout(() => {
            if (backendConnected) {
              sendToAPI(lastUserMessage.content);
            } else {
              dispatch({ type: 'SET_GENERATING', payload: true });
              simulateAIResponse(lastUserMessage.content).then(() => {
                dispatch({ type: 'SET_STREAMING_TEXT', payload: '' });
                dispatch({ type: 'SET_GENERATING', payload: false });
              });
            }
          }, 300);
        }
      }
    }
    setPendingRegenerate(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <RewindOverlay
        isActive={rewindingTo !== null}
        onComplete={handleRewindComplete}
        colorTheme={colorTheme}
      />
      <RegenerateOverlay
        isActive={isRegenerating}
        onComplete={handleRegenerateComplete}
        colorTheme={colorTheme}
      />

      {/* Connection Status */}
      {backendConnected === false && (
        <div className="px-4 py-2 bg-amber-900/30 border-b border-amber-500/30 text-amber-400 text-xs">
          ⚠ Backend not connected - using simulated responses. Start the Python server to connect.
        </div>
      )}

      {/* Episode Header */}
      {state.currentEpisode && (
        <div className={cn("p-3 border-b border-gray-800", colors.text)}>
          <div className="text-xs tracking-wider opacity-70">◈ NOW PLAYING</div>
          <div className="font-bold">{state.currentEpisode.name}</div>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
        {!state.currentEpisode ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-600 p-8">
              <div className={cn("text-6xl mb-4 opacity-50", colors.text)}>◈</div>
              <div className="text-lg tracking-wider">SELECT AN EPISODE TO BEGIN</div>
              <div className="text-sm mt-2 opacity-50">Use the sidebar to choose your adventure</div>
            </div>
          </div>
        ) : state.messages.length === 0 && !state.isGenerating ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-600 p-8">
              <div className={cn("text-4xl mb-4", colors.text)}>▶</div>
              <div className="text-lg tracking-wider">EPISODE LOADED</div>
              <div className="text-sm mt-2 opacity-50 max-w-md">{state.currentEpisode.context}</div>
              <div className={cn("text-sm mt-4", colors.text)}>Type your action to begin...</div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {state.messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRewind={handleRewind}
                onRegenerate={handleRegenerate}
                isLast={index === state.messages.length - 1}
              />
            ))}
            {state.isGenerating && state.streamingText && (
              <ChatMessage
                message={{ id: 'streaming', role: 'ai', content: '' }}
                isStreaming
                streamingText={state.streamingText}
                onEdit={() => {}}
                onDelete={() => {}}
                onRewind={() => {}}
              />
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>
        )}
      </div>

      {/* Input Area */}
      {state.currentEpisode && (
        <div className="p-4 border-t border-gray-800 bg-gray-950/50">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={state.isGenerating ? "Type your next action while waiting..." : "Enter your action... (Ctrl+Enter to send)"}
                disabled={false}
                autoFocus
                className={cn(
                  "w-full h-20 bg-black/50 border text-gray-300 p-3 text-sm font-mono resize-none focus:outline-none transition-colors",
                  state.isGenerating ? "border-gray-600" : "border-gray-700",
                  `focus:${colors.border}`
                )}
              />
              <div className="absolute bottom-2 right-2 text-xs text-gray-600">
                {input.length} chars
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {state.isGenerating ? (
                <button
                  onClick={handleStopGeneration}
                  className={cn(
                    "px-4 h-full border font-mono text-sm tracking-wider transition-all",
                    "border-red-500/50 text-red-400 hover:bg-red-500/20"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="animate-pulse">■</span>
                    <span>STOP</span>
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className={cn(
                    "px-4 h-full border font-mono text-sm tracking-wider transition-all",
                    !input.trim()
                      ? "border-gray-700 text-gray-600 cursor-not-allowed"
                      : cn(colors.border, colors.text, colors.bgHover)
                  )}
                >
                  SEND ▶
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}