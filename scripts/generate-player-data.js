const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const STATS_DIR = path.join(DATA_DIR, 'stats');
const MATCH_REVIEW_DIR = path.join(DATA_DIR, 'match_review');
const TARGET_TEAMS = ['Japan', 'Japan XV'];
const MIN_MATCH_DATE = '2024-01-01';

function norm(v){return String(v??'').trim().replace(/\s+/g,' ').toLowerCase();}
function normTeam(v){return String(v??'').trim().replace(/\s+/g,' ').toUpperCase();}
function isTargetTeam(team){
  const t=normTeam(team);
  if(!t) return false;
  const targets=TARGET_TEAMS.map(normTeam);
  if(targets.includes(t)) return true;
  return t.split(/[\/,&]+/).map(x=>normTeam(x)).some(part=>targets.includes(part));
}
function playerKey(name,team){return isTargetTeam(team)?`${norm(name)}|japan-group`:`${norm(name)}|${norm(team)}`;}
function mergeDisplayTeams(current, incoming){ const list=(Array.isArray(current)?current:(current?[current]:[])).filter(Boolean); if(incoming&&!list.some(t=>normTeam(t)===normTeam(incoming))) list.push(String(incoming).trim()); const order=t=>normTeam(t)==='JAPAN'?0:normTeam(t)==='JAPAN XV'?1:2; return list.sort((a,b)=>order(a)-order(b)||String(a).localeCompare(String(b)));}
function displayTeamName(teams){ const list=Array.isArray(teams)?teams.filter(Boolean):[]; return list.length?list.join(' / '):'';}
function toNumber(v){const n=parseFloat(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;}
function getField(row,names){ if(!row) return ''; for(const name of names){ if(Object.prototype.hasOwnProperty.call(row,name)) return row[name]; } const lower={}; for(const k of Object.keys(row||{})) lower[k.toLowerCase()]=row[k]; for(const name of names){ const v=lower[String(name).toLowerCase()]; if(v!==undefined) return v; } return ''; }
function normalizeShirt(v){ const m=String(v??'').trim().match(/\d+/); return m?String(Number(m[0])).padStart(2,'0'):''; }
function dateLabel(v){ if(!v) return ''; const s=String(v).trim(); const dm=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(dm) return `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`; return s.slice(0,10); }
function isDateOnOrAfter(date, minDate=MIN_MATCH_DATE){ const d=String(date||'').slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(d) && d>=minDate; }
function cleanJsonFiles(dir){ try{ fs.mkdirSync(dir,{recursive:true}); for(const f of fs.readdirSync(dir)){ if(f.endsWith('.json')) fs.rmSync(path.join(dir,f),{force:true}); } }catch{} }
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
    const info={key,name,team,minutes:toNumber(a.MINS),shirt:a.ShirtNo||'',position:a.PosID||'',positionId:a.PosID||'',plid:a.PLID||'',attMinutes:toNumber(a.AttMinutes),defMinutes:toNumber(a.DefMinutes),ballInPlayMins:toNumber(a.BallInPlayMins)};
    out.players.set(key,info); if(info.plid) out.playersByPlid.set(String(info.plid),info); if(info.team&&info.shirt) out.playersByShirt.set(`${norm(info.team)}|${String(info.shirt).replace(/^0+/,'')}`,info); if(info.minutes>0) out.minutes.set(key,info.minutes); if(info.ballInPlayMins>0) out.ballInPlay.set(key,info.ballInPlayMins);
  }
  return out;
}
function extractReviewName(row){ const first=row.PlayerFirstName||'', last=row.PlayerLastName||''; const name=`${first} ${last}`.trim(); if(name) return name; const combined=row['PlayerName (Team)']||''; const m=combined.match(/^(.*?)\s*\((.*?)\)\s*$/); return (m?m[1]:combined).trim(); }
function extractReviewTeam(row){ if(row.TeamName) return row.TeamName; const combined=row['PlayerName (Team)']||''; const m=combined.match(/^(.*?)\s*\((.*?)\)\s*$/); return (m?m[2]:'').trim(); }
function blankStats(player){return {player,team:player.team||'',teams:player.teams||[],positionId:'',totalActions:0,appearances:0,minutes:0,ballInPlayMins:0,positiveActions:0,negativeActions:0,carry:0,carryMetres:0,postContactMetres:0,carryDominant:0,carryContact:0,tackleAttempts:0,tackleMade:0,tackleDominant:0,goalKickAttempts:0,goalKickMade:0,cleanBreaks:0,defendersBeaten:0,tackleFirstAttempts:0,tackleFirstMade:0,tackleFirstDominant:0,ruckSupportAttack:0,ruckSupportAttackEffective:0,colours:{Gold:0,Green:0,Yellow:0,Red:0},reviewTotal:0,typeByColour:{Gold:{},Green:{},Yellow:{},Red:{}},timeByColour:{Gold:{},Green:{},Yellow:{},Red:{}},typeCounts:{},positiveActionTypes:{},negativeActionTypes:{},shirt:'',position:'',rosterSource:'',matchHistory:[]};}
function ensurePlayer(match, players, name, team, data={}){
  if(!name||!team) return null; const key=playerKey(name,team);
  let p=players.get(key); if(!p){ const teams=mergeDisplayTeams([], team); p={key,name:name.trim(),team:displayTeamName(teams)||team.trim(),teams,shirt:'',position:'',show:isTargetTeam(team),matches:[]}; players.set(key,p); } else { p.teams=mergeDisplayTeams(p.teams||p.team, team); p.team=displayTeamName(p.teams)||p.team; p.show=p.show||isTargetTeam(team); }
  // Keep player-level metadata for search only. Match-up logic must use match-specific stats below.
  const normalizedShirt=normalizeShirt(data.shirt);
  if(normalizedShirt&&!p.shirt) p.shirt=normalizedShirt; if(data.position&&!p.position) p.position=data.position; if(data.positionId&&!p.positionId) p.positionId=data.positionId;
  let st=match.playerStats.get(key); if(!st){ st=blankStats(p); match.playerStats.set(key,st); }
  if(normalizedShirt && st.rosterSource!=='SuperScout XML') st.shirt=normalizedShirt;
  if(data.position && st.rosterSource!=='SuperScout XML') st.position=data.position;
  if(data.positionId && st.rosterSource!=='SuperScout XML') st.positionId=data.positionId;
  st.team=p.team||team; st.teams=p.teams||[team].filter(Boolean);
  return {key,player:p,stats:st};
}
function clockMinutes(v){ const n=Number(v); if(!Number.isFinite(n)) return null; const whole=Math.floor(n); const mm=Math.floor(whole/100); const ss=whole%100; if(ss>=60) return n/60; return mm + ss/60; }
function rowClockMinutes(row){ const mt=clockMinutes(row.MatchTime); if(mt!==null) return mt; const ps=toNumber(row.start_timestamp||row.ps_timestamp||row.ps_endstamp); return ps ? ps/60 : null; }
function effortTimeBand(mins){ const m=Number(mins); if(!Number.isFinite(m)) return ''; if(m<20) return '0-20'; if(m<40) return '20-40'; if(m<60) return '40-60'; if(m<80) return '60-80'; return '80+'; }
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
function samuraiReasonLabel(prefix,row){
  const action=String(row.actionName||'').trim()||'Action';
  const type=String(row.ActionTypeName||'').trim();
  const result=String(row.ActionResultName||'').trim();
  const qs=[row.qualifier3Name,row.qualifier4Name,row.qualifier5Name,row.qualifier6Name,row.qualifier7Name].map(x=>String(x||'').trim()).filter(Boolean);
  const detail=[type,result,...qs].filter(Boolean).slice(0,3).join(' / ');
  return detail ? `${prefix}: ${detail}` : prefix;
}
function addSamuraiReason(list,label,count=1){ for(let i=0;i<count;i++) list.push(label); }
function samuraiScoreRow(row){
  // JRFU / PowerBI Samurai Stats logic.
  // A single row can count in multiple categories, matching the DAX measure structure.
  const normText = v => String(v ?? '').trim().replace(/\s+/g,' ').toLowerCase();
  const raw = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim();
    }
    return '';
  };
  const eq = (value, target) => normText(value) === normText(target);
  const inSet = (value, list) => list.some(item => eq(value, item));

  const action = raw('actionName','ActionName','action');
  const type = raw('ActionTypeName','actionTypeName');
  const result = raw('ActionResultName','actionResultName');
  const q3 = raw('qualifier3Name','Qualifier3Name');
  const q4 = raw('qualifier4Name','Qualifier4Name');

  let pos = 0, neg = 0;
  const positiveReasons = [], negativeReasons = [];
  const addPos = label => { pos++; positiveReasons.push(label); };
  const addNeg = label => { neg++; negativeReasons.push(label); };

  // Positive Actions JRFU
  if(eq(action,'Pass') && inSet(type, ['Complete','Break','Key','Off Target','Try'])) addPos('Pass positive');
  if(eq(type,'Offload')) addPos('Ball carry offload');
  if(inSet(type, ['Initial Break','Supported Break'])) addPos('Linebreak');
  if(inSet(type, ['Try Assist','Break Assist','Decoy','Snake'])) addPos('Attacking quality');
  if(eq(type,'Defender Beaten')) addPos('Defender beaten');
  if(inSet(q3, ['Kick in Play','Kick in Play (Own 22)'])) addPos('Kick in play');
  if(eq(q3,'Penalty Kick') && inSet(result, ['Kick In Touch (Bounce)','Kick In Touch (Full)'])) addPos('Penalty kick to touch');
  if(eq(action,'Kick') && inSet(result, ['Own Player - Collected','Pressure Error','Try Kick','Pressure in Touch','Pressure Carried Over'])) addPos('Kick retained / pressure');
  if(eq(action,'Kick') && eq(q4,'50/22')) addPos('50/22');
  if(eq(action,'Goal Kick') && eq(result,'Goal Kicked')) addPos('Goal kick made');
  if(eq(action,'Lineout Throw') && inSet(result, ['Won Clean Catch','Won Clean Tap','Won Free Kick','Won Other','Won Other From Scrappy Catch','Won Penalty','Won Tap (Scrappy)'])) addPos('Lineout won');
  if(eq(action,'Carry')) addPos('Ball carry');
  if(eq(action,'Carry') && eq(result,'Try Scored')) addPos('Carry try scored');
  if(inSet(result, ['Complete','Forced in Touch','Passive','Sack','Try Saver','Turnover Won'])) addPos('Tackle made');
  if(inSet(result, ['Restart Retained','Restart Opp Error','Restart Opp Collection'])) addPos('Restart positive');
  if(eq(action,'Tackle') && inSet(result, ['Forced in Touch','Turnover Won'])) addPos('Tackle turnover won');
  if(eq(action,'Tackle') && eq(q4,'Dominant Tackle')) addPos('Dominant tackle');
  if(eq(q4,'Dominant Contact')) addPos('Dominant carry');
  if(eq(action,'Collection') && eq(result,'Success')) addPos('Handling success');
  if(eq(action,'Ruck OOA') && eq(q4,'Attacking OOA') && inSet(type, ['Cleaned Out','Secured'])) addPos('Ruck clean effective');
  if(eq(action,'Lineout Take') && inSet(type, ['Lineout Steal Front','Lineout Steal Middle','Lineout Steal Back','Lineout Steal 15m+','Lineout Steal Quick','Lineout Win Front','Lineout Win Middle','Lineout Win Back','Lineout Win 15m+','Lineout Win Quick'])) addPos('Lineout opposition steal / win');
  if(eq(action,'Ruck OOA') && eq(q4,'Defensive OOA') && inSet(type, ['Nuisance','Turnover Won','Penalty Won'])) addPos('Ruck defence effective');

  // Negative Actions JRFU
  if(eq(result,'Offload Allowed')) addNeg('Offload allowed');
  if(eq(action,'Missed Tackle')) addNeg('Tackle missed');
  if(eq(action,'Tackle') && eq(result,'Passive')) addNeg('Passive tackle');
  if(eq(action,'Penalty Conceded') && eq(q4,'Full Penalty')) addNeg('Penalty conceded - full penalty');
  if(eq(action,'Penalty Conceded') && eq(q4,'Free Kick')) addNeg('Penalty conceded - free kick');
  if(eq(action,'Penalty Conceded') && eq(result,'Yellow Card')) addNeg('Yellow card');
  if(eq(action,'Penalty Conceded') && eq(result,'Red Card')) addNeg('Red card');
  if(eq(q4,'Ineffective Contact')) addNeg('Ineffective carry/contact');
  if(eq(action,'Ruck OOA') && eq(q4,'Attacking OOA') && inSet(type, ['Failed Cleanout','Attended','Penalty Conceded'])) addNeg('Ruck clean ineffective');
  if(eq(action,'Ruck OOA') && eq(q4,'Defensive OOA') && inSet(type, ['Not Clearing','Got Cleaned Out','Penalty Conceded'])) addNeg('Ruck defence ineffective');
  if(eq(action,'Collection') && eq(result,'Fail')) addNeg('Handling fail');
  if(eq(type,'Offload') && eq(result,'To Ground')) addNeg('Offload to ground');
  if(eq(result,'Error On Defence')) addNeg('Error on defence');
  if(eq(result,'Error On Attack')) addNeg('Error on attack');
  if(eq(action,'Goal Kick') && eq(result,'Goal Missed')) addNeg('Goal kick missed');

  return {positive:pos, negative:neg, positiveReasons, negativeReasons};
}

