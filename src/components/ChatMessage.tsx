import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '../types';
import { useApp } from '../context/AppContext';
import { cn } from '../utils/cn';

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  streamingText?: string;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  onRewind: (id: string) => void;
  isLast?: boolean;
}

export function ChatMessage({ message, isStreaming, streamingText, onEdit, onDelete, onRegenerate, onRewind }: ChatMessageProps) {
  const { state } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);

  const content = isStreaming ? streamingText : message.content;

  return (
    <div
      className={cn(
        "relative p-4 border-l-2 transition-all group",
        message.role === 'user'
            ? "border-l-gray-700 bg-white/5"
            : "border-l-[var(--border-color)] bg-[var(--bg-tint)]"
      )}
      onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}
    >
      <div className={cn(
          "text-xs font-bold tracking-widest mb-2 uppercase flex items-center gap-2",
          message.role === 'user' ? 'text-gray-500' : 'text-[var(--glow-color)] text-theme-glow'
      )}>
        <span>{message.role === 'user' ? '>> PLAYER' : '## NARRATOR'}</span>
      </div>

      {isEditing ? (
        <div className="space-y-2">
           <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full h-32 bg-black border border-gray-700 p-2 text-sm text-gray-300 focus:outline-none font-mono" />
           <div className="flex gap-2">
             <button onClick={() => { onEdit(message.id, editContent); setIsEditing(false); }} className="px-2 py-1 border border-gray-600 text-xs hover:bg-white/10">SAVE</button>
             <button onClick={() => setIsEditing(false)} className="px-2 py-1 text-gray-500 text-xs">CANCEL</button>
           </div>
        </div>
      ) : (
        <div className="text-gray-300 text-sm font-mono leading-relaxed prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
        </div>
      )}

      {showActions && !isStreaming && !isEditing && (
        <div className="absolute top-2 right-2 flex gap-1 bg-black/80 border border-gray-800 p-1 text-[10px] font-mono">
          <button onClick={() => onRegenerate(message.id)} title="Regenerate" className="px-1.5 py-0.5 hover:text-cyan-400 text-gray-500 transition-colors border border-transparent hover:border-cyan-400/30">RGN</button>
          <button onClick={() => onRewind(message.id)} title="Rewind to here" className="px-1.5 py-0.5 hover:text-purple-400 text-gray-500 transition-colors border border-transparent hover:border-purple-400/30">RWD</button>
          <button onClick={() => setIsEditing(true)} title="Edit" className="px-1.5 py-0.5 hover:text-white text-gray-500 transition-colors border border-transparent hover:border-gray-600">EDT</button>
          <button onClick={() => onDelete(message.id)} title="Delete" className="px-1.5 py-0.5 hover:text-red-500 text-gray-500 transition-colors border border-transparent hover:border-red-500/30">DEL</button>
        </div>
      )}
    </div>
  );
}