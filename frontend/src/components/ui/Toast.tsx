import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string) => void;
  info: (message: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let globalToastHandler: ((item: Omit<ToastItem, 'id'>) => void) | null = null;

export const toast = {
  success: (message: string, duration = 4000) => {
    if (globalToastHandler) globalToastHandler({ message, type: 'success', duration });
  },
  error: (message: string) => {
    // Errors stay until dismissed
    if (globalToastHandler) globalToastHandler({ message, type: 'error', duration: 0 });
  },
  info: (message: string, duration = 4000) => {
    if (globalToastHandler) globalToastHandler({ message, type: 'info', duration });
  },
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback to global dispatcher if outside provider
    return {
      showToast: (message, type = 'info', duration) => {
        if (type === 'error') toast.error(message);
        else if (type === 'success') toast.success(message, duration);
        else toast.info(message, duration);
      },
      success: toast.success,
      error: toast.error,
      info: toast.info,
      dismiss: () => {},
    };
  }
  return ctx;
};

const ToastCard: React.FC<{
  item: ToastItem;
  onDismiss: (id: string) => void;
}> = ({ item, onDismiss }) => {
  const shouldReduceMotion = useReducedMotion();
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef<number>(item.duration ?? 4000);
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isError = item.type === 'error';
  const duration = isError ? 0 : (item.duration ?? 4000);

  useEffect(() => {
    if (duration <= 0) return;

    if (!isPaused) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        onDismiss(item.id);
      }, remainingRef.current);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      const elapsed = Date.now() - startTimeRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, isPaused, item.id, onDismiss]);

  const typeConfig = {
    success: {
      icon: <CheckCircle2 size={18} style={{ color: 'var(--accent-success, #10b981)', flexShrink: 0 }} />,
      borderColor: 'rgba(16, 185, 129, 0.3)',
      barColor: 'var(--accent-success, #10b981)',
      shadow: '0 8px 24px rgba(16, 185, 129, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)',
    },
    error: {
      icon: <AlertCircle size={18} style={{ color: 'var(--accent-danger, #ef4444)', flexShrink: 0 }} />,
      borderColor: 'rgba(239, 68, 68, 0.35)',
      barColor: 'var(--accent-danger, #ef4444)',
      shadow: '0 8px 24px rgba(239, 68, 68, 0.15), 0 2px 6px rgba(0, 0, 0, 0.04)',
    },
    info: {
      icon: <Info size={18} style={{ color: 'var(--accent-primary, #6c4dff)', flexShrink: 0 }} />,
      borderColor: 'rgba(108, 77, 255, 0.25)',
      barColor: 'var(--accent-primary, #6c4dff)',
      shadow: '0 8px 24px rgba(108, 77, 255, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)',
    },
  }[item.type];

  return (
    <motion.div
      layout
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      initial={{
        opacity: 0,
        y: shouldReduceMotion ? 0 : 16,
        scale: shouldReduceMotion ? 1 : 0.94,
      }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
      }}
      exit={{
        opacity: 0,
        y: shouldReduceMotion ? 0 : 10,
        scale: shouldReduceMotion ? 1 : 0.94,
        transition: { duration: 0.2 },
      }}
      transition={{
        type: 'spring',
        damping: 26,
        stiffness: 340,
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '360px',
        pointerEvents: 'auto',
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${typeConfig.borderColor}`,
        borderRadius: 'var(--radius-card, 16px)',
        boxShadow: typeConfig.shadow,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginTop: '2px' }}>{typeConfig.icon}</div>
      <p
        style={{
          margin: 0,
          flex: 1,
          fontSize: '14px',
          lineHeight: '1.4',
          color: 'var(--text-primary)',
          fontWeight: 500,
        }}
      >
        {item.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <X size={16} />
      </button>

      {/* Thin auto-dismiss countdown bar (non-error toasts only) */}
      {!isError && duration > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: '2.5px',
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}
        >
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: isPaused ? undefined : 0 }}
            transition={{
              duration: shouldReduceMotion ? 0.01 : duration / 1000,
              ease: 'linear',
            }}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: typeConfig.barColor,
              transformOrigin: 'left',
            }}
          />
        </div>
      )}
    </motion.div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type, duration: type === 'error' ? 0 : duration }]);
    },
    []
  );

  const success = useCallback((message: string, duration = 4000) => showToast(message, 'success', duration), [showToast]);
  const error = useCallback((message: string) => showToast(message, 'error', 0), [showToast]);
  const info = useCallback((message: string, duration = 4000) => showToast(message, 'info', duration), [showToast]);

  useEffect(() => {
    globalToastHandler = ({ message, type, duration }) => {
      showToast(message, type, duration);
    };
    return () => {
      globalToastHandler = null;
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, dismiss }}>
      {children}
      {/* Toast Notification Container */}
      <div
        role="region"
        aria-label="Notifications"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: '10px',
          zIndex: 9999,
          maxWidth: 'min(90vw, 360px)',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
