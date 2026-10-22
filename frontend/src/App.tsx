import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import NotebookShell from './components/NotebookShell';
import type { JourneyStepId, FlowMode } from './components/PageTabs';
import type { DurationPreset, ConsentPayload, JobRecord, ScriptTone, JobCreatePayload } from './types/api';
import apiClient from './api/client';
import { mapAPIError } from './api/errorMapper';
import { playPageTurnSound } from './utils/soundEffects';
import { Loader2 } from 'lucide-react';
import type { UploadedImageItem } from './components/steps/ImagesAudioStep';

const HeroStep = lazy(() => import('./components/steps/HeroStep'));
const ChoiceStep = lazy(() => import('./components/steps/ChoiceStep'));
const IdeaStep = lazy(() => import('./components/steps/IdeaStep'));
const PhotoStep = lazy(() => import('./components/steps/PhotoStep'));
const VoiceStep = lazy(() => import('./components/steps/VoiceStep'));
const ImagesAudioStep = lazy(() => import('./components/steps/ImagesAudioStep'));
const DurationStep = lazy(() => import('./components/steps/DurationStep'));
const LookVoiceStep = lazy(() => import('./components/steps/LookVoiceStep'));
const ScriptStep = lazy(() => import('./components/steps/ScriptStep'));
const ConsentStep = lazy(() => import('./components/steps/ConsentStep'));
const WaitingStep = lazy(() => import('./components/steps/WaitingStep'));
const PremiereStep = lazy(() => import('./components/steps/PremiereStep'));
const FailedStep = lazy(() => import('./components/steps/FailedStep'));
const StyleGuide = lazy(() => import('./components/StyleGuide'));

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
    <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>
      Loading step...
    </p>
  </div>
);

