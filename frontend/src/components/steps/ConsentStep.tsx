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
}

export const ConsentStep: React.FC<ConsentStepProps> = ({
  onSubmitJob,
  onBack,
  submitting,
  error,
}) => {
  // Global Rule & Requirement: NO pre-checked boxes! All default to false.
  const [faceRights, setFaceRights] = useState(false);
  const [voiceRights, setVoiceRights] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  // All 3 consents must be actively accepted by the user
  const isValid = faceRights && voiceRights && authorized;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    // Statement contains required tokens ('own', 'permission', 'authorize') for backend verification
    const consentPayload: ConsentPayload = {
      authorized: true,
      statement: 'I attest that I own or have permission to use this photo and voice sample, and authorize Memory Studio to render this video.',
      face_rights_attested: true,
      voice_rights_attested: true,
    };

    onSubmitJob(consentPayload);
  };

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(20px, 4vw, 32px) clamp(12px, 3vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
        width: '100%',
      }}
    >
      <Tape rotation="2.5deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="RIGHTS & RESPECT" rotation="-2deg" variant="sage" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 2vw + 12px, 22px)' }}>
          Keeping creativity safe, honest & respectful...
        </p>
        <h2 className="editorial-title" style={{ marginTop: '4px' }}>
          Rights & Consent Confirmation
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Before we bring your narrative to life, please take a quiet moment to confirm permission and transparency.
        </p>
      </header>

      {/* Plain Language Summary Card */}
      <section
        style={{
          padding: 'clamp(14px, 3vw, 20px)',
          borderRadius: '12px',
          backgroundColor: 'var(--paper-cream-alt)',
          border: '1px solid var(--paper-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: 'var(--shadow-card)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={20} style={{ color: 'var(--ink-terracotta)', flexShrink: 0 }} />
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', color: 'var(--ink-primary)' }}>
            What Happens with Your Media
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <UserCheck size={18} style={{ color: 'var(--ink-sage)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>Your Photograph</p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                Used strictly to synthesize natural facial animation for this video.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Mic size={18} style={{ color: 'var(--ink-blue)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>Your Voice Recording</p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                Used to clone speech tone and pronounce your script narrative.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Tag size={18} style={{ color: 'var(--ink-amber)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-primary)' }}>AI Transparency Label</p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                The rendered film carries a discrete AI label so viewers know it was synthetically crafted.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Active Acceptance Form (No Pre-checked Boxes; 44px+ Touch Targets) */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            padding: 'clamp(14px, 3vw, 20px)',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            border: '1.5px dashed var(--paper-border)',
            boxShadow: 'var(--shadow-card)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
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
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px', lineHeight: 1.4 }}>
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
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px', lineHeight: 1.4 }}>
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
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                I agree that this video is generated for respectful storytelling and carries an AI disclosure.
              </p>
            </div>
          </label>
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
        <footer className="step-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <button type="button" onClick={onBack} disabled={submitting} className="btn-secondary">
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
              opacity: !isValid || submitting ? 0.5 : 1,
              cursor: !isValid || submitting ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              padding: '12px 24px',
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
