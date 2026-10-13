import React, { useEffect, useState } from 'react';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import { ArrowRight, ArrowLeft, Mic, Check, Volume2, Loader2, AlertCircle } from 'lucide-react';
import type { AvatarPreset, VoicePreset } from '../../types/api';

export interface LookVoiceStepProps {
  initialAvatarId?: string;
  initialVoiceId?: string;
  onNext: (avatarId: string, voiceId: string) => void;
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

export const LookVoiceStep: React.FC<LookVoiceStepProps> = ({
  initialAvatarId,
  initialVoiceId,
  onNext,
  onBack,
}) => {
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

  const handleSelectAvatar = (id: string) => {
    playStickerPopSound();
    setSelectedAvatar(id);
  };

  const handleSelectVoice = (id: string) => {
    playStickerPopSound();
    setSelectedVoice(id);
  };

  const handleContinue = () => {
    onNext(selectedAvatar, selectedVoice);
  };

  return (
    <div
      className="step-container"
      style={{
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        position: 'relative',
        maxWidth: '840px',
        margin: '0 auto',
      }}
    >
      <Tape rotation="2deg" style={{ position: 'absolute', top: '10px', right: '32px' }} />

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
            padding: '10px 18px',
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
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <p className="handwritten" style={{ fontSize: '22px', color: 'var(--ink-sage)', margin: 0 }}>
          Cast your animated narrator...
        </p>
        <h1 className="editorial-title" style={{ fontSize: '30px', lineHeight: 1.2, margin: 0 }}>
          Choose your look and voice
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', lineHeight: 1.5, margin: 0 }}>
          Select a character portrait and voice narrator from the studio preset collection.
        </p>
      </header>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 0', color: 'var(--ink-muted)' }}>
          <Loader2 size={20} className="animate-spin" />
          <span>Loading studio presets...</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#fff4f2',
            border: '1px solid var(--ink-terracotta)',
            color: 'var(--ink-terracotta)',
            fontSize: '14px',
          }}
        >
          <AlertCircle size={18} flex-shrink={0} />
          <span>{error.message} (Using default studio presets)</span>
        </div>
      )}

      {/* Section 1: Character Look (Taped Polaroids) */}
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
                {/* Tape at top of polaroid */}
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

                {/* Inner Photo Frame */}
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
                      // Fallback placeholder if image fails to load
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>

                {/* Polaroid Label */}
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

      {/* Section 2: Narrator Voice */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '6px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-hand)',
            fontSize: '20px',
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
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
                  padding: '14px 18px',
                  minHeight: '52px',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: isSelected ? 'var(--ink-sage)' : 'rgba(110, 140, 115, 0.15)',
                      color: isSelected ? '#fff' : 'var(--ink-sage)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Mic size={16} />
                  </div>
                  <div>
                    <span
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-hand)',
                        fontSize: '17px',
                        fontWeight: isSelected ? 'bold' : 'normal',
                        color: isSelected ? 'var(--ink-sage)' : 'var(--ink-primary)',
                      }}
                    >
                      {voice.name}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                      Preset voice profile
                    </span>
                  </div>
                </div>

                {/* Preview audio only if sample_url provided */}
                {voice.sample_url && (
                  <audio src={voice.sample_url} controls style={{ display: 'none' }} />
                )}

                {isSelected ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--ink-sage)',
                      color: '#fff',
                    }}
                  >
                    <Check size={12} strokeWidth={3} />
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
          borderTop: '1px solid var(--paper-border)',
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
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="btn-terracotta"
          style={{
            minHeight: '44px',
            padding: '12px 24px',
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
