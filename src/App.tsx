import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { CRTOverlay } from './components/CRTOverlay';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Footer } from './components/Footer';
import { SettingsModal } from './components/SettingsModal';
import { FinishEpisodeModal } from './components/FinishEpisodeModal';
import { cn } from './utils/cn';

function AppContent() {
  const { state } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishEpisodeOpen, setFinishEpisodeOpen] = useState(false);

  // Fishbowl transform for the whole app
  const fishbowlStyle = state.settings.crtEffects && state.settings.fishbowlIntensity > 0
    ? {
        transform: `perspective(1000px) rotateX(${state.settings.fishbowlIntensity * 2}deg)`,
        borderRadius: `${state.settings.fishbowlIntensity * 30}px`,
      }
    : {};

  return (
    <div
      className={cn(
        "h-screen w-screen overflow-hidden font-mono",
        "bg-gray-950 text-gray-300",
        state.settings.crtEffects && "crt-glow"
      )}
      style={fishbowlStyle}
    >
      {/* CRT Effects Overlay */}
      <CRTOverlay />

      {/* Main Layout */}
      <div className="h-full flex flex-col">
        <Header
          onOpenSettings={() => setSettingsOpen(true)}
          onFinishEpisode={() => setFinishEpisodeOpen(true)}
        />

        <div className="flex-1 flex overflow-hidden">
          <Sidebar />
          <ChatArea />
        </div>

        <Footer />
      </div>

      {/* Modals */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FinishEpisodeModal isOpen={finishEpisodeOpen} onClose={() => setFinishEpisodeOpen(false)} />
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