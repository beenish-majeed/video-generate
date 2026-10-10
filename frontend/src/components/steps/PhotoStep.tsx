import React, { useState, useRef } from 'react';
import { DoodleCamera } from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import { Upload, ArrowRight, ArrowLeft, Loader2, RefreshCw, AlertCircle } from 'lucide-react';

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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeStr, setFileSizeStr] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [mappedError, setMappedError] = useState<MappedAPIError | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFile = async (file: File) => {
    setMappedError(null);

    // Client-side validation 1: File Type
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      setMappedError({
        title: 'Please Select an Image',
        message: 'We could not read this format. Please choose a portrait photo in PNG, JPG, or WEBP format.',
        kind: 'validation',
      });
      return;
    }

    // Client-side validation 2: File Size (20MB Max)
    const MAX_SIZE_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setMappedError({
        title: 'Photo File is Too Large',
        message: `This image is ${formatFileSize(file.size)}, which exceeds the 20MB studio limit. Please select a smaller photo.`,
        kind: 'too_large',
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setFileName(file.name);
    setFileSizeStr(formatFileSize(file.size));

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      const res = await apiClient.uploadAsset('photo', file, (percent) => {
        setUploadProgress(percent);
      });
      playStickerPopSound();
      onAssetSelected(res.asset_id);
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setMappedError(mapped);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleKeyDownDropzone = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(20px, 4vw, 32px) clamp(14px, 3vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
        width: '100%',
      }}
    >
      <Tape rotation="2deg" style={{ position: 'absolute', top: '12px', right: '40px' }} />
      <Sticker label="WHO IS SPEAKING?" rotation="-2deg" variant="sage" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: 'clamp(18px, 2vw + 12px, 22px)' }}>
          First, let’s choose the main character...
        </p>
        <h2 className="editorial-title" style={{ marginTop: '4px' }}>
          Upload your portrait photograph
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Choose a clear, front-facing photo. Our studio engine will bring its expressions to life.
        </p>
      </header>

      {/* Main Interactive Area: Empty / Drag & Drop / Polaroid Preview */}
      <main style={{ width: '100%' }}>
        {previewUrl ? (
          /* Taped Polaroid Presentation - Centered & Fluid Scaling */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
            <div
              style={{
                position: 'relative',
                padding: '10px 10px 30px 10px',
                backgroundColor: '#ffffff',
                borderRadius: '4px',
                boxShadow: 'var(--shadow-notebook)',
                transform: 'rotate(-2deg)',
                maxWidth: 'clamp(210px, 55vw, 280px)',
                width: '100%',
                margin: '0 auto',
                border: '1px solid var(--paper-border)',
                transition: 'transform 0.2s ease',
              }}
            >
              <Tape rotation="-2deg" style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%) rotate(-2deg)' }} />

              <img
                src={previewUrl}
                alt={fileName ? `Uploaded portrait photo: ${fileName}` : 'Uploaded portrait photo'}
                style={{
                  width: '100%',
                  height: 'clamp(170px, 45vw, 230px)',
                  objectFit: 'cover',
                  borderRadius: '2px',
                  backgroundColor: 'var(--paper-cream-alt)',
                }}
              />

              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <p className="handwritten" style={{ fontSize: '16px', color: 'var(--ink-primary)', fontWeight: 'bold' }}>
                  {fileName || 'Memory Portrait'}
                </p>
                {fileSizeStr && (
                  <p style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                    {fileSizeStr}
                  </p>
                )}
              </div>
            </div>

            {/* Uploading Progress State */}
            {uploading ? (
              <div
                style={{
                  width: '100%',
                  maxWidth: '360px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--paper-cream-alt)',
                  border: '1px dashed var(--paper-border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--ink-terracotta)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Loader2 size={16} className="animate-spin" />
                    Placing photo on canvas...
                  </span>
                  <span style={{ color: 'var(--ink-primary)' }}>{uploadProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--paper-border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      backgroundColor: 'var(--ink-terracotta)',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </div>
            ) : selectedAssetId ? (
              /* Success Locked State with Option to Replace */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <span className="handwritten" style={{ color: 'var(--ink-sage)', fontSize: '20px', fontWeight: 'bold' }}>
                  ✓ Photo pinned to canvas!
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary"
                  style={{ fontSize: '14px', padding: '8px 16px', minHeight: '44px' }}
                >
                  <RefreshCw size={14} />
                  <span>Choose a different photo</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          /* Empty / Drag & Drop Dropzone - Easy Touch Use */
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={handleKeyDownDropzone}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-label="Upload portrait photo dropzone. Click or drag and drop an image file here."
            style={{
              position: 'relative',
              padding: 'clamp(24px, 5vw, 36px) clamp(16px, 4vw, 24px)',
              borderRadius: '12px',
              backgroundColor: dragActive ? 'var(--paper-cream-dark)' : 'var(--paper-cream-alt)',
              border: dragActive ? '2.5px dashed var(--ink-terracotta)' : '2px dashed var(--paper-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              minHeight: 'clamp(200px, 35vh, 260px)',
              width: '100%',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: dragActive ? 'var(--shadow-paper-float)' : 'none',
            }}
          >
            <Tape rotation="-3deg" style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%) rotate(-3deg)' }} />

            <DoodleCamera size={52} />

            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-primary)', fontSize: 'clamp(15px, 2.5vw, 17px)' }}>
                Drag & drop your photograph here, or click to browse
              </p>
              <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '4px' }}>
                Supports PNG, JPG, or WEBP (Up to 20MB)
              </p>
            </div>

            <span className="btn-secondary" style={{ pointerEvents: 'none', marginTop: '4px' }}>
              <Upload size={16} />
              <span>Select Photo File</span>
            </span>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </main>

      {/* Kind Human Error State Card */}
      {mappedError && (
        <div
          role="alert"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: '#fff',
            border: '1.5px dashed var(--ink-terracotta)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <AlertCircle size={22} style={{ color: 'var(--ink-terracotta)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '17px', color: 'var(--ink-primary)' }}>
              {mappedError.title}
            </h4>
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
              {mappedError.message}
            </p>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <footer className="step-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
        <button type="button" onClick={onBack} className="btn-secondary">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!selectedAssetId || uploading}
          className="btn-terracotta"
          style={{
            opacity: !selectedAssetId || uploading ? 0.5 : 1,
            cursor: !selectedAssetId || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          <span>Continue to Voice</span>
          <ArrowRight size={16} />
        </button>
      </footer>
    </div>
  );
};

export default PhotoStep;
