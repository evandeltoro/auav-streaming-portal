// Shared name-formatting logic. "Middle initial" means exactly that -- a
// single letter followed by a period -- regardless of what the user typed
// (e.g. "j" or "J." both become "J."), so chat/viewer-log names look
// consistent no matter who entered them (admin at invite time, or the
// person themselves via Account settings).
export function composeFullName(first, middle, last) {
  const firstName = (first || '').trim();
  const lastName = (last || '').trim();
  let middleInitial = (middle || '').trim();

  if (middleInitial) {
    middleInitial = `${middleInitial.charAt(0).toUpperCase()}.`;
  }

  return [firstName, middleInitial, lastName].filter(Boolean).join(' ');
}
