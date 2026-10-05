import React, { useEffect, useState } from 'react';
import type { JobRecord, JobState } from '../../types/api';
import apiClient from '../../api/client';
import { DoodlePerson, DoodleStar, DoodleSparkle } from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { Loader2, Film } from 'lucide-react';

interface WaitingStepProps {
  jobId: string;
  onCompleted: (job: JobRecord) => void;
  onFailed: (job: JobRecord) => void;
}

const PIPELINE_STATES: { state: JobState; label: string; note: string }[] = [
  { state: 'RECEIVED', label: 'Received Request', note: 'Opening the sketchbook...' },
  { state: 'COMPILING_PROMPT', label: 'Preparing Narrative', note: 'Polishing your story text...' },
  { state: 'PLANNING_TIMELINE', label: 'Planning Timeline', note: 'Timing scene transitions...' },
  { state: 'PREPARING_IDENTITY', label: 'Analyzing Portrait', note: 'Preserving natural expressions...' },
  { state: 'SYNTHESIZING_AUDIO', label: 'Synthesizing Voice', note: 'Singing life into spoken words...' },
  { state: 'SCHEDULING_SEGMENTS', label: 'Scheduling Segments', note: 'Arranging keyframes into order...' },
  { state: 'GENERATING_SEGMENTS', label: 'Rendering Frames', note: 'Painting each frame with care...' },
  { state: 'QA_CHECKING', label: 'Quality Verification', note: 'Inspecting motion smoothness & length...' },
  { state: 'ASSEMBLING', label: 'Finalizing Film', note: 'Stitching audio & video into MP4...' },
  { state: 'COMPLETED', label: 'Premiere Ready', note: 'Your film is ready to watch!' },
];

export const WaitingStep: React.FC<WaitingStepProps> = ({
  jobId,
  onCompleted,
  onFailed,
}) => {
  const [job, setJob] = useState<JobRecord | null>(null);

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const record = await apiClient.getJob(jobId);
        setJob(record);

        if (record.state === 'COMPLETED' || record.status === 'COMPLETED') {
          onCompleted(record);
        } else if (record.state === 'FAILED' || record.status === 'FAILED') {
          onFailed(record);
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    };

    poll();
    timerId = setInterval(poll, 3000);

    return () => clearInterval(timerId);
  }, [jobId]);

  const currentState = job?.state || job?.status || 'RECEIVED';
  const stateIndex = PIPELINE_STATES.findIndex((p) => p.state === currentState);
  const currentPipe = PIPELINE_STATES[Math.max(0, stateIndex)] || PIPELINE_STATES[0];

  // Calculate segment progress details if present
  const segments = job?.segments || [];
  const completedSegments = segments.filter((s) => s.state === 'COMPLETED' || (s.progress && s.progress >= 100)).length;
  const totalSegments = segments.length;

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="STUDIO RENDER" rotation="3deg" variant="blue" />

      <div>
        <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-terracotta)' }}>
          Please take a gentle breath while we craft...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Rendering your memory film
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Job ID: <code style={{ backgroundColor: 'var(--paper-cream-alt)', padding: '2px 6px', borderRadius: '4px' }}>{jobId}</code>
        </p>
      </div>

      {/* Main Status & Animation Frame */}
      <div
        style={{
          padding: '28px',
          borderRadius: '12px',
          backgroundColor: '#fff',
          border: '1.5px dashed var(--paper-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          boxShadow: 'var(--shadow-card)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Loader2 size={36} className="animate-spin" style={{ color: 'var(--ink-terracotta)' }} />
          <div>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', color: 'var(--ink-primary)' }}>
              {currentPipe.label}
            </h3>
            <p className="handwritten" style={{ fontSize: '20px', color: 'var(--ink-terracotta)' }}>
              "{currentPipe.note}"
            </p>
          </div>
        </div>

        {/* Segment progress counter when rendering segments */}
        {totalSegments > 0 && (
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'var(--paper-cream-alt)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
              <span style={{ color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Film size={14} /> Segment Progress
              </span>
              <span style={{ color: 'var(--ink-terracotta)' }}>
                {completedSegments} / {totalSegments} segments
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--paper-border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(completedSegments / Math.max(1, totalSegments)) * 100}%`,
                  height: '100%',
                  backgroundColor: 'var(--ink-terracotta)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '8px' }}>
          <DoodlePerson width={80} height={100} color="var(--ink-primary)" />
          <DoodleSparkle size={24} />
          <DoodleStar size={28} />
        </div>
      </div>

      {/* Step pipeline list */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
        {PIPELINE_STATES.slice(0, 9).map((step, idx) => {
          const isDone = stateIndex > idx;
          const isCurrent = stateIndex === idx;

          return (
            <div
              key={step.state}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: isCurrent ? 'var(--paper-cream-alt)' : isDone ? '#fff' : 'transparent',
                border: isCurrent ? '1px solid var(--ink-terracotta)' : '1px solid transparent',
                fontSize: '13px',
                color: isDone ? 'var(--ink-sage)' : isCurrent ? 'var(--ink-terracotta)' : 'var(--ink-muted)',
                fontWeight: isCurrent ? 'bold' : 'normal',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{isDone ? '✓' : isCurrent ? '►' : '•'}</span>
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WaitingStep;
