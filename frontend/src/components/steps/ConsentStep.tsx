import React, { useState } from 'react';
import type { ConsentPayload } from '../../types/api';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';

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
  const [faceRights, setFaceRights] = useState(false);
  const [voiceRights, setVoiceRights] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  const isValid = faceRights && voiceRights && authorized;

  const handleSubmit = () => {
    if (!isValid) return;
    const consent: ConsentPayload = {
      authorized: true,
      statement: 'I attest that I hold full rights to use this photo and voice sample for video synthesis.',
      face_rights_attested: true,
      voice_rights_attested: true,
    };
    onSubmitJob(consent);
  };

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="2.5deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="STEP 05" rotation="-2deg" variant="sage" />

      <div>
        <p className="handwritten" style={{ fontSize: '22px' }}>
          Keeping creativity safe & respectful...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Rights & Consent Confirmation
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Before we bring your story to life, please confirm that you have permission to use the photo and voice sample.
        </p>
      </div>

      {/* Kind Consent Checkboxes */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px',
          borderRadius: '12px',
          backgroundColor: '#fff',
          border: '1px dashed var(--paper-border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={faceRights}
            onChange={(e) => setFaceRights(e.target.checked)}
            style={{ width: '20px', height: '20px', marginTop: '2px', accentColor: 'var(--ink-terracotta)' }}
          />
          <div>
            <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
              I have permission to use the face image in this photograph
            </p>
            <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
              I own this image or have explicit consent from the person shown in the photo.
            </p>
          </div>
        </label>

        <div style={{ height: '1px', backgroundColor: 'var(--paper-border)' }} />

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={voiceRights}
            onChange={(e) => setVoiceRights(e.target.checked)}
            style={{ width: '20px', height: '20px', marginTop: '2px', accentColor: 'var(--ink-terracotta)' }}
          />
          <div>
            <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
              I have permission to use this voice recording sample
            </p>
            <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
              I am the speaker or have permission to clone/synthesize this speaker's voice.
            </p>
          </div>
        </label>

        <div style={{ height: '1px', backgroundColor: 'var(--paper-border)' }} />

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
            style={{ width: '20px', height: '20px', marginTop: '2px', accentColor: 'var(--ink-terracotta)' }}
          />
          <div>
            <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '15px' }}>
              I authorize Memory Studio to render this video creation
            </p>
            <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
              I agree that this content is created solely for respectful personal or creative storytelling.
            </p>
          </div>
        </label>
      </div>

      {error && (
        <p style={{ color: 'var(--ink-terracotta)', fontSize: '14px', textAlign: 'center' }}>
          {error}
        </p>
      )}

      {/* Navigation & Submit Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <button onClick={onBack} disabled={submitting} className="btn-secondary">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="btn-terracotta"
          style={{ opacity: !isValid || submitting ? 0.5 : 1, cursor: !isValid || submitting ? 'not-allowed' : 'pointer' }}
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
      </div>
    </div>
  );
};

export default ConsentStep;
