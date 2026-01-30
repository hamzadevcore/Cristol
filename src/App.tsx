import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { CRTOverlay } from './components/CRTOverlay';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Footer } from './components/Footer';
import { SettingsModal } from './components/SettingsModal';
import { FinishEpisodeModal } from './components/FinishEpisodeModal';
import { EditShowModal } from './components/EditShowModal';
import { cn } from './utils/cn';

function AppContent() {
  const { state, dispatch } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishEpisodeOpen, setFinishEpisodeOpen] = useState(false);

  // Logic: 3D only active if Master Switch (crtEffects) is ON AND Perspective Switch is ON
  const is3DActive = state.settings.crtEffects && state.settings.enablePerspective;
  const intensity = is3DActive ? state.settings.fishbowlIntensity : 0;

  const containerStyle = {
    '--tilt-x': is3DActive ? '2deg' : '0deg',
    '--curve': is3DActive ? `${intensity * 200}px` : '0px',
    '--scale': is3DActive ? 0.96 : 1,
  } as React.CSSProperties;

  return (
    <div
        className={cn(
          "perspective-container bg-black",
          !is3DActive && "overflow-hidden" // Remove scrollbars if flat
        )}
        data-theme={state.settings.colorTheme}
        data-vfx={state.settings.crtEffects ? "enabled" : "disabled"}
    >
        <div
            className="crt-monitor flex flex-col overflow-hidden"
            style={containerStyle}
        >
            <CRTOverlay />

            {state.settings.crtEffects && <div className="monitor-glare" />}

            <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <FinishEpisodeModal isOpen={finishEpisodeOpen} onClose={() => setFinishEpisodeOpen(false)} />

            <Header onOpenSettings={() => setSettingsOpen(true)} onFinishEpisode={() => setFinishEpisodeOpen(true)} />

            <div className="flex-1 flex overflow-hidden relative z-10">
                <Sidebar />
                <ChatArea />

                {state.editingShow !== undefined && (
                   <EditShowModal
                      isOpen={true}
                      onClose={() => dispatch({ type: 'SET_EDITING_SHOW', payload: undefined })}
                      show={state.editingShow}
                   />
                )}
            </div>

            <Footer />
        </div>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}