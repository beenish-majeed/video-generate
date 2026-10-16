import React, { useEffect, useState } from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import { ArrowRight, ArrowLeft, Mic, Check, Loader2, AlertCircle, Film, User, Palette } from 'lucide-react';
import type { AvatarPreset, VoicePreset } from '../../types/api';
import ComputerCapabilitiesPanel from '../ComputerCapabilitiesPanel';

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
        padding: 'clamp(10px, 1.5dvh, 20px) clamp(14px, 2vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(8px, 1.2dvh, 14px)',
        position: 'relative',
        maxWidth: 'clamp(840px, 80vw, 1140px)',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Tape rotation="2deg" style={{ position: 'absolute', top: '10px', right: '35px' }} />

      {/* Top Header Row with Back Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          aria-label="Back to previous screen"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: '44px',
            minWidth: '44px',
            padding: '8px 16px',
            fontSize: '15px',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </button>

        <Sticker label="STEP 03" rotation="-1deg" variant="sage" />
      </div>

      {/* Title & Description */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(2px, 0.5dvh, 4px)' }}>
        <p className="handwritten" style={{ fontSize: 'clamp(17px, 1.5vw, 20px)', color: 'var(--ink-sage)', margin: 0 }}>
          Visual style &amp; narrator...
        </p>
        <h1 className="editorial-title" style={{ fontSize: 'clamp(22px, 2vw, 26px)', lineHeight: 1.2, margin: 0 }}>
          Choose your look and voice
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: 'clamp(12.5px, 1vw, 14px)', lineHeight: 1.4, margin: 0 }}>
          Select how your video should look: animated scenes with camera moves, or a talking character portrait.
        </p>
      </header>

      {/* Section 0: Presentation Mode Selection */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label
          style={{
            fontFamily: 'var(--font-hand)',
            fontSize: '17px',
            fontWeight: 'bold',
            color: 'var(--ink-primary)',
          }}
        >
          Presentation style
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'clamp(8px, 1vw, 12px)',
            width: '100%',
          }}
        >
          {/* Option A: Scenes with camera moves */}
          <button
            type="button"
            onClick={() => handleSelectPresentation('slideshow')}
            aria-pressed={visualMode === 'slideshow'}
            style={{
              padding: 'clamp(8px, 1.2dvh, 12px) 14px',
              borderRadius: 'var(--radius-paper)',
              border: visualMode === 'slideshow' ? '2px solid var(--ink-terracotta)' : '1px solid var(--paper-border)',
              backgroundColor: visualMode === 'slideshow' ? 'rgba(196, 98, 77, 0.08)' : 'var(--paper-cream)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Film size={17} color="var(--ink-terracotta)" />
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink-primary)' }}>
                  Visual style: scenes with camera moves
                </span>
              </div>
              {visualMode === 'slideshow' && (
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--ink-terracotta)',
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
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-muted)', lineHeight: 1.35 }}>
              Cinematic scenes panning and zooming seamlessly along with the speech.
            </p>
          </button>

          {/* Option B: A talking face */}
          <button
            type="button"
            onClick={() => handleSelectPresentation('talking_head')}
            aria-pressed={visualMode === 'talking_head'}
            style={{
              padding: 'clamp(8px, 1.2dvh, 12px) 14px',
              borderRadius: 'var(--radius-paper)',
              border: visualMode === 'talking_head' ? '2px solid var(--ink-sage)' : '1px solid var(--paper-border)',
              backgroundColor: visualMode === 'talking_head' ? 'rgba(110, 140, 115, 0.08)' : 'var(--paper-cream)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={17} color="var(--ink-sage)" />
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink-primary)' }}>
                  A talking face
                </span>
              </div>
              {visualMode === 'talking_head' && (
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--ink-sage)',
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
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-muted)', lineHeight: 1.35 }}>
              A character portrait brought to life with synchronized lip movements.
            </p>
          </button>
        </div>
      </section>

      {/* Section 1A: Visual Style for scenes with camera moves */}
      {visualMode === 'slideshow' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Palette size={17} color="var(--ink-terracotta)" />
            <h2
              style={{
                fontFamily: 'var(--font-hand)',
                fontSize: '17px',
                fontWeight: 'bold',
                color: 'var(--ink-primary)',
                margin: 0,
              }}
            >
              Art &amp; Visual Style
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 'clamp(6px, 1vw, 10px)',
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
                  style={{
                    padding: 'clamp(8px, 1dvh, 10px) 10px',
                    borderRadius: 'var(--radius-paper)',
                    border: isSelected ? '2px solid var(--ink-terracotta)' : '1px solid var(--paper-border)',
                    backgroundColor: isSelected ? 'rgba(196, 98, 77, 0.08)' : 'var(--paper-cream)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                    minHeight: '44px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-hand)',
                        fontSize: '15px',
                        fontWeight: isSelected ? 'bold' : '600',
                        color: isSelected ? 'var(--ink-terracotta)' : 'var(--ink-primary)',
                      }}
                    >
                      {style.label}
                    </span>
                    {isSelected && <Check size={14} color="var(--ink-terracotta)" strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--ink-muted)', lineHeight: 1.3 }}>
                    {style.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 1B: Character Look (Taped Polaroids) for talking face */}
      {visualMode === 'talking_head' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-hand)',
              fontSize: '20px',
              fontWeight: 'bold',
              color: 'var(--ink-primary)',
              margin: 0,
            }}
          >
            Character Look
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '20px',
              width: '100%',
            }}
          >
            {avatars.map((avatar, idx) => {
              const isSelected = selectedAvatar === avatar.id;
              const rotation = idx % 2 === 0 ? '-1.5deg' : '1.5deg';

              return (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => handleSelectAvatar(avatar.id)}
                  aria-pressed={isSelected}
                  style={{
                    position: 'relative',
                    backgroundColor: 'var(--paper-cream)',
                    border: isSelected ? '2.5px solid var(--ink-terracotta)' : '1px solid var(--paper-border)',
                    borderRadius: '4px',
                    padding: '12px 12px 18px 12px',
                    boxShadow: isSelected
                      ? '0 6px 16px rgba(196, 98, 77, 0.25)'
                      : 'var(--shadow-card)',
                    transform: `rotate(${rotation})`,
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
                  <Tape
                    rotation={idx % 2 === 0 ? '2deg' : '-2deg'}
                    style={{
                      position: 'absolute',
                      top: '-10px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 2,
                    }}
                  />

                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: '2px',
                      overflow: 'hidden',
                      backgroundColor: '#ded7cb',
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
                        fontFamily: 'var(--font-hand)',
                        fontSize: '16px',
                        color: isSelected ? 'var(--ink-terracotta)' : 'var(--ink-primary)',
                        fontWeight: isSelected ? 'bold' : 'normal',
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
                          backgroundColor: 'var(--ink-terracotta)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', color: 'var(--ink-muted)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: '14px' }}>Loading presets...</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: '#fff4f2',
            border: '1px solid var(--ink-terracotta)',
            color: 'var(--ink-terracotta)',
            fontSize: '13px',
          }}
        >
          <AlertCircle size={16} flex-shrink={0} />
          <span>{error.message} (Using default studio presets)</span>
        </div>
      )}

      {/* Section 2: Narrator Voice */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-hand)',
            fontSize: '17px',
            fontWeight: 'bold',
            color: 'var(--ink-primary)',
            margin: 0,
          }}
        >
          Narrator Voice
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'clamp(6px, 1vw, 10px)',
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'clamp(6px, 1dvh, 10px) 12px',
                  minHeight: '44px',
                  borderRadius: 'var(--radius-paper)',
                  border: isSelected ? '2px solid var(--ink-sage)' : '1px solid var(--paper-border)',
                  backgroundColor: isSelected ? 'rgba(110, 140, 115, 0.08)' : 'var(--paper-cream)',
                  boxShadow: isSelected ? 'var(--shadow-card)' : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      backgroundColor: isSelected ? 'var(--ink-sage)' : 'rgba(110, 140, 115, 0.15)',
                      color: isSelected ? '#fff' : 'var(--ink-sage)',
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
                        fontFamily: 'var(--font-hand)',
                        fontSize: '15px',
                        fontWeight: isSelected ? 'bold' : 'normal',
                        color: isSelected ? 'var(--ink-sage)' : 'var(--ink-primary)',
                      }}
                    >
                      {voice.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
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
                      backgroundColor: 'var(--ink-sage)',
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

      {/* Limitations and capabilities note */}
      <div style={{ marginTop: '2px' }}>
        <ComputerCapabilitiesPanel mode={visualMode} durationSeconds={30} showLimitations={true} />
      </div>

      {/* Navigation Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '4px',
          paddingTop: 'clamp(8px, 1dvh, 14px)',
          borderTop: '1px solid var(--paper-border)',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          style={{ minHeight: '44px', padding: '8px 18px', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="btn-terracotta"
          style={{
            minHeight: '44px',
            padding: '10px 22px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>Review Script</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default LookVoiceStep;
