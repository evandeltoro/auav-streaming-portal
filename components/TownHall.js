'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { Mic, MicOff, PhoneOff, Users, Video as VideoIcon, VideoOff } from 'lucide-react';
import { LIVEKIT_URL } from '../lib/supabase/config';

// Standing multi-party video room, one per client company. Everyone
// registered under that company (plus staff) can drop in any time -- this
// is deliberately not scoped to a specific inspection, unlike RadioPanel.
// Tracks are attached straight into the DOM (same pattern as RadioPanel /
// LiveVideo) rather than kept in React state, since LiveKit's attach/detach
// already returns/owns the media element.
export default function TownHall({ companyId, companyName }) {
  const gridRef = useRef(null);
  const roomRef = useRef(null);
  const tilesRef = useRef(new Map()); // identity -> tile wrapper element
  const audioElsRef = useRef(new Map()); // track.sid -> audio element
  const [status, setStatus] = useState('connecting'); // connecting | connected | error | ended
  const [errorMsg, setErrorMsg] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [count, setCount] = useState(1);
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

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
      setInputDevices(devices.filter((d) => d.kind === 'audioinput'));
      if (outputSupported) setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
    } catch {
      // labels populate once mic/cam permission is granted -- already the
      // case by the time this runs, but harmless if it silently no-ops.
    }
  }

  function tileFor(participant) {
    let tile = tilesRef.current.get(participant.identity);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'conference-tile';
      const tag = document.createElement('span');
      tag.className = 'conference-name-tag';
      tag.textContent = participant.name || 'Someone';
      tile.appendChild(tag);
      gridRef.current?.appendChild(tile);
      tilesRef.current.set(participant.identity, tile);
    }
    return tile;
  }

  function attachVideo(track, participant) {
    const tile = tileFor(participant);
    const el = track.attach();
    el.className = 'conference-video';
    tile.insertBefore(el, tile.firstChild);
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

  function removeParticipantTile(participant) {
    const tile = tilesRef.current.get(participant.identity);
    if (tile) {
      tile.remove();
      tilesRef.current.delete(participant.identity);
    }
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
          if (track.kind === Track.Kind.Video) attachVideo(track, participant);
          else attachAudio(track);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => detachTrack(track));
        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          removeParticipantTile(participant);
          setCount(room.remoteParticipants.size + 1);
        });
        room.on(RoomEvent.ParticipantConnected, () => setCount(room.remoteParticipants.size + 1));
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) setStatus('ended');
        });

        await room.connect(LIVEKIT_URL, data.token);
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);

        room.localParticipant.videoTrackPublications.forEach((pub) => {
          if (pub.track) attachVideo(pub.track, { identity: 'you', name: 'You' });
        });

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
      tilesRef.current.forEach((el) => el.remove());
      tilesRef.current.clear();
      audioElsRef.current.forEach((el) => el.remove());
      audioElsRef.current.clear();
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
