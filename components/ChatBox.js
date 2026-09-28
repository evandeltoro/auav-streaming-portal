'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, MessageSquare } from 'lucide-react';
import { createClient } from '../lib/supabase/client';
import { useChatNotify } from './ChatNotifyContext';

// How close to the bottom (in px) counts as "already caught up" -- inside
// this band, new messages still auto-scroll the view.
const NEAR_BOTTOM_PX = 80;

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ChatBox({ inspectionId, initialMessages, currentUserId, canSend }) {
  // LiveVideo now mounts a second ChatBox inside its fullscreen overlay
  // (same inspection, same messages) so chat stays reachable in fullscreen.
  // createBrowserClient() is a singleton in the browser, so both instances
  // share one underlying Supabase client -- if they both subscribed to a
  // channel named just `messages-{inspectionId}`, the second .subscribe()
  // call collides with the first's already-open channel of the same name
  // and throws, crashing the page. useId() gives each mounted instance its
  // own channel name; the actual filtering (which rows this channel
  // receives) is unaffected since that's driven by postgres_changes' own
  // table/filter config below, not the channel name itself.
  const instanceId = useId();
  const chatNotify = useChatNotify();
  // Read via ref inside the subscribe effect below instead of depending on
  // chatNotify directly -- its context value is a new object every time
  // hasUnread flips, and re-running the effect would tear down and
  // resubscribe the Realtime channel on every incoming message.
  const chatNotifyRef = useRef(chatNotify);
  chatNotifyRef.current = chatNotify;
  const [messages, setMessages] = useState(initialMessages || []);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef(null);
  const nearBottomRef = useRef(true);
  const prevCountRef = useRef((initialMessages || []).length);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages-${inspectionId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `inspection_id=eq.${inspectionId}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
          // Flags LiveVideo's fullscreen chat toggle regardless of whether
          // this particular instance is the visible one right now -- the
          // point is "something arrived while nobody had chat open," not
          // this instance's own scroll position.
          if (payload.new.sender_id !== currentUserId) {
            chatNotifyRef.current?.reportMessage();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [inspectionId, instanceId, currentUserId]);

  // Land at the bottom on first load only -- everything after this is
  // handled by the effect below, which decides per-message whether to
  // follow along or hang back.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll is only welcome if the reader was already caught up, or the
  // new message is their own. Someone scrolled up reading earlier messages
  // never gets yanked back down -- they get an "N new" pill instead.
  useEffect(() => {
    const added = messages.length - prevCountRef.current;
    prevCountRef.current = messages.length;
    if (added <= 0) return;

    const lastMessage = messages[messages.length - 1];
    const isOwnMessage = lastMessage?.sender_id === currentUserId;

    if (nearBottomRef.current || isOwnMessage) {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      setUnreadCount(0);
    } else {
      setUnreadCount((n) => n + added);
    }
  }, [messages, currentUserId]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nowNearBottom = distanceFromBottom < NEAR_BOTTOM_PX;
    nearBottomRef.current = nowNearBottom;
    if (nowNearBottom && unreadCount > 0) setUnreadCount(0);
  }

  function scrollToBottom() {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
    nearBottomRef.current = true;
    setUnreadCount(0);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;

    setSending(true);
    setError('');

    const res = await fetch(`/api/inspections/${inspectionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });

    setSending(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to send message');
      return;
    }

    setText('');
  }

  return (
    <div className="chat-box">
      <div className="chat-title">Inspection Chat</div>

      <div className="chat-messages-wrap">
        <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <MessageSquare size={22} strokeWidth={1.5} />
              <span>No messages yet.</span>
            </div>
          ) : (
            messages.map((m) => (
              <div className={`chat-message ${m.sender_id === currentUserId ? 'own' : ''}`} key={m.id}>
                <span className="chat-sender">
                  {m.sender_name || 'Unknown'}
                  {m.created_at && <span className="chat-timestamp">{formatTime(m.created_at)}</span>}
                </span>
                <span className="chat-body">{m.body}</span>
                {m.image_url && (
                  <a href={m.image_url} target="_blank" rel="noopener noreferrer" className="chat-image-link">
                    <img src={m.image_url} alt="Snapshot from the live feed" className="chat-image" />
                  </a>
                )}
              </div>
            ))
          )}
        </div>

        {unreadCount > 0 && (
          <button type="button" className="chat-unread-pill" onClick={scrollToBottom}>
            <ArrowDown size={13} />
            {unreadCount} new message{unreadCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {canSend ? (
        <form className="chat-input-row" data-tour-id="demo-chat-input" onSubmit={handleSubmit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the team watching this inspection..."
            maxLength={2000}
          />
          <button type="submit" className="small-btn" disabled={sending || !text.trim()}>
            {sending && <span className="spinner dark" />}
            Send
          </button>
        </form>
      ) : (
        <div className="chat-closed-note">Chat is open while this inspection is live.</div>
      )}

      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
