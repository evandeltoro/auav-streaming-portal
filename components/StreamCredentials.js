'use client';

import { useState } from 'react';

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard permission denied -- field is still selectable/copyable by hand
    }
  }

  return (
    <div className="cred-field">
      <label>{label}</label>
      <div className="cred-row">
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="small-btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function StreamCredentials({ whipUrl, streamKey }) {
  return (
    <div className="cred-box">
      <div className="cred-title">OBS credentials for this inspection</div>
      <p className="cred-hint">
        In OBS: Settings → Stream → Service: <strong>Custom</strong>. Paste these in, then hit
        Start Streaming — this inspection will go live and start recording automatically.
      </p>
      <CopyField label="Server" value={whipUrl} />
      <CopyField label="Stream Key" value={streamKey} />
    </div>
  );
}
