import React from 'react';
import type { JobRecord } from '../../types/api';
import apiClient from '../../api/client';
import { DoodleSparkle, DoodlePlant } from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { Download, RotateCcw, CheckCircle2 } from 'lucide-react';

interface PremiereStepProps {
  job: JobRecord;
  onRestart: () => void;
}

export const PremiereStep: React.FC<PremiereStepProps> = ({ job, onRestart }) => {
  const downloadUrl = apiClient.getDownloadUrl(job.job_id);

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-3deg" style={{ position: 'absolute', top: '10px', left: '30px' }} />
      <Sticker label="DIRECTOR'S CUT" rotation="4deg" variant="terracotta" />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--ink-sage)' }} />
          <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-sage)' }}>
            Your film is ready!
          </p>
        </div>
        <h2 className="editorial-title" style={{ fontSize: '32px', marginTop: '4px' }}>
          Grand Premiere
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Here is your rendered video memory ({job.final_video_duration_seconds || job.target_duration_seconds || '30'} seconds).
        </p>
      </div>

      {/* Video Player Window */}
      <div
        style={{
          position: 'relative',
          borderRadius: '12px',
          backgroundColor: '#000',
          boxShadow: 'var(--shadow-notebook)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '320px',
          border: '4px solid var(--paper-cream-alt)',
        }}
      >
        <Tape rotation="1.5deg" style={{ position: 'absolute', top: '12px', right: '20px' }} />

        <video
          controls
          autoPlay
          src={downloadUrl}
          style={{ width: '100%', maxHeight: '420px', objectFit: 'contain' }}
        />
      </div>

      {/* Download & Actions Bar */}
      <div
        style={{
          padding: '20px',
          borderRadius: '12px',
          backgroundColor: 'var(--paper-cream-alt)',
          border: '1px dashed var(--paper-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div>
          <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', color: 'var(--ink-primary)' }}>
            Download & Keep Forever
          </h4>
          <p className="handwritten" style={{ fontSize: '17px', color: 'var(--ink-terracotta)', marginTop: '2px' }}>
            High-definition MP4 with synthesized audio soundtrack
          </p>
        </div>

        <a
          href={downloadUrl}
          download={`memory-${job.job_id.slice(0, 8)}.mp4`}
          className="btn-terracotta"
          style={{ textDecoration: 'none' }}
        >
          <Download size={18} />
          <span>Download Video</span>
        </a>
      </div>

      {/* Replay / Restart */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
        <button onClick={onRestart} className="btn-secondary">
          <RotateCcw size={16} />
          <span>Create Another Memory</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DoodlePlant size={42} />
          <DoodleSparkle size={20} />
        </div>
      </div>
    </div>
  );
};

export default PremiereStep;
