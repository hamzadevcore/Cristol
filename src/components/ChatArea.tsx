import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ChatMessage } from './ChatMessage';
import { RewindOverlay } from './RewindOverlay';
import { useSound } from '../hooks/useSound';
import { api } from '../services/api';
import { cn } from '../utils/cn';

export function ChatArea() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState('');
  const [rewindingTo, setRewindingTo] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { playMessageSent, playKeyClick } = useSound(state.settings.soundEnabled);

  const colors = {
    purple: { text: 'text-purple-400', border: 'border-purple-500', bgHover: 'hover:bg-purple-500/20' },
    cyan: { text: 'text-cyan-400', border: 'border-cyan-500', bgHover: 'hover:bg-cyan-500/20' },
    green: { text: 'text-green-400', border: 'border-green-500', bgHover: 'hover:bg-green-500/20' },
    amber: { text: 'text-amber-400', border: 'border-amber-500', bgHover: 'hover:bg-amber-500/20' },
    hell: { text: 'text-red-500', border: 'border-red-600', bgHover: 'hover:bg-red-900/40' },
  }[state.settings.colorTheme];

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
  }, []);
  useLayoutEffect(() => { scrollToBottom(); }, [state.messages, state.streamingText]);

  // Check Backend
  useEffect(() => {
    const check = async () => setBackendConnected(await api.healthCheck());
    check();
  }, []);

  const sendToAPI = useCallback(async (userMessage: string) => {
    dispatch({ type: 'SET_GENERATING', payload: true });
    let fullResponse = '';
    try {
      const request = {
        message: userMessage,
        model: state.settings.model,
        instanceId: state.currentInstance?.id,
        history: state.messages.map(m => ({ role: m.role, content: m.content })),
        lore: state.lore,
        profile: state.profile,
      };

      for await (const token of api.chat(request)) {
        fullResponse += token;
        dispatch({ type: 'SET_STREAMING_TEXT', payload: fullResponse });
      }

      dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'ai', content: fullResponse } });
      dispatch({ type: 'UPDATE_TOKEN_USAGE', payload: { prompt: userMessage.length, response: fullResponse.length } }); // Simplified estimation
    } catch (error) {
        console.error(error);
        dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'ai', content: "Error: Backend unreachable." } });
    }
    dispatch({ type: 'SET_STREAMING_TEXT', payload: '' });
    dispatch({ type: 'SET_GENERATING', payload: false });
  }, [dispatch, state.currentInstance, state.messages, state.lore, state.profile, state.settings.model]);

  const handleSend = () => {
    if (!input.trim() || state.isGenerating || !state.currentInstance) return;
    playMessageSent();
    const msg = input.trim();
    setInput('');
    dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: 'user', content: msg } });
    setTimeout(() => sendToAPI(msg), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) handleSend();
    else playKeyClick();
  };

  // Episode Info
  const currentEp = state.currentInstance
    ? state.currentInstance.episodes[state.currentInstance.currentEpisodeIndex]
    : null;
  const isFinished = state.currentInstance && !currentEp;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <RewindOverlay isActive={rewindingTo !== null} onComplete={() => { if(rewindingTo) dispatch({ type: 'DELETE_MESSAGE', payload: rewindingTo }); setRewindingTo(null); }} colorTheme={state.settings.colorTheme} />

      {/* Header Info */}
      {state.currentInstance && (
        <div className={cn("p-2 border-b border-gray-800 flex justify-between items-center", colors.text)}>
          <div>
            <span className="text-xs opacity-50 tracking-widest mr-2">INSTANCE:</span>
            <span className="font-bold">{state.currentInstance.showName}</span>
          </div>
          <div>
            <span className="text-xs opacity-50 tracking-widest mr-2">EPISODE:</span>
            <span className="font-bold">{currentEp ? currentEp.name : "CAMPAIGN COMPLETE"}</span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto custom-scrollbar relative">
        {!state.currentInstance ? (
          <div className="h-full flex flex-col items-center justify-center opacity-50">
            <div className="text-6xl mb-4">◈</div>
            <div>SELECT OR START A CAMPAIGN</div>
          </div>
        ) : isFinished ? (
            <div className="h-full flex flex-col items-center justify-center text-green-500">
                <div className="text-4xl mb-2">COMPLETE</div>
                <div className="text-sm">You have finished this journey.</div>
            </div>
        ) : state.messages.length === 0 && !state.isGenerating ? (
          <div className="p-8 text-center opacity-70 mt-10">
            <div className={cn("text-xl mb-4 font-bold", colors.text)}>CONTEXT</div>
            <div className="italic text-gray-400 max-w-lg mx-auto leading-relaxed">{currentEp?.context}</div>
            <div className="mt-8 text-sm animate-pulse">Waiting for input...</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50 pb-4">
             {state.messages.map((m, i) => (
               <ChatMessage
                key={m.id} message={m}
                onEdit={(id,c) => dispatch({type: 'UPDATE_MESSAGE', payload: {id, content:c}})}
                onDelete={(id) => dispatch({type: 'DELETE_MESSAGE', payload: id})}
                onRewind={() => {}}
                isLast={i === state.messages.length -1}
               />
             ))}
             {state.streamingText && <ChatMessage message={{id:'stream', role:'ai', content: state.streamingText}} isStreaming onEdit={()=>{}} onDelete={()=>{}} onRewind={()=>{}} />}
          </div>
        )}
      </div>

      {/* Input */}
      {state.currentInstance && !isFinished && (
        <div className="p-4 border-t border-gray-800 bg-black/40">
           <div className="flex gap-2">
             <textarea
                value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                className={cn("flex-1 h-20 bg-black/50 border p-3 text-sm focus:outline-none resize-none", state.isGenerating ? "border-gray-700" : "border-gray-600 focus:" + colors.border)}
                placeholder="Action... (Ctrl+Enter)"
                disabled={state.isGenerating}
                autoFocus
             />
             <button onClick={handleSend} disabled={!input.trim() || state.isGenerating} className={cn("px-6 border font-bold text-sm", colors.border, colors.text, colors.bgHover)}>
                {state.isGenerating ? "..." : "SEND"}
             </button>
           </div>
        </div>
      )}
    </div>
  );
}