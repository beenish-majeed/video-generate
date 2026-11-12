import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import NotebookShell from './components/NotebookShell';
import { ToastProvider } from './components/ui/Toast';
import { type JourneyStepId, type FlowMode, ENABLE_EXTENDED_WORKFLOWS } from './components/PageTabs';
import type { DurationPreset, ConsentPayload, JobRecord, ScriptTone, JobCreatePayload, UploadedClipItem, ScenePlanResponse } from './types/api';
import apiClient from './api/client';
import { mapAPIError } from './api/errorMapper';
import { playPageTurnSound } from './utils/soundEffects';
import { Loader2, Sparkles } from 'lucide-react';
import type { UploadedImageItem } from './components/steps/ImagesAudioStep';

export { ENABLE_EXTENDED_WORKFLOWS };

const HeroStep = lazy(() => import('./components/steps/HeroStep'));
const ChoiceStep = lazy(() => import('./components/steps/ChoiceStep'));
const IdeaStep = lazy(() => import('./components/steps/IdeaStep'));
const PhotoStep = lazy(() => import('./components/steps/PhotoStep'));
const VoiceStep = lazy(() => import('./components/steps/VoiceStep'));
const ImagesAudioStep = lazy(() => import('./components/steps/ImagesAudioStep'));
const DurationStep = lazy(() => import('./components/steps/DurationStep'));
const LookVoiceStep = lazy(() => import('./components/steps/LookVoiceStep'));
const ScriptStep = lazy(() => import('./components/steps/ScriptStep'));
const ScenePlanStep = lazy(() => import('./components/steps/ScenePlanStep'));
const ClipsUploadStep = lazy(() => import('./components/steps/ClipsUploadStep'));
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
    <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent)' }} />
    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>
      Loading step...
    </p>
  </div>
);

const DEFAULT_PHOTO_ASSET_ID = 'default-studio-photo';

