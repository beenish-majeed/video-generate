import React, { useEffect, useState } from 'react';
import type { JobRecord } from '../../types/api';
import apiClient from '../../api/client';
import { mapJobStateToStory } from '../../utils/jobStateMapper';
import { getPollingInterval, isTerminalState } from '../../utils/pollingStrategy';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Clock,
  WifiOff,
  XCircle,
  Camera,
  Mic,
  User,
  Film,
  Sparkles,
  Check,
} from 'lucide-react';

interface WaitingStepProps {
  jobId: string;
  onCompleted: (job: JobRecord) => void;
  onFailed: (job: JobRecord) => void;
  onCancelled?: (job: JobRecord) => void;
}

export const WaitingStep: React.FC<WaitingStepProps> = ({
  jobId,
  onCompleted,
  onFailed,
  onCancelled,
}) => {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [connectionLost, setConnectionLost] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [isCancelled, setIsCancelled] = useState<boolean>(false);

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
      // Pause polling if browser tab is hidden or job is already cancelled
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
          } else if (currentState === 'CANCELLED') {
            setIsCancelled(true);
            onCancelled?.(record);
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

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const record = await apiClient.cancelJob(jobId);
      setIsCancelled(true);
      setJob(record);
      onCancelled?.(record);
    } catch {
      // Keep state if cancel API fails
    } finally {
      setCancelling(false);
    }
  };

  const currentState = job?.state || job?.status || (isCancelled ? 'CANCELLED' : 'RECEIVED');
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

  const getActiveStageIndex = (state: string): number => {
    const s = state.toUpperCase();
    if (['COMPLETED'].includes(s)) return 4;
    if (['ASSEMBLING'].includes(s)) return 3;
    if (['GENERATING_SEGMENTS', 'QA_CHECKING'].includes(s)) return 2;
    if (['PLANNING_TIMELINE', 'PREPARING_IDENTITY', 'SCHEDULING_SEGMENTS'].includes(s)) return 1;
    return 0; // RECEIVED, CONSENT_*, COMPILING_PROMPT, SYNTHESIZING_AUDIO
  };

  const activeStageIdx = getActiveStageIndex(currentState);
  const stagesList = [
    'Script & Voice',
    'Visuals & Flow',
    'Scene Rendering',
    'Final Polish',
  ];

  // Render appropriate icon for story stage
  const renderStoryIcon = () => {
    switch (story.doodleKind) {
      case 'camera':
        return <Camera size={40} style={{ color: 'var(--accent-primary)' }} />;
      case 'mic':
        return <Mic size={40} style={{ color: 'var(--accent-primary)' }} />;
      case 'person':
        return <User size={40} style={{ color: 'var(--accent-primary)' }} />;
      case 'plant':
        return <Film size={40} style={{ color: 'var(--accent-primary)' }} />;
      case 'clock':
        return <Clock size={40} style={{ color: 'var(--accent-primary)' }} />;
      case 'sparkle':
      case 'spiral':
      case 'star':
      default:
        return <Sparkles size={40} style={{ color: 'var(--accent-primary)' }} />;
    }
  };

  return (
    <div
      className="step-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2.5dvh, 28px)',
        position: 'relative',
        maxWidth: 'min(900px, 96%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
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

      {/* Network Connection Loss Banner */}
      {connectionLost && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-card)',
            backgroundColor: 'var(--accent-warning-light)',
            border: '1px solid var(--accent-warning)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--accent-warning)',
            fontSize: '14px',
            fontWeight: 600,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <WifiOff size={18} style={{ flexShrink: 0 }} />
          <span>We lost connection to the studio, still trying to reconnect...</span>
        </div>
      )}

      {/* Header Copy */}
      <header style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
          <h2
            className="editorial-title"
            style={{
              fontSize: 'clamp(24px, 2.2vw, 36px)',
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            {isCancelled ? 'Job Stopped' : 'Rendering your memory film'}
          </h2>
          <span className="step-indicator-pill">STUDIO WAITING ROOM</span>
        </div>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: 'clamp(14px, 1vw, 16px)',
            margin: 0,
          }}
        >
          Job ID:{' '}
          <code
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-light)',
              fontSize: '13px',
              fontFamily: 'monospace',
            }}
          >
            {jobId}
          </code>
        </p>
      </header>

      {/* Cancelled State Display */}
      {isCancelled ? (
        <div
          role="status"
          data-testid="job-cancelled-banner"
          className="card"
          style={{
            padding: '36px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-primary-light)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={28} />
          </div>
          <h3
            className="editorial-title"
            style={{ fontSize: '22px', margin: 0, color: 'var(--text-primary)' }}
          >
            Job Cancelled
          </h3>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-muted)',
              margin: 0,
              maxWidth: '460px',
              lineHeight: 1.5,
            }}
          >
            The video job was stopped cleanly between scenes. All intermediate files were cleaned up.
          </p>
          <button
            type="button"
            onClick={() =>
              onFailed(
                job || {
                  job_id: jobId,
                  state: 'CANCELLED',
                  status: 'CANCELLED',
                  created_at: '',
                  updated_at: '',
                }
              )
            }
            className="btn-primary"
            style={{ marginTop: '8px', padding: '10px 22px', minHeight: '44px', cursor: 'pointer' }}
          >
            Start a new creation
          </button>
        </div>
      ) : (
        /* Main Ambient Card */
        <div
          className="card"
          style={{
            position: 'relative',
            padding: 'clamp(28px, 4dvh, 44px) clamp(20px, 3vw, 36px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(14px, 2dvh, 22px)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* Flowing Dreamy Gradient Orb with Story Icon */}
          <div className="flowing-orb" aria-hidden="true" style={{ margin: '8px 0' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(45, 38, 74, 0.08)',
              }}
            >
              {renderStoryIcon()}
            </div>
          </div>

          {/* Progressive Stage Dots */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: '2px 0 6px 0',
              padding: '8px 16px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(255, 255, 255, 0.65)',
              border: '1px solid var(--border-subtle)',
              backdropFilter: 'blur(8px)',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {stagesList.map((label, idx) => {
              const isDone = idx < activeStageIdx;
              const isCurrent = idx === activeStageIdx;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div
                      className={isDone ? 'checkmark-pop' : isCurrent ? 'stage-dot-pulse' : ''}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: isDone
                          ? 'var(--accent-success)'
                          : isCurrent
                          ? 'var(--accent)'
                          : 'rgba(108, 77, 255, 0.15)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {isDone ? <Check size={11} strokeWidth={3} /> : idx + 1}
                    </div>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: isCurrent ? 600 : 500,
                        color: isCurrent
                          ? 'var(--text-primary)'
                          : isDone
                          ? 'var(--text-secondary)'
                          : 'var(--text-muted)',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                  {idx < stagesList.length - 1 && (
                    <div
                      style={{
                        width: '12px',
                        height: '2px',
                        backgroundColor: isDone ? 'var(--accent-success)' : 'rgba(108, 77, 255, 0.15)',
                        borderRadius: '1px',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Smooth Cross-Fading Current Stage Story Label */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '6px',
              maxWidth: '560px',
              width: '100%',
              minHeight: '74px',
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={story.title}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{ textAlign: 'center' }}
              >
                <h3
                  className="editorial-title"
                  style={{
                    fontSize: 'clamp(20px, 3vw, 26px)',
                    margin: 0,
                    color: 'var(--text-primary)',
                  }}
                >
                  {story.title}
                </h3>

                <p
                  style={{
                    fontSize: 'clamp(14px, 1.2vw, 16px)',
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                    margin: '6px 0 0 0',
                  }}
                >
                  {story.storyLine}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Progress / Time Status */}
          {hasRealSegmentProgress ? (
            <div
              style={{
                width: '100%',
                maxWidth: '440px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                }}
              >
                <span>
                  Segment {completedSegments} of {totalSegments}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{realSegmentPercent}%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'rgba(108, 77, 255, 0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${realSegmentPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--accent) 0%, var(--blob-peach) 100%)',
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 0.35s ease',
                  }}
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '12px 18px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                border: '1px solid var(--border-subtle)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                width: '100%',
                maxWidth: '440px',
                boxSizing: 'border-box',
                fontSize: '14px',
                color: 'var(--text-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMinSec(elapsedSeconds)} elapsed
                </span>
              </div>

              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ~{formatMinSec(estimatedRenderSeconds)} estimated render
              </div>
            </div>
          )}

          {/* Friendly Reassurance Note */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(255, 255, 255, 0.75)',
              border: '1px solid var(--border-subtle)',
              backdropFilter: 'blur(8px)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginTop: '2px',
            }}
          >
            <span
              className="ambient-status-dot"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-success)',
              }}
            />
            <span>You can leave this page; we keep working in the background.</span>
          </div>

          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-muted)',
              marginTop: '2px',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Taking care with every frame... your memory is taking shape.
          </p>

          {/* Cancel Job Action Button */}
          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              data-testid="cancel-job-btn"
              onClick={handleCancel}
              disabled={cancelling}
              className="btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13.5px',
                padding: '8px 18px',
                minHeight: '44px',
                color: 'var(--accent-danger)',
                cursor: cancelling ? 'default' : 'pointer',
                opacity: cancelling ? 0.7 : 1,
              }}
            >
              {cancelling ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Cancelling job...</span>
                </>
              ) : (
                <>
                  <XCircle size={15} />
                  <span>Cancel job</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitingStep;
