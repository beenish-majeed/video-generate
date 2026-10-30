import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Copy, Check, Download, Info, Film } from 'lucide-react';
import type { ScenePlanResponse, SceneClipItem } from '../../types/api';
import apiClient from '../../api/client';

export interface ScenePlanStepProps {
  script: string;
  imageStyle?: string;
  targetSeconds?: number;
  initialPlan?: ScenePlanResponse | null;
  initialScenePlan?: ScenePlanResponse | null;
  onPlanLoaded?: (plan: ScenePlanResponse) => void;
  onScenePlanGenerated?: (plan: ScenePlanResponse) => void;
  onNext: (plan?: ScenePlanResponse) => void;
  onBack: () => void;
}

export const ScenePlanStep: React.FC<ScenePlanStepProps> = ({
  script,
  imageStyle = 'cinematic',
  targetSeconds = 30,
  initialPlan = null,
  initialScenePlan = null,
  onPlanLoaded,
  onScenePlanGenerated,
  onNext,
  onBack,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const effectiveInitial = initialPlan || initialScenePlan || null;
  const [scenePlan, setScenePlan] = useState<ScenePlanResponse | null>(effectiveInitial);
  const [loading, setLoading] = useState<boolean>(!effectiveInitial);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  useEffect(() => {
    if (!scenePlan) {
      loadPlan();
    }
  }, []);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const plan = await apiClient.exportScenePlan({
        script: script.trim() || 'A tranquil morning landscape with gentle sunlight.',
        style: imageStyle,
        target_duration_seconds: targetSeconds,
      });
      setScenePlan(plan);
      if (onPlanLoaded) {
        onPlanLoaded(plan);
      }
      if (onScenePlanGenerated) {
        onScenePlanGenerated(plan);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate scene plan.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPrompt = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyAll = async () => {
    if (!scenePlan) return;
    try {
      await navigator.clipboard.writeText(scenePlan.plain_text_prompts || '');
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadPlanJson = () => {
    if (!scenePlan) return;
    const blob = new Blob([JSON.stringify(scenePlan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenePlan.plan_id || 'scene_plan'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadNotebook = () => {
    // Provide direct link or instruction for Colab notebook
    const notebookUrl = '/notebooks/ai_clips_colab.ipynb';
    const a = document.createElement('a');
    a.href = notebookUrl;
    a.download = 'ai_clips_colab.ipynb';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(16px, 2.5dvh, 32px) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2dvh, 24px)',
        position: 'relative',
        maxWidth: 'min(1080px, 100%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Bar Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          aria-label="Back to script step"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </button>

        {scenePlan && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleCopyAll}
              className="btn-secondary"
              style={{ fontSize: '13px', padding: '10px 16px', minHeight: '44px', minWidth: '44px' }}
            >
              {copiedAll ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copiedAll ? 'Copied All' : 'Copy All Prompts'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPlanJson}
              className="btn-secondary"
              style={{ fontSize: '13px', padding: '10px 16px', minHeight: '44px', minWidth: '44px' }}
            >
              <Download size={14} />
              <span>Download Scene Plan</span>
            </button>
          </div>
        )}
      </div>

      {/* Header with Title and Tooltip */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="editorial-title" style={{ fontSize: 'clamp(24px, 2.6vw, 32px)', margin: 0 }}>
            Scene Plan & Visual Prompts
          </h1>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowTooltip(!showTooltip)}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              aria-label="Information about scene plan and Colab workflow"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '44px',
                height: '44px',
                minWidth: '44px',
                minHeight: '44px',
                padding: 0,
                borderRadius: '8px',
              }}
            >
              <Info size={18} />
            </button>
            {showTooltip && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 20,
                  width: '280px',
                  padding: '12px',
                  background: 'var(--glass-bg)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: '12.5px',
                  color: 'var(--text-primary)',
                  lineHeight: 1.45,
                }}
              >
                Download your scene plan and run it with our free companion Colab notebook on a T4 GPU.
                Once your clips are rendered, click <strong>Continue</strong> to upload them.
              </div>
            )}
          </div>
        </div>
        <p className="page-lead" style={{ margin: 0 }}>
          Your script has been split into timed scenes with cinematic visual prompts and negative prompts.
        </p>
      </header>

      {/* Error View */}
      {error && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button type="button" onClick={loadPlan} className="btn-secondary" style={{ padding: '8px 16px', minHeight: '44px', minWidth: '44px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px 0', alignItems: 'center' }}>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>
            Crafting scene plan and visual prompts...
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="glass-card"
                style={{
                  height: '110px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.3)',
                  animation: 'pulse 1.6s infinite ease-in-out',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Scene List Cards */}
      {!loading && scenePlan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {scenePlan.scenes.map((scene: SceneClipItem, idx: number) => {
            const isCopied = copiedIndex === idx;
            return (
              <motion.div
                key={scene.id || `scene_${scene.scene_index ?? idx}`}
                className="glass-card"
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                style={{
                  padding: '16px 20px',
                  borderRadius: '16px',
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: '#5835ea',
                        color: '#ffffff',
                      }}
                    >
                      Scene {scene.scene_index + 1}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {(scene.start_seconds ?? 0).toFixed(1)}s – {(scene.end_seconds ?? scene.duration_seconds ?? 5.0).toFixed(1)}s ({(scene.duration_seconds ?? 5.0).toFixed(1)}s duration) • {scene.aspect_ratio || '16:9'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyPrompt(scene.visual_prompt, idx)}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '8px 14px', minHeight: '44px', minWidth: '44px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {isCopied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                    <span>{isCopied ? 'Copied' : 'Copy Prompt'}</span>
                  </button>
                </div>

                <div style={{ fontSize: '14.5px', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                  "{scene.narration_text || (scene as any).narration || ''}"
                </div>

                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.04)',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ color: 'var(--text-primary)' }}>Visual Prompt:</strong> {scene.visual_prompt}
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Negative:</strong> {scene.negative_prompt}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Action Footer */}
      {!loading && scenePlan && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '16px',
            borderTop: '1px solid var(--glass-border)',
          }}
        >
          <button
            type="button"
            onClick={handleDownloadNotebook}
            className="btn-secondary"
            style={{ fontSize: '13.5px', minHeight: '44px', minWidth: '44px', padding: '10px 18px' }}
          >
            <Film size={15} />
            <span>Colab Notebook</span>
          </button>

          <button
            type="button"
            onClick={() => onNext(scenePlan)}
            className="btn-primary"
            style={{ minWidth: '220px', minHeight: '44px' }}
          >
            <span>Continue to Upload Clips</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default ScenePlanStep;