function getStepIndex(step: JourneyStepId, mode: FlowMode): number {
  if (step === 'hero') return 0;
  if (step === 'choice') return 1;
  if (step === 'waiting') return 90;
  if (step === 'premiere') return 91;
  if (step === 'failed') return 92;

  if (mode === 'prompt_first') {
    if (step === 'idea') return 2;
    if (step === 'duration') return 3;
    if (step === 'look_voice') return 4;
    if (step === 'script') return 5;
    if (step === 'consent') return 6;
  } else {
    // Flow B (custom_media)
    if (step === 'photo') return 2;
    if (step === 'voice') return 3;
    if (step === 'duration') return 4;
    if (step === 'idea') return 5;
    if (step === 'consent') return 6;
  }
  return 2;
}

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<JourneyStepId>('hero');
  const [flowMode, setFlowMode] = useState<FlowMode>('prompt_first');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const shouldReduceMotion = useReducedMotion();

  // Flow A Consent Confirmation Dialog State
  const [showFlowAConsent, setShowFlowAConsent] = useState<boolean>(false);
  const [creatingFlowAJob, setCreatingFlowAJob] = useState<boolean>(false);

  // Journey State Machine Data
  const [photoAssetId, setPhotoAssetId] = useState<string>('');
  const [voiceAssetId, setVoiceAssetId] = useState<string>('');
  const [detectedAudioDuration, setDetectedAudioDuration] = useState<number | null>(null);
  const [ideaText, setIdeaText] = useState<string>('');
  const [tone, setTone] = useState<ScriptTone>('storytelling');
  const [visualMode, setVisualMode] = useState<'slideshow' | 'talking_head' | 'ai_clips'>('slideshow');
  const [uploadedClips, setUploadedClips] = useState<UploadedClipItem[]>([]);
  const [scenePlan, setScenePlan] = useState<ScenePlanResponse | null>(null);
  const [imageStyle, setImageStyle] = useState<string>('cinematic');
  const [avatarPresetId, setAvatarPresetId] = useState<string>('avatar_default');
  const [voicePresetId, setVoicePresetId] = useState<string>('voice_piper_lessac');
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('30s');
  const [targetSeconds, setTargetSeconds] = useState<number>(30);
  const [script, setScript] = useState<string>('');
  const [scriptSource, setScriptSource] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('Warm cinematic light, soft watercolor texture');

  // Images + Audio mode state (preserved for extended mode)
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

  const hasOwnVoice = Boolean(voiceAssetId && detectedAudioDuration && detectedAudioDuration > 0);

  const changeStep = (step: JourneyStepId) => {
    const currentIndex = getStepIndex(currentStep, flowMode);
    const nextIndex = getStepIndex(step, flowMode);
    setDirection(nextIndex >= currentIndex ? 'forward' : 'back');
    playPageTurnSound();
    setCurrentStep(step);
  };

  // Focus heading on step change for accessibility and keyboard navigation
  useEffect(() => {
    const timer = setTimeout(() => {
      const heading = document.querySelector<HTMLElement>('main h1, main h2, .step-container h1, .step-container h2');
      if (heading) {
        heading.setAttribute('tabIndex', '-1');
        heading.focus({ preventScroll: true });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [currentStep]);

  // Safe Keyboard Navigation: Esc to go back, Enter to proceed on valid forms
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable);

      if (e.key === 'Escape') {
        if (isInput) {
          activeEl.blur();
          return;
        }
        if (showFlowAConsent) {
          setShowFlowAConsent(false);
          return;
        }
        if (currentStep === 'choice') {
          changeStep('hero');
        } else if (currentStep === 'idea') {
          changeStep(flowMode === 'prompt_first' ? 'choice' : 'duration');
        } else if (currentStep === 'photo') {
          changeStep('choice');
        } else if (currentStep === 'voice') {
          changeStep('photo');
        } else if (currentStep === 'duration') {
          changeStep(flowMode === 'prompt_first' ? 'idea' : 'voice');
        } else if (currentStep === 'consent') {
          changeStep(hasOwnVoice ? 'duration' : 'idea');
        }
      }

      if (e.key === 'Enter') {
        if (activeEl?.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) {
          return;
        }

        const nextButton = document.querySelector<HTMLButtonElement>(
          'main button.btn-primary:not(:disabled), .step-container button.btn-primary:not(:disabled)'
        );
        if (nextButton && !nextButton.disabled && !nextButton.contains(activeEl)) {
          if (activeEl?.tagName === 'BUTTON') return;
          e.preventDefault();
          nextButton.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, flowMode, showFlowAConsent, hasOwnVoice]);

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
    setIdeaText('');
    setScript('');
    changeStep('idea');
  };

  const handleSelectCustomMediaFlow = () => {
    setFlowMode('custom_media');
    setVisualMode('talking_head');
    setPhotoAssetId('');
    setVoiceAssetId('');
    setDetectedAudioDuration(null);
    setIdeaText('');
    setScript('');
    changeStep('photo');
  };

  const handleSelectImagesAudioFlow = () => {
    setFlowMode('images_audio');
    setVisualMode('slideshow');
    changeStep('images_audio');
  };

  const handleSelectAiClipsFlow = () => {
    setFlowMode('ai_clips');
    setVisualMode('ai_clips');
    setScript('');
    changeStep('idea');
  };

  // Flow A: Direct generation after AI Consent confirmation
  const handleConfirmFlowAGeneration = async () => {
    if (creatingFlowAJob) return;
    setCreatingFlowAJob(true);
    setErrorMessage(null);

    let scriptText = script;

    // Automatically call generateScript if not already generated
    try {
      const scriptRes = await apiClient.generateScript({
        prompt: ideaText.trim().slice(0, 1000) || 'A peaceful animated memory',
        tone: tone,
        target_duration_seconds: targetSeconds,
        duration_preset: durationPreset,
      });
      if (scriptRes?.script) {
        scriptText = scriptRes.script;
        setScript(scriptRes.script);
      }
    } catch {
      if (!scriptText) {
        scriptText = ideaText.trim().slice(0, 500);
      }
    }

    const consent: ConsentPayload = {
      authorized: true,
      statement: 'This video is AI-generated and will carry an AI label',
      ai_generated_accepted: true,
      ai_label_accepted: true,
      voice_rights_attested: true,
    };

    const payload: JobCreatePayload = {
      visual_mode: 'text_to_video',
      image_style: imageStyle || 'cinematic',
      avatar_preset_id: 'avatar_default',
      voice_preset_id: 'voice_piper_lessac',
      script: scriptText.trim() || undefined,
      prompt: ideaText.trim().slice(0, 1000) || 'Warm cinematic light, soft watercolor texture',
      duration_preset: durationPreset,
      target_duration_seconds: targetSeconds,
      burn_subtitles: true,
      music_preset_id: 'calm',
      music_volume: 0.25,
      music_ducking: true,
      overrides: {
        'voice.tone': tone,
      },
      consent,
    };

    try {
      const res = await apiClient.createJob(payload);
      try {
        localStorage.setItem('memory_studio_active_job_id', res.job_id);
      } catch {}
      setActiveJobId(res.job_id);
      setShowFlowAConsent(false);
      changeStep('waiting');
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setErrorMessage(mapped.message);
      setFailedJob(null);
      setShowFlowAConsent(false);
      changeStep('failed');
    } finally {
      setCreatingFlowAJob(false);
    }
  };

  // Standard Job Creation handler (for Flow B and extended flows)
  const handleCreateJob = async (consent: ConsentPayload) => {
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    let payload: JobCreatePayload;

    if (flowMode === 'ai_clips') {
      payload = {
        visual_mode: 'ai_clips',
        clip_asset_ids: uploadedClips.map((c) => c.assetId),
        plan_id: scenePlan?.plan_id,
        voice_preset_id: voicePresetId || 'voice_piper_lessac',
        voice_asset_id: voiceAssetId || undefined,
        script: script.trim() || undefined,
        duration_preset: durationPreset,
        target_duration_seconds: targetSeconds,
        burn_subtitles: burnSubtitles,
        bg_music_asset_id: bgMusicAssetId || undefined,
        bg_music_volume: bgMusicVolume,
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
      // Flow B: Picture to video (or legacy custom_media)
      payload = {
        visual_mode: 'picture_to_video',
        photo_asset_id: photoAssetId || DEFAULT_PHOTO_ASSET_ID,
        voice_asset_id: hasOwnVoice ? voiceAssetId : undefined,
        voice_preset_id: hasOwnVoice ? undefined : (voicePresetId || 'voice_piper_lessac'),
        script: script.trim() || undefined,
        prompt: prompt.trim() || ideaText.trim() || 'Warm cinematic light, soft watercolor texture',
        duration_preset: hasOwnVoice ? undefined : durationPreset,
        target_duration_seconds: hasOwnVoice ? (detectedAudioDuration || 15) : targetSeconds,
        overrides: {
          'voice.tone': tone,
        },
        consent,
      };
    }

    try {
      const res = await apiClient.createJob(payload);
      try {
        localStorage.setItem('memory_studio_active_job_id', res.job_id);
      } catch {}
      setActiveJobId(res.job_id);
      setCurrentStep('waiting');
    } catch (err: unknown) {
      const mapped = mapAPIError(err);
      setErrorMessage(mapped.message);
      setFailedJob(null);
      setCurrentStep('failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Smooth directional page transitions respecting prefers-reduced-motion
  const pageVariants = {
    initial: (dir: 'forward' | 'back') => ({
      opacity: 0,
      x: shouldReduceMotion ? 0 : (dir === 'forward' ? 32 : -32),
      scale: shouldReduceMotion ? 1 : 0.985,
      filter: shouldReduceMotion ? 'none' : 'blur(4px)',
    }),
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.36,
        ease: [0.16, 1, 0.3, 1],
      },
    },
    exit: (dir: 'forward' | 'back') => ({
      opacity: 0,
      x: shouldReduceMotion ? 0 : (dir === 'forward' ? -32 : 32),
      scale: shouldReduceMotion ? 1 : 0.985,
      filter: shouldReduceMotion ? 'none' : 'blur(4px)',
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.24,
        ease: [0.25, 0.1, 0.25, 1],
      },
    }),
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
      <ToastProvider>
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
      </ToastProvider>
    );
  }

  return (
    <NotebookShell
      currentStep={currentStep}
      flowMode={flowMode}
      hasOwnVoice={hasOwnVoice}
      onSelectStep={(step) => changeStep(step)}
    >
      <Suspense fallback={<StepFallback />}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
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
            {/* Step 1: Welcome Hero */}
            {currentStep === 'hero' && (
              <HeroStep onGetStarted={() => changeStep('choice')} />
            )}

            {/* Step 2: Two-mode Choice Step */}
            {currentStep === 'choice' && (
              <ChoiceStep
                onSelectPromptFlow={handleSelectPromptFlow}
                onSelectImagesAudioFlow={handleSelectImagesAudioFlow}
                onSelectCustomMediaFlow={handleSelectCustomMediaFlow}
                onSelectAiClipsFlow={handleSelectAiClipsFlow}
                onBack={() => changeStep('hero')}
              />
            )}

            {/* Prompt Screen (Flow A: "Your prompt" / Flow B: "Prompt") */}
            {currentStep === 'idea' && (
              <IdeaStep
                label={flowMode === 'prompt_first' ? 'Your prompt' : 'Prompt'}
                submitLabel="Continue"
                maxWords={flowMode === 'custom_media' ? 2000 : undefined}
                initialIdea={ideaText}
                initialTone={tone}
                onNext={(newIdea, newTone) => {
                  setIdeaText(newIdea);
                  setTone(newTone);
                  setPrompt(newIdea);
                  if (flowMode === 'prompt_first') {
                    changeStep('duration');
                  } else {
                    changeStep('consent');
                  }
                }}
                onBack={() => {
                  if (flowMode === 'prompt_first') {
                    changeStep('choice');
                  } else {
                    changeStep('duration');
                  }
                }}
              />
            )}

            {/* Picture Upload Screen (Flow B) */}
            {currentStep === 'photo' && (
              <PhotoStep
                selectedAssetId={photoAssetId}
                onAssetSelected={(id) => setPhotoAssetId(id)}
                onNext={() => changeStep('voice')}
                onBack={() => changeStep('choice')}
              />
            )}

            {/* Voice Screen (Flow B: 3 choices: Default voice preselected, Upload, Record now) */}
            {currentStep === 'voice' && (
              <VoiceStep
                selectedAssetId={voiceAssetId}
                onAssetSelected={(id) => setVoiceAssetId(id)}
                onDurationDetected={(sec) => setDetectedAudioDuration(sec > 0 ? sec : null)}
                isAiClipsMode={flowMode === 'ai_clips'}
                onNext={() => changeStep('duration')}
                onBack={() => changeStep(flowMode === 'ai_clips' ? 'upload_clips' : 'photo')}
              />
            )}

            {/* Duration Screen (Shared Component for Flow A and Flow B) */}
            {currentStep === 'duration' && (
              <DurationStep
                selectedPreset={durationPreset}
                detectedAudioSeconds={flowMode === 'custom_media' && hasOwnVoice ? detectedAudioDuration : null}
                onPresetSelected={(preset, seconds) => {
                  setDurationPreset(preset);
                  setTargetSeconds(seconds);
                }}
                onNext={() => {
                  if (!ENABLE_EXTENDED_WORKFLOWS && flowMode === 'prompt_first') {
                    setShowFlowAConsent(true);
                  } else if (flowMode === 'custom_media') {
                    if (hasOwnVoice) {
                      changeStep('consent');
                    } else {
                      changeStep('idea');
                    }
                  } else {
                    changeStep(flowMode === 'prompt_first' ? 'look_voice' : 'script');
                  }
                }}
                onBack={() => {
                  changeStep(flowMode === 'prompt_first' ? 'idea' : 'voice');
                }}
              />
            )}

            {/* Extended Workflow Steps (Preserved behind ENABLE_EXTENDED_WORKFLOWS flag) */}
            {ENABLE_EXTENDED_WORKFLOWS && currentStep === 'images_audio' && (
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

            {ENABLE_EXTENDED_WORKFLOWS && currentStep === 'look_voice' && (
              <LookVoiceStep
                initialVisualMode={visualMode === 'ai_clips' ? 'slideshow' : visualMode}
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

            {ENABLE_EXTENDED_WORKFLOWS && currentStep === 'script' && (
              <ScriptStep
                script={script}
                onScriptChange={setScript}
                prompt={prompt}
                onPromptChange={setPrompt}
                targetSeconds={targetSeconds}
                durationPreset={durationPreset}
                ideaText={ideaText}
                tone={tone}
                isPromptPath={flowMode === 'prompt_first' || flowMode === 'ai_clips'}
                initialScriptSource={scriptSource}
                onScriptSourceChange={(src) => setScriptSource(src)}
                onNext={() => changeStep(flowMode === 'ai_clips' ? 'scene_plan' : 'consent')}
                onBack={() => changeStep(flowMode === 'ai_clips' ? 'duration' : (flowMode === 'prompt_first' ? 'look_voice' : 'duration'))}
              />
            )}

            {ENABLE_EXTENDED_WORKFLOWS && currentStep === 'scene_plan' && (
              <ScenePlanStep
                script={script}
                targetSeconds={targetSeconds}
                imageStyle={imageStyle}
                initialPlan={scenePlan}
                onPlanLoaded={(plan: ScenePlanResponse) => setScenePlan(plan)}
                onNext={() => changeStep('upload_clips')}
                onBack={() => changeStep('script')}
              />
            )}

            {ENABLE_EXTENDED_WORKFLOWS && currentStep === 'upload_clips' && (
              <ClipsUploadStep
                plan={scenePlan}
                clips={uploadedClips}
                onClipsChange={(clips: UploadedClipItem[]) => setUploadedClips(clips)}
                onNext={() => changeStep('voice')}
                onBack={() => changeStep('scene_plan')}
              />
            )}

            {/* Consent Step for Flow B & Extended Flows */}
            {currentStep === 'consent' && (
              <ConsentStep
                onSubmitJob={handleCreateJob}
                onBack={() => {
                  if (!ENABLE_EXTENDED_WORKFLOWS) {
                    changeStep(hasOwnVoice ? 'duration' : 'idea');
                  } else {
                    changeStep(flowMode === 'images_audio' ? 'images_audio' : (flowMode === 'ai_clips' ? 'voice' : 'script'));
                  }
                }}
                submitting={submitting}
                error={errorMessage}
                isPromptPath={flowMode === 'prompt_first'}
                isAiClipsMode={flowMode === 'ai_clips'}
              />
            )}

            {/* Waiting Room Step (Showing Real Stages) */}
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

            {/* Grand Premiere Result Step (Download, Save, Make Another) */}
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

            {/* Error / Recovery Step */}
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
                  changeStep(recommendedStep || (flowMode === 'prompt_first' ? 'duration' : 'consent'));
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Suspense>

      {/* Flow A Consent Confirmation Dialog */}
      {showFlowAConsent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="flow-a-consent-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '28px 24px',
              backgroundColor: 'var(--bg-surface)',
              border: '2px solid var(--accent)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Sparkles size={32} style={{ color: 'var(--accent)' }} />
            </div>

            <div>
              <h3
                id="flow-a-consent-title"
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  margin: '0 0 8px 0',
                  color: 'var(--text-primary)',
                }}
              >
                AI Video Generation
              </h3>
              <p
                style={{
                  fontSize: '14.5px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                This video is AI-generated and will carry an AI label.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                marginTop: '8px',
              }}
            >
              <button
                type="button"
                onClick={() => setShowFlowAConsent(false)}
                disabled={creatingFlowAJob}
                className="btn-secondary"
                style={{ minHeight: '44px', padding: '10px 20px', cursor: 'pointer' }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmFlowAGeneration}
                disabled={creatingFlowAJob}
                className="btn-primary"
                style={{ minHeight: '44px', padding: '10px 24px', cursor: creatingFlowAJob ? 'not-allowed' : 'pointer' }}
              >
                {creatingFlowAJob ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Confirm</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotebookShell>
  );
};

export default App;
