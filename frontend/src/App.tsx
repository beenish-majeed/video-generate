import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import NotebookShell from './components/NotebookShell';
import type { JourneyStepId } from './components/PageTabs';
import type { DurationPreset, ConsentPayload, JobRecord } from './types/api';
import apiClient from './api/client';
import { mapAPIError } from './api/errorMapper';
import { playPageTurnSound } from './utils/soundEffects';
import { Loader2 } from 'lucide-react';

const HeroStep = lazy(() => import('./components/steps/HeroStep'));
const PhotoStep = lazy(() => import('./components/steps/PhotoStep'));
const VoiceStep = lazy(() => import('./components/steps/VoiceStep'));
const DurationStep = lazy(() => import('./components/steps/DurationStep'));
const ScriptStep = lazy(() => import('./components/steps/ScriptStep'));
const ConsentStep = lazy(() => import('./components/steps/ConsentStep'));
const WaitingStep = lazy(() => import('./components/steps/WaitingStep'));
const PremiereStep = lazy(() => import('./components/steps/PremiereStep'));
const FailedStep = lazy(() => import('./components/steps/FailedStep'));

const StepFallback: React.FC = () => (
  <div
    style={{
      padding: '80px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '14px',
      minHeight: '360px',
    }}
  >
    <Loader2 size={36} className="animate-spin" style={{ color: 'var(--ink-terracotta)' }} />
    <p className="handwritten" style={{ fontSize: '22px', color: 'var(--ink-terracotta)' }}>
      Opening sketchbook page...
    </p>
  </div>
);

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<JourneyStepId>('hero');
  const shouldReduceMotion = useReducedMotion();

  const changeStep = (step: JourneyStepId) => {
    playPageTurnSound();
    setCurrentStep(step);
  };

  // Journey State Machine Data (RETAINED across retries & failures!)
  const [photoAssetId, setPhotoAssetId] = useState<string>('');
  const [voiceAssetId, setVoiceAssetId] = useState<string>('');
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('30s');
  const [targetSeconds, setTargetSeconds] = useState<number>(30);
  const [script, setScript] = useState<string>('A peaceful sunny morning in a quiet valley surrounded by tall whispering pine trees.');
  const [prompt, setPrompt] = useState<string>('Warm cinematic light, soft watercolor texture');

  // Active Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [completedJob, setCompletedJob] = useState<JobRecord | null>(null);
  const [failedJob, setFailedJob] = useState<JobRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Restore active job id from localStorage if returning to open session
  useEffect(() => {
    try {
      const savedJobId = localStorage.getItem('memory_studio_active_job_id');
      if (savedJobId && !activeJobId) {
        setActiveJobId(savedJobId);
      }
    } catch {
      // Ignore if localStorage unavailable
    }
  }, []);

  const handleCreateJob = async (consent: ConsentPayload) => {
    // Prevent double submission
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.createJob({
        photo_asset_id: photoAssetId,
        voice_asset_id: voiceAssetId,
        script: script.trim(),
        prompt: prompt.trim() || undefined,
        duration_preset: durationPreset,
        target_duration_seconds: targetSeconds,
        consent,
      });

      // Save created job_id in localStorage
      try {
        localStorage.setItem('memory_studio_active_job_id', res.job_id);
      } catch {
        // Ignore if localStorage blocked
      }

      setActiveJobId(res.job_id);
      setCurrentStep('waiting');
    } catch (err: unknown) {
      // Map API error into kind human words
      const mapped = mapAPIError(err);
      setErrorMessage(mapped.message);
      setFailedJob(null);
      setCurrentStep('failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Snappy paper-slide page transitions respecting prefers-reduced-motion
  const pageVariants = {
    initial: {
      opacity: 0,
      x: shouldReduceMotion ? 0 : 24,
      rotate: shouldReduceMotion ? 0 : 0.6,
    },
    animate: {
      opacity: 1,
      x: 0,
      rotate: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.25,
        ease: 'easeOut',
      },
    },
    exit: {
      opacity: 0,
      x: shouldReduceMotion ? 0 : -24,
      rotate: shouldReduceMotion ? 0 : -0.6,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.18,
        ease: 'easeIn',
      },
    },
  };

  return (
    <NotebookShell currentStep={currentStep} onSelectStep={(step) => changeStep(step)}>
      <Suspense fallback={<StepFallback />}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ width: '100%' }}
          >
            {currentStep === 'hero' && (
              <HeroStep onNext={() => changeStep('photo')} />
            )}

            {currentStep === 'photo' && (
              <PhotoStep
                selectedAssetId={photoAssetId}
                onAssetSelected={(id) => setPhotoAssetId(id)}
                onNext={() => changeStep('voice')}
                onBack={() => changeStep('hero')}
              />
            )}

            {currentStep === 'voice' && (
              <VoiceStep
                selectedAssetId={voiceAssetId}
                onAssetSelected={(id) => setVoiceAssetId(id)}
                onNext={() => changeStep('duration')}
                onBack={() => changeStep('photo')}
              />
            )}

            {currentStep === 'duration' && (
              <DurationStep
                selectedPreset={durationPreset}
                onPresetSelected={(preset, seconds) => {
                  setDurationPreset(preset);
                  setTargetSeconds(seconds);
                }}
                onNext={() => changeStep('script')}
                onBack={() => changeStep('voice')}
              />
            )}

            {currentStep === 'script' && (
              <ScriptStep
                script={script}
                onScriptChange={setScript}
                prompt={prompt}
                onPromptChange={setPrompt}
                targetSeconds={targetSeconds}
                onNext={() => changeStep('consent')}
                onBack={() => changeStep('duration')}
              />
            )}

            {currentStep === 'consent' && (
              <ConsentStep
                onSubmitJob={handleCreateJob}
                onBack={() => changeStep('script')}
                submitting={submitting}
                error={errorMessage}
              />
            )}

            {currentStep === 'waiting' && activeJobId && (
              <WaitingStep
                jobId={activeJobId}
                onCompleted={(job) => {
                  setCompletedJob(job);
                  changeStep('premiere');
                }}
                onFailed={(job) => {
                  setFailedJob(job);
                  setErrorMessage(job.error || 'Job rendering failed.');
                  changeStep('failed');
                }}
              />
            )}

            {currentStep === 'premiere' && completedJob && (
              <PremiereStep
                job={completedJob}
                onRestart={() => {
                  setActiveJobId(null);
                  setCompletedJob(null);
                  try {
                    localStorage.removeItem('memory_studio_active_job_id');
                  } catch {}
                  changeStep('hero');
                }}
              />
            )}

            {currentStep === 'failed' && (
              <FailedStep
                job={failedJob}
                errorMessage={errorMessage}
                onRetry={(recommendedStep) => {
                  setActiveJobId(null);
                  setFailedJob(null);
                  setErrorMessage(null);
                  try {
                    localStorage.removeItem('memory_studio_active_job_id');
                  } catch {}
                  changeStep(recommendedStep || 'consent');
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Suspense>
    </NotebookShell>
  );
};

export default App;
