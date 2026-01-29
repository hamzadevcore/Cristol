import { useApp } from '../context/AppContext';

export function Footer() {
  const { state } = useApp();

  const textColor = state.settings.colorTheme === 'purple' ? 'text-purple-500/50' : 
                   state.settings.colorTheme === 'cyan' ? 'text-cyan-500/50' :
                   state.settings.colorTheme === 'green' ? 'text-green-500/50' : 'text-amber-500/50';

  return (
    <div className="h-8 bg-gray-950/90 border-t border-gray-800 flex items-center justify-between px-4 text-xs font-mono">
      {/* Left: Current Episode */}
      <div className="text-gray-600">
        {state.currentEpisode ? (
          <span className={textColor}>◈ {state.currentEpisode.name}</span>
        ) : (
          <span>NO EPISODE LOADED</span>
        )}
      </div>

      {/* Right: Token Stats */}
      <div className="flex items-center gap-4 text-gray-600">
        <span>
          TOKENS: <span className={textColor}>{state.tokenUsage.prompt}</span>/<span className={textColor}>{state.tokenUsage.response}</span>
        </span>
        <span className="text-gray-700">|</span>
        <span>
          TOTAL: <span className={textColor}>{state.tokenUsage.total}</span>
        </span>
        <span className="text-gray-700">|</span>
        <span>
          MSGS: <span className={textColor}>{state.messages.length}</span>
        </span>
      </div>
    </div>
  );
}
