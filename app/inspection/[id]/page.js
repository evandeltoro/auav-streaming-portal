import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import LiveVideo from '../../../components/LiveVideo';
import StreamCredentials from '../../../components/StreamCredentials';
import ViewerHistory from '../../../components/ViewerHistory';
import ChatBox from '../../../components/ChatBox';
import StreamHealthHistory from '../../../components/StreamHealthHistory';
import SurveyorAssign from '../../../components/SurveyorAssign';
import RadioPanel from '../../../components/RadioPanel';
import CommsModeToggle from '../../../components/CommsModeToggle';

export default async function InspectionDetailPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isStaff = profile?.role === 'admin' || profile?.role === 'inspector';

  const { data: inspection } = await supabase
    .from('inspections')
    .select('id, site, asset, pilot, inspection_date, inspection_type, status, livekit_room_name, went_live_at, company_id, surveyor_id, open_comms, companies(name)')
    .eq('id', id)
    .single();

  if (!inspection) {
    return (
      <div className="page-wrap">
        <div className="card">
          <div className="archive-empty">
            This inspection either doesn&apos;t exist or you don&apos;t have access to it.
          </div>
        </div>
      </div>
    );
  }

  let credentials = null;
  if (isStaff && (inspection.status === 'scheduled' || inspection.status === 'live')) {
    // stream_credentials is staff-only via RLS -- the anon/RLS-scoped
    // client already enforces that, no admin client needed here.
    const { data } = await supabase
      .from('stream_credentials')
      .select('whip_url, stream_key')
      .eq('inspection_id', inspection.id)
      .maybeSingle();
    credentials = data;
  }

  let recordingUrl = null;
  let recordingPending = false;

  if (inspection.status === 'completed' || inspection.status === 'archived') {
    // Row-level access was already enforced above by fetching `inspection`
    // through the RLS-scoped client -- if we got this far, this viewer is
    // allowed to see this inspection, so it's safe to fetch its recording.
    const { data: recording } = await supabase
      .from('recordings')
      .select('s3_key')
      .eq('inspection_id', inspection.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recording?.s3_key) {
      try {
        const admin = createAdminClient();
        const { data: signed } = await admin.storage
          .from('recordings')
          .createSignedUrl(recording.s3_key, 60 * 60);
        recordingUrl = signed?.signedUrl || null;
      } catch {
        // Service role key not configured yet -- degrade gracefully
        // instead of crashing the page.
        recordingUrl = null;
      }
    } else {
      recordingPending = true;
    }
  }

  // Staff-only persisted audit log of who watched this inspection and for
  // how long, populated by the LiveKit webhook (participant_joined/left).
  let viewerHistory = [];
  if (isStaff) {
    const { data } = await supabase
      .from('viewer_sessions')
      .select('id, display_name, participant_identity, joined_at, left_at')
      .eq('inspection_id', inspection.id)
      .order('joined_at', { ascending: false })
      .limit(50);
    viewerHistory = data || [];
  }

  // Chat history is readable any time (it's a log), but only sendable while
  // the inspection is live -- RLS on messages already scopes this to staff
  // or same-company clients, matching who can see the inspection at all.
  const { data: initialMessages } = await supabase
    .from('messages')
    .select('id, sender_id, sender_name, body, image_url, created_at')
    .eq('inspection_id', inspection.id)
    .order('created_at', { ascending: true })
    .limit(200);

  // Staff-only history of the field camera's reported connection quality --
  // populated client-side by viewers' browsers via LiveVideo's health pings.
  let healthSamples = [];
  if (isStaff) {
    const { data } = await supabase
      .from('stream_health_samples')
      .select('quality, sampled_at')
      .eq('inspection_id', inspection.id)
      .order('sampled_at', { ascending: true })
      .limit(1000);
    healthSamples = data || [];
  }

  // Surveyor name + the pool of client users staff can reassign to -- both
  // scoped to this inspection's company, not the whole client base.
  let surveyorName = null;
  let clientsForCompany = [];
  if (inspection.surveyor_id) {
    const { data: surveyorProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', inspection.surveyor_id)
      .maybeSingle();
    surveyorName = surveyorProfile?.full_name || null;
  }
  if (isStaff) {
    // Registered surveyors, plus whoever's currently assigned even if they
    // were since unregistered -- so reassigning off of them still shows who
    // it currently is instead of silently blanking the dropdown.
    let query = supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'client')
      .eq('company_id', inspection.company_id);
    query = inspection.surveyor_id
      ? query.or(`is_registered_surveyor.eq.true,id.eq.${inspection.surveyor_id}`)
      : query.eq('is_registered_surveyor', true);
    const { data } = await query.order('full_name');
    clientsForCompany = data || [];
  }

  // Comms are available as soon as the inspection exists, off once it's
  // wrapped -- independent of whether the video is actually live. Matches
  // the token route's own check, kept in sync so the button doesn't show
  // up somewhere it'll just 403.
  const commsOpen = inspection.status === 'scheduled' || inspection.status === 'live';
  const isSurveyor = inspection.surveyor_id === user.id;
  const commsAccessAllowed = isStaff || isSurveyor || inspection.open_comms;

  return (
    <div className="page-wrap">
      <div className="card">
        <h1>{inspection.site}</h1>
        <p className="subtitle">
          {inspection.asset || 'Inspection'}
          {inspection.pilot ? ` — Pilot: ${inspection.pilot}` : ''}
          {inspection.companies?.name ? ` — ${inspection.companies.name}` : ''}
          {' — '}
          {inspection.inspection_date}
        </p>

        {credentials && (
          <StreamCredentials whipUrl={credentials.whip_url} streamKey={credentials.stream_key} />
        )}

        {inspection.status === 'live' ? (
          <LiveVideo room={inspection.livekit_room_name} inspectionId={inspection.id} wentLiveAt={inspection.went_live_at} />
        ) : inspection.status === 'scheduled' ? (
          <div className="archive-empty">
            Not live yet. Start streaming in OBS with the credentials above — this will go live
            automatically.
          </div>
        ) : recordingUrl ? (
          <div className="video-box">
            <video src={recordingUrl} controls playsInline />
          </div>
        ) : recordingPending ? (
          <div className="archive-empty">
            Recording is still processing — check back in a few minutes.
          </div>
        ) : (
          <div className="archive-empty">No recording is available for this inspection.</div>
        )}

        {commsOpen && commsAccessAllowed && (
          <RadioPanel
            inspectionId={inspection.id}
            heading={
              isStaff
                ? 'Voice Comms (field radio)'
                : inspection.open_comms
                ? 'Voice Comms (Open -- Demo Mode)'
                : 'Voice Comms with Inspector'
            }
          />
        )}

        {isStaff && <CommsModeToggle inspectionId={inspection.id} openComms={inspection.open_comms} />}

        {isStaff && (
          <SurveyorAssign
            inspectionId={inspection.id}
            currentSurveyorId={inspection.surveyor_id}
            currentSurveyorName={surveyorName}
            clients={clientsForCompany}
          />
        )}

        {isStaff && viewerHistory.length > 0 && <ViewerHistory sessions={viewerHistory} />}
        {isStaff && healthSamples.length > 0 && <StreamHealthHistory samples={healthSamples} />}

        <ChatBox
          inspectionId={inspection.id}
          initialMessages={initialMessages || []}
          currentUserId={user.id}
          canSend={inspection.status === 'live'}
        />
      </div>
    </div>
  );
}
