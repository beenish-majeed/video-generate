import React from 'react';
import PageTabs, { type JourneyStepId, type FlowMode } from './PageTabs';
import SoundToggle from './SoundToggle';
import CursorGlow from './ui/CursorGlow';

interface NotebookShellProps {
  currentStep: JourneyStepId;
  flowMode?: FlowMode;
  onSelectStep?: (step: JourneyStepId) => void;
  children: React.ReactNode;
}

export const NotebookShell: React.FC<NotebookShellProps> = ({
  currentStep,
  flowMode,
  onSelectStep,
  children,
}) => {
  return (
    <div className="app-shell">
      {/* Desktop subtle cursor glow follower */}
      <CursorGlow />

      {/* Modern Edge-to-Edge Top Bar */}
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
          aria-label="Memory Studio Home"
        >
          <span className="app-brand-badge">M</span>
          <span>Memory Studio</span>
        </div>

        {/* Clean Step Indicator */}
        {currentStep !== 'hero' && currentStep !== 'choice' && (
          <nav
            aria-label="Step navigation"
            style={{
              flex: 1,
              maxWidth: '840px',
              margin: '0 16px',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <PageTabs currentStep={currentStep} flowMode={flowMode} onSelectStep={onSelectStep} />
          </nav>
        )}

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
  );
};

export default NotebookShell;

