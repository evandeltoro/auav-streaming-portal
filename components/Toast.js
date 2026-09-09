'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

let idCounter = 0;

const ICON = { success: CheckCircle2, error: XCircle, info: Info };

// App-wide toast notifications -- until now, actions either had inline
// feedback baked in one-off per component (spinner + label swap, a "Saved"
// string) or nothing at all (several copy-to-clipboard buttons gave zero
// confirmation). This is the shared, consistent version: any component can
// call useToast() and get a dismissable, auto-expiring notification without
// building its own feedback state every time.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message, type = 'success', duration = 4000) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timeout = setTimeout(() => dismiss(id), duration);
      timeoutsRef.current.set(id, timeout);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => {
          const Icon = ICON[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)} role="status">
              <Icon size={16} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// Returns a showToast(message, type, durationMs) function. type is
// 'success' | 'error' | 'info', defaults to 'success'.
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be called from within ToastProvider (app/layout.js)');
  }
  return ctx;
}
