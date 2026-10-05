import React, { useState } from 'react';
import { DoodleCamera } from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { Upload, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';

interface PhotoStepProps {
  selectedAssetId: string;
  onAssetSelected: (assetId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export const PhotoStep: React.FC<PhotoStepProps> = ({
  selectedAssetId,
  onAssetSelected,
  onNext,
  onBack,
}) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const res = await apiClient.uploadAsset('photo', file);
      onAssetSelected(res.asset_id);
    } catch (err: any) {
      setError(err.message || 'Failed to upload photo. Please try another image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="2deg" style={{ position: 'absolute', top: '12px', right: '40px' }} />
      <Sticker label="STEP 01" rotation="-2deg" variant="sage" />

      <div>
        <p className="handwritten" style={{ fontSize: '22px' }}>
          First, let’s pick the face or scene...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Upload your portrait photo
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Choose a clear, front-facing photograph. We’ll bring its expressions to life.
        </p>
      </div>

      {/* Upload Drop Zone / Polaroid frame */}
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
          minHeight: '260px',
          textAlign: 'center',
        }}
      >
        <Tape rotation="-3deg" style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%) rotate(-3deg)' }} />

        {previewUrl ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '140px',
                height: '160px',
                padding: '10px 10px 30px 10px',
                backgroundColor: '#fff',
                boxShadow: 'var(--shadow-paper-float)',
                borderRadius: '4px',
                transform: 'rotate(-1.5deg)',
              }}
            >
              <img
                src={previewUrl}
                alt="Selected preview"
                style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '2px' }}
              />
              <p className="handwritten" style={{ fontSize: '14px', textAlign: 'center', marginTop: '4px', color: 'var(--ink-muted)' }}>
                {fileName || 'Your photo'}
              </p>
            </div>
            {uploading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-terracotta)' }}>
                <Loader2 size={16} className="animate-spin" />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>Tucking photo into sketchbook...</span>
              </div>
            ) : selectedAssetId ? (
              <span className="handwritten" style={{ color: 'var(--ink-sage)', fontSize: '18px', fontWeight: 'bold' }}>
                ✓ Ready in notebook! (ID: {selectedAssetId.slice(0, 8)}...)
              </span>
            ) : null}
          </div>
        ) : (
          <>
            <DoodleCamera size={56} />
            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: '16px' }}>
                Drag & drop your photograph here
              </p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                Supports JPG, PNG, WEBP (Up to 20MB)
              </p>
            </div>

            <label className="btn-secondary" style={{ marginTop: '8px' }}>
              <Upload size={16} />
              <span>Browse Image File</span>
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
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
          <span>Continue to Voice</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default PhotoStep;
