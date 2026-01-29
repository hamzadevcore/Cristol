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
  onRewind: (id: string) => void;
  onRegenerate?: () => void;
  isLast?: boolean;
}

export function ChatMessage({
  message,
  isStreaming,
  streamingText,
  onEdit,
  onDelete,
  onRewind,
  onRegenerate,
  isLast,
}: ChatMessageProps) {
  const { state } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);

  const colorTheme = state.settings.colorTheme;
  
  const themeColors = {
    purple: {
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      borderSolid: 'border-purple-500',
      bg: 'bg-purple-500/10',
      glow: 'shadow-purple-500/20',
    },
    cyan: {
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
      borderSolid: 'border-cyan-500',
      bg: 'bg-cyan-500/10',
      glow: 'shadow-cyan-500/20',
    },
    green: {
      text: 'text-green-400',
      border: 'border-green-500/30',
      borderSolid: 'border-green-500',
      bg: 'bg-green-500/10',
      glow: 'shadow-green-500/20',
    },
    amber: {
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      borderSolid: 'border-amber-500',
      bg: 'bg-amber-500/10',
      glow: 'shadow-amber-500/20',
    },
  };

  const colors = themeColors[colorTheme];
  const displayContent = isStreaming ? streamingText : message.content;

  const handleSaveEdit = () => {
    onEdit(message.id, editContent);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "group relative p-4 border-l-2 transition-all",
        message.role === 'user' 
          ? "border-l-gray-600 bg-gray-900/30" 
          : cn(colors.border, "bg-black/30"),
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Role Label */}
      <div className={cn(
        "text-xs font-bold tracking-wider mb-2",
        message.role === 'user' ? 'text-gray-500' : colors.text
      )}>
        {message.role === 'user' ? '▶ USER' : '◆ AI'}
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className={cn(
              "w-full min-h-[100px] bg-black/50 border text-gray-300 p-2 text-sm font-mono resize-y focus:outline-none",
              "border-gray-700 focus:" + colors.borderSolid
            )}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              className={cn("px-3 py-1 text-xs border", colors.text, colors.border, "hover:" + colors.bg)}
            >
              SAVE
            </button>
            <button
              onClick={() => {
                setEditContent(message.content);
                setIsEditing(false);
              }}
              className="px-3 py-1 text-xs border border-gray-600 text-gray-400 hover:bg-gray-800"
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : (
        <div className="text-gray-300 text-sm font-mono leading-relaxed prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className={colors.text}>{children}</strong>,
              em: ({ children }) => <em className="text-gray-400 italic">{children}</em>,
              h1: ({ children }) => <h1 className={cn("text-xl font-bold mb-2 mt-4", colors.text)}>{children}</h1>,
              h2: ({ children }) => <h2 className={cn("text-lg font-bold mb-2 mt-3", colors.text)}>{children}</h2>,
              h3: ({ children }) => <h3 className={cn("text-base font-bold mb-1 mt-2", colors.text)}>{children}</h3>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="text-gray-300">{children}</li>,
              code: ({ className, children }) => {
                const isInline = !className;
                return isInline ? (
                  <code className={cn("px-1.5 py-0.5 rounded text-xs", colors.bg, colors.text)}>{children}</code>
                ) : (
                  <code className={cn("block p-3 my-2 rounded text-xs overflow-x-auto", colors.bg, "border", colors.border)}>
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => <pre className="bg-transparent">{children}</pre>,
              blockquote: ({ children }) => (
                <blockquote className={cn("border-l-2 pl-3 my-2 italic text-gray-400", colors.border)}>
                  {children}
                </blockquote>
              ),
              a: ({ href, children }) => (
                <a href={href} className={cn(colors.text, "underline hover:opacity-80")} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              hr: () => <hr className={cn("my-4 border-t", colors.border)} />,
            }}
          >
            {displayContent || ''}
          </ReactMarkdown>
          {isStreaming && (
            <span className={cn("inline-block w-2 h-4 animate-blink ml-1", colors.bg)} />
          )}
        </div>
      )}

      {/* Action Buttons - themed with the color scheme */}
      {showActions && !isEditing && !isStreaming && (
        <div className={cn(
          "absolute top-2 right-2 flex gap-1 p-1 border",
          "bg-gray-900/95 backdrop-blur-sm",
          colors.border
        )}>
          <button
            onClick={() => setIsEditing(true)}
            className={cn("p-1.5 transition-colors", colors.text, "opacity-60 hover:opacity-100")}
            title="Edit"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(message.id)}
            className="p-1.5 text-red-400 opacity-60 hover:opacity-100 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <button
            onClick={() => onRewind(message.id)}
            className={cn("p-1.5 transition-colors", colors.text, "opacity-60 hover:opacity-100")}
            title="Rewind to here"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 3L2 12l10.5 9V3zm8.5 0L10.5 12 21 21V3z"/>
            </svg>
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(message.content)}
            className={cn("p-1.5 transition-colors", colors.text, "opacity-60 hover:opacity-100")}
            title="Copy"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          {message.role === 'ai' && isLast && onRegenerate && (
            <button
              onClick={onRegenerate}
              className={cn("p-1.5 transition-colors", colors.text, "opacity-60 hover:opacity-100")}
              title="Regenerate"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
