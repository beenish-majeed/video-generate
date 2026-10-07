import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import NotebookShell from './components/NotebookShell';
import type { JourneyStepId } from './components/PageTabs';
import type { DurationPreset, ConsentPayload, JobRecord } from './types/api';
import apiClient from './api/client';
import { mapAPIError } from './api/errorMapper';

import HeroStep from './components/steps/HeroStep';
import PhotoStep from './components/steps/PhotoStep';
import VoiceStep from './components/steps/VoiceStep';
import DurationStep from './components/steps/DurationStep';
import ScriptStep from './components/steps/ScriptStep';
import ConsentStep from './components/steps/ConsentStep';
import WaitingStep from './components/steps/WaitingStep';
import PremiereStep from './components/steps/PremiereStep';
import FailedStep from './components/steps/FailedStep';

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<JourneyStepId>('hero');

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

  const pageVariants = {
    initial: { opacity: 0, x: 20, rotate: 0.5 },
    animate: { opacity: 1, x: 0, rotate: 0, transition: { duration: 0.25, ease: 'easeOut' } },
    exit: { opacity: 0, x: -20, rotate: -0.5, transition: { duration: 0.2, ease: 'easeIn' } },
  };

  return (
    <NotebookShell currentStep={currentStep} onSelectStep={(step) => setCurrentStep(step)}>
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
            <HeroStep onNext={() => setCurrentStep('photo')} />
          )}

          {currentStep === 'photo' && (
            <PhotoStep
              selectedAssetId={photoAssetId}
              onAssetSelected={(id) => setPhotoAssetId(id)}
              onNext={() => setCurrentStep('voice')}
              onBack={() => setCurrentStep('hero')}
            />
          )}

          {currentStep === 'voice' && (
            <VoiceStep
              selectedAssetId={voiceAssetId}
              onAssetSelected={(id) => setVoiceAssetId(id)}
              onNext={() => setCurrentStep('duration')}
              onBack={() => setCurrentStep('photo')}
            />
          )}

          {currentStep === 'duration' && (
            <DurationStep
              selectedPreset={durationPreset}
              onPresetSelected={(preset, seconds) => {
                setDurationPreset(preset);
                setTargetSeconds(seconds);
              }}
              onNext={() => setCurrentStep('script')}
              onBack={() => setCurrentStep('voice')}
            />
          )}

          {currentStep === 'script' && (
            <ScriptStep
              script={script}
              onScriptChange={setScript}
              prompt={prompt}
              onPromptChange={setPrompt}
              targetSeconds={targetSeconds}
              onNext={() => setCurrentStep('consent')}
              onBack={() => setCurrentStep('duration')}
            />
          )}

          {currentStep === 'consent' && (
            <ConsentStep
              onSubmitJob={handleCreateJob}
              onBack={() => setCurrentStep('script')}
              submitting={submitting}
              error={errorMessage}
            />
          )}

          {currentStep === 'waiting' && activeJobId && (
            <WaitingStep
              jobId={activeJobId}
              onCompleted={(job) => {
                setCompletedJob(job);
                setCurrentStep('premiere');
              }}
              onFailed={(job) => {
                setFailedJob(job);
                setErrorMessage(job.error || 'Job rendering failed.');
                setCurrentStep('failed');
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
                setCurrentStep('hero');
              }}
            />
          )}

          {currentStep === 'failed' && (
            <FailedStep
              job={failedJob}
              errorMessage={errorMessage}
              onRetry={(recommendedStep) => {
                // Clears job instance but RETAINS photo, voice, script, and prompt state!
                setActiveJobId(null);
                setFailedJob(null);
                setErrorMessage(null);
                try {
                  localStorage.removeItem('memory_studio_active_job_id');
                } catch {}
                setCurrentStep(recommendedStep || 'consent');
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </NotebookShell>
  );
};

export default App;
