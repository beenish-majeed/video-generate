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
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, Film, Clock, WifiOff } from 'lucide-react';

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
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [connectionLost, setConnectionLost] = useState<boolean>(false);

  const shouldReduceMotion = useReducedMotion();

  // Real-time elapsed time counter (seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Polling loop with backoff, visibility pause/resume, and 404 handling
  useEffect(() => {
    let isSubscribed = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let pollCount = 0;

    const fetchJob = async () => {
      // Pause polling if browser tab is hidden
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      try {
        const record = await apiClient.getJob(jobId);
        if (!isSubscribed) return;

        setJob(record);
        setConnectionLost(false); // Connection restored!
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
      } catch (err: unknown) {
        if (!isSubscribed) return;

        const errStr = err instanceof Error ? err.message : String(err);
        
        // Handle 404 / Expired or Unknown Job ID
        if (errStr.includes('404') || errStr.toLowerCase().includes('not found')) {
          try {
            localStorage.removeItem('memory_studio_active_job_id');
          } catch {}
          onFailed({
            job_id: jobId,
            state: 'FAILED',
            status: 'FAILED',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            error: 'We could not find this render session in the studio. Please start a new creation.',
          });
          return;
        }

        // Show slow network / offline notification banner, but keep background polling active
        setConnectionLost(true);
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

    fetchJob(); // Immediate initial fetch

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

  // Honest estimated total render time (3.7x target duration)
  const targetDurationSeconds = job?.target_duration_seconds || 30;
  const estimatedRenderSeconds = Math.round(targetDurationSeconds * 3.7);

  const formatMinSec = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Real segment progress (Only shown if API provides real segments data!)
  const segments = job?.segments || [];
  const totalSegments = segments.length;
  const completedSegments = segments.filter(
    (s) => s.state === 'COMPLETED' || (s.progress && s.progress >= 100)
  ).length;
  const hasRealSegmentProgress = totalSegments > 0;
  const realSegmentPercent = hasRealSegmentProgress
    ? Math.round((completedSegments / totalSegments) * 100)
    : 0;

  // Render appropriate doodle icon for story stage
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

  return (
    <div className="step-container" style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', right: '40px' }} />
      <Sticker label="STUDIO WAITING ROOM" rotation="3deg" variant="blue" />

      {/* Accessibility Announcement Region for Screen Readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {`Current studio stage: ${story.title}. ${story.storyLine}`}
      </div>

      {/* Network Connection Loss / Slow Network Recovery Banner */}
      {connectionLost && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#fff8f6',
            border: '1.5px dashed var(--ink-terracotta)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--ink-terracotta)',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          <WifiOff size={18} style={{ flexShrink: 0 }} />
          <span>We lost connection to the studio, still trying to reconnect...</span>
        </div>
      )}

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

      {/* Main Ambient Frame */}
      <main
        style={{
          padding: '28px',
          borderRadius: '12px',
          backgroundColor: '#ffffff',
          border: '1.5px dashed var(--paper-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '22px',
          boxShadow: 'var(--shadow-card)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Slow Ambient Breathing Container */}
        <motion.div
          animate={
            shouldReduceMotion
              ? {}
              : {
                  scale: [1, 1.02, 1],
                  opacity: [0.92, 1, 0.92],
                }
          }
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'center' }}
        >
          <Loader2 size={36} className="animate-spin" style={{ color: 'var(--ink-terracotta)', flexShrink: 0 }} />
          <div>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', color: 'var(--ink-primary)' }}>
              {story.title}
            </h3>
            <p className="handwritten" style={{ fontSize: '21px', color: 'var(--ink-terracotta)', marginTop: '2px' }}>
              "{story.storyLine}"
            </p>
          </div>
        </motion.div>

        {/* Real Progress Only Section: NEVER fake a percentage! */}
        {hasRealSegmentProgress ? (
          /* API Provided Real Segment Progress */
          <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600 }}>
              <span style={{ color: 'var(--ink-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Film size={14} /> Real Segment Progress
              </span>
              <span style={{ color: 'var(--ink-terracotta)' }}>
                {completedSegments} / {totalSegments} segments ({realSegmentPercent}%)
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--paper-border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${realSegmentPercent}%`,
                  height: '100%',
                  backgroundColor: 'var(--ink-sage)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        ) : (
          /* Honest Stage & Elapsed Time Info (No Faked Percentage!) */
          <div
            style={{
              padding: '14px 20px',
              borderRadius: '10px',
              backgroundColor: 'var(--paper-cream-alt)',
              border: '1px border var(--paper-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              maxWidth: '440px',
              fontSize: '14px',
              color: 'var(--ink-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: 'var(--ink-terracotta)' }} />
              <span style={{ fontWeight: 600 }}>{formatMinSec(elapsedSeconds)} elapsed</span>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
              ~{formatMinSec(estimatedRenderSeconds)} estimated render
            </div>
          </div>
        )}

        {/* Story Doodle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '6px' }}>
          {renderStoryDoodle()}
        </div>

        <p className="handwritten" style={{ fontSize: '17px', color: 'var(--ink-muted)', marginTop: '4px' }}>
          Taking care with every frame... your memory is taking shape.
        </p>
      </main>
    </div>
  );
};

export default WaitingStep;
