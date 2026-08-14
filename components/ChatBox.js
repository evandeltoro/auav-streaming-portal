'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { createClient } from '../lib/supabase/client';

export default function ChatBox({ inspectionId, initialMessages, currentUserId, canSend }) {
  const [messages, setMessages] = useState(initialMessages || []);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages-${inspectionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `inspection_id=eq.${inspectionId}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [inspectionId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

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

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <MessageSquare size={22} strokeWidth={1.5} />
            <span>No messages yet.</span>
          </div>
        ) : (
          messages.map((m) => (
            <div className={`chat-message ${m.sender_id === currentUserId ? 'own' : ''}`} key={m.id}>
              <span className="chat-sender">{m.sender_name || 'Unknown'}</span>
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

      {canSend ? (
        <form className="chat-input-row" onSubmit={handleSubmit}>
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
