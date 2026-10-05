import React from 'react';
import PageTabs, { type JourneyStepId } from './PageTabs';
import { DoodleSpiral } from './Doodles';

interface NotebookShellProps {
  currentStep: JourneyStepId;
  onSelectStep?: (step: JourneyStepId) => void;
  children: React.ReactNode;
}

export const NotebookShell: React.FC<NotebookShellProps> = ({
  currentStep,
  onSelectStep,
  children,
}) => {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-canvas)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 12px',
        boxSizing: 'border-box',
      }}
    >
      {/* Outer Notebook Window Container */}
      <div className="notebook-container graph-paper-bg">
        {/* Notebook Top Binder Spiral */}
        <DoodleSpiral count={14} />

        {/* Handmade Page Tabs Step Indicator */}
        <PageTabs currentStep={currentStep} onSelectStep={onSelectStep} />

        {/* Paper Page Inner Content */}
        <div style={{ position: 'relative', minHeight: '560px', width: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default NotebookShell;