function starterFinisherRole(shirt){
  const m=String(shirt||'').match(/\d+/);
  if(!m) return 'Unknown';
  const n=Number(m[0]);
  if(n>=1 && n<=15) return 'Starter';
  if(n>=16) return 'Finisher';
  return 'Unknown';
}
function attachMatchHistory(match){
  for(const [key,st] of match.playerStats){
    if(!st || !(st.appearances || st.minutes || st.totalActions || st.reviewTotal)) continue;
    const shirt=normalizeShirt(st.shirt||st.jersey||st.matchShirt||'');
    st.matchHistory=[{
      matchId:match.id,
      date:match.date||'',
      label:match.label||match.id||'',
      season:match.season||'',
      shirt,
      position:st.position||'',
      positionId:st.positionId||'',
      minutes:toNumber(st.minutes||0),
      role:starterFinisherRole(shirt)
    }];
  }
}

function deriveMeta(item,biRows){ const first=biRows.find(r=>r.FXID||r.homeTeamName||r.awayTeamName)||{}; const home=item.homeTeam||first.homeTeamName||''; const away=item.awayTeam||first.awayTeamName||''; const score=item.score||((first.hometeamFTscore||first.awayteamFTscore)?`${first.hometeamFTscore??''}–${first.awayteamFTscore??''}`:''); const label=item.label||(home&&away&&score?`${home} ${score} ${away}`:(home&&away?`${home} v ${away}`:item.id)); const date=item.date||dateLabel(first.datePlayed||first.UTCTime); const season=String(item.season||first.season||date.slice(0,4)||'Unknown'); return {id:String(item.id||first.FXID||label),label,date,season,home,away,score,venue:item.venue||first.venueName||'',competition:item.competition||first.competitionName||'',raw:item}; }

