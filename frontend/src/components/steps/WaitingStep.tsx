import React, { useEffect, useState } from 'react';
import type { JobRecord } from '../../types/api';
import apiClient from '../../api/client';
import { mapJobStateToStory } from '../../utils/jobStateMapper';
import { getPollingInterval, isTerminalState } from '../../utils/pollingStrategy';
import {
  DoodlePerson,
  DoodleStar,
  DoodleSparkle,
  DoodlePlant,
  DoodleCamera,
  DoodleMic,
  DoodleSpiral,
} from '../Doodles';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { Loader2, Film, Clock } from 'lucide-react';

interface WaitingStepProps {
  jobId: string;
  onCompleted: (job: JobRecord) => void;
  onFailed: (job: JobRecord) => void;
}

export const WaitingStep: React.FC<WaitingStepProps> = ({
  jobId,
  onCompleted,
  onFailed,
}) => {
  const [job, setJob] = useState<JobRecord | null>(null);

  useEffect(() => {
    let isSubscribed = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let pollCount = 0;

    const fetchJob = async () => {
      // Pause polling if the tab is hidden
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      try {
        const record = await apiClient.getJob(jobId);
        if (!isSubscribed) return;

        setJob(record);
        const currentState = record.state || record.status || 'RECEIVED';

        // Stop polling completely on terminal states
        if (isTerminalState(currentState)) {
          if (currentState === 'COMPLETED') {
            onCompleted(record);
          } else if (currentState === 'FAILED') {
            onFailed(record);
          }
          return;
        }

        pollCount++;
        const nextInterval = getPollingInterval(pollCount);
        timerId = setTimeout(fetchJob, nextInterval);
      } catch (err) {
        console.error('Polling hiccup:', err);
        pollCount++;
        const nextInterval = getPollingInterval(pollCount);
        timerId = setTimeout(fetchJob, nextInterval);
      }
    };

    // Tab visibility handler: resumes polling immediately when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (timerId) clearTimeout(timerId);
        fetchJob();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    fetchJob(); // Start initial fetch immediately

    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [jobId]);

  const currentState = job?.state || job?.status || 'RECEIVED';
  const story = mapJobStateToStory(currentState);

  // Render appropriate doodle based on story doodleKind
  const renderStoryDoodle = () => {
    switch (story.doodleKind) {
      case 'spiral':
        return <DoodleSpiral count={6} />;
      case 'camera':
        return <DoodleCamera size={44} />;
      case 'mic':
        return <DoodleMic size={44} />;
      case 'person':
        return <DoodlePerson width={80} height={90} color="var(--ink-primary)" />;
      case 'plant':
        return <DoodlePlant size={48} />;
      case 'clock':
        return <Clock size={40} style={{ color: 'var(--ink-terracotta)' }} />;
      case 'sparkle':
        return <DoodleSparkle size={36} />;
      case 'star':
      default:
        return <DoodleStar size={36} />;
    }
  };

  // Calculate segment progress details if present
  const segments = job?.segments || [];
  const completedSegments = segments.filter(
    (s) => s.state === 'COMPLETED' || (s.progress && s.progress >= 100)
  ).length;
  const totalSegments = segments.length;

  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="STUDIO WAITING ROOM" rotation="3deg" variant="blue" />

      {/* Header Copy */}
      <header>
        <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-terracotta)' }}>
          Please take a gentle breath while we craft...
        </p>
        <h2 className="editorial-title" style={{ fontSize: '28px', marginTop: '4px' }}>
          Rendering your memory film
        </h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '15px', marginTop: '4px' }}>
          Job ID: <code style={{ backgroundColor: 'var(--paper-cream-alt)', padding: '2px 8px', borderRadius: '4px' }}>{jobId}</code>
        </p>
      </header>

      {/* Main Status & Animation Frame */}
      <main
        style={{
          padding: '28px',
          borderRadius: '12px',
          backgroundColor: '#ffffff',
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
              {story.title}
            </h3>
            <p className="handwritten" style={{ fontSize: '20px', color: 'var(--ink-terracotta)', marginTop: '2px' }}>
              "{story.storyLine}"
            </p>
          </div>
        </div>

        {/* Story Progress Bar */}
        <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
            <span style={{ color: 'var(--ink-primary)' }}>Pipeline Step: {currentState}</span>
            <span style={{ color: 'var(--ink-terracotta)' }}>~{story.progressPercent}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--paper-border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${story.progressPercent}%`,
                height: '100%',
                backgroundColor: 'var(--ink-terracotta)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Live Segment counter when rendering segments */}
        {totalSegments > 0 && (
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
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
                  backgroundColor: 'var(--ink-sage)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Story Doodle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '8px' }}>
          {renderStoryDoodle()}
        </div>
      </main>
    </div>
  );
};

export default WaitingStep;
