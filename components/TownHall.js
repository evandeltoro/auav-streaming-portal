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
export default function TownHall({ companyId, companyName, inspections = [], initialNowPlayingId = null }) {
  const gridRef = useRef(null);
  const roomRef = useRef(null);
  const tilesRef = useRef(new Map()); // identity -> { wrapper, avatar, videoEl }
  const audioElsRef = useRef(new Map()); // track.sid -> audio element
  const pinnedRef = useRef(null); // identity currently pinned, or null
  const activeSpeakersRef = useRef(new Set()); // identities currently speaking ('you' for local)
  const [status, setStatus] = useState('connecting'); // connecting | connected | error | ended
  const [errorMsg, setErrorMsg] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [count, setCount] = useState(1);
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [nowPlayingId, setNowPlayingId] = useState(initialNowPlayingId);
  const [pickerValue, setPickerValue] = useState('');
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recordingMsg, setRecordingMsg] = useState('');

  const nowPlaying = inspections.find((i) => i.id === nowPlayingId) || null;

  // Persisted on companies.townhall_now_playing_id (set via PATCH below) so
  // this syncs to everyone currently in the room AND to anyone who joins
  // the town hall later -- same postgres_changes realtime pattern ChatBox.js
  // uses for messages, just watching UPDATE on companies instead of INSERT
  // on messages.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`townhall-pick-${companyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
        (payload) => setNowPlayingId(payload.new.townhall_now_playing_id)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

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

  async function pickStream(id) {
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
        {inspections.length === 0 ? (
          <div className="viewer-empty">No inspections for {companyName} yet.</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={pickerValue}
              onChange={(e) => setPickerValue(e.target.value)}
              style={{ marginBottom: 0, flex: 1, minWidth: 200 }}
            >
              <option value="">-- Choose an inspection --</option>
              {inspections.map((i) => (
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
          {nowPlaying.status === 'live' ? (
            <LiveVideo room={nowPlaying.livekit_room_name} inspectionId={nowPlaying.id} wentLiveAt={nowPlaying.went_live_at} />
          ) : recordingUrl ? (
            <div className="video-box">
              <video src={recordingUrl} controls playsInline />
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
      {status === 'connected' && inputDevices.length > 1 && (
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
      {status === 'connected' && outputSupported && outputDevices.length > 1 && (
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