function rowTextForCompare(row){return [row.actionName,row.ActionName,row.ActionTypeName,row.actionTypeName,row.ActionResultName,row.actionResultName,row.qualifier3Name,row.qualifier4Name,row.qualifier5Name,row.qualifier6Name,row.qualifier7Name,row.Qualifier3Name,row.Qualifier4Name].map(x=>String(x||'')).join(' | ');}
function compareNorm(v){return String(v||'').trim().replace(/\s+/g,' ').toLowerCase();}
function rowIsFirstTackle(row){
  const text=compareNorm(rowTextForCompare(row));
  return text.includes('1st tackle') || text.includes('first tackle') || text.includes('1st tackler') || text.includes('first tackler');
}
function rowIsTackleAttempt(row){
  const action=compareNorm(row.actionName||row.ActionName);
  return action==='tackle' || action==='missed tackle';
}
function rowIsTackleMade(row){
  const action=compareNorm(row.actionName||row.ActionName);
  const result=compareNorm(row.ActionResultName||row.actionResultName);
  return action==='tackle' && result!=='missed';
}
function isRuckSupportAttack(row){
  const action=compareNorm(row.actionName||row.ActionName);
  const q4=compareNorm(row.qualifier4Name||row.Qualifier4Name);
  const text=compareNorm(rowTextForCompare(row));
  return (action==='ruck ooa' && q4==='attacking ooa') || text.includes('ruck support attack');
}
function isRuckSupportAttackEffective(row){
  const type=compareNorm(row.ActionTypeName||row.actionTypeName);
  const result=compareNorm(row.ActionResultName||row.actionResultName);
  return ['cleaned out','secured','effective','success','won'].includes(type) || ['success','won','turnover won','penalty won'].includes(result);
}
function trackComparisonMetrics(st,row){
  const action=compareNorm(row.actionName||row.ActionName);
  const type=compareNorm(row.ActionTypeName||row.actionTypeName);
  const q4=compareNorm(row.qualifier4Name||row.Qualifier4Name);
  if(type==='initial break' || type==='supported break' || type==='clean break') st.cleanBreaks++;
  if(type==='defender beaten') st.defendersBeaten++;
  if(rowIsTackleAttempt(row) && rowIsFirstTackle(row)){
    st.tackleFirstAttempts++;
    if(rowIsTackleMade(row)) st.tackleFirstMade++;
    if(action==='tackle' && q4==='dominant tackle') st.tackleFirstDominant++;
  }
  if(isRuckSupportAttack(row)){
    st.ruckSupportAttack++;
    if(isRuckSupportAttackEffective(row)) st.ruckSupportAttackEffective++;
  }
}


