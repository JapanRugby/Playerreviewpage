const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const STATS_DIR = path.join(DATA_DIR, 'stats');
const TARGET_TEAMS = ['Japan', 'Japan XV'];

function norm(v){return String(v??'').trim().replace(/\s+/g,' ').toLowerCase();}
function normTeam(v){return String(v??'').trim().replace(/\s+/g,' ').toUpperCase();}
function playerKey(name,team){return `${norm(name)}|${norm(team)}`;}
function isTargetTeam(team){const t=normTeam(team);return TARGET_TEAMS.some(x=>normTeam(x)===t);}
function toNumber(v){const n=parseFloat(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;}
function dateLabel(v){ if(!v) return ''; const s=String(v).trim(); const dm=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(dm) return `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`; return s.slice(0,10); }
function titleCaseWords(value){ return String(value||'').trim().replace(/\s+/g,' ').split(' ').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' '); }
function canonicalEffortType(value){ const clean=String(value||'Other').trim().replace(/\s+/g,' '); return clean ? titleCaseWords(clean) : 'Other'; }
function canonicalEffortColour(value){ const key=String(value||'').trim().toLowerCase(); if(key==='gold') return 'Gold'; if(key==='green') return 'Green'; if(key==='yellow') return 'Yellow'; if(key==='red') return 'Red'; return String(value||'').trim(); }
function parseCSV(text){
  text=String(text||'').replace(/^\uFEFF/,''); const rows=[]; let row=[],field='',inQuotes=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(inQuotes){ if(c==='"'){ if(text[i+1]==='"'){field+='"';i++;} else inQuotes=false;} else field+=c; }
    else { if(c==='"') inQuotes=true; else if(c===','){row.push(field);field='';} else if(c==='\n'){row.push(field);field=''; if(row.some(x=>String(x).trim()!=='')) rows.push(row); row=[];} else if(c!=='\r') field+=c; }
  }
  row.push(field); if(row.some(x=>String(x).trim()!=='')) rows.push(row); if(!rows.length) return [];
  const headers=rows.shift().map(h=>String(h).replace(/^\uFEFF/,'').trim());
  return rows.map(cols=>{const obj={};headers.forEach((h,i)=>obj[h]=cols[i]??'');return obj;});
}
function readIfExists(file){ try{return fs.readFileSync(file,'utf8');}catch{return '';}}
function dataPath(ref){ if(!ref) return ''; return path.join(DATA_DIR, String(ref).replace(/^data[\/]/,'')); }
function parseAttrs(s){ const out={}; const re=/([A-Za-z0-9_:-]+)="([^"]*)"/g; let m; while((m=re.exec(s))) out[m[1]]=m[2]; return out; }
function parseSuperScoutMinutes(xmlText){
  const out={minutes:new Map(), ballInPlay:new Map(), players:new Map(), playersByPlid:new Map(), playersByShirt:new Map()};
  if(!String(xmlText||'').trim()) return out;
  const re=/<Player\b([^>]*)\/?\s*>/g; let m;
  while((m=re.exec(xmlText))){
    const a=parseAttrs(m[1]);
    const first=a.PLFORN||''; const last=a.PLSURN||''; const name=`${first} ${last}`.trim(); const team=(a.TEAMNAME||'').trim();
    if(!name||!team) continue;
    const key=playerKey(name,team);
    const info={key,name,team,minutes:toNumber(a.MINS),shirt:a.ShirtNo||'',position:a.PosID||'',plid:a.PLID||'',attMinutes:toNumber(a.AttMinutes),defMinutes:toNumber(a.DefMinutes),ballInPlayMins:toNumber(a.BallInPlayMins)};
    out.players.set(key,info); if(info.plid) out.playersByPlid.set(String(info.plid),info); if(info.team&&info.shirt) out.playersByShirt.set(`${norm(info.team)}|${String(info.shirt).replace(/^0+/,'')}`,info); if(info.minutes>0) out.minutes.set(key,info.minutes); if(info.ballInPlayMins>0) out.ballInPlay.set(key,info.ballInPlayMins);
  }
  return out;
}
function extractReviewName(row){ const first=row.PlayerFirstName||'', last=row.PlayerLastName||''; const name=`${first} ${last}`.trim(); if(name) return name; const combined=row['PlayerName (Team)']||''; const m=combined.match(/^(.*?)\s*\((.*?)\)\s*$/); return (m?m[1]:combined).trim(); }
function extractReviewTeam(row){ if(row.TeamName) return row.TeamName; const combined=row['PlayerName (Team)']||''; const m=combined.match(/^(.*?)\s*\((.*?)\)\s*$/); return (m?m[2]:'').trim(); }
function blankStats(player){return {player,totalActions:0,appearances:0,minutes:0,ballInPlayMins:0,positiveActions:0,negativeActions:0,carry:0,carryMetres:0,postContactMetres:0,carryDominant:0,carryContact:0,tackleAttempts:0,tackleMade:0,tackleDominant:0,colours:{Gold:0,Green:0,Yellow:0,Red:0},reviewTotal:0,typeByColour:{Gold:{},Green:{},Yellow:{},Red:{}},typeCounts:{},shirt:player.shirt||'',position:player.position||''};}
function ensurePlayer(match, players, name, team, data={}){
  if(!name||!team) return null; const key=playerKey(name,team);
  let p=players.get(key); if(!p){ p={key,name:name.trim(),team:team.trim(),shirt:'',position:'',show:isTargetTeam(team),matches:[]}; players.set(key,p); }
  if(data.shirt&&!p.shirt) p.shirt=String(data.shirt).padStart(2,'0'); if(data.position&&!p.position) p.position=data.position;
  let st=match.playerStats.get(key); if(!st){ st=blankStats(p); match.playerStats.set(key,st); }
  if(data.shirt&&!st.shirt) st.shirt=String(data.shirt).padStart(2,'0'); if(data.position&&!st.position) st.position=data.position;
  return {key,player:p,stats:st};
}
function clockMinutes(v){ const n=Number(v); if(!Number.isFinite(n)) return null; const whole=Math.floor(n); const mm=Math.floor(whole/100); const ss=whole%100; if(ss>=60) return n/60; return mm + ss/60; }
function rowClockMinutes(row){ const mt=clockMinutes(row.MatchTime); if(mt!==null) return mt; const ps=toNumber(row.ps_timestamp||row.ps_endstamp); return ps ? ps/60 : null; }
function computeMatchEndMinutes(biRows){ let end=0; for(const row of biRows){ const t=rowClockMinutes(row); if(t!==null&&t>end) end=t; } return Math.max(80,end||80); }
function computePlayerMinutesFromBI(biRows, matchEnd){
  const byPlayer=new Map(); for(const row of biRows){ const name=(row.playerName||'').trim(); const team=(row.teamName||'').trim(); if(!name||!team) continue; const key=playerKey(name,team); if(!byPlayer.has(key)) byPlayer.set(key,[]); byPlayer.get(key).push(row); }
  const minutes=new Map();
  for(const [key,rows] of byPlayer){
    rows.sort((a,b)=>(rowClockMinutes(a)||0)-(rowClockMinutes(b)||0));
    const hasAction=rows.some(r=>String(r.actionName||'').trim() && !/^Sub (In|Out)$/i.test(String(r.actionName||'').trim()));
    const startsOnField=hasAction || !rows.some(r=>/^Sub In$/i.test(String(r.actionName||'').trim()));
    let on=startsOnField, start=0, total=0;
    for(const r of rows){ const action=String(r.actionName||'').trim(); const t=rowClockMinutes(r); if(t===null) continue; if(action==='Sub In'){ if(!on){ on=true; start=Math.min(t,matchEnd); } } else if(action==='Sub Out'){ if(on){ total+=Math.max(0,Math.min(t,matchEnd)-start); on=false; } } }
    if(on) total+=Math.max(0,matchEnd-start); minutes.set(key,Math.min(matchEnd,Math.max(0,total)));
  }
  return minutes;
}
function textBlob(row){return [row.actionName,row.ActionTypeName,row.ActionResultName,row.qualifier3Name,row.qualifier4Name,row.qualifier5Name,row.qualifier6Name,row.qualifier7Name].map(x=>String(x||'')).join(' | ');}
function samuraiScoreRow(row){
  const action=String(row.actionName||'').trim(); const result=String(row.ActionResultName||'').trim(); const q=textBlob(row); let pos=0, neg=0; const has=re=>re.test(q);
  if(action==='Carry'){ if(has(/Error|Lost|Turnover|Carried in Touch|Ineffective Contact|Tackled Ineffective/i)) neg++; else pos++; if(has(/Dominant Contact|Tackled Dominant/i)) pos++; if(has(/Line Break|Clean Break|Defender Beaten|Bumped Off/i)) pos++; }
  if(action==='Pass'){ if(has(/Incomplete|Bad Pass|Missed|Error|To Opposition/i)) neg++; else pos++; if(has(/Break Assist/i)) pos++; }
  if(action==='Collection'){ if(has(/Catch|Collected|Success|Won/i)) pos++; if(has(/Dropped|Error|Lost/i)) neg++; }
  if(action==='Kick'){ if(has(/Kick Error|Charged Down|Failed|Out on Full|Error/i)) neg++; else if(has(/Kick in Play|Touch Kick|Penalty Kick Touch|50-22|Territorial|Bomb|Box|Chip/i)) pos++; if(has(/Regained|Retained/i)) pos++; }
  if(action==='Restart'){ pos++; if(has(/Retained/i)) pos++; }
  if(action==='Goal Kick'){ if(has(/Goal Kicked|Scored|Success/i)) pos++; else neg++; }
  if(action==='Tackle'){ if(result==='Missed'||has(/Missed|Ineffective Tackle|Passive|Offload Allowed|Penalty Conceded/i)) neg++; else pos++; if(has(/Dominant Tackle/i)) pos++; if(has(/Turnover|Penalty Won|Try Save/i)) pos++; }
  if(action==='Missed Tackle') neg++; if(action==='Ruck'){ if(has(/Failed Clearout|Ineffective|Lost|Penalty Conceded|Off Feet|Wrong Side/i)) neg++; else if(has(/Cleaned Out|Own Team|Effective|Jackal|Penalty Won|Turnover Won/i)) pos++; }
  if(action==='Turnover'){ if(has(/Won|Turnover Won|Penalty Won/i)) pos++; else neg++; }
  if(action==='Lineout Throw'||action==='Lineout Take'){ if(has(/Lost|Not Straight|Fail|Offence/i)) neg++; else pos++; }
  if(action==='Penalty Conceded') neg++; if(action==='Card'){ if(has(/Yellow/i)) neg++; if(has(/Red/i)) neg++; } if(has(/Handling Error|Dropped Ball/i)) neg++;
  return {positive:pos,negative:neg};
}
function deriveMeta(item,biRows){ const first=biRows.find(r=>r.FXID||r.homeTeamName||r.awayTeamName)||{}; const home=item.homeTeam||first.homeTeamName||''; const away=item.awayTeam||first.awayTeamName||''; const score=item.score||((first.hometeamFTscore||first.awayteamFTscore)?`${first.hometeamFTscore??''}–${first.awayteamFTscore??''}`:''); const label=item.label||(home&&away&&score?`${home} ${score} ${away}`:(home&&away?`${home} v ${away}`:item.id)); const date=item.date||dateLabel(first.datePlayed||first.UTCTime); const season=String(item.season||first.season||date.slice(0,4)||'Unknown'); return {id:String(item.id||first.FXID||label),label,date,season,home,away,score,venue:item.venue||first.venueName||'',competition:item.competition||first.competitionName||'',raw:item}; }
function buildMatch(item,biRows,reviewRows,xmlText,players){
  const meta=deriveMeta(item,biRows); const matchEnd=computeMatchEndMinutes(biRows); const xmlData=parseSuperScoutMinutes(xmlText); const fallbackMinutes=computePlayerMinutesFromBI(biRows,matchEnd); const playerMinutes=xmlData.minutes.size?xmlData.minutes:fallbackMinutes; const playerBallInPlay=xmlData.ballInPlay.size?xmlData.ballInPlay:playerMinutes; const match={...meta,matchEndMinutes:matchEnd,minutesSource:xmlData.minutes.size?'SuperScout XML':'BI CSV fallback',playerStats:new Map()}; const seen=new Set();
  const xmlInfoFor=(row,name,team)=>{ const plid=String(row.PLID||row.plid||'').trim(); if(plid && xmlData.playersByPlid.has(plid)) return xmlData.playersByPlid.get(plid); const shirt=String(row.playerShirtNumber||row.ShirtNumber||'').replace(/^0+/,'').trim(); if(team&&shirt&&xmlData.playersByShirt.has(`${norm(team)}|${shirt}`)) return xmlData.playersByShirt.get(`${norm(team)}|${shirt}`); return xmlData.players.get(playerKey(name,team))||null; };
  const applyXmlMinutes=(st,info)=>{ if(!info) return false; if(info.minutes>0) st.minutes=info.minutes; if(info.ballInPlayMins>0) st.ballInPlayMins=info.ballInPlayMins; if(info.shirt&&!st.shirt) st.shirt=String(info.shirt).padStart(2,'0'); if(info.position&&!st.position) st.position=info.position; return true; };
  for(const info of xmlData.players.values()){ if(info.minutes<=0) continue; const got=ensurePlayer(match,players,info.name,info.team,{shirt:info.shirt,position:info.position}); if(!got) continue; got.stats.appearances=1; got.stats.minutes=info.minutes; got.stats.ballInPlayMins=info.ballInPlayMins||info.minutes||0; seen.add(got.key); }
  for(const row of biRows){ const name=(row.playerName||'').trim(); const team=(row.teamName||'').trim(); const got=ensurePlayer(match,players,name,team,{shirt:row.playerShirtNumber,position:row.playerpositionName}); if(!got) continue; const st=got.stats; const sk=got.key; if(!seen.has(sk)){ seen.add(sk); st.appearances=1; st.minutes=playerMinutes.get(sk)||0; st.ballInPlayMins=playerBallInPlay.get(sk)||st.minutes||0; } applyXmlMinutes(st,xmlInfoFor(row,name,team)); st.totalActions++; const sam=samuraiScoreRow(row); st.positiveActions+=sam.positive; st.negativeActions+=sam.negative; const action=String(row.actionName||'').trim(); if(action==='Carry'){ st.carry++; st.carryMetres+=toNumber(row.Metres2); st.postContactMetres+=toNumber(row.Metres3); const contact=String(row.qualifier4Name||''); if(/Contact/i.test(contact)) st.carryContact++; if(/Dominant Contact/i.test(contact)) st.carryDominant++; } if(action==='Tackle'){ st.tackleAttempts++; const result=String(row.ActionResultName||'').trim(); if(result!=='Missed') st.tackleMade++; const tq=String(row.qualifier4Name||''); if(/Dominant Tackle/i.test(tq)) st.tackleDominant++; } }
  for(const row of reviewRows){ const name=extractReviewName(row); const team=extractReviewTeam(row); const got=ensurePlayer(match,players,name,team,{shirt:row.ShirtNumber}); if(!got) continue; const st=got.stats; if(!st.appearances){ const sk=playerKey(name,team); st.appearances=1; st.minutes=playerMinutes.get(sk)||0; st.ballInPlayMins=playerBallInPlay.get(sk)||st.minutes||0; } const colour=canonicalEffortColour(row.next_action_result); const type=canonicalEffortType(row.next_action_type||'Other'); if(st.colours[colour]!==undefined){ st.colours[colour]++; st.typeByColour[colour][type]=(st.typeByColour[colour][type]||0)+1; } st.reviewTotal++; st.typeCounts[type]=(st.typeCounts[type]||0)+1; }
  return match;
}
function serializeMatch(match){ const playerStats={}; for(const [key,st] of match.playerStats){ playerStats[key]=st; } return {match:{id:match.id,label:match.label,date:match.date,season:match.season,home:match.home,away:match.away,score:match.score,venue:match.venue,competition:match.competition,matchEndMinutes:match.matchEndMinutes,minutesSource:match.minutesSource}, playerStats}; }
function main(){
  fs.mkdirSync(STATS_DIR,{recursive:true});
  const manifestPath=path.join(DATA_DIR,'matches.json');
  if(!fs.existsSync(manifestPath)){ throw new Error('data/matches.json not found. Run generate-matches.js first.'); }
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const players=new Map(); const matchSummaries=[];
  for(const item of manifest){
    const id=String(item.id||item.matchId||'').trim();
    const biRows=parseCSV(readIfExists(dataPath(item.biCsv)));
    const reviewRows=parseCSV(readIfExists(dataPath(item.reviewCsv)));
    const xmlText=readIfExists(dataPath(item.superscoutXml));
    const match=buildMatch({...item,id:id||item.id},biRows,reviewRows,xmlText,players);
    const serialized=serializeMatch(match);
    fs.writeFileSync(path.join(STATS_DIR, `${match.id}.json`), JSON.stringify(serialized));
    const summary={id:match.id,label:match.label,date:match.date,season:match.season,home:match.home,away:match.away,score:match.score,venue:match.venue,competition:match.competition,minutesSource:match.minutesSource};
    matchSummaries.push(summary);
    for(const [key,st] of match.playerStats){
      const p=players.get(key); if(!p) continue;
      if(!p.matches.includes(match.id)) p.matches.push(match.id);
      p.shirt=p.shirt||st.shirt||''; p.position=p.position||st.position||'';
      if(!p.matchSummaries) p.matchSummaries={};
      p.matchSummaries[match.id]={carry:st.carry,tackleMade:st.tackleMade,tackleAttempts:st.tackleAttempts,effort:st.reviewTotal,minutes:st.minutes};
    }
  }
  const index={generatedAt:new Date().toISOString(),version:2,matches:matchSummaries,players:[...players.values()].filter(p=>p.show).sort((a,b)=>a.team.localeCompare(b.team)||a.name.localeCompare(b.name)).map(p=>({key:p.key,name:p.name,team:p.team,shirt:p.shirt||'',position:p.position||'',matches:p.matches,matchSummaries:p.matchSummaries||{}}))};
  fs.writeFileSync(path.join(DATA_DIR,'player_index.json'), JSON.stringify(index));
  console.log(`Generated player_index.json and ${matchSummaries.length} stats files for ${index.players.length} Japan players.`);
}
main();
