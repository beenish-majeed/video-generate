import React from 'react';
import { type JourneyStepId, type FlowMode } from './PageTabs';
import StoryTimeline from './StoryTimeline';
import SoundToggle from './SoundToggle';
import CursorGlow from './ui/CursorGlow';
import SparkleCanvas from './ui/SparkleCanvas';
import { ToastProvider } from './ui/Toast';

interface NotebookShellProps {
  currentStep: JourneyStepId;
  flowMode?: FlowMode;
  hasOwnVoice?: boolean;
  onSelectStep?: (step: JourneyStepId) => void;
  children: React.ReactNode;
}

export const NotebookShell: React.FC<NotebookShellProps> = ({
  currentStep,
  flowMode,
  hasOwnVoice = false,
  onSelectStep,
  children,
}) => {
  return (
    <ToastProvider>
      <div className="app-shell">
        {/* Sparkle canvas layer on every page except the Welcome page */}
        {currentStep !== 'hero' && <SparkleCanvas density="subtle" />}

        {/* Desktop subtle cursor glow follower */}
        <CursorGlow />

        {/* Modern Edge-to-Edge Top Bar with Horizontal Story Progress Indicator */}
        <header className="app-topbar" aria-label="Application Header">
          <div
            className="app-brand"
            onClick={() => onSelectStep && onSelectStep('hero')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelectStep && onSelectStep('hero');
              }
            }}
            aria-label="Memory Studio"
          >
            <span className="app-brand-badge">M</span>
            <span>Memory Studio</span>
          </div>

          {/* Consistent Horizontal Top Story Progress Indicator across every screen */}
          <div
            style={{
              flex: 1,
              maxWidth: '680px',
              margin: '0 clamp(8px, 1.5vw, 24px)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minWidth: 0,
              overflow: 'visible',
            }}
          >
            <StoryTimeline
              currentStep={currentStep}
              flowMode={flowMode}
              hasOwnVoice={hasOwnVoice}
              onSelectStep={onSelectStep}
            />
          </div>

          {/* Top-Right Sound & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <SoundToggle />
          </div>
        </header>

        {/* Main Content Area */}
        <main id="main-content" className="app-main">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
};

export default NotebookShell;
