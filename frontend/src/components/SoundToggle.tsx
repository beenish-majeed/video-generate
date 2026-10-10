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
      aria-label={enabled ? 'Mute sound effects' : 'Enable sound effects'}
      aria-pressed={enabled}
      title={enabled ? 'Sound effects active (click to mute)' : 'Sound effects muted (click to enable)'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: '9999px',
        backgroundColor: enabled ? 'var(--paper-cream)' : 'rgba(225, 215, 200, 0.4)',
        border: enabled ? '1.5px solid var(--ink-terracotta)' : '1px dashed var(--ink-muted)',
        color: enabled ? 'var(--ink-terracotta)' : 'var(--ink-muted)',
        fontFamily: 'var(--font-hand)',
        fontSize: '15px',
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        minHeight: '44px',
        userSelect: 'none',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      {enabled ? (
        <Volume2 size={16} style={{ color: 'var(--ink-terracotta)' }} />
      ) : (
        <VolumeX size={16} style={{ color: 'var(--ink-muted)' }} />
      )}
      <span>{enabled ? 'Sound: On' : 'Sound: Off'}</span>
    </button>
  );
};

export default SoundToggle;
