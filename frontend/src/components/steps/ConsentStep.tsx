import React, { useState } from 'react';
import type { ConsentPayload } from '../../types/api';
import { playStickerPopSound } from '../../utils/soundEffects';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowLeft, ShieldCheck, Loader2, Info, UserCheck, Mic, Tag } from 'lucide-react';

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
    <div className="step-container" style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="2.5deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="RIGHTS & RESPECT" rotation="-2deg" variant="sage" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: '22px' }}>
          Keeping creativity safe, honest & respectful...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Rights & Consent Confirmation
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Before we bring your narrative to life, please take a quiet moment to confirm permission and transparency.
        </p>
      </header>

      {/* Plain Language Summary Card */}
      <section
        style={{
          padding: '20px',
          borderRadius: '12px',
          backgroundColor: 'var(--paper-cream-alt)',
          border: '1px solid var(--paper-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={20} style={{ color: 'var(--ink-terracotta)' }} />
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', color: 'var(--ink-primary)' }}>
            What Happens with Your Media
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
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

      {/* Active Acceptance Form (No Pre-checked Boxes) */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            border: '1.5px dashed var(--paper-border)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Consent 1: Face Rights */}
          <label
            htmlFor="face-rights-checkbox"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              cursor: 'pointer',
              userSelect: 'none',
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
                marginTop: '2px',
                accentColor: 'var(--ink-terracotta)',
                cursor: 'pointer',
              }}
            />
            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
                I attest that I have permission to use the face image in this photograph
              </p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
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
              gap: '14px',
              cursor: 'pointer',
              userSelect: 'none',
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
                marginTop: '2px',
                accentColor: 'var(--ink-terracotta)',
                cursor: 'pointer',
              }}
            />
            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
                I attest that I have permission to use this voice recording sample
              </p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
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
              gap: '14px',
              cursor: 'pointer',
              userSelect: 'none',
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
                marginTop: '2px',
                accentColor: 'var(--ink-terracotta)',
                cursor: 'pointer',
              }}
            />
            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
                I acknowledge the AI generation label and authorize Memory Studio to render this film
              </p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                I agree that this video is generated for respectful storytelling and carries an AI disclosure.
              </p>
            </div>
          </label>
        </div>

        {/* Error Feedback */}
        {error && (
          <p role="alert" style={{ color: 'var(--ink-terracotta)', fontSize: '14px', textAlign: 'center' }}>
            {error}
          </p>
        )}

        {/* Navigation & Action Footer */}
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
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
              padding: '14px 30px',
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
