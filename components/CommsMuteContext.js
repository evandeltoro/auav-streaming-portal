'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

const CommsMuteContext = createContext(null);

// Bridges RadioPanel's mic (its own LiveKit room, connected/disconnected
// independently of the video) to a mute button LiveVideo can render inside
// .video-box -- the only element the Fullscreen API actually displays while
// fullscreen, so RadioPanel's own Mute button (a sibling, outside that
// element) becomes unreachable the moment a surveyor goes fullscreen on the
// video. RadioPanel registers its toggle function here once connected;
// LiveVideo just calls whatever's currently registered, wherever it happens
// to be rendered.
export function CommsMuteProvider({ children }) {
  const [muted, setMutedState] = useState(false);
  const [active, setActive] = useState(false);
  const toggleRef = useRef(null);

  // RadioPanel calls this on connect (toggleFn, currentlyMuted) and on
  // disconnect (null) -- active tracks whether there's actually a live mic
  // to mute right now, so LiveVideo knows whether to show the button at all.
  const register = useCallback((toggleFn, currentlyMuted) => {
    toggleRef.current = toggleFn;
    setActive(!!toggleFn);
    if (typeof currentlyMuted === 'boolean') setMutedState(currentlyMuted);
  }, []);

  // RadioPanel calls this after its own button toggles the mic, so both
  // buttons stay in sync regardless of which one was clicked.
  const setMuted = useCallback((value) => {
    setMutedState(value);
  }, []);

  const requestToggle = useCallback(() => {
    toggleRef.current?.();
  }, []);

  return (
    <CommsMuteContext.Provider value={{ muted, active, register, setMuted, requestToggle }}>
      {children}
    </CommsMuteContext.Provider>
  );
}

export function useCommsMute() {
  return useContext(CommsMuteContext);
}
