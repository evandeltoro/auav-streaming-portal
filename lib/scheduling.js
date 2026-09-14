const LOCK_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Returns the scheduled Date for an inspection, or null when there's no
// specific call time set -- a bare date has no precise "an hour before" to
// compute against, so callers should treat that as nothing to lock.
export function scheduledDateTime(inspectionDate, inspectionTime) {
  if (!inspectionDate || !inspectionTime) return null;
  const d = new Date(`${inspectionDate}T${inspectionTime}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Clients and inspectors can't open a still-scheduled inspection's card or
// page until an hour before its call time -- keeps people from clicking
// into (and potentially claiming the surveyor seat, joining comms on) a job
// that isn't starting yet, which matters most for clients/inspectors who
// don't always read the schedule closely. Admins are exempt -- they're the
// ones who actually need in early to check on setup. Only bites while
// status is still 'scheduled' (once live, none of this applies) and only
// when a specific time was set.
export function isLockedForRole(inspection, role) {
  if (role === 'admin') return false;
  if (inspection.status !== 'scheduled') return false;
  const scheduled = scheduledDateTime(inspection.inspection_date, inspection.inspection_time);
  if (!scheduled) return false;
  return scheduled.getTime() - Date.now() > LOCK_WINDOW_MS;
}
