import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSoundEnabled, setSoundEnabled, playStickerPopSound } from '../utils/soundEffects';

export const SoundToggle: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(isSoundEnabled());
  }, []);

  const handleToggle = () => {
    const nextState = !enabled;
    setEnabled(nextState);
    setSoundEnabled(nextState);
    if (nextState) {
      playStickerPopSound();
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={enabled ? 'Sound: On - click to mute sound effects' : 'Sound: Off - click to enable sound effects'}
      aria-pressed={enabled}
      title={enabled ? 'Sound effects active (click to mute)' : 'Sound effects muted (click to enable)'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        borderRadius: 'var(--radius-pill)',
        backgroundColor: enabled ? 'var(--accent-primary-light)' : 'var(--bg-surface)',
        border: enabled ? '1px solid var(--accent-primary-border)' : '1px solid var(--border-light)',
        color: enabled ? 'var(--accent-primary)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontSize: '13.5px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        minHeight: '44px',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {enabled ? (
        <Volume2 size={16} style={{ color: 'var(--accent-primary)' }} />
      ) : (
        <VolumeX size={16} style={{ color: 'var(--text-muted)' }} />
      )}
      <span>{enabled ? 'Sound: On' : 'Sound: Off'}</span>
    </button>
  );
};

export default SoundToggle;
