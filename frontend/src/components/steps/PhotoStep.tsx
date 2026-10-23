import React, { useState, useRef } from 'react';
import apiClient from '../../api/client';
import { mapAPIError, type MappedAPIError } from '../../api/errorMapper';
import { playStickerPopSound } from '../../utils/soundEffects';
import { Upload, ArrowRight, ArrowLeft, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

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
      {/* Header Copy */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h2 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.2vw, 34px)', lineHeight: 1.2, margin: 0 }}>
          Upload your portrait photograph
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'clamp(14px, 1vw, 16px)', lineHeight: 1.5, margin: 0 }}>
          Choose a clear, front-facing photo. Our studio engine will bring its expressions to life.
        </p>
      </header>

      {/* Main Interactive Area: Upload / Preview */}
      <div role="region" aria-label="Photo upload workspace" style={{ width: '100%' }}>
        {previewUrl ? (
          /* Preview Presentation - Clean 16px Card */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
            <div
              className="card thumbnail-pop"
              style={{
                padding: '16px',
                maxWidth: '300px',
                width: '100%',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <img
                src={previewUrl}
                alt={fileName ? `Uploaded portrait photo: ${fileName}` : 'Uploaded portrait photo'}
                style={{
                  width: '100%',
                  height: '240px',
                  objectFit: 'cover',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-subtle)',
                }}
              />

              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                  {fileName || 'Portrait Photo'}
                </p>
                {fileSizeStr && (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', margin: 0 }}>
                    {fileSizeStr}
                  </p>
                )}
              </div>
            </div>

            {/* Uploading Progress State */}
            {uploading ? (
              <div
                className="card"
                style={{
                  width: '100%',
                  maxWidth: '360px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Loader2 size={16} className="animate-spin" />
                    Uploading photo...
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{uploadProgress}%</span>
                </div>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${uploadProgress}%`,
                    }}
                  />
                </div>
              </div>
            ) : selectedAssetId ? (
              /* Success Locked State with Option to Replace */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--accent-success)', fontSize: '15px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={18} />
                  Photo ready for video
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary"
                  style={{ fontSize: '14px', padding: '8px 18px', minHeight: '44px' }}
                >
                  <RefreshCw size={14} />
                  <span>Choose a different photo</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          /* Empty / Drag & Drop Dropzone */
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={handleKeyDownDropzone}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            aria-label="Upload portrait photo dropzone. Click or drag and drop an image file here."
            className={`card upload-dropzone ${dragActive ? 'upload-dropzone--active' : ''}`}
            style={{
              padding: 'clamp(24px, 4dvh, 48px) 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              minHeight: '220px',
              width: '100%',
              boxSizing: 'border-box',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div
              className="empty-state-float"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                backgroundColor: 'var(--accent-light)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Upload size={26} />
            </div>

            <div>
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '16px', margin: 0 }}>
                Drag & drop your photograph here, or click to browse
              </p>
              <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
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
      </div>

      {/* Error State Card */}
      {mappedError && (
        <div
          role="alert"
          className="card error-shake error-card-tint"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <AlertCircle size={22} style={{ color: 'var(--accent-danger)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {mappedError.title}
            </h4>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              {mappedError.message}
            </p>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <footer
        className="step-footer"
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
          <ArrowLeft size={16} />
          <span>Back</span>
          <span className="kbd-hint" title="Keyboard shortcut: Esc">Esc</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!selectedAssetId || uploading}
          className="btn-primary"
          style={{
            minHeight: '44px',
            padding: '10px 24px',
            cursor: !selectedAssetId || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          <span>Continue to Voice</span>
          <ArrowRight size={16} />
          <span className="kbd-hint" title="Keyboard shortcut: Enter">↵</span>
        </button>
      </footer>
    </div>
  );
};

export default PhotoStep;
