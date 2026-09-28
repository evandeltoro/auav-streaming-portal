'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { Mic, MicOff, PhoneOff, Radio as RadioIcon } from 'lucide-react';
import { LIVEKIT_URL } from '../lib/supabase/config';
import { filterRegularDevices } from '../lib/audioDevices';
import { useCommsMute } from './CommsMuteContext';

// Voice comms between the assigned surveyor and the field inspector's
// streaming laptop, over the puck's Channel 2. This connects to a room
// completely separate from the video stream (`{room}-radio`), so it's
// available independent of whether the inspection is live, and it never
// touches the recorded egress -- the egress only ever composites the main
// video room, and this audio was never published there in the first place.
export default function RadioPanel({ inspectionId, heading = 'Voice Comms', subheading }) {
  const roomRef = useRef(null);
  const audioContainerRef = useRef(null);
  const commsMute = useCommsMute();
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | error
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

  const outputSupported =
    typeof window !== 'undefined' &&
    typeof HTMLMediaElement !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype;

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      commsMute?.register(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(filterRegularDevices(devices.filter((d) => d.kind === 'audioinput')));
      if (outputSupported) {
        setOutputDevices(filterRegularDevices(devices.filter((d) => d.kind === 'audiooutput')));
      }
    } catch {
      // device labels just won't populate until permission is granted --
      // connect() will retry this once the mic is live.
    }
  }

  async function connect() {
    setStatus('connecting');
    setErrorMsg('');

    try {
      const res = await fetch(`/api/inspections/${inspectionId}/radio-token`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get a voice comms token');
      }

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        const el = track.attach();
        el.style.display = 'none';
        audioContainerRef.current?.appendChild(el);
        if (outputSupported && selectedOutput) {
          el.setSinkId(selectedOutput).catch(() => {});
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      room.on(RoomEvent.ParticipantConnected, () => setPeerCount(room.remoteParticipants.size));
      room.on(RoomEvent.ParticipantDisconnected, () => setPeerCount(room.remoteParticipants.size));
      room.on(RoomEvent.Disconnected, () => {
        setStatus('idle');
        setPeerCount(0);
      });

      await room.connect(LIVEKIT_URL, data.token);
      await room.localParticipant.setMicrophoneEnabled(true);

      setPeerCount(room.remoteParticipants.size);
      setStatus('connected');
      // Hand the mute toggle to the shared context -- lets LiveVideo mirror
      // a mute button inside .video-box, which is the only place a mute
      // control actually stays reachable once the video goes fullscreen.
      commsMute?.register(toggleMute, false);
      await refreshDevices();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
      roomRef.current?.disconnect();
      roomRef.current = null;
      commsMute?.register(null);
    }
  }

  function disconnect() {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus('idle');
    setPeerCount(0);
    commsMute?.register(null);
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    // Reads the mic's actual current state off the room instead of closing
    // over this render's `muted` -- this function gets handed to
    // CommsMuteContext once at connect() time and called again later from
    // LiveVideo's mirrored button, by which point a closure over `muted`
    // would be stale (React re-renders make a fresh toggleMute each time,
    // but only the original one ever got registered).
    const nextMuted = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    setMuted(nextMuted);
    commsMute?.setMuted(nextMuted);
  }

  async function changeInput(deviceId) {
    setSelectedInput(deviceId);
    if (roomRef.current) {
      await roomRef.current.switchActiveDevice('audioinput', deviceId);
    }
  }

  async function changeOutput(deviceId) {
    setSelectedOutput(deviceId);
    if (roomRef.current) {
      await roomRef.current.switchActiveDevice('audiooutput', deviceId);
    }
  }

  return (
    <div className="viewer-history" data-tour-id="demo-radio-panel">
      <div className="viewer-history-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <RadioIcon size={16} />
        {heading}
      </div>
      {/* Mode context (field radio / open demo / with inspector) used to be
         crammed into the title itself, which wrapped badly once this panel
         moved into the narrow sidebar column -- demoted to a small muted
         line so the title stays short but the context isn't lost. */}
      {subheading && (
        <div className="meta-line" style={{ marginTop: -8, marginBottom: 10 }}>
          {subheading}
        </div>
      )}

      <div ref={audioContainerRef} />

      {status === 'idle' && (
        <button type="button" className="small-btn go-live" onClick={connect}>
          Join Voice Comms
        </button>
      )}

      {status === 'connecting' && (
        <button type="button" className="small-btn go-live" disabled>
          <span className="spinner dark" />
          Connecting...
        </button>
      )}

      {status === 'connected' && (
        <div>
          <div className="meta-line" style={{ marginBottom: 10 }}>
            Connected -- {peerCount > 0 ? `${peerCount} other party on the line` : 'waiting for the other party to join'}
          </div>

          <div className="radio-panel-actions">
            <button type="button" className="small-btn" onClick={toggleMute}>
              {muted ? <MicOff size={14} /> : <Mic size={14} />}
              {muted ? ' Unmute' : ' Mute'}
            </button>
            <button type="button" className="small-btn end-live" onClick={disconnect}>
              <PhoneOff size={14} /> Leave Comms
            </button>
          </div>

          {inputDevices.length > 0 && (
            <div className="cred-field">
              <label title="Select the comHub puck here if it's paired">Input</label>
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

          {outputSupported && outputDevices.length > 0 && (
            <div className="cred-field">
              <label title="Select the comHub puck here to route into Channel 2">Output</label>
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
      )}

      {status === 'error' && (
        <div>
          <div className="error-text">{errorMsg}</div>
          <button type="button" className="small-btn go-live" onClick={connect}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
