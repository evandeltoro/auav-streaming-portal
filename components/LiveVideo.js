'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import {
  Camera,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { LIVEKIT_URL } from '../lib/supabase/config';

// The field camera (OBS via WHIP ingress) joins the room too, as identity
// `obs-{inspectionId}` -- see lib/livekit/ingress.js. It's the broadcaster,
// not a viewer, so it's excluded from the "who's watching" list.
function isViewerIdentity(identity) {
  return !!identity && !identity.startsWith('obs-');
}

function isFieldCameraIdentity(identity) {
  return !!identity && identity.startsWith('obs-');
}

function formatElapsed(from) {
  if (!from) return '';
  const secs = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const QUALITY_LABEL = { excellent: 'Excellent', good: 'Good', poor: 'Poor', unknown: 'Unknown' };
const QUALITY_CLASS = { excellent: 'q-excellent', good: 'q-good', poor: 'q-poor', unknown: 'q-unknown' };

export default function LiveVideo({ room, inspectionId, wentLiveAt }) {
  const videoRef = useRef(null);
  const roomRef = useRef(null);
  const containerRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // connecting | waiting | live | offline | error
  const [errorMsg, setErrorMsg] = useState('');
  const [viewers, setViewers] = useState([]); // [{ identity, name, joinedAt }]
  const [, setTick] = useState(0); // forces a re-render every second so elapsed times update
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [muted, setMuted] = useState(true);
  const [myQuality, setMyQuality] = useState('unknown');
  const [cameraQuality, setCameraQuality] = useState('unknown');
  const [snapping, setSnapping] = useState(false);
  const [snapMsg, setSnapMsg] = useState('');
  const [retryKey, setRetryKey] = useState(0); // bump to force a video-only reconnect

  // Reconnects just this LiveKit video room -- leaves RadioPanel (a sibling
  // component, separate room) completely untouched. A full page reload would
  // remount everything, including RadioPanel, which drops voice comms. This
  // gives staff/clients a way to resync the video feed without kicking
  // anyone off the radio.
  function refreshStream() {
    setStatus('connecting');
    setErrorMsg('');
    setViewers([]);
    setRetryKey((k) => k + 1);
  }

  // Track fullscreen state from the browser itself (not just our own toggle
  // calls) so the icon stays correct if the viewer exits via Esc or a
  // browser control instead of our button.
  useEffect(() => {
    function handleFsChange() {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    }
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Same idea for Picture-in-Picture -- it can be exited from the OS-level
  // floating window itself, not just our button.
  useEffect(() => {
    const v = videoRef.current;
    function handleEnter() {
      setIsPip(true);
    }
    function handleLeave() {
      setIsPip(false);
    }
    v?.addEventListener('enterpictureinpicture', handleEnter);
    v?.addEventListener('leavepictureinpicture', handleLeave);
    return () => {
      v?.removeEventListener('enterpictureinpicture', handleEnter);
      v?.removeEventListener('leavepictureinpicture', handleLeave);
    };
  }, []);

  function toggleFullscreen() {
    const isCurrentlyFullscreen = document.fullscreenElement || document.webkitFullscreenElement;

    if (isCurrentlyFullscreen) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }

    const el = containerRef.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen();
    } else if (el?.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (videoRef.current?.webkitEnterFullscreen) {
      // iOS Safari doesn't support fullscreening arbitrary elements --
      // only the <video> tag itself supports native fullscreen there.
      videoRef.current.webkitEnterFullscreen();
    }
  }

  async function togglePip() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current?.requestPictureInPicture) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // Not supported in this browser, or blocked -- button just no-ops.
    }
  }

  async function handleSnapshot() {
    if (!videoRef.current || snapping) return;
    setSnapping(true);
    setSnapMsg('');

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      const res = await fetch(`/api/inspections/${inspectionId}/messages/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to capture snapshot');

      setSnapMsg('Sent to chat');
    } catch (err) {
      setSnapMsg(err.message);
    } finally {
      setSnapping(false);
      setTimeout(() => setSnapMsg(''), 2500);
    }
  }

  useEffect(() => {
    let cancelled = false;

    function syncViewers(lkRoom) {
      const list = [];
      lkRoom.remoteParticipants.forEach((p) => {
        if (isViewerIdentity(p.identity)) {
          list.push({ identity: p.identity, name: p.name || p.identity, joinedAt: p.joinedAt });
        }
      });
      setViewers(list);
    }

    // Reports the field camera's connection quality to the server so staff
    // get a stored history instead of relying on someone's manual notes --
    // LiveKit computes this from the publisher's real uplink, so every
    // viewer sees (and can report) the same value.
    function reportHealth(quality, identity) {
      fetch(`/api/inspections/${inspectionId}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality, participantIdentity: identity }),
      }).catch(() => {
        // best-effort -- a dropped health ping shouldn't disrupt viewing
      });
    }

    async function connect() {
      try {
        const res = await fetch(`/api/livekit-token?room=${encodeURIComponent(room)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to get a viewing token');
        }

        if (cancelled) return;

        const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = lkRoom;

        lkRoom.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
            setStatus('live');
          } else if (track.kind === Track.Kind.Audio) {
            track.attach();
          }
        });

        lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => track.detach());
        lkRoom.on(RoomEvent.Disconnected, () => setStatus('offline'));
        lkRoom.on(RoomEvent.ParticipantConnected, () => syncViewers(lkRoom));
        lkRoom.on(RoomEvent.ParticipantDisconnected, () => syncViewers(lkRoom));

        lkRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
          const identity = participant?.identity;
          if (!identity) return;
          if (participant.isLocal) {
            setMyQuality(quality);
          } else if (isFieldCameraIdentity(identity)) {
            setCameraQuality(quality);
            reportHealth(quality, identity);
          }
        });

        setStatus('waiting');
        await lkRoom.connect(LIVEKIT_URL, data.token);
        syncViewers(lkRoom);
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err.message);
        }
      }
    }

    connect();
    const interval = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      roomRef.current?.disconnect();
    };
  }, [room, inspectionId, retryKey]);

  const pillMap = {
    connecting: { cls: 'waiting', label: 'Connecting...' },
    waiting: { cls: 'waiting', label: 'Waiting for stream to start' },
    live: { cls: 'live', label: 'Live' },
    offline: { cls: 'offline', label: 'Stream ended' },
    error: { cls: 'offline', label: errorMsg || 'Connection error' },
  };
  const pill = pillMap[status];
  const liveElapsed = status === 'live' && wentLiveAt ? formatElapsed(new Date(wentLiveAt)) : null;

  return (
    <div className="stream-layout">
      <div>
        <div className="video-box" ref={containerRef}>
          <video ref={videoRef} autoPlay playsInline muted={muted} />
          {status === 'live' && (
            <img src="/auav-logo.png" alt="AUAV" className="video-watermark" />
          )}
          {(status === 'connecting' || status === 'waiting') && (
            <div className="video-loading">
              <div className="ring" />
              <span>{pillMap[status].label}</span>
            </div>
          )}

          {status === 'live' && (
            <div className="video-top-bar">
              {liveElapsed && <span className="live-elapsed-badge">LIVE {liveElapsed}</span>}
              <div className="quality-badges" title={`Your connection: ${QUALITY_LABEL[myQuality]} · Field camera: ${QUALITY_LABEL[cameraQuality]}`}>
                <span className={`quality-chip ${QUALITY_CLASS[myQuality]}`}>You: {QUALITY_LABEL[myQuality]}</span>
                <span className={`quality-chip ${QUALITY_CLASS[cameraQuality]}`}>Camera: {QUALITY_LABEL[cameraQuality]}</span>
              </div>
            </div>
          )}

          {status === 'live' && muted && (
            <button type="button" className="unmute-overlay" onClick={() => setMuted(false)}>
              <VolumeX size={16} /> Tap to unmute
            </button>
          )}

          {status === 'live' && (
            <div className="video-controls-row">
              <button
                type="button"
                className="video-control-btn"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                className="video-control-btn"
                onClick={togglePip}
                aria-label={isPip ? 'Exit picture-in-picture' : 'Picture-in-picture'}
              >
                <PictureInPicture2 size={16} />
              </button>
              <button
                type="button"
                className="video-control-btn"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button
                type="button"
                className="video-control-btn"
                onClick={handleSnapshot}
                disabled={snapping}
                aria-label="Capture snapshot to chat"
              >
                <Camera size={16} />
              </button>
              {snapMsg && <span className="snap-msg">{snapMsg}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className={`status-pill ${pill.cls}`}>
            <span className="status-dot" />
            {pill.label}
          </div>
          <button
            type="button"
            className="small-btn"
            onClick={refreshStream}
            disabled={status === 'connecting'}
            title="Reconnect the video feed without dropping voice comms"
          >
            <RefreshCw size={14} /> Refresh Stream
          </button>
        </div>
      </div>

      <aside className="viewer-panel">
        <div className="viewer-panel-title">Watching now ({viewers.length})</div>
        {viewers.length === 0 ? (
          <div className="viewer-empty">No one else is watching yet.</div>
        ) : (
          viewers.map((v) => (
            <div className="viewer-row" key={v.identity}>
              <span>{v.name}</span>
              <span>{formatElapsed(v.joinedAt)}</span>
            </div>
          ))
        )}
      </aside>
    </div>
  );
}
