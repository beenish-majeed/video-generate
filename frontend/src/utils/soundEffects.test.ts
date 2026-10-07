import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isSoundEnabled, setSoundEnabled, playPageTurnSound, playStickerPopSound, playClickSound } from './soundEffects';

describe('Sound Effects Utility', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const localStorageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      clear: () => {
        mockStorage = {};
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    };

    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('window', {
      localStorage: localStorageMock,
    });
  });

  it('should default to sound disabled', () => {
    expect(isSoundEnabled()).toBe(false);
  });

  it('should enable sound and persist choice in localStorage', () => {
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
    expect(mockStorage['memory_studio_sound_enabled']).toBe('true');
  });

  it('should disable sound and update localStorage', () => {
    setSoundEnabled(true);
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    expect(mockStorage['memory_studio_sound_enabled']).toBe('false');
  });

  it('should safely execute sound triggers without error regardless of toggle state', () => {
    expect(() => playPageTurnSound()).not.toThrow();
    expect(() => playStickerPopSound()).not.toThrow();
    expect(() => playClickSound()).not.toThrow();

    setSoundEnabled(true);
    expect(() => playPageTurnSound()).not.toThrow();
    expect(() => playStickerPopSound()).not.toThrow();
    expect(() => playClickSound()).not.toThrow();
  });
});