function teamBaseName(team){ const raw=String(team||'').trim(); if(!raw) return 'Unknown'; const parts=raw.split('/').map(x=>x.trim()).filter(Boolean); const first=parts[0]||raw; return first; }
function canonicalTeamForStats(team){ const raw=String(team||'').trim(); if(!raw) return 'Unknown'; const upper=normTeam(raw); if(upper==='JAPAN') return 'Japan'; if(upper==='JAPAN XV') return 'Japan XV'; return raw; }
function emptyTeamStats(team){return {team,carryMetres:0,kickingMetres:0,penaltiesConceded:0,turnoversConceded:0,opp22Time:0,_opp22Intervals:[],lineoutTotal:0,lineoutWon:0,scrumTotal:0,scrumWon:0,carry:{fwds:{carries:0,metres:0,pcm:0},bks:{carries:0,metres:0,pcm:0}}};}
function getTeamStatsMap(match){ if(!match.teamStats) match.teamStats=new Map(); return match.teamStats; }
function ensureTeamStats(match,team){ const name=canonicalTeamForStats(team); const map=getTeamStatsMap(match); if(!map.has(name)) map.set(name,emptyTeamStats(name)); return map.get(name); }
function textOfRow(row){
  return [
    getField(row,['actionName','ActionName','action']),
    getField(row,['ActionTypeName','actionTypeName','typeName']),
    getField(row,['ActionResultName','actionResultName','resultName']),
    getField(row,['qualifier3Name','Qualifier3Name']),
    getField(row,['qualifier4Name','Qualifier4Name']),
    getField(row,['qualifier5Name','Qualifier5Name']),
    getField(row,['qualifier6Name','Qualifier6Name']),
    getField(row,['qualifier7Name','Qualifier7Name'])
  ].map(x=>String(x||'')).join(' | ');
}
function rowNormText(row){return textOfRow(row).toLowerCase();}
function actionNameOf(row){return String(getField(row,['actionName','ActionName','actionNameLong'])||'').trim();}
function resultNameOf(row){return String(getField(row,['ActionResultName','actionResultName','resultName'])||'').trim();}
function typeNameOf(row){return String(getField(row,['ActionTypeName','actionTypeName','typeName'])||'').trim();}
function qName(row,n){return String(getField(row,[`qualifier${n}Name`,`Qualifier${n}Name`])||'').trim();}
function anyTextHas(row, patterns){ const txt=rowNormText(row); return patterns.some(p=>txt.includes(String(p).toLowerCase())); }
function isKickRow(row){
  const a=norm(actionNameOf(row));
  const txt=rowNormText(row);
  if(a==='goal kick') return false;
  return a==='kick' || a.includes('kick') || txt.includes('kick in play') || txt.includes('penalty kick') || txt.includes('50/22');
}
function kickMetresOf(row){
  const vals=['Metres','metres','Metres2','metres2','kickMetres','KickingMetres','Kicking Metres'].map(k=>toNumber(getField(row,[k])));
  return Math.max(0,...vals);
}
function isLineoutRow(row){ const a=norm(actionNameOf(row)); const txt=rowNormText(row); return a.includes('lineout') || txt.includes('lineout throw') || txt.includes('lineout take'); }
function isScrumRow(row){ const a=norm(actionNameOf(row)); const txt=rowNormText(row); return a.includes('scrum') || txt.includes('scrum '); }
function isLineoutWin(row){ const txt=rowNormText(row); const res=norm(resultNameOf(row)); const type=norm(typeNameOf(row)); return isLineoutRow(row) && (/won|win|success|retained|clean catch|clean tap|free kick|penalty|scrappy|steal/.test(txt+' '+res+' '+type)) && !/lost|not straight|overthrow|failed|opposition won|turnover conceded/.test(txt); }
function isScrumWin(row){ const txt=rowNormText(row); const res=norm(resultNameOf(row)); const type=norm(typeNameOf(row)); return isScrumRow(row) && /won|retained|complete|success|penalty won|free kick won/.test(res+' '+type+' '+txt) && !/lost|fail|penalty conceded|free kick conceded|turnover conceded|opposition/.test(res+' '+type+' '+txt); }
function isLineoutLost(row){ const txt=rowNormText(row); return isLineoutRow(row) && /lost|opposition|not straight|overthrow|failed|turnover conceded/.test(txt) && !/lineout steal|steal front|steal middle|steal back|won|win/.test(txt); }
function isScrumLost(row){ const txt=rowNormText(row); return isScrumRow(row) && /lost|opposition|penalty conceded|free kick conceded|turnover conceded|failed/.test(txt); }
function isTurnoverConcededRow(row){ const txt=rowNormText(row); if(txt.includes('turnover conceded')||txt.includes('turnover lost')||txt.includes('error on attack')) return true; if(isLineoutLost(row)||isScrumLost(row)) return true; return false; }
function isPenaltyConcededRow(row){ const a=norm(actionNameOf(row)); const txt=rowNormText(row); return a==='penalty conceded' || txt.includes('penalty conceded') || txt.includes('free kick conceded'); }
function rowPositionId(row,st){ const raw=st?.positionId||getField(row,['playerpositionID','playerpositionId','PositionID','PosID','positionId','playerPositionId']); const m=String(raw||'').match(/\d+/); return m?parseInt(m[0],10):0; }
function isPossessionTimeRow(row){
  const action=norm(actionNameOf(row));
  const txt=rowNormText(row);
  // Opp 22 Area Time should represent time with the ball, not defensive actions or penalties/cards.
  if(!action) return false;
  if(action==='tackle' || action==='missed tackle' || action==='penalty conceded' || action==='card') return false;
  if(txt.includes('tackle') && !txt.includes('tackle break') && !txt.includes('tackled')) return false;
  const possessionActions=[
    'carry','pass','kick','collection','lineout throw','scrum','ruck ooa','restart','goal kick',
    'maul','breakdown','try','conversion','penalty kick'
  ];
  if(possessionActions.some(a=>action===a || action.includes(a))) return true;
  // Some feeds carry possession information in qualifiers/results rather than ActionName.
  return /(carry|pass|kick in play|penalty kick|lineout throw|scrum|ruck ooa|collection|restart|maul)/.test(txt);
}
function opp22IntervalSeconds(row){
  // SuperScout/BI coordinates are team-relative in the feeds we use: x=100 is the opponent goal-line
  // for the team on the row. Therefore Opp 22 is x >= 78, not either end of the field.
  if(!isPossessionTimeRow(row)) return null;
  const start=toNumber(getField(row,['ps_timestamp','start_timestamp','startTime']));
  const end=toNumber(getField(row,['ps_endstamp','end_timestamp','endTime']));
  if(!(end>start)) return null;
  const x0=toNumber(getField(row,['x_coord','x']));
  const x1Raw=getField(row,['x_coord_end','x_end','end_x']);
  const x1=toNumber(x1Raw);
  if(!Number.isFinite(x0) && !Number.isFinite(x1)) return null;
  const from=Number.isFinite(x0)?x0:x1;
  const to=Number.isFinite(x1)?x1:from;
  const threshold=78;
  let a=start, b=end;
  if(from>=threshold && to>=threshold){
    // Entire action interval is in the opposition 22.
  }else if(from<threshold && to<threshold){
    return null;
  }else if(to!==from){
    const ratio=(threshold-from)/(to-from);
    if(!Number.isFinite(ratio)) return null;
    const cross=start+(end-start)*Math.max(0,Math.min(1,ratio));
    if(from<threshold && to>=threshold){ a=cross; b=end; }
    else if(from>=threshold && to<threshold){ a=start; b=cross; }
  }else{
    return null;
  }
  if(b>a) return [a,b];
  return null;
}
function mergeIntervalsSeconds(intervals){
  const clean=(intervals||[]).filter(x=>Array.isArray(x)&&x.length===2&&x[1]>x[0]).sort((a,b)=>a[0]-b[0]);
  if(!clean.length) return 0;
  let total=0, cs=clean[0][0], ce=clean[0][1];
  for(let i=1;i<clean.length;i++){
    const [s,e]=clean[i];
    if(s<=ce){ if(e>ce) ce=e; }
    else{ total+=ce-cs; cs=s; ce=e; }
  }
  total+=ce-cs;
  return total/60;
}
function finalizeTeamStats(match){
  for(const t of (match.teamStats||new Map()).values()){
    t.opp22Time=mergeIntervalsSeconds(t._opp22Intervals);
    delete t._opp22Intervals;
  }
}
function rowDurationMinutes(row){
  const start=toNumber(getField(row,['ps_timestamp','start_timestamp','startTime']));
  const end=toNumber(getField(row,['ps_endstamp','end_timestamp','endTime']));
  if(end>start) return (end-start)/60;
  return 0;
}
function trackTeamMatchStats(match,row,st){
  const team=String(getField(row,['teamName','TeamName','team','team_name'])||st?.team||st?.player?.team||'').trim(); if(!team) return; const t=ensureTeamStats(match,team);
  const action=actionNameOf(row); const actionN=norm(action);
  if(actionN==='carry'){
    const metres=toNumber(getField(row,['Metres2','metres2','CarryMetres','Carry Metres']));
    const pcm=toNumber(getField(row,['Metres3','metres3','PostContactMetres','Post Contact Metres']));
    t.carryMetres+=metres;
    const pid=rowPositionId(row,st); const grp=(pid>=1&&pid<=8)?'fwds':'bks';
    t.carry[grp].carries++; t.carry[grp].metres+=metres; t.carry[grp].pcm+=pcm;
  }
  if(isKickRow(row)) t.kickingMetres+=kickMetresOf(row);
  if(isPenaltyConcededRow(row)) t.penaltiesConceded++;
  if(isTurnoverConcededRow(row)) t.turnoversConceded++;
  if(isLineoutRow(row) && (actionN.includes('throw') || rowNormText(row).includes('lineout throw'))){ t.lineoutTotal++; if(isLineoutWin(row)) t.lineoutWon++; }
  // Some providers only mark lineout rows without "throw". Count them if no throw wording exists.
  if(isLineoutRow(row) && !actionN.includes('throw') && !rowNormText(row).includes('lineout throw') && /won|lost|not straight|overthrow|turnover conceded/.test(rowNormText(row))){ t.lineoutTotal++; if(isLineoutWin(row)) t.lineoutWon++; }
  if(isScrumRow(row)){ t.scrumTotal++; if(isScrumWin(row)) t.scrumWon++; }
  const oppInt=opp22IntervalSeconds(row); if(oppInt) t._opp22Intervals.push(oppInt);
}