const DEFAULT_PHOTO_ASSET_ID = 'default-studio-photo';
const DEFAULT_VOICE_ASSET_ID = 'default-studio-voice';

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<JourneyStepId>('hero');
  const [flowMode, setFlowMode] = useState<FlowMode>('custom_media');
  const shouldReduceMotion = useReducedMotion();

  const changeStep = (step: JourneyStepId) => {
    playPageTurnSound();
    setCurrentStep(step);
  };

  // Journey State Machine Data (RETAINED across retries & failures!)
  const [photoAssetId, setPhotoAssetId] = useState<string>('');
  const [voiceAssetId, setVoiceAssetId] = useState<string>('');
  const [ideaText, setIdeaText] = useState<string>('');
  const [tone, setTone] = useState<ScriptTone>('storytelling');
  const [visualMode, setVisualMode] = useState<'slideshow' | 'talking_head'>('slideshow');
  const [imageStyle, setImageStyle] = useState<string>('cinematic');
  const [avatarPresetId, setAvatarPresetId] = useState<string>('');
  const [voicePresetId, setVoicePresetId] = useState<string>('');
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('30s');
  const [targetSeconds, setTargetSeconds] = useState<number>(30);
  const [script, setScript] = useState<string>(
    'A peaceful sunny morning in a quiet valley surrounded by tall whispering pine trees.'
  );
  const [scriptSource, setScriptSource] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('Warm cinematic light, soft watercolor texture');

  // Images + Audio mode state
  const [uploadedImages, setUploadedImages] = useState<UploadedImageItem[]>([]);
  const [audioAssetId, setAudioAssetId] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [preferLipSync, setPreferLipSync] = useState<boolean>(false);
  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(true);
  const [bgMusicAssetId, setBgMusicAssetId] = useState<string>('');
  const [bgMusicVolume, setBgMusicVolume] = useState<number>(0.2);

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
        setCurrentStep('waiting');
      }
    } catch {
      // Ignore if localStorage unavailable
    }
  }, []);

  const handleSelectPromptFlow = () => {
    setFlowMode('prompt_first');
    setVisualMode('slideshow');
    setScript('');
    changeStep('idea');
  };

  const handleSelectImagesAudioFlow = () => {
    setFlowMode('images_audio');
    setVisualMode('slideshow');
    changeStep('images_audio');
  };

  const handleSelectCustomMediaFlow = () => {
    setFlowMode('custom_media');
    setVisualMode('talking_head');
    changeStep('photo');
  };

  const handleCreateJob = async (consent: ConsentPayload) => {
    // Prevent double submission
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    let payload: JobCreatePayload;

    if (flowMode === 'prompt_first') {
      payload = {
        visual_mode: visualMode,
        image_style: imageStyle,
        avatar_preset_id: visualMode === 'talking_head' ? (avatarPresetId || 'avatar_default') : undefined,
        voice_preset_id: voicePresetId || 'voice_piper_lessac',
        script: script.trim(),
        prompt: ideaText.trim() || prompt.trim() || 'Warm cinematic light, soft watercolor texture',
        duration_preset: durationPreset,
        target_duration_seconds: targetSeconds,
        burn_subtitles: burnSubtitles,
        consent,
      };
    } else if (flowMode === 'images_audio') {
      payload = {
        visual_mode: preferLipSync ? 'talking_head' : 'slideshow',
        uploaded_image_asset_ids: uploadedImages.map((img) => img.assetId),
        image_durations: uploadedImages.map((img) => img.duration),
        uploaded_audio_asset_id: audioAssetId || undefined,
        prefer_lip_sync: preferLipSync,
        burn_subtitles: burnSubtitles,
        bg_music_asset_id: bgMusicAssetId || undefined,
        bg_music_volume: bgMusicVolume,
        script: script.trim() || undefined,
        consent,
      };
    } else {
      payload = {
        visual_mode: 'talking_head',
        photo_asset_id: photoAssetId || DEFAULT_PHOTO_ASSET_ID,
        voice_asset_id: voiceAssetId || DEFAULT_VOICE_ASSET_ID,
        script: script.trim(),
        prompt: prompt.trim() || 'Warm cinematic light, soft watercolor texture',
        duration_preset: durationPreset,
        target_duration_seconds: targetSeconds,
        consent,
      };
    }

    try {
      const res = await apiClient.createJob(payload);

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

  const [isStyleGuide, setIsStyleGuide] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname === '/styleguide' ||
      window.location.pathname.endsWith('/styleguide') ||
      window.location.hash === '#styleguide' ||
      window.location.search.includes('styleguide')
    );
  });

  useEffect(() => {
    const handleRouteCheck = () => {
      setIsStyleGuide(
        window.location.pathname === '/styleguide' ||
        window.location.pathname.endsWith('/styleguide') ||
        window.location.hash === '#styleguide' ||
        window.location.search.includes('styleguide')
      );
    };
    window.addEventListener('hashchange', handleRouteCheck);
    window.addEventListener('popstate', handleRouteCheck);
    return () => {
      window.removeEventListener('hashchange', handleRouteCheck);
      window.removeEventListener('popstate', handleRouteCheck);
    };
  }, []);

  if (isStyleGuide) {
    return (
      <div className="app-shell" style={{ overflowY: 'auto' }}>
        <Suspense fallback={<StepFallback />}>
          <StyleGuide
            onClose={() => {
              if (window.location.hash === '#styleguide') {
                window.location.hash = '';
              } else if (window.location.pathname.includes('styleguide')) {
                window.history.pushState(null, '', '/');
              }
              setIsStyleGuide(false);
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <NotebookShell currentStep={currentStep} flowMode={flowMode} onSelectStep={(step) => changeStep(step)}>
      <Suspense fallback={<StepFallback />}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{
              width: '100%',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100%',
              justifyContent: 'center',
            }}
          >
            {currentStep === 'hero' && (
              <HeroStep onGetStarted={() => changeStep('choice')} />
            )}

            {currentStep === 'choice' && (
              <ChoiceStep
                onSelectPromptFlow={handleSelectPromptFlow}
                onSelectImagesAudioFlow={handleSelectImagesAudioFlow}
                onSelectCustomMediaFlow={handleSelectCustomMediaFlow}
                onBack={() => changeStep('hero')}
              />
            )}

            {currentStep === 'idea' && (
              <IdeaStep
                initialIdea={ideaText}
                initialTone={tone}
                onNext={(newIdea, newTone) => {
                  setIdeaText(newIdea);
                  setTone(newTone);
                  setPrompt(newIdea);
                  changeStep('duration');
                }}
                onBack={() => changeStep('choice')}
              />
            )}

            {currentStep === 'photo' && (
              <PhotoStep
                selectedAssetId={photoAssetId}
                onAssetSelected={(id) => setPhotoAssetId(id)}
                onNext={() => changeStep('voice')}
                onBack={() => changeStep('choice')}
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

            {currentStep === 'images_audio' && (
              <ImagesAudioStep
                initialImages={uploadedImages}
                initialAudioId={audioAssetId}
                initialAudioDuration={audioDuration}
                initialScript={script}
                initialPreferLipSync={preferLipSync}
                initialBurnSubtitles={burnSubtitles}
                initialBgMusicId={bgMusicAssetId}
                initialBgMusicVolume={bgMusicVolume}
                onNext={({
                  images,
                  audioAssetId: aId,
                  audioDuration: aDur,
                  script: sText,
                  preferLipSync: pls,
                  burnSubtitles: bs,
                  bgMusicAssetId: bgId,
                  bgMusicVolume: bgVol,
                }) => {
                  setUploadedImages(images);
                  if (aId) setAudioAssetId(aId);
                  if (aDur) setAudioDuration(aDur);
                  if (sText) setScript(sText);
                  setPreferLipSync(pls);
                  setBurnSubtitles(bs);
                  if (bgId) setBgMusicAssetId(bgId);
                  setBgMusicVolume(bgVol);
                  changeStep('consent');
                }}
                onBack={() => changeStep('choice')}
              />
            )}

            {currentStep === 'duration' && (
              <DurationStep
                selectedPreset={durationPreset}
                onPresetSelected={(preset, seconds) => {
                  setDurationPreset(preset);
                  setTargetSeconds(seconds);
                }}
                onNext={() => changeStep(flowMode === 'prompt_first' ? 'look_voice' : 'script')}
                onBack={() => changeStep(flowMode === 'prompt_first' ? 'idea' : 'voice')}
              />
            )}

            {currentStep === 'look_voice' && (
              <LookVoiceStep
                initialVisualMode={visualMode}
                initialImageStyle={imageStyle}
                initialAvatarId={avatarPresetId}
                initialVoiceId={voicePresetId}
                onNext={(avatarId, voiceId, nextMode, nextStyle) => {
                  setAvatarPresetId(avatarId);
                  setVoicePresetId(voiceId);
                  if (nextMode) setVisualMode(nextMode);
                  if (nextStyle) setImageStyle(nextStyle);
                  changeStep('script');
                }}
                onBack={() => changeStep('duration')}
              />
            )}

            {currentStep === 'script' && (
              <ScriptStep
                script={script}
                onScriptChange={setScript}
                prompt={prompt}
                onPromptChange={setPrompt}
                targetSeconds={targetSeconds}
                durationPreset={durationPreset}
                ideaText={ideaText}
                tone={tone}
                isPromptPath={flowMode === 'prompt_first'}
                initialScriptSource={scriptSource}
                onScriptSourceChange={(src) => setScriptSource(src)}
                onNext={() => changeStep('consent')}
                onBack={() => changeStep(flowMode === 'prompt_first' ? 'look_voice' : 'duration')}
              />
            )}

            {currentStep === 'consent' && (
              <ConsentStep
                onSubmitJob={handleCreateJob}
                onBack={() => changeStep(flowMode === 'images_audio' ? 'images_audio' : 'script')}
                submitting={submitting}
                error={errorMessage}
                isPromptPath={flowMode === 'prompt_first'}
              />
            )}

            {currentStep === 'waiting' && activeJobId && (
              <WaitingStep
                jobId={activeJobId}
                onCompleted={(job) => {
                  setCompletedJob(job);
                  changeStep('premiere');
                }}
                onCancelled={(job) => {
                  setActiveJobId(null);
                  setFailedJob(job);
                  try {
                    localStorage.removeItem('memory_studio_active_job_id');
                  } catch {}
                  changeStep('choice');
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
