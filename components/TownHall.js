'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { Mic, MicOff, MonitorPlay, PhoneOff, Users, Video as VideoIcon, VideoOff, X } from 'lucide-react';
import { LIVEKIT_URL } from '../lib/supabase/config';
import { createClient } from '../lib/supabase/client';
import { filterRegularDevices } from '../lib/audioDevices';
import LiveVideo from './LiveVideo';

const STATUS_LABEL = { scheduled: 'Scheduled', live: 'LIVE', completed: 'Completed', archived: 'Archived' };

// How many remote video feeds get decoded at once, no matter how many
// people are actually in the room. Audio is always subscribed for everyone
// (cheap -- tens of kbps each), but video is expensive to decode client
// side, so only the current active speaker(s) plus anyone pinned actually
// get a live video feed. Everyone else shows as a name tile that lights up
// when they're talking. This is what keeps a 15-20+ person room usable
// instead of asking every browser to decode a video stream per participant.
const MAX_VIDEO_TILES = 4;

function initials(name) {
  if (!name) return '?';
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

// Standing multi-party video room, one per client company. Everyone
// registered under that company (plus staff) can drop in any time -- this
// is deliberately not scoped to a specific inspection, unlike RadioPanel.
// Tracks are attached straight into the DOM (same pattern as RadioPanel /
// LiveVideo) rather than kept in React state, since LiveKit's attach/detach
// already returns/owns the media element.
export default function TownHall({
  companyId,
  companyName,
  inspections = [],
  initialNowPlayingId = null,
  initialNowPlayingBy = null,
  initialNowPlayingByName = null,
  currentUserId = null,
  currentUserName = '',
}) {
  const gridRef = useRef(null);
  const roomRef = useRef(null);
  const tilesRef = useRef(new Map()); // identity -> { wrapper, avatar, videoEl }
  const audioElsRef = useRef(new Map()); // track.sid -> audio element
  const pinnedRef = useRef(null); // identity currently pinned, or null
  const activeSpeakersRef = useRef(new Set()); // identities currently speaking ('you' for local)
  const pickChannelRef = useRef(null); // realtime channel, also used for playback broadcast
  const presenterVideoRef = useRef(null); // <video> element, role depends on isPresenter
  const heartbeatRef = useRef(null); // presenter's periodic sync-position interval
  const [status, setStatus] = useState('connecting'); // connecting | connected | error | ended
  const [errorMsg, setErrorMsg] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [count, setCount] = useState(1);
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [selectedVideo, setSelectedVideo] = useState('');
  const [nowPlayingId, setNowPlayingId] = useState(initialNowPlayingId);
  const [nowPlayingBy, setNowPlayingBy] = useState(initialNowPlayingBy);
  const [nowPlayingByName, setNowPlayingByName] = useState(initialNowPlayingByName);
  const [pickerValue, setPickerValue] = useState('');
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recordingMsg, setRecordingMsg] = useState('');

  const isPresenter = Boolean(nowPlayingId) && Boolean(currentUserId) && nowPlayingBy === currentUserId;

  // `inspections` (the prop) is a one-time snapshot from whenever this
  // page happened to load -- if someone joined the room before a stream
  // went live, their copy stays frozen at status: 'scheduled' forever
  // unless something updates it. That's the bug behind "I picked a live
  // stream to share and some people just saw a stuck/wrong message" --
  // the *pointer* (nowPlayingId) was syncing fine, but the *data it
  // pointed at* wasn't. Mirrored into state so the realtime subscription
  // below can patch it in place.
  const [inspectionsList, setInspectionsList] = useState(inspections);
  const nowPlaying = inspectionsList.find((i) => i.id === nowPlayingId) || null;

  // Two things kept in sync here, both via postgres_changes: which
  // inspection is picked (companies.townhall_now_playing_id) and that
  // inspection's own live data (status / went_live_at / room name) --
  // same pattern ChatBox.js uses for messages, just watching UPDATE
  // instead of INSERT.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`townhall-pick-${companyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
        (payload) => {
          setNowPlayingId(payload.new.townhall_now_playing_id);
          setNowPlayingBy(payload.new.townhall_now_playing_by);
          setNowPlayingByName(payload.new.townhall_now_playing_by_name);
        }
      )
      // Playback sync for shared recordings -- pure pub/sub over the same
      // socket, not a DB write, since play/pause/seek can fire many times a
      // minute and none of it needs to persist. Only the presenter's own
      // client ever sends these (see attachPresenterEvents below); everyone
      // else just applies whatever comes in.
      .on('broadcast', { event: 'playback' }, ({ payload }) => applyIncomingPlayback(payload))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inspections', filter: `company_id=eq.${companyId}` },
        (payload) => {
          setInspectionsList((prev) => prev.map((i) => (i.id === payload.new.id ? { ...i, ...payload.new } : i)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inspections', filter: `company_id=eq.${companyId}` },
        (payload) => {
          setInspectionsList((prev) => (prev.some((i) => i.id === payload.new.id) ? prev : [payload.new, ...prev]));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'inspections', filter: `company_id=eq.${companyId}` },
        (payload) => {
          setInspectionsList((prev) => prev.filter((i) => i.id !== payload.old.id));
        }
      )
      .subscribe();
    pickChannelRef.current = channel;
    return () => {
      pickChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  // Applies a play/pause/seek/sync event that came from the presenter's
  // client to this viewer's own <video> element. Never runs for the
  // presenter themselves (self broadcast is off by default on Supabase
  // channels), so there's no feedback loop to guard against here.
  function applyIncomingPlayback(payload) {
    const el = presenterVideoRef.current;
    if (!el || !payload) return;
    const latencyAdjust = payload.action === 'play' || payload.action === 'sync' ? (Date.now() - payload.sentAt) / 1000 : 0;
    const target = Math.max(0, (payload.time || 0) + Math.max(0, latencyAdjust));
    const drift = Math.abs(el.currentTime - target);
    if (payload.action === 'sync') {
      // Heartbeat, mainly for viewers who joined mid-playback -- only
      // correct if actually drifted, so it doesn't cause visible jitter
      // for everyone else who's already in sync.
      if (drift > 1.5) el.currentTime = target;
      if (payload.playing && el.paused) el.play().catch(() => {});
      if (!payload.playing && !el.paused) el.pause();
      return;
    }
    if (drift > 0.5) el.currentTime = target;
    if (payload.action === 'play') el.play().catch(() => {});
    if (payload.action === 'pause') el.pause();
    if (payload.action === 'seek') {
      if (payload.playing) el.play().catch(() => {});
      else el.pause();
    }
  }

  // Presenter-side: wires the shared <video> element's own play/pause/seeked
  // events to broadcast out over the channel, plus a low-frequency heartbeat
  // so anyone who joins mid-playback catches up within a few seconds instead
  // of staying stuck at 0:00 until the next real event.
  function attachPresenterEvents(el) {
    function send(action, extra) {
      pickChannelRef.current?.send({
        type: 'broadcast',
        event: 'playback',
        payload: { action, time: el.currentTime, sentAt: Date.now(), ...extra },
      });
    }
    const onPlay = () => send('play');
    const onPause = () => send('pause');
    const onSeeked = () => send('seek', { playing: !el.paused });
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('seeked', onSeeked);

    clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      send('sync', { playing: !el.paused });
    }, 5000);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('seeked', onSeeked);
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };
  }

  useEffect(() => {
    if (!isPresenter) return;
    const el = presenterVideoRef.current;
    if (!el) return;
    return attachPresenterEvents(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresenter, recordingUrl]);

  useEffect(() => {
    setRecordingUrl('');
    setRecordingMsg('');
    if (!nowPlaying || nowPlaying.status === 'live' || nowPlaying.status === 'scheduled') return;
    let cancelled = false;
    fetch(`/api/inspections/${nowPlaying.id}/recording-url`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setRecordingMsg(data.error || 'Recording not available');
          return;
        }
        setRecordingUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setRecordingMsg('Failed to load recording');
      });
    return () => {
      cancelled = true;
    };
  }, [nowPlaying?.id, nowPlaying?.status]);

  // Someone else is already presenting -- interrupting them (to share a
  // different stream, or to just stop their share outright) needs a
  // confirmation, same as Teams' "X is presenting, take control?" prompt.
  // Deliberately a plain confirm dialog rather than a request/accept flow:
  // gets 90% of the value (no accidental hijacking) for a fraction of the
  // complexity of a pending-request/timeout/disconnect state machine.
  function confirmTakeoverIfNeeded(actionLabel) {
    if (!nowPlayingId || !nowPlayingBy || nowPlayingBy === currentUserId) return true;
    return window.confirm(`${nowPlayingByName || 'Someone'} is currently sharing ${nowPlaying?.site || 'a stream'}. ${actionLabel}?`);
  }

  async function pickStream(id) {
    if (id && !confirmTakeoverIfNeeded('Take over')) return;
    if (!id && !confirmTakeoverIfNeeded('Stop their share')) return;
    setPickError('');
    setPickBusy(true);
    const res = await fetch(`/api/companies/${companyId}/townhall-now-playing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspection_id: id || null }),
    });
    const data = await res.json();
    setPickBusy(false);
    if (!res.ok) {
      setPickError(data.error || 'Failed to update the shared stream');
      return;
    }
    setNowPlayingId(id || null);
    setNowPlayingBy(id ? currentUserId : null);
    setNowPlayingByName(id ? currentUserName : null);
    setPickerValue('');
  }

  // Same device-switching support as RadioPanel -- a Sonetics comHub puck
  // (or any Bluetooth/USB headset) shows up here as just another input/
  // output device once it's paired at the OS level. No special-casing
  // needed for Bluetooth; the browser exposes it through the same
  // enumerateDevices() list as everything else.
  const outputSupported =
    typeof window !== 'undefined' &&
    typeof HTMLMediaElement !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype;

  async function refreshDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(filterRegularDevices(devices.filter((d) => d.kind === 'audioinput')));
      if (outputSupported) setOutputDevices(filterRegularDevices(devices.filter((d) => d.kind === 'audiooutput')));
      // Covers HDMI capture cards (Cam Link, Elgato, etc.) showing up as a
      // plain USB video-capture device, same as the built-in webcam --
      // whichever one is picked here becomes what everyone else in the
      // room sees for "You".
      setVideoDevices(filterRegularDevices(devices.filter((d) => d.kind === 'videoinput')));
    } catch {
      // labels populate once mic/cam permission is granted -- already the
      // case by the time this runs, but harmless if it silently no-ops.
    }
  }

  // Every participant gets a tile as soon as they're known about, whether
  // or not their video is currently subscribed -- it starts as an avatar
  // (initials) and swaps to a <video> element only while their feed is
  // actually subscribed. Clicking a remote tile pins/unpins it.
  function tileFor(identity, name) {
    let tile = tilesRef.current.get(identity);
    if (!tile) {
      const wrapper = document.createElement('div');
      wrapper.className = 'conference-tile';

      const avatar = document.createElement('div');
      avatar.className = 'conference-avatar';
      avatar.textContent = initials(name);
      wrapper.appendChild(avatar);

      const tag = document.createElement('span');
      tag.className = 'conference-name-tag';
      tag.textContent = name || 'Someone';
      wrapper.appendChild(tag);

      if (identity !== 'you') {
        wrapper.classList.add('conference-tile-pinnable');
        wrapper.title = 'Click to pin/unpin their video';
        wrapper.addEventListener('click', () => togglePin(identity));
      }

      gridRef.current?.appendChild(wrapper);
      tile = { wrapper, avatar, tag, videoEl: null };
      tilesRef.current.set(identity, tile);
    } else if (name) {
      tile.tag.textContent = name;
      tile.avatar.textContent = initials(name);
    }
    return tile;
  }

  function setSpeaking(identity, speaking) {
    tilesRef.current.get(identity)?.wrapper.classList.toggle('conference-tile-speaking', speaking);
  }

  function setPinnedVisual(identity, pinned) {
    tilesRef.current.get(identity)?.wrapper.classList.toggle('conference-tile-pinned', pinned);
  }

  function togglePin(identity) {
    if (pinnedRef.current === identity) {
      setPinnedVisual(identity, false);
      pinnedRef.current = null;
    } else {
      if (pinnedRef.current) setPinnedVisual(pinnedRef.current, false);
      pinnedRef.current = identity;
      setPinnedVisual(identity, true);
    }
    applyVideoPolicy();
  }

  function attachVideo(track, identity, name) {
    const tile = tileFor(identity, name);
    const el = track.attach();
    el.className = 'conference-video';
    tile.wrapper.insertBefore(el, tile.avatar);
    tile.avatar.style.display = 'none';
    tile.videoEl = el;
  }

  function detachVideoTile(identity) {
    const tile = tilesRef.current.get(identity);
    if (tile?.videoEl) {
      tile.videoEl.remove();
      tile.videoEl = null;
      tile.avatar.style.display = '';
    }
  }

  function attachAudio(track) {
    const el = track.attach();
    el.style.display = 'none';
    document.body.appendChild(el);
    if (outputSupported && selectedOutput) {
      el.setSinkId(selectedOutput).catch(() => {});
    }
    audioElsRef.current.set(track.sid, el);
  }

  function detachTrack(track) {
    if (track.kind === Track.Kind.Audio) {
      const el = audioElsRef.current.get(track.sid);
      if (el) {
        track.detach(el);
        el.remove();
        audioElsRef.current.delete(track.sid);
      }
    } else {
      track.detach().forEach((el) => el.remove());
    }
  }

  function removeParticipantTile(identity) {
    const tile = tilesRef.current.get(identity);
    if (tile) {
      tile.wrapper.remove();
      tilesRef.current.delete(identity);
    }
    if (pinnedRef.current === identity) pinnedRef.current = null;
    activeSpeakersRef.current.delete(identity);
  }

  // Decides, out of everyone currently in the room, whose video actually
  // gets subscribed: the pinned participant (if any) always gets a slot,
  // the rest are filled by current active speakers, up to MAX_VIDEO_TILES
  // total. Re-run any time speakers change, someone (un)pins, or a new
  // video track shows up. Local video never consumes a slot -- it's
  // rendered from the local camera, not subscribed over the network.
  function applyVideoPolicy() {
    const room = roomRef.current;
    if (!room) return;

    const wanted = new Set();
    if (pinnedRef.current && pinnedRef.current !== 'you') wanted.add(pinnedRef.current);
    for (const identity of activeSpeakersRef.current) {
      if (identity === 'you') continue;
      if (wanted.size >= MAX_VIDEO_TILES) break;
      wanted.add(identity);
    }

    room.remoteParticipants.forEach((participant) => {
      participant.videoTrackPublications.forEach((pub) => {
        const shouldSubscribe = wanted.has(participant.identity);
        if (pub.isSubscribed !== shouldSubscribe) {
          pub.setSubscribed(shouldSubscribe);
        }
      });
    });
  }

  function subscribeAllAudio(participant) {
    participant.audioTrackPublications.forEach((pub) => {
      if (!pub.isSubscribed) pub.setSubscribed(true);
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function join() {
      setStatus('connecting');
      setErrorMsg('');

      try {
        const res = await fetch(`/api/companies/${companyId}/townhall-token`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to get a room token');
        if (cancelled) return;

        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind === Track.Kind.Video) attachVideo(track, participant.identity, participant.name);
          else attachAudio(track);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          if (track.kind === Track.Kind.Video) detachVideoTile(participant.identity);
          detachTrack(track);
        });
        // Audio always subscribes the moment it's published -- comms stay
        // on for everyone regardless of room size. Video is left to
        // applyVideoPolicy() to decide.
        room.on(RoomEvent.TrackPublished, (publication) => {
          if (publication.kind === Track.Kind.Audio) {
            publication.setSubscribed(true);
          } else {
            applyVideoPolicy();
          }
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          activeSpeakersRef.current.forEach((identity) => setSpeaking(identity, false));
          const nextKeys = new Set(
            speakers.map((p) => (p.identity === room.localParticipant.identity ? 'you' : p.identity))
          );
          activeSpeakersRef.current = nextKeys;
          nextKeys.forEach((identity) => setSpeaking(identity, true));
          applyVideoPolicy();
        });
        room.on(RoomEvent.ParticipantConnected, (participant) => {
          tileFor(participant.identity, participant.name);
          setCount(room.remoteParticipants.size + 1);
        });
        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          removeParticipantTile(participant.identity);
          setCount(room.remoteParticipants.size + 1);
          applyVideoPolicy();
        });
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setStatus('ended');
        });

        // autoSubscribe: false -- video subscriptions are managed by hand
        // (applyVideoPolicy) instead of blindly pulling every stream.
        await room.connect(LIVEKIT_URL, data.token, { autoSubscribe: false });
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);

        room.localParticipant.videoTrackPublications.forEach((pub) => {
          if (pub.track) attachVideo(pub.track, 'you', 'You');
        });

        // Participants (and tracks) already in the room when we joined
        // don't replay as events -- walk the initial state once to create
        // their tiles and subscribe their audio, then let the video policy
        // decide who gets a live feed.
        room.remoteParticipants.forEach((participant) => {
          tileFor(participant.identity, participant.name);
          subscribeAllAudio(participant);
        });
        applyVideoPolicy();

        if (cancelled) {
          room.disconnect();
          return;
        }

        setCount(room.remoteParticipants.size + 1);
        setStatus('connected');
        await refreshDevices();
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err.message);
        }
      }
    }

    join();

    return () => {
      cancelled = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
      tilesRef.current.forEach((t) => t.wrapper.remove());
      tilesRef.current.clear();
      audioElsRef.current.forEach((el) => el.remove());
      audioElsRef.current.clear();
      pinnedRef.current = null;
      activeSpeakersRef.current = new Set();
    };
  }, [companyId]);

  async function toggleMic() {
    const next = !micOn;
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function toggleCam() {
    const next = !camOn;
    await roomRef.current?.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }

  function leave() {
    roomRef.current?.disconnect();
    setStatus('ended');
  }

  async function changeInput(deviceId) {
    setSelectedInput(deviceId);
    if (roomRef.current) await roomRef.current.switchActiveDevice('audioinput', deviceId);
  }

  async function changeOutput(deviceId) {
    setSelectedOutput(deviceId);
    if (roomRef.current) await roomRef.current.switchActiveDevice('audiooutput', deviceId);
    audioElsRef.current.forEach((el) => {
      if (outputSupported) el.setSinkId(deviceId).catch(() => {});
    });
  }

  // Swaps the camera source (built-in webcam, HDMI capture card, whatever's
  // plugged in) for the track already being published -- LiveKit replaces
  // the underlying media on the existing track rather than creating a new
  // one, so the local "You" tile keeps playing without any manual
  // re-attach here.
  async function changeVideo(deviceId) {
    setSelectedVideo(deviceId);
    if (roomRef.current) await roomRef.current.switchActiveDevice('videoinput', deviceId);
  }

  if (status === 'ended') {
    return (
      <div className="archive-empty">
        You left {companyName}'s town hall.{' '}
        <button type="button" className="small-btn go-live" onClick={() => window.location.reload()}>
          Rejoin
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div>
        <div className="error-text">{errorMsg}</div>
        <button type="button" className="small-btn go-live" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {status === 'connecting' && <div className="archive-empty">Joining {companyName}'s town hall...</div>}

      <div className="viewer-history" style={{ marginBottom: 14 }}>
        <div className="viewer-history-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MonitorPlay size={16} /> Pull Up a Stream
        </div>
        <div className="meta-line" style={{ marginBottom: 10 }}>
          Share a live or archived inspection with everyone in this room.
        </div>
        {inspectionsList.length === 0 ? (
          <div className="viewer-empty">No inspections for {companyName} yet.</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={pickerValue}
              onChange={(e) => setPickerValue(e.target.value)}
              style={{ marginBottom: 0, flex: 1, minWidth: 200 }}
            >
              <option value="">-- Choose an inspection --</option>
              {inspectionsList.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.site}
                  {i.asset ? ` (${i.asset})` : ''} -- {STATUS_LABEL[i.status] || i.status}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="small-btn go-live"
              disabled={!pickerValue || pickBusy}
              onClick={() => pickStream(pickerValue)}
            >
              {pickBusy && <span className="spinner dark" />} Show to Everyone
            </button>
            {nowPlaying && (
              <button type="button" className="small-btn end-live" disabled={pickBusy} onClick={() => pickStream(null)}>
                <X size={14} /> Stop Sharing
              </button>
            )}
          </div>
        )}
        {pickError && <div className="error-text">{pickError}</div>}
      </div>

      {nowPlaying && (
        <div className="card" style={{ marginBottom: 14, borderTopColor: 'var(--auav-orange, #f37021)' }}>
          <div className="viewer-history-title" style={{ marginBottom: 10 }}>
            Now sharing: {nowPlaying.site}
            {nowPlaying.asset ? ` -- ${nowPlaying.asset}` : ''}
          </div>
          {nowPlayingByName && (
            <div className="meta-line" style={{ marginBottom: 10 }}>
              {isPresenter ? 'You are' : nowPlayingByName + ' is'} sharing
              {nowPlaying.status !== 'live' ? ' -- only they control play, pause, and seek' : ''}
            </div>
          )}
          {nowPlaying.status === 'live' ? (
            <LiveVideo room={nowPlaying.livekit_room_name} inspectionId={nowPlaying.id} wentLiveAt={nowPlaying.went_live_at} />
          ) : nowPlaying.status === 'scheduled' ? (
            <div className="archive-empty">Not live yet -- this will appear automatically once the field camera goes live.</div>
          ) : recordingUrl ? (
            <div className="video-box">
              {/* Non-presenters get no native controls at all -- no scrub
                  bar, no play/pause -- so the only way playback moves for
                  them is a broadcast from whoever picked the stream. */}
              <video ref={presenterVideoRef} src={recordingUrl} controls={isPresenter} playsInline />
            </div>
          ) : (
            <div className="archive-empty">{recordingMsg || 'Loading recording...'}</div>
          )}
        </div>
      )}

      <div className="conference-grid" ref={gridRef} />
      {status === 'connected' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className="small-btn" onClick={toggleMic}>
            {micOn ? <Mic size={14} /> : <MicOff size={14} />}
            {micOn ? ' Mute' : ' Unmute'}
          </button>
          <button type="button" className="small-btn" onClick={toggleCam}>
            {camOn ? <VideoIcon size={14} /> : <VideoOff size={14} />}
            {camOn ? ' Stop Video' : ' Start Video'}
          </button>
          <button type="button" className="small-btn end-live" onClick={leave}>
            <PhoneOff size={14} /> Leave
          </button>
          <span className="meta-line" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Users size={14} /> {count} in the room
          </span>
          <span className="meta-line">Click a tile to pin their video</span>
        </div>
      )}
      {status === 'connected' && videoDevices.length > 0 && (
        <div className="cred-field">
          <label>Camera (built-in webcam, HDMI capture card, whatever's plugged in)</label>
          <select value={selectedVideo} onChange={(e) => changeVideo(e.target.value)}>
            <option value="">System default</option>
            {videoDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Camera'}
              </option>
            ))}
          </select>
        </div>
      )}
      {status === 'connected' && inputDevices.length > 0 && (
        <div className="cred-field">
          <label>Microphone (select the comHub puck or any paired Bluetooth mic)</label>
          <select value={selectedInput} onChange={(e) => changeInput(e.target.value)}>
            <option value="">System default</option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Microphone'}
              </option>
            ))}
          </select>
        </div>
      )}
      {status === 'connected' && outputSupported && outputDevices.length > 0 && (
        <div className="cred-field">
          <label>Speaker output (select the comHub puck or any paired Bluetooth speaker)</label>
          <select value={selectedOutput} onChange={(e) => changeOutput(e.target.value)}>
            <option value="">System default</option>
            {outputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Speaker'}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
