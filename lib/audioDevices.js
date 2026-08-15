// The browser's enumerateDevices() list includes every audio device the OS
// knows about, including ones a field user never wants to pick: virtual/
// software loopback devices from other apps (Teams, Zoom, Discord, Steam,
// OBS, etc.), and duplicate "Default -" / "Communications -" entries that
// just re-list the same physical default device. Filtering those out
// leaves the built-in default plus real hardware (USB, wired, Bluetooth --
// including the Sonetics comHub puck), which is what the mic/speaker
// dropdowns should actually offer.
const VIRTUAL_DEVICE_PATTERN =
  /virtual|teams audio|steam streaming|zoom audio|discord|loopback|soundflower|blackhole|vb-audio|vb-cable|voicemeeter|obs virtual|nvidia broadcast|wave link|krisp|iphone|ipad|continuity/i;

const DUPLICATE_DEFAULT_PATTERN = /^(default|communications)\s*[-–]/i;

export function filterRegularDevices(devices) {
  return devices.filter((d) => {
    const label = d.label || '';
    if (!label) return true; // no label yet (permission not granted) -- keep rather than hide everything
    if (VIRTUAL_DEVICE_PATTERN.test(label)) return false;
    if (DUPLICATE_DEFAULT_PATTERN.test(label)) return false;
    return true;
  });
}
