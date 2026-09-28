'use client';

import { createContext, useCallback, useContext, useState } from 'react';

const ChatNotifyContext = createContext(null);

// Lets LiveVideo's fullscreen chat toggle show a "new message" dot even
// while its overlay is closed (or hidden behind fullscreen). Both mounted
// ChatBox instances (the always-visible one below the video, and the one
// inside LiveVideo's overlay) report inbound messages here independent of
// their own scroll position/unread-pill logic -- this is specifically about
// "did anything arrive while nobody had chat open," not "is the reader
// scrolled up."
export function ChatNotifyProvider({ children }) {
  const [hasUnread, setHasUnread] = useState(false);

  const reportMessage = useCallback(() => setHasUnread(true), []);
  const markSeen = useCallback(() => setHasUnread(false), []);

  return (
    <ChatNotifyContext.Provider value={{ hasUnread, reportMessage, markSeen }}>
      {children}
    </ChatNotifyContext.Provider>
  );
}

export function useChatNotify() {
  return useContext(ChatNotifyContext);
}
