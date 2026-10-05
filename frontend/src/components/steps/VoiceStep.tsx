import React, { useState } from 'react';
import { DoodleMic } from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { Upload, ArrowRight, ArrowLeft, Loader2, Volume2 } from 'lucide-react';

interface VoiceStepProps {
  selectedAssetId: string;
  onAssetSelected: (assetId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export const VoiceStep: React.FC<VoiceStepProps> = ({
  selectedAssetId,
  onAssetSelected,
  onNext,
  onBack,
}) => {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    setFileName(file.name);

    try {
      const res = await apiClient.uploadAsset('voice', file);
      onAssetSelected(res.asset_id);
    } catch (err: any) {
      setError(err.message || 'Failed to upload voice audio. Please try another file.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-1.5deg" style={{ position: 'absolute', top: '10px', right: '50px' }} />
      <Sticker label="STEP 02" rotation="2deg" variant="blue" />

      <div>
        <p className="handwritten" style={{ fontSize: '22px' }}>
          Now, let’s give your memory a voice...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Upload a voice recording
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Upload a short clear audio sample (10-30 seconds). We will synthesize speech matching this tone.
        </p>
      </div>

      <div
        style={{
          position: 'relative',
          padding: '32px',
          borderRadius: '12px',
          backgroundColor: 'var(--paper-cream-alt)',
          border: '2px dashed var(--paper-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          minHeight: '240px',
          textAlign: 'center',
        }}
      >
        <Tape rotation="2deg" style={{ position: 'absolute', top: '-14px', left: '40px' }} />

        <DoodleMic size={52} />

        {fileName ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 18px',
                borderRadius: '8px',
                backgroundColor: '#fff',
                border: '1px solid var(--paper-border)',
              }}
            >
              <Volume2 size={20} style={{ color: 'var(--ink-terracotta)' }} />
              <span style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>{fileName}</span>
            </div>

            {uploading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-terracotta)' }}>
                <Loader2 size={16} className="animate-spin" />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>Analyzing voice frequencies...</span>
              </div>
            ) : selectedAssetId ? (
              <span className="handwritten" style={{ color: 'var(--ink-sage)', fontSize: '18px', fontWeight: 'bold' }}>
                ✓ Voice sample locked in! (ID: {selectedAssetId.slice(0, 8)}...)
              </span>
            ) : null}
          </div>
        ) : (
          <>
            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '16px' }}>
                Upload voice audio clip (.wav, .mp3, .m4a)
              </p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                Clear background, single speaker works best
              </p>
            </div>

            <label className="btn-secondary" style={{ marginTop: '8px' }}>
              <Upload size={16} />
              <span>Select Audio File</span>
              <input type="file" accept="audio/*" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
          </>
        )}

        {error && (
          <p style={{ color: 'var(--ink-terracotta)', fontSize: '14px', marginTop: '8px' }}>
            {error}
          </p>
        )}
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <button
          onClick={onNext}
          disabled={!selectedAssetId || uploading}
          className="btn-terracotta"
          style={{ opacity: !selectedAssetId || uploading ? 0.5 : 1, cursor: !selectedAssetId || uploading ? 'not-allowed' : 'pointer' }}
        >
          <span>Continue to Duration</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default VoiceStep;
