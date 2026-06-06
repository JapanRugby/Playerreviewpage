const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const outPath = path.join(dataDir, 'matches.json');
const overridesPath = path.join(dataDir, 'match_overrides.json');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readFirstRows(filePath, maxRows = 80) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, maxRows + 1);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine).map(values => {
    const row = {};
    header.forEach((h, i) => row[h] = values[i] ?? '');
    return row;
  });
  return { header, rows };
}

function isoDateFromUtc(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function niceFallbackLabel(filename, id) {
  return filename
    .replace(new RegExp('^' + id + '_?'), '')
    .replace(/_?BI\.csv$/i, '')
    .replace(/_/g, ' ')
    .replace(/v/i, ' v ')
    .trim() || id;
}

function loadOverrides() {
  if (!fs.existsSync(overridesPath)) return {};
  return JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
}

const allFiles = fs.readdirSync(dataDir);
const files = allFiles.filter(f => f.toLowerCase().endsWith('.csv'));
const xmlFiles = allFiles.filter(f => f.toLowerCase().endsWith('.xml'));
const groups = new Map();

for (const file of files) {
  const idMatch = file.match(/^(\d+)/);
  if (!idMatch) {
    console.warn(`Skipped: ${file}（ファイル名の先頭に試合IDがありません）`);
    continue;
  }
  const id = idMatch[1];
  if (!groups.has(id)) groups.set(id, { id });
  const g = groups.get(id);
  const lower = file.toLowerCase();

  // Review CSV: Gold / Green / Yellow / Red が入っているファイル
  if (lower.includes('measurem') || lower.includes('advanced')) {
    g.reviewCsv = file;
  } else {
    g.biCsv = file;
  }
}

for (const file of xmlFiles) {
  const idMatch = file.match(/^(\d+)/);
  if (!idMatch) {
    console.warn(`Skipped XML: ${file}（ファイル名の先頭に試合IDがありません）`);
    continue;
  }
  const id = idMatch[1];
  if (!groups.has(id)) groups.set(id, { id });
  groups.get(id).superscoutXml = file;
}

const overrides = loadOverrides();
const matches = [];

for (const [id, group] of Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
  if (!group.biCsv || !group.reviewCsv) {
    console.warn(`Skipped match ${id}: BI CSVまたはReview CSVが足りません`);
    continue;
  }

  const biPath = path.join(dataDir, group.biCsv);
  const { rows } = readFirstRows(biPath);
  let homeTeam = '';
  let awayTeam = '';
  let date = '';

  for (const row of rows) {
    homeTeam = homeTeam || row.homeTeamName || row.HomeTeamName || '';
    awayTeam = awayTeam || row.awayTeamName || row.AwayTeamName || '';
    date = date || isoDateFromUtc(row.UTCTime || row.utcTime || row.Date || '');
    if (homeTeam && awayTeam && date) break;
  }

  const biFileName = path.basename(group.biCsv);
  const entry = {
    id,
    label: homeTeam && awayTeam ? `${homeTeam} v ${awayTeam}` : niceFallbackLabel(biFileName, id),
    date,
    homeTeam,
    awayTeam,
    score: '',
    venue: '',
    biCsv: group.biCsv,
    reviewCsv: group.reviewCsv,
    ...(group.superscoutXml ? { superscoutXml: group.superscoutXml } : {})
  };

  matches.push({ ...entry, ...(overrides[id] || {}) });
}

fs.writeFileSync(outPath, JSON.stringify(matches, null, 2) + '\n');
console.log(`Generated ${path.relative(root, outPath)} with ${matches.length} match(es).`);
