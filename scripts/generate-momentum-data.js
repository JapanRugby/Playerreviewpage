#!/usr/bin/env node
/*
 * Player Review Hub - Momentum data generator
 *
 * Usage:
 *   node scripts/generate-momentum-data.js
 *
 * Input:
 *   data/*_BI.csv
 *
 * Output:
 *   data/momentum/manifest.json
 *   data/momentum/index.json
 *   data/momentum/matches/{matchId}.json
 *   data/momentum/players/{matchId}.json
 *   data/momentum/review_clips.json
 *
 * This is the automatic-update inference script for the website.
 * It is intentionally dependency-free so GitHub Actions can run it every time
 * a BI CSV is added.  The logic mirrors the v5 Explainable Rugby Momentum
 * approach: possession-level signal + five explainable components.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(DATA_DIR, 'momentum');
const MATCH_DIR = path.join(OUT_DIR, 'matches');
const PLAYER_DIR = path.join(OUT_DIR, 'players');
const HALF_LIFE_SECONDS = 240;
const RMI_SCALE = 3.0;
const JAPAN_TEAM_NAMES = new Set(['JAPAN', 'JAPAN XV']);

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function norm(v) { return String(v ?? '').trim().replace(/\s+/g, ' '); }
function normKey(v) { return norm(v).toLowerCase(); }
function normTeam(v) { return norm(v).toUpperCase(); }
function isJapanTeam(v) { return JAPAN_TEAM_NAMES.has(normTeam(v)); }
function toNumber(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function fmtClock(sec) {
  const s = Math.max(0, Math.round(toNumber(sec)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
function matchSeconds(row) {
  const mt = get(row, ['MatchTime', 'Match Time']);
  const raw = toNumber(mt);
  if (raw > 0) {
    const n = Math.floor(raw);
    const mm = Math.floor(n / 100);
    const ss = n % 100;
    if (ss >= 0 && ss < 60 && mm <= 130) return mm * 60 + ss;
  }
  return toNumber(get(row, ['ps_timestamp', 'start_timestamp']));
}
function dateLabel(v) {
  const s = norm(v);
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  return s.slice(0, 10);
}
function playerKey(name, team) {
  if (!name || !team) return '';
  return isJapanTeam(team) ? `${normKey(name)}|japan-group` : `${normKey(name)}|${normKey(team)}`;
}

function parseCSV(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else q = false;
      } else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; if (row.some(x => String(x).trim() !== '')) rows.push(row); row = []; }
      else if (c !== '\r') field += c;
    }
  }
  row.push(field);
  if (row.some(x => String(x).trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => String(h).replace(/^\uFEFF/, '').trim());
  return rows.map(cols => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i] ?? '');
    return obj;
  });
}
function lowerMap(row) {
  if (row.__lower) return row.__lower;
  const m = {};
  for (const k of Object.keys(row || {})) m[String(k).toLowerCase()] = row[k];
  row.__lower = m;
  return m;
}
function get(row, names) {
  if (!row) return '';
  for (const name of names) if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  const low = lowerMap(row);
  for (const name of names) {
    const v = low[String(name).toLowerCase()];
    if (v !== undefined) return v;
  }
  return '';
}
function getNum(row, names) { return toNumber(get(row, names)); }
function isBIFile(f) {
  const lower = f.toLowerCase();
  return lower.endsWith('.csv') && lower.includes('_bi') && !lower.includes('measurem') && !lower.includes('review') && !lower.startsWith('._');
}
function listBI() {
  let out = [];
  try {
    for (const f of fs.readdirSync(DATA_DIR)) {
      const fp = path.join(DATA_DIR, f);
      if (fs.statSync(fp).isFile() && isBIFile(f)) out.push(fp);
    }
  } catch {}
  return out.sort();
}
function matchIdFromFile(f) {
  const m = path.basename(f).match(/^(\d{5,})/);
  return m ? m[1] : '';
}
function reasonFromComponents(c) {
  const items = [
    ['得点脅威', c.scoringThreat],
    ['テリトリー', c.territory],
    ['継続品質', c.possessionQuality],
    ['接点・BD', c.contactBreakdown],
    ['規律・TO', c.disciplineTurnover],
  ].sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
  return items.filter(x => Math.abs(x[1]) >= 0.15).slice(0, 3).map(([name, val]) => `${name} ${val >= 0 ? '+' : ''}${val.toFixed(1)}`).join(' / ') || 'possession value change';
}

function eventComponents(row, perspectiveTeamId) {
  const action = Math.round(getNum(row, ['action']));
  const actionType = Math.round(getNum(row, ['ActionType', 'actionType']));
  const result = Math.round(getNum(row, ['Actionresult', 'actionResult']));
  const q3 = Math.round(getNum(row, ['qualifier3', 'Qualifier3']));
  const q4 = Math.round(getNum(row, ['qualifier4', 'Qualifier4']));
  const q5 = Math.round(getNum(row, ['qualifier5', 'Qualifier5']));
  const teamId = Math.round(getNum(row, ['team_id', 'teamId']));
  const x = getNum(row, ['x_coord', 'x']);
  const xe = getNum(row, ['x_coord_end', 'xEnd']);
  const metres = getNum(row, ['Metres', 'metres']);
  const metres3 = getNum(row, ['Metres3', 'metres3']);
  const sign = teamId === perspectiveTeamId ? 1 : -1;
  const validEnd = xe > 0;
  const c = { scoringThreat: 0, territory: 0, possessionQuality: 0, contactBreakdown: 0, disciplineTurnover: 0 };

  // Scoring threat
  if (action === 46) c.scoringThreat += sign * 1.6;        // attacking 22 entry
  if (action === 9) c.scoringThreat += sign * 6.0;          // try
  if (action === 11) c.scoringThreat += sign * 2.0;         // goal kick attempt/made
  if (x >= 78) c.scoringThreat += sign * 0.12;

  // Territory
  if (validEnd) c.territory += sign * 0.025 * (xe - x);
  if (action === 4) c.territory += sign * clamp(metres, -70, 70) * 0.012;
  if (action === 45) c.territory += sign * 0.9;             // defensive exit
  if (action === 44) c.territory += sign * clamp(metres, -50, 50) * 0.018;

  // Possession quality
  if (action === 1) c.possessionQuality += sign * clamp(metres, -20, 30) * 0.035;
  if (action === 3 && [169, 172, 178, 151].includes(actionType)) c.possessionQuality += sign * 0.08;
  if (action === 3 && [173, 174, 175, 180].includes(actionType)) c.possessionQuality += sign * -0.55;
  if (action === 10) c.possessionQuality += sign * 0.65;    // attacking qualities
  if (action === 23 && [554, 555].includes(q4)) c.possessionQuality += sign * 0.16;
  if (action === 23 && [558].includes(q4)) c.possessionQuality += sign * -0.12;

  // Contact / breakdown
  if (action === 1 && q3 === 109) c.contactBreakdown += sign * 0.18;
  if (action === 1 && q3 === 111) c.contactBreakdown += sign * -0.18;
  if (action === 1 && q4 === 460) c.contactBreakdown += sign * 0.25;
  if (action === 1 && q4 === 462) c.contactBreakdown += sign * -0.25;
  if (action === 1 && result === 107) c.contactBreakdown += sign * 0.28;
  if (action === 1 && result === 409) c.contactBreakdown += sign * -0.28;
  if (action === 2 && [156, 158, 159].includes(result)) c.contactBreakdown += sign * 0.45;
  if (action === 2 && [160, 161, 155, 157].includes(result)) c.contactBreakdown += sign * -0.35;
  if (action === 12) c.contactBreakdown += sign * -0.35;
  if (action === 23) c.contactBreakdown += sign * clamp(metres3, -10, 10) * 0.04;
  if (action === 43 && actionType === 800) c.contactBreakdown += sign * 0.08;

  // Discipline / turnover
  if (action === 7) c.disciplineTurnover += sign * -1.25;   // penalty conceded by event team
  if (action === 21) c.disciplineTurnover += sign * -2.0;   // card
  if (action === 8) {
    const lost = [253, 254, 678].includes(result) || /lost|conceded|error/i.test(get(row, ['ActionResultName', 'actionResultName']));
    c.disciplineTurnover += sign * (lost ? -1.5 : 1.5);
  }
  if (action === 5 && [357, 209, 354].includes(result)) c.disciplineTurnover += sign * 1.1;
  if (action === 5 && [358, 359, 360, 361].includes(result)) c.disciplineTurnover += sign * -1.1;
  if (action === 6 && [376, 377, 378, 379, 380].includes(result)) c.disciplineTurnover += sign * 0.45;
  if (action === 6 && [381, 382, 383, 384, 385, 417, 418, 419].includes(result)) c.disciplineTurnover += sign * -0.75;
  if (action === 1 && result === 210) c.disciplineTurnover += sign * 1.2;
  if (action === 1 && result === 124) c.disciplineTurnover += sign * -1.2;
  if (action === 2 && result === 157) c.disciplineTurnover += sign * -1.2;
  return c;
}
function sumComponents(list) {
  const c = { scoringThreat: 0, territory: 0, possessionQuality: 0, contactBreakdown: 0, disciplineTurnover: 0 };
  for (const x of list) for (const k of Object.keys(c)) c[k] += x[k] || 0;
  return c;
}
function addComp(a, b) { for (const k of Object.keys(a)) a[k] += b[k] || 0; return a; }
function compTotal(c) { return c.scoringThreat + c.territory + c.possessionQuality + c.contactBreakdown + c.disciplineTurnover; }

function choosePossessions(rows) {
  const possRows = rows.filter(r => Math.round(getNum(r, ['action'])) === 15 || normKey(get(r, ['actionName'])) === 'possession' || normKey(get(r, ['actionName'])) === 'possessions');
  const bySet = new Map();
  for (const r of rows) {
    const setNum = Math.round(getNum(r, ['SetNum', 'setNum']));
    if (!setNum) continue;
    if (!bySet.has(setNum)) bySet.set(setNum, []);
    bySet.get(setNum).push(r);
  }
  const possBySet = new Map();
  for (const r of possRows) {
    const setNum = Math.round(getNum(r, ['SetNum', 'setNum']));
    if (setNum && !possBySet.has(setNum)) possBySet.set(setNum, r);
  }
  const out = [];
  for (const [setNum, evs] of [...bySet.entries()].sort((a,b)=>a[0]-b[0])) {
    evs.sort((a,b) => getNum(a, ['ps_timestamp']) - getNum(b, ['ps_timestamp']));
    const pr = possBySet.get(setNum);
    let ownerTeamId, ownerTeamName;
    if (pr) { ownerTeamId = Math.round(getNum(pr, ['team_id'])); ownerTeamName = get(pr, ['teamName']); }
    else {
      const counts = new Map();
      for (const e of evs) {
        const tid = Math.round(getNum(e, ['team_id'])); if (!tid) continue;
        const name = get(e, ['teamName']);
        if (!counts.has(tid)) counts.set(tid, {tid, name, n:0});
        counts.get(tid).n++;
      }
      const best = [...counts.values()].sort((a,b)=>b.n-a.n)[0] || {tid:0,name:''};
      ownerTeamId = best.tid; ownerTeamName = best.name;
    }
    if (!ownerTeamId) continue;
    const first = evs[0], last = evs[evs.length - 1];
    const t0 = Math.min(...evs.map(e => getNum(e, ['ps_timestamp'])).filter(Number.isFinite));
    const t1 = Math.max(...evs.map(e => Math.max(getNum(e, ['ps_endstamp']), getNum(e, ['ps_timestamp']))).filter(Number.isFinite));
    const startRow = pr || first;
    const endRow = pr || last;
    const xStart = getNum(startRow, ['x_coord']);
    let xEnd = getNum(endRow, ['x_coord_end']);
    if (!xEnd) xEnd = getNum(last, ['x_coord_end']) || getNum(last, ['x_coord']) || xStart;
    const yStart = getNum(startRow, ['y_coord']);
    const yEnd = getNum(endRow, ['y_coord_end']) || getNum(last, ['y_coord_end']) || getNum(last, ['y_coord']) || yStart;
    out.push({ setNum, row: pr || first, events: evs, ownerTeamId, ownerTeamName, t0, t1, xStart, xEnd, yStart, yEnd });
  }
  return out;
}

function simpleLearnedSignal(poss, comps, fixture) {
  const events = poss.events.length;
  const metres = poss.xEnd - poss.xStart;
  const start22 = poss.xStart >= 78 ? 1 : 0;
  const end22 = poss.xEnd >= 78 ? 1 : 0;
  const own22 = poss.xStart <= 22 ? 1 : 0;
  const rule = compTotal(comps);
  const playerAdv = getNum(poss.row, ['player_advantage']);
  const scoreAdv = getNum(poss.row, ['score_advantage']);
  // Conservative, explainable EP proxy for automatic website refresh.
  const ownerLogit = -3.1 + 0.033 * poss.xEnd + 0.55 * end22 + 0.30 * start22 + 0.11 * Math.log1p(events) + 0.018 * clamp(metres, -50, 80) + 0.08 * clamp(rule, -5, 5) + 0.07 * clamp(playerAdv, -2, 2);
  const oppLogit = -3.2 + 0.026 * (100 - poss.xEnd) + 0.45 * own22 - 0.04 * clamp(metres, -50, 80) - 0.05 * clamp(rule, -5, 5) - 0.04 * clamp(playerAdv, -2, 2);
  const ownerProb = clamp(sigmoid(ownerLogit), 0.01, 0.95);
  const oppProb = clamp(sigmoid(oppLogit), 0.01, 0.95);
  const marginDelta = 5.0 * (ownerProb - oppProb) + 0.12 * clamp(rule, -5, 5) + 0.02 * clamp(scoreAdv, -30, 30);
  const learned = 5.0 * (ownerProb - oppProb) + 0.60 * marginDelta;
  return { ownerScoreProb5m: ownerProb, opponentScoreProb5m: oppProb, predictedMarginDelta5m: marginDelta, learnedSignal: learned };
}

function rollingSeries(possessions, viewSignFunc, sideName) {
  const maxTime = Math.max(80 * 60, ...possessions.map(p => p.t0 || 0));
  const maxMinute = Math.min(130, Math.ceil(maxTime / 60));
  const series = [];
  for (let minute = 0; minute <= maxMinute; minute++) {
    const t = minute * 60;
    let raw = 0;
    const reasons = [];
    for (const p of possessions) {
      if (p.t0 > t) continue;
      const age = t - p.t0;
      if (age > HALF_LIFE_SECONDS * 5) continue;
      const w = Math.pow(0.5, age / HALF_LIFE_SECONDS);
      const s = p.finalSignal * viewSignFunc(p);
      raw += s * w;
      if (Math.abs(s) * w >= 0.35) reasons.push({ reason: p.reason, impact: s*w });
    }
    const rmi = 100 * Math.tanh(raw / RMI_SCALE);
    reasons.sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact));
    series.push({ minute, matchClock: fmtClock(t), rmi: round(rmi, 1), raw: round(raw, 3), label: sideName, leadingReasons: reasons.slice(0, 3).map(x => x.reason) });
  }
  return series;
}
function round(x, n=2) { const f = Math.pow(10, n); return Math.round(toNumber(x) * f) / f; }

function generateForFile(file) {
  const matchId = matchIdFromFile(file);
  const rows = parseCSV(fs.readFileSync(file, 'utf8'));
  if (!rows.length) return null;
  rows.sort((a,b) => getNum(a, ['ps_timestamp']) - getNum(b, ['ps_timestamp']));
  const first = rows[0];
  const homeTeamId = Math.round(getNum(first, ['homeTeamID']));
  const awayTeamId = Math.round(getNum(first, ['awayTeamID']));
  const homeTeamName = get(first, ['homeTeamName']);
  const awayTeamName = get(first, ['awayTeamName']);
  const date = dateLabel(get(first, ['datePlayed']));
  const homeScore = Math.round(getNum(first, ['hometeamFTscore', 'hometeamFTScore']));
  const awayScore = Math.round(getNum(first, ['awayteamFTscore', 'awayteamFTScore']));
  const hasJapan = isJapanTeam(homeTeamName) || isJapanTeam(awayTeamName);
  const japanTeamId = isJapanTeam(homeTeamName) ? homeTeamId : (isJapanTeam(awayTeamName) ? awayTeamId : 0);
  const possessions = choosePossessions(rows);
  const playerAgg = new Map();
  const reviewClipItems = [];

  const processedPoss = possessions.map(p => {
    const comps = sumComponents(p.events.map(e => eventComponents(e, p.ownerTeamId)));
    const learned = simpleLearnedSignal(p, comps, { homeTeamId, awayTeamId });
    const ruleSignal = compTotal(comps);
    const finalSignal = learned.learnedSignal + 0.35 * clamp(ruleSignal, -6, 6);
    const reason = reasonFromComponents(comps);
    for (const e of p.events) {
      const playerName = norm(get(e, ['playerName']));
      const teamName = norm(get(e, ['teamName']));
      if (!playerName || !teamName) continue;
      const key = playerKey(playerName, teamName);
      if (!key) continue;
      const pc = eventComponents(e, Math.round(getNum(e, ['team_id'])));
      const impact = compTotal(pc);
      if (!playerAgg.has(key)) {
        playerAgg.set(key, {
          playerKey: key,
          playerName,
          team: teamName,
          matchId,
          netMomentum: 0,
          momentumAdded: 0,
          momentumLost: 0,
          scoringThreat: 0,
          territory: 0,
          possessionQuality: 0,
          contactBreakdown: 0,
          disciplineTurnover: 0,
          actions: 0,
          topActions: []
        });
      }
      const a = playerAgg.get(key);
      a.netMomentum += impact;
      if (impact >= 0) a.momentumAdded += impact; else a.momentumLost += -impact;
      a.scoringThreat += pc.scoringThreat;
      a.territory += pc.territory;
      a.possessionQuality += pc.possessionQuality;
      a.contactBreakdown += pc.contactBreakdown;
      a.disciplineTurnover += pc.disciplineTurnover;
      a.actions += 1;
      if (Math.abs(impact) >= 0.55) {
        a.topActions.push({
          time: fmtClock(matchSeconds(e)),
          startSecond: Math.max(0, round(getNum(e, ['ps_timestamp']) - 8, 1)),
          endSecond: round(getNum(e, ['ps_timestamp']) + 18, 1),
          action: get(e, ['actionName']) || String(getNum(e, ['action'])),
          result: get(e, ['ActionResultName', 'actionResultName']),
          impact: round(impact, 2),
          reason: reasonFromComponents(pc)
        });
      }
    }
    const obj = {
      matchId, setNum: p.setNum, teamId: p.ownerTeamId, team: p.ownerTeamName,
      startSecond: round(p.t0, 1), endSecond: round(p.t1, 1), matchClock: fmtClock(p.t0),
      xStart: round(p.xStart, 1), xEnd: round(p.xEnd, 1), yStart: round(p.yStart, 1), yEnd: round(p.yEnd, 1), events: p.events.length,
      ...Object.fromEntries(Object.entries(comps).map(([k,v]) => [k, round(v, 3)])),
      ruleSignal: round(ruleSignal, 3),
      ownerScoreProb5m: round(learned.ownerScoreProb5m, 4),
      opponentScoreProb5m: round(learned.opponentScoreProb5m, 4),
      predictedMarginDelta5m: round(learned.predictedMarginDelta5m, 3),
      learnedSignal: round(learned.learnedSignal, 3),
      finalSignal: round(finalSignal, 3),
      reason
    };
    if (Math.abs(finalSignal) >= 2.0) reviewClipItems.push({
      matchId,
      setNum: p.setNum,
      startSecond: Math.max(0, round(p.t0 - 10, 1)),
      endSecond: round(p.t1 + 10, 1),
      matchClock: fmtClock(p.t0),
      team: p.ownerTeamName,
      signal: round(finalSignal, 2),
      reason,
      clipType: 'momentum_possession'
    });
    return obj;
  });

  const procForRoll = processedPoss.map((pp, i) => ({...pp, t0: pp.startSecond, finalSignal: pp.finalSignal, ownerTeamId: possessions[i].ownerTeamId, reason: pp.reason }));
  const homeSeries = rollingSeries(procForRoll, p => p.ownerTeamId === homeTeamId ? 1 : -1, 'home');
  const japanSeries = hasJapan ? rollingSeries(procForRoll, p => p.ownerTeamId === japanTeamId ? 1 : -1, 'japan') : [];
  const peaks = [...processedPoss].sort((a,b)=>Math.abs(b.finalSignal)-Math.abs(a.finalSignal)).slice(0, 20).map(p => ({
    setNum: p.setNum, matchClock: p.matchClock, team: p.team, signal: p.finalSignal, reason: p.reason,
    components: {
      scoringThreat: p.scoringThreat, territory: p.territory, possessionQuality: p.possessionQuality,
      contactBreakdown: p.contactBreakdown, disciplineTurnover: p.disciplineTurnover
    }
  }));
  const playerList = [...playerAgg.values()].map(p => {
    p.netMomentum = round(p.netMomentum, 2);
    p.momentumAdded = round(p.momentumAdded, 2);
    p.momentumLost = round(p.momentumLost, 2);
    p.scoringThreat = round(p.scoringThreat, 2);
    p.territory = round(p.territory, 2);
    p.possessionQuality = round(p.possessionQuality, 2);
    p.contactBreakdown = round(p.contactBreakdown, 2);
    p.disciplineTurnover = round(p.disciplineTurnover, 2);
    p.reviewPriority = Math.abs(p.netMomentum) >= 5 || p.topActions.length >= 5 ? 'High' : (Math.abs(p.netMomentum) >= 2.5 || p.topActions.length >= 2 ? 'Medium' : 'Low');
    p.topActions = p.topActions.sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact)).slice(0, 10);
    return p;
  }).sort((a,b)=>Math.abs(b.netMomentum)-Math.abs(a.netMomentum));

  return {
    match: {
      matchId, date, sourceFile: path.basename(file), homeTeamId, awayTeamId, homeTeamName, awayTeamName, homeScore, awayScore, hasJapan,
      modelVersion: 'v5-auto-explainable-lite', generatedAt: new Date().toISOString(), halfLifeSeconds: HALF_LIFE_SECONDS,
      series: { home: homeSeries, japan: japanSeries }, peaks, possessions: processedPoss
    },
    players: { matchId, players: playerList },
    clips: reviewClipItems.sort((a,b)=>Math.abs(b.signal)-Math.abs(a.signal)).slice(0, 40),
    indexItem: { matchId, date, homeTeamName, awayTeamName, homeScore, awayScore, hasJapan, sourceFile: path.basename(file), possessions: processedPoss.length, players: playerList.length }
  };
}

function main() {
  ensureDir(OUT_DIR); ensureDir(MATCH_DIR); ensureDir(PLAYER_DIR);
  const files = listBI();
  const byId = new Map();
  for (const f of files) {
    const id = matchIdFromFile(f); if (!id) continue;
    // Prefer the shortest canonical filename if duplicates exist.
    if (!byId.has(id) || path.basename(f).length < path.basename(byId.get(id)).length) byId.set(id, f);
  }
  const index = [];
  const allClips = [];
  const failures = [];
  for (const [id, file] of [...byId.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
    try {
      const res = generateForFile(file);
      if (!res) continue;
      fs.writeFileSync(path.join(MATCH_DIR, `${id}.json`), JSON.stringify(res.match, null, 2));
      fs.writeFileSync(path.join(PLAYER_DIR, `${id}.json`), JSON.stringify(res.players, null, 2));
      index.push(res.indexItem);
      for (const c of res.clips) allClips.push(c);
      console.log(`Momentum: ${id} ${res.indexItem.homeTeamName} v ${res.indexItem.awayTeamName} (${res.indexItem.possessions} possessions)`);
    } catch (err) {
      failures.push({ matchId: id, file: path.basename(file), error: String(err && err.stack || err) });
      console.error(`Momentum failed for ${id}:`, err.message || err);
    }
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    modelVersion: 'v5-auto-explainable-lite',
    source: 'Opta BI CSV',
    matches: index.length,
    japanMatches: index.filter(x => x.hasJapan).length,
    filesScanned: files.length,
    uniqueFixtures: byId.size,
    outputs: {
      index: 'data/momentum/index.json',
      matches: 'data/momentum/matches/{matchId}.json',
      players: 'data/momentum/players/{matchId}.json',
      reviewClips: 'data/momentum/review_clips.json'
    },
    logic: {
      definition: 'RMI measures which team is moving closer to the next score.',
      components: ['scoringThreat', 'territory', 'possessionQuality', 'contactBreakdown', 'disciplineTurnover'],
      halfLifeSeconds: HALF_LIFE_SECONDS,
      scale: '-100 to +100 via 100*tanh(raw/3.0)',
      note: 'This automatic generator uses a dependency-free explainable inference approximation. Full deep model retraining should be run manually/offline and then the logic can be refreshed.'
    },
    failures
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'review_clips.json'), JSON.stringify(allClips.sort((a,b)=>Math.abs(b.signal)-Math.abs(a.signal)).slice(0, 3000), null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'logic.md'), `# Rugby Momentum v5 automatic JSON logic\n\nMomentum means **which team is moving closer to the next score**.\n\nThe automatic website generator scans \`data/*_BI.csv\` and creates JSON under \`data/momentum/\`.\n\n## Components\n\n- scoringThreat: tries, goal kicks, attacking 22 entries, near-line pressure.\n- territory: x movement, kick metres, defensive exits, counterattack metres.\n- possessionQuality: carries, passes, attacking qualities, quick/slow ruck signals.\n- contactBreakdown: gain-line, dominant carry/tackle, ruck movement.\n- disciplineTurnover: penalties, cards, turnovers, set-piece wins/losses.\n\n## Output\n\n- \`matches/{matchId}.json\`: match timeline, peaks, and possession values.\n- \`players/{matchId}.json\`: player momentum contribution.\n- \`review_clips.json\`: high-impact review candidates.\n\n## Updating\n\nCommit or upload a new \`*_BI.csv\` into \`data/\`. GitHub Actions runs \`node scripts/generate-momentum-data.js\` and commits updated JSON.\n`);
  if (failures.length) {
    fs.writeFileSync(path.join(OUT_DIR, 'failures.json'), JSON.stringify(failures, null, 2));
  }
  console.log(`Generated momentum JSON for ${index.length} matches. Failures: ${failures.length}`);
}

main();
