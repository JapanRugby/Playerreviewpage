const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
function listFiles(dir){ try{return fs.readdirSync(dir).filter(f=>fs.statSync(path.join(dir,f)).isFile());}catch{return [];} }
function parseId(name){ const m=String(name).match(/^(\d{5,})/); return m ? m[1] : ''; }
function readFirstCsvRow(file){
  try{
    const txt=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
    const lines=txt.split(/\r?\n/).filter(Boolean); if(lines.length<2) return {};
    const parse=(line)=>{ const out=[]; let field='',q=false; for(let i=0;i<line.length;i++){ const c=line[i]; if(q){ if(c==='"'){ if(line[i+1]==='"'){field+='"';i++;} else q=false; } else field+=c; } else if(c==='"') q=true; else if(c===','){out.push(field);field='';} else field+=c; } out.push(field); return out; };
    const h=parse(lines[0]).map(x=>x.trim()); const v=parse(lines[1]); const row={}; h.forEach((x,i)=>row[x]=v[i]||''); return row;
  }catch{return {};}
}
function dateLabel(v){ if(!v) return ''; const s=String(v).trim(); const dm=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(dm) return `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`; return s.slice(0,10); }
function main(){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const files=listFiles(DATA_DIR);
  let overrides={}; try{overrides=JSON.parse(fs.readFileSync(path.join(DATA_DIR,'match_overrides.json'),'utf8'));}catch{}
  const groups=new Map();
  for(const f of files){ const id=parseId(f); if(!id) continue; if(!groups.has(id)) groups.set(id,{id}); const g=groups.get(id); const lower=f.toLowerCase(); if(lower.endsWith('.xml')) g.superscoutXml=f; else if(lower.endsWith('.csv')){ if(lower.includes('measurem')||lower.includes('review')||lower.includes('effort')) g.reviewCsv=f; else g.biCsv=f; } }
  const out=[];
  for(const [id,g] of [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
    const first=g.biCsv ? readFirstCsvRow(path.join(DATA_DIR,g.biCsv)) : {};
    const home=first.homeTeamName||''; const away=first.awayTeamName||''; const score=(first.hometeamFTscore||first.awayteamFTscore)?`${first.hometeamFTscore||''}–${first.awayteamFTscore||''}`:'';
    const label=(home&&away&&score)?`${home} ${score} ${away}`:(home&&away?`${home} v ${away}`:id);
    const date=dateLabel(first.datePlayed||first.UTCTime||'');
    const item={id,label,date,season:date?date.slice(0,4):'Unknown'};
    if(g.biCsv) item.biCsv=g.biCsv;
    if(g.reviewCsv) item.reviewCsv=g.reviewCsv;
    if(g.superscoutXml) item.superscoutXml=g.superscoutXml;
    Object.assign(item, overrides[id]||{});
    out.push(item);
  }
  fs.writeFileSync(path.join(DATA_DIR,'matches.json'), JSON.stringify(out, null, 2));
  console.log(`Generated data/matches.json with ${out.length} matches.`);
}
main();
