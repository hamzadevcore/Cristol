import { useApp } from '../context/AppContext';
import { cn } from '../utils/cn';

interface HeaderProps {
  onOpenSettings: () => void;
  onFinishEpisode: () => void;
}

export function Header({ onOpenSettings, onFinishEpisode }: HeaderProps) {
  const { state, dispatch } = useApp();

  const textColor = state.settings.colorTheme === 'purple' ? 'text-purple-400' : 
                   state.settings.colorTheme === 'cyan' ? 'text-cyan-400' :
                   state.settings.colorTheme === 'green' ? 'text-green-400' : 'text-amber-400';

  const borderColor = state.settings.colorTheme === 'purple' ? 'border-purple-500' : 
                     state.settings.colorTheme === 'cyan' ? 'border-cyan-500' :
                     state.settings.colorTheme === 'green' ? 'border-green-500' : 'border-amber-500';

  return (
    <div className={cn("h-12 bg-gray-950/90 border-b-2 border-gray-700 flex items-center justify-between px-4")}>
      {/* Logo */}
      <div className={cn("flex items-center gap-3", textColor)}>
        <div className="text-lg">◈</div>
        <div className="font-bold tracking-wider">LOREKEEPER TERMINAL</div>
        <div className="text-xs text-gray-600 tracking-wider">v1.0</div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {state.currentEpisode && state.messages.length > 0 && (
          <button
            onClick={onFinishEpisode}
            className={cn(
              "px-3 py-1.5 text-xs font-mono tracking-wider border transition-all",
              borderColor,
              textColor,
              "hover:bg-white/5"
            )}
          >
            FINISH EPISODE
          </button>
        )}
        
        {state.currentEpisode && (
          <button
            onClick={() => dispatch({ type: 'CLEAR_SESSION' })}
            className="px-3 py-1.5 text-xs font-mono tracking-wider border border-gray-700 text-gray-500 hover:border-red-500 hover:text-red-400 transition-all"
          >
            CLEAR
          </button>
        )}

        <button
          onClick={onOpenSettings}
          className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>

        {/* Window Controls (decorative) */}
        <div className="flex gap-1 ml-2 pl-2 border-l border-gray-700">
          <button className="w-3 h-3 rounded-full bg-gray-700 hover:bg-yellow-500 transition-colors" />
          <button className="w-3 h-3 rounded-full bg-gray-700 hover:bg-green-500 transition-colors" />
          <button className="w-3 h-3 rounded-full bg-gray-700 hover:bg-red-500 transition-colors" />
        </div>
      </div>
    </div>
  );
}
