'use client';

import StepTour from './StepTour';

// In-stream counterpart to OnboardingTour -- that one only ever points at
// the sidebar, so it can explain Town Hall or Assets exist but not what it
// actually feels like to be locked out of voice comms, or to send a chat
// message during a live job. This walks through the real mechanics on the
// practice inspection itself.
const STEPS = [
  {
    kind: 'welcome',
    title: 'Part 2: Practice Inspection',
    body: 'Nothing here is a real job -- use this any time to get comfortable with the controls before your first real inspection. About a minute.',
  },
  {
    target: 'demo-video',
    optional: true,
    title: 'The video feed',
    body: 'This is where live drone video appears during a real inspection. On a real job this updates live as the pilot streams from the field.',
  },
  {
    target: 'demo-claim-surveyor',
    title: 'Only one surveyor at a time',
    body: 'On a real job, staff assign exactly one client as the surveyor -- only that person can join voice comms with the field inspector. Click "Become the Surveyor" to claim that seat for this practice run.',
  },
  {
    target: 'demo-radio-panel',
    title: 'Voice comms',
    body: 'On a real job, this panel is only ever visible to the assigned surveyor and the field inspector -- everyone else doesn’t see it at all. It’s always shown here so you can try "Join Voice Comms" both before and after claiming the seat above, and see the real rejection message unauthorized users get. Once connected, you can mute, leave, and pick which microphone and speaker to use.',
  },
  {
    target: 'demo-chat-input',
    optional: true,
    title: 'Chat',
    body: 'Everyone watching an inspection can post here -- questions, notes, anything worth flagging to the team in real time. Try sending a message.',
  },
  {
    kind: 'done',
    title: 'That’s everything',
    body: 'That’s the whole walkthrough, both parts. You can come back to this practice inspection any time from the Tutorials menu in the sidebar.',
  },
];

export default function DemoTour({ active, onFinished }) {
  return <StepTour active={active} steps={STEPS} onFinished={onFinished} finishLabel="Done" />;
}
