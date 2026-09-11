import { Play } from 'lucide-react';

// The practice inspection has no real LiveKit ingress behind it (see the
// is_demo branch in app/inspection/[id]/page.js) -- this is a clearly
// labeled animated placeholder, not a recording of a real job, so nobody
// mistakes it for actual drone footage. Swappable for a real looping clip
// later: replace this component's contents with a
// <video autoPlay loop muted playsInline src="/demo-loop.mp4" /> and the
// rest of the page (data-tour-id, layout) doesn't need to change.
export default function DemoVideo() {
  return (
    <div className="video-box demo-video" data-tour-id="demo-video">
      <div className="demo-video-scan" />
      <div className="demo-video-badge">
        <span className="demo-video-dot" />
        PRACTICE FEED
      </div>
      <div className="demo-video-center">
        <Play size={40} strokeWidth={1.5} />
        <div>This is where live drone video appears during a real inspection.</div>
      </div>
    </div>
  );
}
