import React, { useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import { ArrowRight, ArrowLeft, Mic, Check, Loader2, AlertCircle, Film, User, Palette } from 'lucide-react';
import type { AvatarPreset, VoicePreset } from '../../types/api';

export interface LookVoiceStepProps {
  initialVisualMode?: 'slideshow' | 'talking_head';
  initialImageStyle?: string;
  initialAvatarId?: string;
  initialVoiceId?: string;
  onNext: (
    avatarId: string,
    voiceId: string,
    visualMode?: 'slideshow' | 'talking_head',
    imageStyle?: string
  ) => void;
  onBack: () => void;
}

const FALLBACK_AVATARS: AvatarPreset[] = [
  {
    id: 'avatar_default',
    name: 'Storyteller Portrait',
    thumbnail_url: '/v1/presets/avatars/avatar_default/thumbnail',
  },
];

const FALLBACK_VOICES: VoicePreset[] = [
  {
    id: 'voice_piper_lessac',
    name: 'Lessac (Warm & Clear)',
  },
];

export interface VisualStyleOption {
  id: string;
  label: string;
  description: string;
}

export const VISUAL_STYLES: VisualStyleOption[] = [
  { id: 'cinematic', label: 'Cinematic', description: 'Dramatic lighting, 35mm film atmosphere' },
  { id: 'watercolor', label: 'Watercolor', description: 'Soft pigments on textured sketchbook paper' },
  { id: 'flat illustration', label: 'Flat illustration', description: 'Clean graphic shapes and minimal lines' },
  { id: 'photo', label: 'Photo', description: 'Natural realism and authentic perspective' },
  { id: 'cards', label: 'Simple cards', description: 'Title cards with gradient backgrounds' },
];

export const LookVoiceStep: React.FC<LookVoiceStepProps> = ({
  initialVisualMode = 'slideshow',
  initialImageStyle = 'cinematic',
  initialAvatarId,
  initialVoiceId,
  onNext,
  onBack,
}) => {
  const [visualMode, setVisualMode] = useState<'slideshow' | 'talking_head'>(initialVisualMode);
  const [imageStyle, setImageStyle] = useState<string>(initialImageStyle);
  const [avatars, setAvatars] = useState<AvatarPreset[]>(FALLBACK_AVATARS);
  const [voices, setVoices] = useState<VoicePreset[]>(FALLBACK_VOICES);
  const [selectedAvatar, setSelectedAvatar] = useState<string>(initialAvatarId || FALLBACK_AVATARS[0].id);
  const [selectedVoice, setSelectedVoice] = useState<string>(initialVoiceId || FALLBACK_VOICES[0].id);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<MappedAPIError | null>(null);

  useEffect(() => {
    let isMounted = true;
    apiClient
      .getPresets()
      .then((data) => {
        if (!isMounted) return;
        if (data.avatars && data.avatars.length > 0) {
          setAvatars(data.avatars);
          if (!initialAvatarId) {
            setSelectedAvatar(data.avatars[0].id);
          }
        }
        if (data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          if (!initialVoiceId) {
            setSelectedVoice(data.voices[0].id);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(mapAPIError(err));
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [initialAvatarId, initialVoiceId]);

  const handleSelectPresentation = (mode: 'slideshow' | 'talking_head') => {
    playStickerPopSound();
    setVisualMode(mode);
  };

  const handleSelectStyle = (styleId: string) => {
    playStickerPopSound();
    setImageStyle(styleId);
  };

  const handleSelectAvatar = (id: string) => {
    playStickerPopSound();
    setSelectedAvatar(id);
  };

  const handleSelectVoice = (id: string) => {
    playStickerPopSound();
    setSelectedVoice(id);
  };

  const handleContinue = () => {
    onNext(selectedAvatar, selectedVoice, visualMode, imageStyle);
  };

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(16px, 2.5dvh, 32px) clamp(16px, 2.5vw, 44px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2dvh, 24px)',
        position: 'relative',
        maxWidth: 'min(1100px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Title & Description */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 34px)', lineHeight: 1.2, margin: 0 }}>
          Choose your look and voice
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', lineHeight: 1.5, margin: 0 }}>
          Select how your video should look: animated scenes with camera moves, or a talking character portrait.
        </p>
      </header>

      {/* Section 0: Presentation Mode Selection */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Presentation style
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            width: '100%',
          }}
        >
          {/* Option A: Scenes with camera moves */}
          <button
            type="button"
            onClick={() => handleSelectPresentation('slideshow')}
            aria-pressed={visualMode === 'slideshow'}
            className={`card ${visualMode === 'slideshow' ? 'card-selected' : ''}`}
            style={{
              padding: '14px 16px',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease',
              minHeight: '44px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Film size={18} color="var(--accent-primary)" />
                <span style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--text-primary)' }}>
                  Visual style: scenes with camera moves
                </span>
              </div>
              {visualMode === 'slideshow' && (
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Cinematic scenes panning and zooming seamlessly along with the speech.
            </p>
          </button>

          {/* Option B: A talking face */}
          <button
            type="button"
            onClick={() => handleSelectPresentation('talking_head')}
            aria-pressed={visualMode === 'talking_head'}
            className={`card ${visualMode === 'talking_head' ? 'card-selected' : ''}`}
            style={{
              padding: '14px 16px',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease',
              minHeight: '44px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={18} color="var(--accent-primary)" />
                <span style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--text-primary)' }}>
                  A talking face
                </span>
              </div>
              {visualMode === 'talking_head' && (
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              A character portrait brought to life with synchronized lip movements.
            </p>
          </button>
        </div>
      </section>

      {/* Section 1A: Visual Style for scenes with camera moves */}
      {visualMode === 'slideshow' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Palette size={18} color="var(--accent-primary)" />
            <h2
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Art &amp; Visual Style
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
              width: '100%',
            }}
          >
            {VISUAL_STYLES.map((style) => {
              const isSelected = imageStyle === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => handleSelectStyle(style.id)}
                  aria-pressed={isSelected}
                  className={`card ${isSelected ? 'card-selected' : ''}`}
                  style={{
                    padding: '12px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                    minHeight: '44px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '14.5px',
                        fontWeight: 600,
                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                      }}
                    >
                      {style.label}
                    </span>
                    {isSelected && <Check size={14} color="var(--accent-primary)" strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {style.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 1B: Character Look for talking face */}
      {visualMode === 'talking_head' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Character Look
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '14px',
              width: '100%',
            }}
          >
            {avatars.map((avatar) => {
              const isSelected = selectedAvatar === avatar.id;

              return (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => handleSelectAvatar(avatar.id)}
                  aria-pressed={isSelected}
                  className={`card ${isSelected ? 'card-selected' : ''}`}
                  style={{
                    padding: '12px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                    outline: 'none',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      backgroundColor: 'var(--bg-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={avatar.thumbnail_url}
                      alt={avatar.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '14.5px',
                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {avatar.name}
                    </span>
                    {isSelected && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent-primary)',
                          color: '#fff',
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', color: 'var(--text-muted)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: '14px', fontFamily: 'var(--font-sans)' }}>Loading presets...</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderColor: 'var(--accent-danger)',
            color: 'var(--accent-danger)',
            fontSize: '13.5px',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{error.message} (Using default studio presets)</span>
        </div>
      )}

      {/* Section 2: Narrator Voice */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Narrator Voice
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            width: '100%',
          }}
        >
          {voices.map((voice) => {
            const isSelected = selectedVoice === voice.id;

            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => handleSelectVoice(voice.id)}
                aria-pressed={isSelected}
                className={`card ${isSelected ? 'card-selected' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  minHeight: '44px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--accent-primary-light)',
                      color: isSelected ? '#fff' : 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Mic size={14} />
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '14.5px',
                        fontWeight: 600,
                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                      }}
                    >
                      {voice.name}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Preset voice profile
                    </span>
                  </div>
                </div>

                {voice.sample_url && (
                  <audio src={voice.sample_url} controls style={{ display: 'none' }} />
                )}

                {isSelected ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#fff',
                    }}
                  >
                    <Check size={11} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* Navigation Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '8px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          style={{ minHeight: '44px', padding: '10px 20px', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
          <span className="kbd-hint" title="Keyboard shortcut: Esc">Esc</span>
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="btn-primary"
          style={{
            minHeight: '44px',
            padding: '10px 24px',
            cursor: 'pointer',
          }}
        >
          <span>Review Script</span>
          <ArrowRight size={18} aria-hidden="true" />
          <span className="kbd-hint" title="Keyboard shortcut: Enter">↵</span>
        </button>
      </div>
    </div>
  );
};

export default LookVoiceStep;