function buildMatch(item,biRows,reviewRows,xmlText,players){
  const meta=deriveMeta(item,biRows); const matchEnd=computeMatchEndMinutes(biRows); const xmlData=parseSuperScoutMinutes(xmlText); const fallbackMinutes=computePlayerMinutesFromBI(biRows,matchEnd); const playerMinutes=xmlData.minutes.size?xmlData.minutes:fallbackMinutes; const playerBallInPlay=xmlData.ballInPlay.size?xmlData.ballInPlay:playerMinutes; const match={...meta,matchEndMinutes:matchEnd,minutesSource:xmlData.minutes.size?'SuperScout XML':'BI CSV fallback',playerStats:new Map()}; const seen=new Set();
  const xmlInfoFor=(row,name,team)=>{ const plid=String(row.PLID||row.plid||'').trim(); if(plid && xmlData.playersByPlid.has(plid)) return xmlData.playersByPlid.get(plid); const shirt=String(row.playerShirtNumber||row.ShirtNumber||'').replace(/^0+/,'').trim(); if(team&&shirt&&xmlData.playersByShirt.has(`${norm(team)}|${shirt}`)) return xmlData.playersByShirt.get(`${norm(team)}|${shirt}`); return xmlData.players.get(playerKey(name,team))||null; };
  const applyXmlMinutes=(st,info)=>{ if(!info) return false; if(info.minutes>0) st.minutes=info.minutes; if(info.ballInPlayMins>0) st.ballInPlayMins=info.ballInPlayMins; const xmlShirt=normalizeShirt(info.shirt); if(xmlShirt) st.shirt=xmlShirt; if(info.position) st.position=info.position; if(info.positionId||info.position) st.positionId=info.positionId||info.position; if(xmlShirt||info.position||info.positionId) st.rosterSource='SuperScout XML'; return true; };
  for(const info of xmlData.players.values()){ if(info.minutes<=0) continue; const got=ensurePlayer(match,players,info.name,info.team,{shirt:info.shirt,position:info.position,positionId:info.positionId||info.position}); if(!got) continue; got.stats.appearances=1; got.stats.minutes=info.minutes; got.stats.ballInPlayMins=info.ballInPlayMins||info.minutes||0; seen.add(got.key); }
  for(const row of biRows){ trackTeamMatchStats(match,row,null); const name=(getField(row,['playerName'])||'').trim(); const team=(getField(row,['teamName'])||'').trim(); const got=ensurePlayer(match,players,name,team,{shirt:getField(row,['playerShirtNumber','ShirtNumber']),position:getField(row,['playerpositionName','playerPositionName','positionName']),positionId:getField(row,['playerpositionID','playerpositionId','PositionID','PosID'])}); if(!got) continue; const st=got.stats; const sk=got.key; if(!seen.has(sk)){ seen.add(sk); st.appearances=1; st.minutes=playerMinutes.get(sk)||0; st.ballInPlayMins=playerBallInPlay.get(sk)||st.minutes||0; } applyXmlMinutes(st,xmlInfoFor(row,name,team)); st.totalActions++; trackComparisonMetrics(st,row); const sam=samuraiScoreRow(row); st.positiveActions+=sam.positive; st.negativeActions+=sam.negative; for(const label of sam.positiveReasons||[]) st.positiveActionTypes[label]=(st.positiveActionTypes[label]||0)+1; for(const label of sam.negativeReasons||[]) st.negativeActionTypes[label]=(st.negativeActionTypes[label]||0)+1; const action=String(row.actionName||'').trim(); if(action==='Carry'){ st.carry++; st.carryMetres+=toNumber(row.Metres2); st.postContactMetres+=toNumber(row.Metres3); const contact=String(row.qualifier4Name||''); if(/Contact/i.test(contact)) st.carryContact++; if(/Dominant Contact/i.test(contact)) st.carryDominant++; } if(action==='Tackle'){ st.tackleAttempts++; const result=String(row.ActionResultName||'').trim(); if(result!=='Missed') st.tackleMade++; const tq=String(row.qualifier4Name||''); if(/Dominant Tackle/i.test(tq)) st.tackleDominant++; } if(action==='Goal Kick'){ const result=String(row.ActionResultName||'').trim(); if(result){ st.goalKickAttempts++; if(result==='Goal Kicked') st.goalKickMade++; } } }
  for(const row of reviewRows){ const name=extractReviewName(row); const team=extractReviewTeam(row); const got=ensurePlayer(match,players,name,team,{shirt:row.ShirtNumber}); if(!got) continue; const st=got.stats; if(!st.appearances){ const sk=playerKey(name,team); st.appearances=1; st.minutes=playerMinutes.get(sk)||0; st.ballInPlayMins=playerBallInPlay.get(sk)||st.minutes||0; } const colour=canonicalEffortColour(row.next_action_result); const type=canonicalEffortType(row.next_action_type||'Other'); if(st.colours[colour]!==undefined){ st.colours[colour]++; st.typeByColour[colour][type]=(st.typeByColour[colour][type]||0)+1; const band=effortTimeBand(rowClockMinutes(row)); if(band) st.timeByColour[colour][band]=(st.timeByColour[colour][band]||0)+1; } st.reviewTotal++; st.typeCounts[type]=(st.typeCounts[type]||0)+1; }
  finalizeTeamStats(match);
  attachMatchHistory(match);
  return match;
}
function serializeMatch(match){ const playerStats={}; for(const [key,st] of match.playerStats){ playerStats[key]=st; } const teamStats=[...(match.teamStats||new Map()).values()]; return {match:{id:match.id,label:match.label,date:match.date,season:match.season,home:match.home,away:match.away,score:match.score,venue:match.venue,competition:match.competition,matchEndMinutes:match.matchEndMinutes,minutesSource:match.minutesSource}, teamStats, playerStats}; }
function serializeMatchReview(match){
  const playerStats={};
  for(const [key,st] of match.playerStats){
    const name=st.player?.name||st.playerName||'';
    const team=st.player?.team||st.team||'';
    const shirt=normalizeShirt(st.shirt||st.matchShirt||st.jersey||'');
    // Match Review only needs compact roster + Head-to-Head metrics.
    if(!name && !shirt) continue;
    playerStats[key]={
      player:{key,name,team},
      team, shirt,
      position:st.position||'', positionId:st.positionId||'',
      minutes:toNumber(st.minutes), ballInPlayMins:toNumber(st.ballInPlayMins),
      positiveActions:toNumber(st.positiveActions), negativeActions:toNumber(st.negativeActions),
      carry:toNumber(st.carry), carryMetres:toNumber(st.carryMetres), postContactMetres:toNumber(st.postContactMetres),
      carryContact:toNumber(st.carryContact), carryDominant:toNumber(st.carryDominant),
      tackleMade:toNumber(st.tackleMade), tackleAttempts:toNumber(st.tackleAttempts), tackleDominant:toNumber(st.tackleDominant),
      ruckSupportAttack:toNumber(st.ruckSupportAttack)
    };
  }
  const teamStats=[...(match.teamStats||new Map()).values()];
  return {match:{id:match.id,label:match.label,date:match.date,season:match.season,home:match.home,away:match.away,score:match.score,venue:match.venue,competition:match.competition,matchEndMinutes:match.matchEndMinutes,minutesSource:match.minutesSource}, teamStats, playerStats};
}
function main(){
  fs.mkdirSync(STATS_DIR,{recursive:true});
  fs.mkdirSync(MATCH_REVIEW_DIR,{recursive:true});
  cleanJsonFiles(STATS_DIR);
  cleanJsonFiles(MATCH_REVIEW_DIR);
  const manifestPath=path.join(DATA_DIR,'matches.json');
  if(!fs.existsSync(manifestPath)){ throw new Error('data/matches.json not found. Run generate-matches.js first.'); }
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')).filter(item=>isDateOnOrAfter(item.date));
  const players=new Map(); const matchSummaries=[];
  for(const item of manifest){
    const id=String(item.id||item.matchId||'').trim();
    const biRows=parseCSV(readIfExists(dataPath(item.biCsv)));
    const reviewRows=parseCSV(readIfExists(dataPath(item.reviewCsv)));
    const xmlText=readIfExists(dataPath(item.superscoutXml));
    const match=buildMatch({...item,id:id||item.id},biRows,reviewRows,xmlText,players);
    const serialized=serializeMatch(match);
    fs.writeFileSync(path.join(STATS_DIR, `${match.id}.json`), JSON.stringify(serialized));
    fs.writeFileSync(path.join(MATCH_REVIEW_DIR, `${match.id}.json`), JSON.stringify(serializeMatchReview(match)));
    const summary={id:match.id,label:match.label,date:match.date,season:match.season,home:match.home,away:match.away,score:match.score,venue:match.venue,competition:match.competition,minutesSource:match.minutesSource};
    matchSummaries.push(summary);
    for(const [key,st] of match.playerStats){
      const p=players.get(key); if(!p) continue;
      if(!p.matches.includes(match.id)) p.matches.push(match.id);
      p.shirt=p.shirt||st.shirt||''; p.position=p.position||st.position||'';
      if(!p.matchSummaries) p.matchSummaries={};
      p.matchSummaries[match.id]={carry:st.carry,tackleMade:st.tackleMade,tackleAttempts:st.tackleAttempts,effort:st.reviewTotal,minutes:st.minutes,shirt:st.shirt||'',position:st.position||'',positionId:st.positionId||''};
    }
  }
  matchSummaries.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id||'').localeCompare(String(a.id||'')));
  for(const p of players.values()){ p.matches=(p.matches||[]).sort((a,b)=>{ const ma=matchSummaries.find(m=>m.id===a)||{}; const mb=matchSummaries.find(m=>m.id===b)||{}; return String(mb.date||'').localeCompare(String(ma.date||''))||String(b).localeCompare(String(a)); }); }
  const index={generatedAt:new Date().toISOString(),version:3,matches:matchSummaries,players:[...players.values()].filter(p=>(p.matches||[]).length).sort((a,b)=>a.name.localeCompare(b.name)||a.team.localeCompare(b.team)).map(p=>({key:p.key,name:p.name,team:p.team,teams:p.teams||[p.team].filter(Boolean),show:!!p.show,shirt:p.shirt||'',position:p.position||'',matches:p.matches,matchSummaries:p.matchSummaries||{}}))};
  fs.writeFileSync(path.join(DATA_DIR,'player_index.json'), JSON.stringify(index));
  console.log(`Generated player_index.json, ${matchSummaries.length} stats files and ${matchSummaries.length} match_review files for ${index.players.length} indexed players.`);
}
main();
