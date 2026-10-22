// In-memory rolling-window download counter (per process), same single-instance caveat as rate-limit.ts.
export const DOWNLOAD_ANOMALY_WINDOW_SECONDS = 600;
export const DOWNLOAD_ANOMALY_THRESHOLD = 10;
const WINDOW_MS = DOWNLOAD_ANOMALY_WINDOW_SECONDS * 1000;

type Track = { times: number[]; alertedUntil: number };
const tracks = new Map<string, Track>();
let lastPrune = 0;

function prune(now: number) {
  lastPrune = now;
  for (const [key, track] of tracks) {
    if (track.times.length === 0 || now - track.times[track.times.length - 1] >= WINDOW_MS) tracks.delete(key);
  }
}

/**
 * Records one download. Returns the in-window count when this download crosses the threshold and
 * no alert has been raised for the current window yet; otherwise null.
 */
export function recordDownload(organizationId: string, userId: string, now = Date.now()): number | null {
  if (now - lastPrune >= WINDOW_MS) prune(now);
  const key = `${organizationId}\u0000${userId}`;
  let track = tracks.get(key);
  if (!track) {
    track = { times: [], alertedUntil: 0 };
    tracks.set(key, track);
  }
  track.times = track.times.filter((t) => now - t < WINDOW_MS);
  track.times.push(now);
  const count = track.times.length;
  if (count > DOWNLOAD_ANOMALY_THRESHOLD && now >= track.alertedUntil) {
    track.alertedUntil = now + WINDOW_MS;
    return count;
  }
  return null;
}

export function resetDownloadMonitorForTests() {
  tracks.clear();
  lastPrune = 0;
}
