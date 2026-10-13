import React from 'react';
import PageTabs, { type JourneyStepId, type FlowMode } from './PageTabs';
import { DoodleSpiral } from './Doodles';

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
    <div className="notebook-wrapper">
      {/* Outer Notebook Window Container */}
      <div className="notebook-container graph-paper-bg">
        {/* Notebook Top Binder Spiral */}
        <header aria-label="Notebook Binder">
          <h1 className="sr-only">Memory Studio — Turn Memories into Cinematic Videos</h1>
          <DoodleSpiral count={14} />
        </header>

        {/* Handmade Page Tabs Step Indicator */}
        {currentStep !== 'hero' && currentStep !== 'choice' && (
          <nav aria-label="Step navigation">
            <PageTabs currentStep={currentStep} flowMode={flowMode} onSelectStep={onSelectStep} />
          </nav>
        )}

        {/* Paper Page Inner Content */}
        <main id="main-content" style={{ position: 'relative', minHeight: 'clamp(420px, 60dvh, 720px)', width: '100%' }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default NotebookShell;
