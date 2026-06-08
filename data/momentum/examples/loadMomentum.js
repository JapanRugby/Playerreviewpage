// Static-site loader example for Player Review Hub
// Put this file wherever useful, or copy the functions into index.html.

export async function loadMomentumIndex(base = 'data/momentum') {
  const res = await fetch(`${base}/index.json`);
  if (!res.ok) throw new Error(`Failed to load momentum index: ${res.status}`);
  return res.json();
}

export async function loadMatchMomentum(matchId, base = 'data/momentum') {
  const res = await fetch(`${base}/matches/${matchId}.json`);
  if (!res.ok) return null;
  return res.json();
}

export async function loadPlayerMomentum(matchId, base = 'data/momentum') {
  const res = await fetch(`${base}/players/${matchId}.json`);
  if (!res.ok) return [];
  return res.json();
}

export async function loadReviewClips(base = 'data/momentum') {
  const res = await fetch(`${base}/review_clips.json`);
  if (!res.ok) return [];
  return res.json();
}

export function summarizeMomentumLabel(rmi) {
  if (rmi >= 60) return 'Strong home momentum';
  if (rmi >= 25) return 'Home momentum';
  if (rmi <= -60) return 'Strong away momentum';
  if (rmi <= -25) return 'Away momentum';
  return 'Balanced';
}
