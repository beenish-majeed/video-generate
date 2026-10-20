import React, { useState } from 'react';
import type { ConsentPayload } from '../../types/api';
import { playStickerPopSound } from '../../utils/soundEffects';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowLeft, ShieldCheck, Loader2, Info, UserCheck, Mic, Tag, AlertCircle } from 'lucide-react';

interface ConsentStepProps {
  onSubmitJob: (consent: ConsentPayload) => void;
  onBack: () => void;
  submitting: boolean;
  error?: string | null;
  isPromptPath?: boolean;
}

export const ConsentStep: React.FC<ConsentStepProps> = ({
  onSubmitJob,
  onBack,
  submitting,
  error,
  isPromptPath = false,
}) => {
  // Global Rule & Requirement: NO pre-checked boxes! All default to false.
  const [faceRights, setFaceRights] = useState(false);
  const [voiceRights, setVoiceRights] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  // Prompt path consents (AI generation & AI label acceptance)
  const [aiGeneratedAccepted, setAiGeneratedAccepted] = useState(false);
  const [aiLabelAccepted, setAiLabelAccepted] = useState(false);

  // All required consents must be actively accepted by the user
  const isValid = isPromptPath
    ? aiGeneratedAccepted && aiLabelAccepted
    : faceRights && voiceRights && authorized;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    if (isPromptPath) {
      const consentPayload: ConsentPayload = {
        authorized: true,
        statement: 'I accept that this video is AI-generated and will display an AI label.',
        ai_generated_accepted: true,
        ai_label_accepted: true,
      };
      onSubmitJob(consentPayload);
    } else {
      const consentPayload: ConsentPayload = {
        authorized: true,
        statement: 'I attest that I own or have permission to use this photo and voice sample, and authorize Memory Studio to render this video.',
        face_rights_attested: true,
        voice_rights_attested: true,
      };
      onSubmitJob(consentPayload);
    }
  };

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(14px, 2.2dvh, 26px) clamp(16px, 2.2vw, 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(10px, 1.5dvh, 18px)',
        position: 'relative',
        maxWidth: 'min(1160px, 94%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Tape rotation="2.5deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="RIGHTS & RESPECT" rotation="-2deg" variant="sage" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: 'clamp(16px, 1.8vw, 20px)', margin: 0 }}>
          {isPromptPath ? 'AI Transparency & Attribution...' : 'Keeping creativity safe, honest & respectful...'}
        </p>
        <h2 className="editorial-title" style={{ marginTop: '2px', fontSize: 'clamp(20px, 2.5vw, 26px)', lineHeight: 1.15 }}>
          {isPromptPath ? 'AI Generation & Transparency Consent' : 'Rights & Consent Confirmation'}
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '13.5px', marginTop: '2px' }}>
          {isPromptPath
            ? 'Before we render your film, please confirm acceptance that this video is AI-generated and will display an AI transparency label.'
            : 'Before we bring your narrative to life, please take a quiet moment to confirm permission and transparency.'}
        </p>
      </header>

      {/* Plain Language Summary Card */}
      <section
        aria-label={isPromptPath ? 'AI generation transparency overview' : 'What happens with your media'}
        style={{
          padding: 'clamp(10px, 1.2dvh, 16px) clamp(12px, 2vw, 18px)',
          borderRadius: '12px',
          backgroundColor: 'var(--paper-cream-alt)',
          border: '1px solid var(--paper-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(6px, 1dvh, 10px)',
          boxShadow: 'var(--shadow-card)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={18} style={{ color: 'var(--ink-terracotta)', flexShrink: 0 }} />
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '16.5px', color: 'var(--ink-primary)', margin: 0 }}>
            {isPromptPath ? 'AI Generation Details' : 'What Happens with Your Media'}
          </h3>
        </div>

        {isPromptPath ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <UserCheck size={18} style={{ color: 'var(--ink-sage)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>Studio Character Avatar</p>
                <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                  Uses a curated studio portrait preset to synthesize facial animation.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Mic size={18} style={{ color: 'var(--ink-blue)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>Synthesized Voice Narration</p>
                <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                  Uses a standard studio voice preset to pronounce your generated narrative.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Tag size={18} style={{ color: 'var(--ink-amber)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>AI Transparency Label</p>
                <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                  The rendered film carries a visible AI label so viewers know it was synthetically crafted.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <UserCheck size={18} style={{ color: 'var(--ink-sage)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>Your Photograph</p>
                <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                  Used strictly to synthesize natural facial animation for this video.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Mic size={18} style={{ color: 'var(--ink-blue)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>Your Voice Recording</p>
                <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                  Used to clone speech tone and pronounce your script narrative.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Tag size={18} style={{ color: 'var(--ink-amber)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>AI Transparency Label</p>
                <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                  The rendered film carries a discrete AI label so viewers know it was synthetically crafted.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Active Acceptance Form (No Pre-checked Boxes; 44px+ Touch Targets) */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1.2dvh, 14px)', width: '100%' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(8px, 1dvh, 12px)',
            padding: 'clamp(10px, 1.2dvh, 16px) clamp(12px, 2vw, 18px)',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            border: '1.5px dashed var(--paper-border)',
            boxShadow: 'var(--shadow-card)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {isPromptPath ? (
            <>
              {/* Prompt Consent 1: AI Generated */}
              <label
                htmlFor="ai-generated-checkbox"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  minHeight: '44px',
                  padding: '4px 0',
                }}
              >
                <input
                  id="ai-generated-checkbox"
                  type="checkbox"
                  checked={aiGeneratedAccepted}
                  onChange={(e) => {
                    setAiGeneratedAccepted(e.target.checked);
                    playStickerPopSound();
                  }}
                  style={{
                    width: '22px',
                    height: '22px',
                    minWidth: '22px',
                    minHeight: '22px',
                    marginTop: '2px',
                    accentColor: 'var(--ink-terracotta)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
                    I understand and accept that this video is AI-generated
                  </p>
                  <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                    The video is created using studio preset character visuals and synthesized narration.
                  </p>
                </div>
              </label>

              <div style={{ height: '1px', backgroundColor: 'var(--paper-border)' }} />

              {/* Prompt Consent 2: AI Label Acceptance */}
              <label
                htmlFor="ai-label-checkbox"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  minHeight: '44px',
                  padding: '4px 0',
                }}
              >
                <input
                  id="ai-label-checkbox"
                  type="checkbox"
                  checked={aiLabelAccepted}
                  onChange={(e) => {
                    setAiLabelAccepted(e.target.checked);
                    playStickerPopSound();
                  }}
                  style={{
                    width: '22px',
                    height: '22px',
                    minWidth: '22px',
                    minHeight: '22px',
                    marginTop: '2px',
                    accentColor: 'var(--ink-terracotta)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
                    I agree that the video will carry an AI transparency label
                  </p>
                  <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                    A visible label ensures viewers know this animation was synthetically crafted.
                  </p>
                </div>
              </label>
            </>
          ) : (
            <>
              {/* Consent 1: Face Rights */}
              <label
                htmlFor="face-rights-checkbox"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  minHeight: '44px',
                  padding: '4px 0',
                }}
              >
                <input
                  id="face-rights-checkbox"
                  type="checkbox"
                  checked={faceRights}
                  onChange={(e) => {
                    setFaceRights(e.target.checked);
                    playStickerPopSound();
                  }}
                  style={{
                    width: '22px',
                    height: '22px',
                    minWidth: '22px',
                    minHeight: '22px',
                    marginTop: '2px',
                    accentColor: 'var(--ink-terracotta)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
                    I attest that I have permission to use the face image in this photograph
                  </p>
                  <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                    This is my own face, or I have explicit agreement from the person shown in the photo.
                  </p>
                </div>
              </label>

              <div style={{ height: '1px', backgroundColor: 'var(--paper-border)' }} />

              {/* Consent 2: Voice Rights */}
              <label
                htmlFor="voice-rights-checkbox"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  minHeight: '44px',
                  padding: '4px 0',
                }}
              >
                <input
                  id="voice-rights-checkbox"
                  type="checkbox"
                  checked={voiceRights}
                  onChange={(e) => {
                    setVoiceRights(e.target.checked);
                    playStickerPopSound();
                  }}
                  style={{
                    width: '22px',
                    height: '22px',
                    minWidth: '22px',
                    minHeight: '22px',
                    marginTop: '2px',
                    accentColor: 'var(--ink-terracotta)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
                    I attest that I have permission to use this voice recording sample
                  </p>
                  <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                    I am the speaker, or I have explicit agreement to synthesize speech matching this voice.
                  </p>
                </div>
              </label>

              <div style={{ height: '1px', backgroundColor: 'var(--paper-border)' }} />

              {/* Consent 3: Authorization & AI Disclosure */}
              <label
                htmlFor="authorized-checkbox"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  minHeight: '44px',
                  padding: '4px 0',
                }}
              >
                <input
                  id="authorized-checkbox"
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => {
                    setAuthorized(e.target.checked);
                    playStickerPopSound();
                  }}
                  style={{
                    width: '22px',
                    height: '22px',
                    minWidth: '22px',
                    minHeight: '22px',
                    marginTop: '2px',
                    accentColor: 'var(--ink-terracotta)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
                    I acknowledge the AI generation label and authorize Memory Studio to render this film
                  </p>
                  <p style={{ fontSize: '13px', color: '#4e473f', marginTop: '2px', lineHeight: 1.4 }}>
                    I agree that this video is generated for respectful storytelling and carries an AI disclosure.
                  </p>
                </div>
              </label>
            </>
          )}
        </div>

        {/* Error Feedback Card after Job Creation - Fits 320px cleanly */}
        {error && (
          <div
            role="alert"
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: '#fff',
              border: '1.5px dashed var(--ink-terracotta)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              width: '100%',
              boxSizing: 'border-box',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <AlertCircle size={20} style={{ color: 'var(--ink-terracotta)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
              <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', color: 'var(--ink-primary)' }}>
                Job Creation Notice
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Responsive Navigation & Action Footer */}
        <footer
          className="step-footer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '4px',
            paddingTop: 'clamp(8px, 1dvh, 12px)',
            borderTop: '1px solid var(--paper-border)',
          }}
        >
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="btn-secondary"
            style={{ minHeight: '44px', padding: '8px 18px', cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>

          {/* The Continue button stays disabled until ALL consents are accepted */}
          <button
            type="submit"
            disabled={!isValid || submitting}
            aria-disabled={!isValid || submitting}
            className="btn-terracotta"
            style={{
              minHeight: '44px',
              padding: '10px 22px',
              opacity: !isValid || submitting ? 0.5 : 1,
              cursor: !isValid || submitting ? 'not-allowed' : 'pointer',
              fontSize: '15px',
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Sending to Studio...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                <span>Create My Memory Film</span>
              </>
            )}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default ConsentStep;
