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
        <DoodleSpiral count={14} />

        {/* Handmade Page Tabs Step Indicator */}
        <PageTabs currentStep={currentStep} flowMode={flowMode} onSelectStep={onSelectStep} />

        {/* Paper Page Inner Content */}
        <div style={{ position: 'relative', minHeight: 'clamp(420px, 60dvh, 720px)', width: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default NotebookShell;
