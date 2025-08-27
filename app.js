/* app.js — Motore Lupo Solitario (Wizard ripristinato e migliorato) */

'use strict';

/* ===== Helper base ===== */
const EL = id => document.getElementById(id);
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const textOnly = n => (n.textContent || '').replace(/\s+/g, ' ').trim();

/* ===== Costanti ===== */
const AUTOSAVE_KEY  = 'lw_book1_autosave_v10';
const AUTOSAVE_PREF = 'lw_book1_autosave_enabled';
const THEME_PREF    = 'lw_theme';

const WEAPON_LIST = ["Pugnale","Lancia","Mazza","Daga","Martello da Guerra","Spada","Ascia","Asta","Spadone","Arco"];
const DISCIPLINES = ["Mimetismo","Caccia","Sesto Senso","Orientamento","Guarigione","Scherma","Psicoschermo","Psicolaser","Affinità Animale","Telecinesi"];
const DISC_DESC = {
  "Mimetismo":"Ti confondi con l’ambiente per evitare pericoli.",
  "Caccia":"Trovi cibo; spesso non consumi Pasti quando richiesto.",
  "Sesto Senso":"Intuisci trappole, pericoli e opzioni più sicure.",
  "Orientamento":"Segui tracce e scegli la rotta migliore.",
  "Guarigione":"Recuperi 1 Resistenza in paragrafi senza combattimento.",
  "Scherma":"+2 Combattività con l’arma sorteggiata.",
  "Psicoschermo":"Protegge da attacchi psichici (evita −2 Combattività).",
  "Psicolaser":"+2 Combattività contro nemici non immuni.",
  "Affinità Animale":"Comprendi e influenzi gli animali.",
  "Telecinesi":"Muovi piccoli oggetti con la mente."
};
const BONUS_MAP = {
  0:"Spadone", 1:"Spada", 2:"Elmo", 3:"Due Pasti", 4:"Cotta di Maglia",
  5:"Mazza", 6:"Pozione Magica", 7:"Asta", 8:"Lancia", 9:"12 Corone d'Oro"
};
const MAX_DEEPL_FRAGMENT = 1200;

/* ===== Stato ===== */
let state = {
  bookDoc: null,
  index: new Map(),
  current: { section:null, lastHadCombat:false, allowEvade:false, psionicAttack:false, enemyImmuneMB:false },
  enemies: [],
  inCombat: { active:false, foe:null, round:0 },
  navHistory: [], navFuture: [],
  player: {
    combattivitaBase:10, resistenzaBase:20, resistenzaCorrente:20, epBase:20,
    disciplines:new Set(), weapons:[], equipped:"",
    backpack:[], specials:[], meals:1, gold:0, weaponskillWeapon:null
  },
  flags: { version:10, autosave:true, started:false, enforceCond:true, rngManual:false, rngManualVal:0 },
  allowedTargets: new Map(),
  crt: null
};

/* ===== Tema ===== */
(function themeInit(){
  const saved = localStorage.getItem(THEME_PREF);
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  const toggle = EL('themeToggle');
  if (toggle) toggle.checked = document.documentElement.getAttribute('data-theme') === 'light';
})();

/* ===== Popup Immersivo ===== */
function immersion(text, title='Ordine Ramas'){
  const w = EL('immersive'); if(!w) return;
  EL('immTitle').textContent = `✦ ${title}`;
  EL('immTxt').textContent   = text;
  requestAnimationFrame(() => {
    w.classList.add('show');
    setTimeout(() => w.classList.remove('show'), 2200);
  });
}

/* ===== RNG ===== */
function random0to9(){
  if(state.flags.rngManual) return clamp(+EL('rngManualVal').value||0,0,9);
  const b=new Uint8Array(1); crypto.getRandomValues(b); return b[0]%10;
}

/* ===== Libro ===== */
async function tryAutoLoad(){
  try{
    const res = await fetch('01fftd.htm', { cache: 'no-store' });
    if(res.ok){
      const html = await res.text();
      importBook(html);
      return true;
    }
  }catch(e){}
  EL('importHelp')?.classList.remove('hidden');
  EL('bookStatus').textContent = 'Nessun libro caricato';
  return false;
}
function importBook(html){
  const dom=new DOMParser().parseFromString(html,'text/html');
  state.bookDoc=dom; state.index.clear();
  $$('a[id^="sect"],a[name^="sect"]',dom).forEach(a=>{
    const id=(a.id||a.name||'').toString(); const n=+id.replace(/[^0-9]/g,'');
    if(Number.isInteger(n)&&n>0) state.index.set(n,a);
  });
  parseCRT(dom);
  EL('bookStatus').textContent=`Libro caricato (${state.index.size} paragrafi)`;
  EL('importHelp')?.classList.add('hidden');
  const first = state.index.has(1)?1:state.index.keys().next().value;
  if(first) navGoTo(first,false);
}
function sectionContentFromAnchor(a){
  let start=a.closest('h1,h2,h3,h4')||a.parentElement;
  const wrap=document.createElement('div'); let node=start;
  while(node){
    if(node!==start && node.matches?.('h1,h2,h3,h4') && node.querySelector?.('a[id^="sect"],a[name^="sect"]')) break;
    wrap.appendChild(node.cloneNode(true)); node=node.nextElementSibling;
  }
  return wrap;
}
function navGoTo(n, push=true){
  const a=state.index.get(n);
  if(!a){ immersion(`Paragrafo §${n} non trovato.`,'Errore'); return; }
  const content = sectionContentFromAnchor(a);
  if(push && state.current.section) state.navHistory.push(state.current.section);
  if(push) state.navFuture.length=0;
  state.current.section=n;

  // scroll top
  window.scrollTo({ top:0, behavior:'smooth' });

  EL('secNo').textContent=String(n);
  const pass=EL('passage'); pass.innerHTML=''; pass.appendChild(content);
  EL('autoDetections').classList.remove('hidden');
  EL('deadend').classList.toggle('hidden', !$('.deadend',content));

  // Guarigione
  if(!state.inCombat.active && !state.current.lastHadCombat &&
     state.player.disciplines.has('Guarigione') &&
     state.player.resistenzaCorrente < state.player.resistenzaBase){
    state.player.resistenzaCorrente = Math.min(state.player.resistenzaBase, state.player.resistenzaCorrente+1);
    immersion('+1 Resistenza (Guarigione)','Recupero');
  }
  state.current.lastHadCombat=false;

  analyzeSection(content.cloneNode(true));
  updateNavButtons();
  syncUI();
  scheduleAutosave();
}
function updateNavButtons(){
  EL('navBack').disabled = state.navHistory.length===0;
  EL('navForward').disabled = state.navFuture.length===0;
}

/* ===== Analisi § + scelte ===== */
function analyzeSection(root){
  state.enemies=[];
  $$('p',root).forEach(p=>{
    const txt=textOnly(p);
    const m=txt.match(/([A-Za-zÀ-ÖØ-öø-ÿ0-9 '’\-+]+?)\s*:\s*COMBATTIVIT[ÀA]?\s*(\d+)\s*RESISTENZA\s*(\d+)/i);
    if(m) state.enemies.push({name:m[1].trim(), cs:+m[2], ep:+m[3]});
  });
  const whole=textOnly(root);
  state.current.allowEvade    = /\bevadi\b|puoi fuggire|sottrarti al combattimento/i.test(whole);
  state.current.enemyImmuneMB = /immune a psicolaser/i.test(whole);
  state.current.psionicAttack = /attaccando anche con il suo psicolaser|togli due punti.*a meno che tu non abbia lo psicoschermo/i.test(whole);

  renderAutoDetections();
  renderChoicesAssist();
}
function parseChoiceConditions(txt){
  const conds=[];
  if(/se vuoi utilizzare l'arte del sesto senso/i.test(txt)) conds.push({type:'discipline',name:'Sesto Senso'});
  if(/se hai l'arte della telecinesi/i.test(txt))           conds.push({type:'discipline',name:'Telecinesi'});
  if(/se possiedi una gemma vordak/i.test(txt))             conds.push({type:'item',name:'Gemma Vordak'});
  if(/se hai una chiave d'oro/i.test(txt))                  conds.push({type:'item',name:"Chiave d'Oro"});
  if(/se hai (\d+) corone d'oro e vuoi pagarlo/i.test(txt)) conds.push({type:'goldAtLeast',amount:+RegExp.$1,consume:true});
  return conds;
}
function meetsCondition(c){
  const hasItem = name => [...state.player.weapons, ...state.player.backpack, ...state.player.specials].some(x=>new RegExp(name,'i').test(x));
  if(c.type==='discipline') return state.player.disciplines.has(c.name);
  if(c.type==='item')       return hasItem(c.name);
  if(c.type==='goldAtLeast')return state.player.gold>=c.amount;
  return true;
}
function renderChoicesAssist(){
  state.allowedTargets.clear();
  const root=EL('passage');
  $$('a[href*="sect"]',root).forEach(a=>{
    const m=(a.getAttribute('href')||'').match(/#sect(\d+)/i); if(!m) return;
    const target=+m[1];
    const parent=a.closest('p')||a.parentElement;
    const txt=textOnly(parent);
    const conds=parseChoiceConditions(txt);
    const isOk=conds.every(meetsCondition);
    state.allowedTargets.set(target,isOk);
    a.classList.add('choiceLink');
    a.classList.toggle('disabled', !isOk && state.flags.enforceCond);
    a.title = (!isOk && state.flags.enforceCond && conds.length)
      ? conds.map(c=>`Richiede: ${c.name||c.type}`).join('; ')
      : '';
  });
}

/* ===== Combattimento ===== */
function effectiveWeaponBonus(name){
  if(!name) return -4;
  let b=0;
  if(state.player.disciplines.has('Scherma') && state.player.weaponskillWeapon &&
     new RegExp(`\\b${state.player.weaponskillWeapon}\\b`,'i').test(name)) b+=2;
  return b;
}
function playerCurrentCS(){
  let cs=state.player.combattivitaBase + effectiveWeaponBonus(state.player.equipped||"");
  if(EL('useMindblast')?.checked && state.player.disciplines.has('Psicolaser') && !state.current.enemyImmuneMB) cs+=2;
  if(state.current.psionicAttack && !state.player.disciplines.has('Psicoschermo')) cs-=2;
  cs += (+EL('youMod').value || 0);
  return cs;
}
function enemyCurrentCS(base){ return base + (+EL('foeMod').value||0); }
function computeCR(){ if(!state.inCombat.foe) return 0; return playerCurrentCS()-enemyCurrentCS(state.inCombat.foe.cs); }

function parseCRT(dom){
  try{
    const table=Array.from(dom.querySelectorAll('table')).find(t=>/combat results table/i.test(t.textContent));
    if(!table) throw new Error('CRT non trovata');
    const rows=Array.from(table.querySelectorAll('tbody tr'));
    const header=rows[1].querySelectorAll('th');
    const ranges=Array.from(header).slice(1).map(th=>{
      const txt=textOnly(th).replace(/or lower|or higher/i,'').replace('−','-');
      const parts=txt.split('/').map(s=>parseInt(s.trim(),10));
      return {min:parts[0], max:parts[1]??parts[0]};
    });
    const crtRows=rows.slice(2).map(tr=>{
      const cells=Array.from(tr.querySelectorAll('td'));
      return cells.map(td=>{
        const txt=textOnly(td);
        if(txt.includes('k')){ const [e,lw]=txt.split('/'); return {eLoss:0,lwLoss:0,eKill:e==='k',lwKill:lw==='k'}; }
        const [eLoss,lwLoss]=txt.split('/').map(n=>parseInt(n,10));
        return {eLoss,lwLoss,eKill:false,lwKill:false};
      });
    });
    state.crt={ranges, rows:crtRows};
  }catch(e){ fallbackCRT(); }
}
function fallbackCRT(){
  const ranges=[{min:-Infinity,max:-11},{min:-10,max:-9},{min:-8,max:-7},{min:-6,max:-5},{min:-4,max:-3},{min:-2,max:-1},{min:0,max:0},{min:1,max:2},{min:3,max:4},{min:5,max:6},{min:7,max:8},{min:9,max:10},{min:11,max:Infinity}];
  const R=(e,lw)=>({eLoss:e,lwLoss:lw,eKill:false,lwKill:false});
  const K=(ek,lk)=>({eLoss:0,lwLoss:0,eKill:ek,lwKill:lk});
  const rows=[
    [K(false,true),K(false,true),R(0,8),R(0,6),R(1,6),R(2,5),R(3,5),R(4,5),R(5,4),R(6,4),R(7,4),R(8,3),R(9,3)],
    [K(false,true),R(0,8),R(0,7),R(1,6),R(2,5),R(3,5),R(4,4),R(5,4),R(6,3),R(7,3),R(8,3),R(9,3),R(10,2)],
    [R(0,8),R(0,7),R(1,6),R(2,5),R(3,5),R(4,4),R(5,4),R(6,3),R(7,3),R(8,3),R(9,2),R(10,2),R(11,2)],
    [R(0,8),R(1,7),R(2,6),R(3,5),R(4,4),R(5,4),R(6,3),R(7,3),R(8,2),R(9,2),R(10,2),R(11,2),R(12,2)],
    [R(1,7),R(2,6),R(3,5),R(4,4),R(5,4),R(6,3),R(7,2),R(8,2),R(9,2),R(10,2),R(11,2),R(12,2),R(14,1)],
    [R(2,6),R(3,6),R(4,5),R(5,4),R(6,3),R(7,2),R(8,2),R(9,2),R(10,2),R(11,1),R(12,1),R(14,1),R(16,1)],
    [R(3,5),R(4,5),R(5,4),R(6,3),R(7,2),R(8,2),R(9,1),R(10,1),R(11,1),R(12,0),R(14,0),R(16,0),R(18,0)],
    [R(4,4),R(5,4),R(6,3),R(7,2),R(8,1),R(9,1),R(10,0),R(11,0),R(12,0),R(14,0),R(16,0),R(18,0),K(true,false)],
    [R(5,3),R(6,3),R(7,2),R(8,0),R(9,0),R(10,0),R(11,0),R(12,0),R(14,0),R(16,0),R(18,0),K(true,false),K(true,false)],
    [R(6,0),R(7,0),R(8,0),R(9,0),R(10,0),R(11,0),R(12,0),R(14,0),R(16,0),R(18,0),K(true,false),K(true,false),K(true,false)]
  ];
  state.crt={ranges,rows};
}
function consultCRT(cr,rn){
  const col=state.crt.ranges.findIndex(r=>cr>=r.min&&cr<=r.max);
  const idx=col===-1?(cr<0?0:state.crt.ranges.length-1):col;
  return state.crt.rows[rn]?.[idx] || {eLoss:0,lwLoss:0,eKill:false,lwKill:false};
}

function renderAutoDetections(){
  const dc=EL('detectedCombat'), eL=EL('enemyList'), eC=EL('enemyCount');
  if(state.enemies.length){
    dc.classList.remove('hidden');
    eC.textContent=String(state.enemies.length);
    eL.innerHTML=state.enemies.map(e=>`<div class="enemyBox"><strong>${e.name}</strong> — Combattività <strong>${e.cs}</strong>, Resistenza <strong>${e.ep}</strong></div>`).join('');
  } else {
    dc.classList.add('hidden'); EL('combatPanel').classList.add('hidden');
  }
  const hints=EL('psionHints'); const parts=[];
  if(state.current.enemyImmuneMB) parts.push('Nemico <strong>immune a Psicolaser</strong>.');
  if(state.current.psionicAttack) parts.push('Usa <strong>attacchi psichici</strong> (−2 se non hai Psicoschermo).');
  hints.style.display = parts.length?'flex':'none';
  hints.innerHTML = parts.map(p=>`<span class="tag">${p}</span>`).join(' ');
}
function updateCombatUI(){
  const foe=state.inCombat.foe; if(!foe) return;
  EL('foeName').textContent=foe.name||'Nemico';
  EL('foeCS').textContent  =String(enemyCurrentCS(foe.cs));
  EL('foeEP').textContent  =String(foe.epNow);
  EL('foeEPmax').textContent=`/ ${foe.ep}`;
  EL('youCS').textContent  =String(playerCurrentCS());
  EL('youEP').textContent  =String(state.player.resistenzaCorrente);
  EL('youEPmax').textContent=`/ ${state.player.resistenzaBase}`;
  EL('youNotes').textContent=state.player.equipped?`Arma: ${state.player.equipped}`:'Senza arma (−4)';
  const cr=computeCR(); EL('crNow').textContent=cr>=0?`+${cr}`:String(cr);
}
function prepareCombatPanel(){
  if(!state.enemies.length) return;
  const foe=state.enemies[0];
  state.inCombat={active:false, foe:{...foe, epNow:foe.ep}, round:0};
  EL('combatPanel').classList.remove('hidden');
  EL('crNow').textContent='—'; EL('lastRN').textContent='–'; EL('lastResult').textContent='–';
  EL('combatLog').textContent='';
  $('#mbWrap').classList.toggle('hidden', !state.player.disciplines.has('Psicolaser'));
  EL('useMindblast').checked=false;
  $('#mbWrap').classList.toggle('immune', state.current.enemyImmuneMB);
  EL('evadeBtn').style.display = state.current.allowEvade ? '' : 'none';
  EL('startCombatBtn').disabled=false; EL('combatRoundBtn').disabled=true; EL('endCombatBtn').disabled=true;
  updateCombatUI();
}
function startCombat(){
  if(!state.inCombat.foe) return;
  state.inCombat.active=true; state.inCombat.round=0;
  EL('startCombatBtn').disabled=true; EL('combatRoundBtn').disabled=false; EL('endCombatBtn').disabled=false;
  updateCombatUI();
  immersion(`Inizia il combattimento contro ${state.inCombat.foe.name}.`,'Combattimento');
  logLine(`— Inizia combattimento: ${state.inCombat.foe.name} —`);
}
function endCombat(msg){
  EL('startCombatBtn').disabled=true; EL('combatRoundBtn').disabled=true; EL('endCombatBtn').disabled=true;
  state.inCombat.active=false; state.current.lastHadCombat=true;
  if(msg) immersion(msg,'Combattimento');
  syncUI();
}
function describeRound(cr,rn,cell,bYou,aYou,bFoe,aFoe,foeName){
  const youDelta=bYou-aYou, foeDelta=bFoe-aFoe;
  const crTxt=cr>=0?`Rapporto di Forza +${cr}`:`Rapporto di Forza ${cr}`;
  const rnTxt=`Numero Casuale ${rn}`;
  const hits=[];
  if(cell.lwKill){ hits.push(`Un colpo fatale ti abbatte!`); }
  else if(youDelta>0){ const sev=youDelta>=6?'gravemente':youDelta>=3?'duramente':'di striscio'; hits.push(`Sei ferito ${sev} (−${youDelta} EP).`); }
  else { hits.push(`Schivi il colpo! (−0 EP)`); }
  if(cell.eKill){ hits.push(`${foeName} cade al suolo, sconfitto!`); }
  else if(foeDelta>0){ const sev=foeDelta>=6?'gravemente':foeDelta>=3?'duramente':'di striscio'; hits.push(`Colpisci ${foeName} ${sev} (−${foeDelta} EP).`); }
  else { hits.push(`${foeName} para il tuo attacco (−0 EP).`); }
  return `${crTxt} • ${rnTxt}\n`+hits.join(' ');
}
function resolveRound(evading=false){
  if(!state.inCombat.active) return;
  const rn=random0to9(); EL('rngVal').textContent=String(rn); EL('lastRN').textContent=String(rn);
  const cr=computeCR(); const cell=consultCRT(cr,rn);
  let yourLoss = cell.lwKill?state.player.resistenzaCorrente:(cell.lwLoss||0);
  let foeLoss  = cell.eKill?state.inCombat.foe.epNow:(cell.eLoss||0);
  if(evading){ yourLoss=0; foeLoss=0; }
  const bYou=state.player.resistenzaCorrente, bFoe=state.inCombat.foe.epNow;
  state.player.resistenzaCorrente=Math.max(0, state.player.resistenzaCorrente-yourLoss);
  state.inCombat.foe.epNow=Math.max(0, state.inCombat.foe.epNow-foeLoss);
  updateCombatUI();
  const line=`${evading?'(Evasione) ':''}Tu −${yourLoss}, Nemico −${foeLoss}`;
  EL('lastResult').textContent=line; logLine(`Round ${++state.inCombat.round}: ${line}`);
  const narrative = evading
    ? `Tenti di evadere dal combattimento.\n${state.current.allowEvade?'Riesci a sottrarti alla mischia!':'Non trovi spiragli!'}`
    : describeRound(cr,rn,cell,bYou,state.player.resistenzaCorrente,bFoe,state.inCombat.foe.epNow,state.inCombat.foe.name);
  immersion(narrative, evading?'Evasione':'Round di Combattimento');
  if(state.player.resistenzaCorrente<=0){ logLine('✖ Sei caduto.'); EL('deadend').classList.remove('hidden'); endCombat('Sei stato sconfitto.'); return; }
  if(state.inCombat.foe.epNow<=0){ logLine(`✔ ${state.inCombat.foe.name} sconfitto.`); endCombat(`${state.inCombat.foe.name} è stato sconfitto!`); return; }
  if(evading){ logLine('Fuga riuscita.'); endCombat('Sei riuscito a fuggire.'); }
}
function logLine(s){ const el=EL('combatLog'); el.textContent+=s+'\n'; el.scrollTop=el.scrollHeight; }

/* ===== Inventario / UI ===== */
function recomputeEPMaxFromGear(){
  const hasHelm=state.player.specials.some(x=>/^elmo$/i.test(x));
  const hasMail=state.player.specials.some(x=>/cotta di maglia/i.test(x));
  const gear=(hasHelm?2:0)+(hasMail?4:0);
  if(!Number.isFinite(state.player.epBase)||state.player.epBase<1){ state.player.epBase=Math.max(1,(state.player.resistenzaBase||20)-gear); }
  state.player.resistenzaBase=state.player.epBase+gear;
  if(state.player.resistenzaCorrente>state.player.resistenzaBase) state.player.resistenzaCorrente=state.player.resistenzaBase;
}
function enforceCapacity(){
  const maxMeals=Math.max(0,8-state.player.backpack.length);
  if(state.player.meals>maxMeals) state.player.meals=maxMeals;
  EL('meals').value=state.player.meals; EL('meals').max=String(maxMeals);
  const cap=state.player.backpack.length+state.player.meals; EL('capInfo').textContent=`capienza: ${cap}/8`;
}
function renderDisciplinesList(){
  const root=EL('disciplinesList'); root.innerHTML=""; const note=EL('discNote');
  if(state.flags.started){
    note.textContent="(bloccate: avventura in corso)";
    const sel=[...state.player.disciplines];
    root.innerHTML = sel.length ? sel.map(s=>`<div class="row small"><strong>${s}</strong> <span class="tag">— ${DISC_DESC[s]}</span></div>`).join('') : '<div class="small tag">Nessuna arte selezionata.</div>';
  } else {
    note.textContent="seleziona 5";
    DISCIPLINES.forEach(name=>{
      const id=`disc_${name.replace(/\s+/g,'_')}`;
      root.insertAdjacentHTML('beforeend', `<label class="row small"><input type="checkbox" id="${id}" disabled> <strong>${name}</strong> <span class="tag">— ${DISC_DESC[name]}</span></label>`);
    });
  }
}
function renderInventory(){
  const wRoot=EL('weaponsList');
  wRoot.innerHTML = state.player.weapons.length
    ? state.player.weapons.map((w,i)=>`<div class="row small"><span>${w}</span><button class="btn soft" data-delw="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Nessuna arma.</div>';
  wRoot.querySelectorAll('button[data-delw]').forEach(b=>{
    b.onclick=()=>{ state.player.weapons.splice(+b.dataset.delw,1); if(state.player.equipped&&!state.player.weapons.includes(state.player.equipped)) state.player.equipped=state.player.weapons[0]||""; syncUI(); };
  });
  const eq=EL('equippedWeapon');
  eq.innerHTML=`<option value="">(nessuna)</option>`+state.player.weapons.map(w=>`<option value="${w}">${w}</option>`).join('');
  eq.value=state.player.equipped||"";

  const bRoot=EL('backpackList');
  bRoot.innerHTML = state.player.backpack.length
    ? state.player.backpack.map((it,i)=>`<div class="row small"><span>${it}</span><button class="btn soft" data-deli="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Zaino vuoto.</div>';
  bRoot.querySelectorAll('button[data-deli]').forEach(b=>{ b.onclick=()=>{ state.player.backpack.splice(+b.dataset.deli,1); syncUI(); }; });

  const sRoot=EL('specialsList');
  sRoot.innerHTML = state.player.specials.length
    ? state.player.specials.map((it,i)=>`<div class="row small"><span>${it}</span><button class="btn soft" data-dels="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Nessuno.</div>';
  sRoot.querySelectorAll('button[data-dels]').forEach(b=>{ b.onclick=()=>{ state.player.specials.splice(+b.dataset.dels,1); syncUI(); }; });

  recomputeEPMaxFromGear();
  enforceCapacity();

  EL('combattivitaBase').value=state.player.combattivitaBase;
  EL('resistenzaBase').value=state.player.resistenzaBase;
  EL('resistenzaCorrente').value=state.player.resistenzaCorrente;
  EL('meals').value=state.player.meals;
  EL('gold').value=state.player.gold;

  EL('wsPanel').classList.toggle('hidden', !state.player.disciplines.has("Scherma"));
  EL('wsWeapon').textContent = state.player.weaponskillWeapon || '—';
}
function renderChoicesAssist(){ /* (già fatto sopra) */ }

/* ===== Salvataggi ===== */
function buildSaveObj(){ return { player:serializePlayer(), section:state.current.section, flags:state.flags, history:state.navHistory }; }
function serializePlayer(){ const p=JSON.parse(JSON.stringify(state.player)); p.disciplines=[...state.player.disciplines]; return p; }
function applySaveObj(obj){
  state.player=obj.player; state.player.disciplines=new Set(obj.player.disciplines||[]);
  recomputeEPMaxFromGear();
  state.flags=obj.flags; state.navHistory=obj.history||[];
  if(obj.section) navGoTo(obj.section,false); syncUI();
}
function hasAutosave(){ try{return !!localStorage.getItem(AUTOSAVE_KEY);}catch{return false;} }
function scheduleAutosave(){ if(!state.flags.autosave) return; try{ localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildSaveObj())); EL('btnResume').disabled=false; }catch(e){} }
function restoreAutosave(){ try{ const raw=localStorage.getItem(AUTOSAVE_KEY); if(!raw) return false; const obj=JSON.parse(raw); applySaveObj(obj); immersion('Salvataggio automatico ripristinato.','Riprendi'); return true; }catch(e){ return false; } }

/* ===== Quick Start (con bonus + riepilogo) ===== */
function applyBonusItemToState(item){
  if(!item) return;
  if(["Spadone","Spada","Mazza","Asta","Lancia"].includes(item) && state.player.weapons.length<2) state.player.weapons.push(item);
  else if(item==="Due Pasti") state.player.meals+=2;
  else if(item==="Pozione Magica") state.player.backpack.push("Pozione Magica");
  else if(item==="Elmo") state.player.specials.push("Elmo");
  else if(item==="Cotta di Maglia") state.player.specials.push("Cotta di Maglia");
  else if(item==="12 Corone d'Oro") state.player.gold=Math.min(50,state.player.gold+12);
}
function quickStart(){
  const rnCS=random0to9(), rnEP=random0to9();
  state.player.combattivitaBase=10+rnCS;
  state.player.epBase=20+rnEP;
  state.player.resistenzaBase=state.player.epBase;
  state.player.resistenzaCorrente=state.player.resistenzaBase;
  state.player.gold=random0to9();

  state.player.disciplines=new Set();
  const shuffled=[...DISCIPLINES].sort(()=>0.5-Math.random());
  shuffled.slice(0,5).forEach(d=>state.player.disciplines.add(d));
  state.player.weaponskillWeapon = state.player.disciplines.has('Scherma') ? WEAPON_LIST[random0to9()] : null;

  state.player.weapons=["Ascia"]; state.player.equipped="Ascia";
  state.player.backpack=[]; state.player.specials=["Mappa"]; state.player.meals=1;

  const bonus=BONUS_MAP[random0to9()]; applyBonusItemToState(bonus);
  recomputeEPMaxFromGear();

  state.flags.started=true; syncUI();

  const arti=[...state.player.disciplines].join(', ');
  const riepilogo=
    `Combattività: ${state.player.combattivitaBase}\n`+
    `Resistenza: ${state.player.resistenzaCorrente}/${state.player.resistenzaBase} (base ${state.player.epBase})\n`+
    `Oro: ${state.player.gold}\n`+
    `Arti: ${arti||'—'}\n`+
    `Armi: ${state.player.weapons.join(', ')||'—'}\n`+
    `Bonus iniziale: ${bonus}\n`+
    (state.player.weaponskillWeapon?`Maestro di Scherma su ${state.player.weaponskillWeapon}`:'');
  immersion(riepilogo,'Inizio Rapido completato');
}

/* ===== WIZARD ===== */
const wizard = { step:0, total:6, temp:{} };

function openWizard(){
  wizard.step=0;
  wizard.temp={
    manual:false,
    rolls:{ cs:0, ep:0, gold:0, ws:0, bonus:0 },
    cs:10, epBase:20, gold:0,
    disciplines:new Set(),
    wsWeapon:null,
    bonusItem:null
  };
  EL('wizard').classList.remove('hidden');
  renderWizard();
}
function closeWizard(){ EL('wizard').classList.add('hidden'); }

function renderWizard(){
  // intestazione / dots
  EL('wizStepTag').textContent = `Passo ${wizard.step+1} di ${wizard.total}`;
  EL('wizDots').innerHTML = Array(wizard.total).fill(0).map((_,i)=>`<div class="step-dot ${i===wizard.step?'active':''}"></div>`).join('');
  const body=EL('wizBody'); body.innerHTML='';

  // STEP 0 — Intro
  if(wizard.step===0){
    body.innerHTML = `
      <div class="box">
        <h3>Benvenuto, Ramas</h3>
        <p>Questo Wizard crea il tuo personaggio in 6 passi: Statistiche, Oro, Arti, Scherma, Equipaggiamento, Riepilogo.</p>
        <label class="row small"><input type="checkbox" id="wizManual"> Tiri manuali (inserirai tu un numero 0–9)</label>
      </div>`;
    EL('wizManual').checked=wizard.temp.manual;
    EL('wizManual').onchange=e=>wizard.temp.manual=e.target.checked;
  }

  // STEP 1 — Statistiche (CS, EP)
  if(wizard.step===1){
    body.innerHTML = `
      <div class="two">
        <div class="box">
          <h3>Combattività</h3>
          <div class="row">
            <button class="btn" id="wizRollCS">Estrai</button>
            <input id="wizCS" type="number" readonly style="width:100px" value="${wizard.temp.cs}"/>
            <span class="tag">= 10 + Numero</span>
            <span class="tag" id="tryCS"></span>
          </div>
        </div>
        <div class="box">
          <h3>Resistenza</h3>
          <div class="row">
            <button class="btn" id="wizRollEP">Estrai</button>
            <input id="wizEP" type="number" readonly style="width:100px" value="${wizard.temp.epBase}"/>
            <span class="tag">= 20 + Numero (base, senza equipaggiamento)</span>
            <span class="tag" id="tryEP"></span>
          </div>
        </div>
      </div>
      <div class="small tag">Con tiri automatici hai <strong>max 2 tentativi</strong> per ciascuna statistica.</div>`;
    const upd=()=>{ EL('tryCS').textContent=`tentativi: ${wizard.temp.rolls.cs}/2`; EL('tryEP').textContent=`tentativi: ${wizard.temp.rolls.ep}/2`; };
    upd();
    EL('wizRollCS').onclick=()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.cs>=2) return immersion('Tentativi esauriti.','Wizard');
      const r=wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.cs++;
      wizard.temp.cs=10+r; EL('wizCS').value=wizard.temp.cs; upd();
      immersion(`Numero ${r}. Combattività = 10 + ${r} = ${wizard.temp.cs}.`,'Tiro');
    };
    EL('wizRollEP').onclick=()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.ep>=2) return immersion('Tentativi esauriti.','Wizard');
      const r=wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.ep++;
      wizard.temp.epBase=20+r; EL('wizEP').value=wizard.temp.epBase; upd();
      immersion(`Numero ${r}. Resistenza base = 20 + ${r} = ${wizard.temp.epBase}.`,'Tiro');
    };
  }

  // STEP 2 — Oro
  if(wizard.step===2){
    body.innerHTML = `
      <div class="box">
        <h3>Corone d’Oro</h3>
        <div class="row">
          <button class="btn" id="wizRollGold">Estrai</button>
          <input id="wizGold" type="number" readonly style="width:100px" value="${wizard.temp.gold}"/>
          <span class="tag">(0–9)</span>
          <span class="tag" id="tryGold"></span>
        </div>
      </div>
      <div class="small tag">Anche l’Oro segue la regola dei <strong>2 tentativi</strong> se in automatico.</div>`;
    const upd=()=>EL('tryGold').textContent=`tentativi: ${wizard.temp.rolls.gold}/2`; upd();
    EL('wizRollGold').onclick=()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.gold>=2) return immersion('Tentativi esauriti.','Wizard');
      const r=wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.gold++;
      wizard.temp.gold=r; EL('wizGold').value=r; upd();
      immersion(`Numero ${r}. Oro iniziale = ${r}.`,'Tiro');
    };
  }

  // STEP 3 — Arti (5 scelte) + random 5
  if(wizard.step===3){
    body.innerHTML = `
      <div class="box">
        <h3>Scegli 5 Arti Ramas</h3>
        <div class="row"><button class="btn soft" id="wizRandom5Btn">Scegli 5 casuali</button></div>
        <div id="wizDiscList" class="list" style="margin-top:8px;"></div>
        <div class="tag small" id="wizDiscNote"></div>
      </div>`;
    const list=EL('wizDiscList');
    DISCIPLINES.forEach(name=>{
      const id=`wd_${name.replace(/\s+/g,'_')}`;
      list.insertAdjacentHTML('beforeend', `<label class="row small"><input type="checkbox" id="${id}"> <strong>${name}</strong> <span class="tag">— ${DISC_DESC[name]}</span></label>`);
      const cb=EL(id);
      cb.checked=wizard.temp.disciplines.has(name);
      cb.onchange=e=>{
        if(e.target.checked){
          if(wizard.temp.disciplines.size>=5){ e.target.checked=false; immersion('Massimo 5 Arti.','Wizard'); return; }
          wizard.temp.disciplines.add(name);
        } else wizard.temp.disciplines.delete(name);
        EL('wizDiscNote').textContent=`selezionate: ${wizard.temp.disciplines.size}/5`;
      };
    });
    EL('wizRandom5Btn').onclick=()=>{
      wizard.temp.disciplines.clear();
      const shuffled=[...DISCIPLINES].sort(()=>0.5-Math.random());
      shuffled.slice(0,5).forEach(d=>wizard.temp.disciplines.add(d));
      renderWizard(); // rinfresca la lista
    };
    EL('wizDiscNote').textContent=`selezionate: ${wizard.temp.disciplines.size}/5`;
  }

  // STEP 4 — Scherma (se scelta)
  if(wizard.step===4){
    const hasWS = wizard.temp.disciplines.has('Scherma');
    body.innerHTML = hasWS ? `
      <div class="box">
        <h3>Maestro di Scherma</h3>
        <p class="tag">+2 Combattività quando combatti con l’arma sorteggiata.</p>
        <div class="row">
          <button class="btn" id="wizRollWS">Estrai arma</button>
          <select id="wizWSsel" style="min-width:220px"></select>
          <span class="tag" id="tryWS"></span>
        </div>
      </div>` : `
      <div class="box"><h3>Maestro di Scherma</h3><p class="tag">Non hai selezionato <em>Scherma</em>, quindi saltiamo questo passo.</p></div>`;
    if(hasWS){
      const sel=EL('wizWSsel'); sel.innerHTML=WEAPON_LIST.map(w=>`<option value="${w}">${w}</option>`).join('');
      if(wizard.temp.wsWeapon) sel.value=wizard.temp.wsWeapon;
      EL('tryWS').textContent = wizard.temp.rolls.ws ? `estratto: ${wizard.temp.wsWeapon}` : '—';
      EL('wizRollWS').onclick=()=>{
        const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
        wizard.temp.rolls.ws++;
        wizard.temp.wsWeapon = WEAPON_LIST[r];
        sel.value = wizard.temp.wsWeapon;
        EL('tryWS').textContent=`estratto: ${wizard.temp.wsWeapon}`;
        immersion(`Numero ${r}. Maestro di Scherma su ${wizard.temp.wsWeapon}.`,'Tiro');
      };
      sel.onchange=e=>wizard.temp.wsWeapon=e.target.value;
    }
  }

  // STEP 5 — Equip + Bonus con limite 2 tentativi + Riepilogo e Fine
  if(wizard.step===5){
    const bonusTxt = wizard.temp.bonusItem ? `<span class="pill">${wizard.temp.bonusItem}</span>` : '<span class="tag">—</span>';
    body.innerHTML = `
      <div class="box">
        <h3>Equipaggiamento iniziale</h3>
        <p class="tag">Parti con: <strong>Ascia</strong>, <strong>1 Pasto</strong> e <strong>Mappa</strong>.</p>
        <div class="row">
          <button class="btn" id="wizBonusRoll">Tira per l'oggetto bonus</button>
          <span id="bonusItemWrap">${bonusTxt}</span>
          <span class="tag" id="tryBonus"></span>
        </div>
        <div class="small tag">Con tiri automatici il Bonus si può tirare <strong>al massimo 2 volte</strong>.</div>
      </div>
      <div class="box" id="wizSummaryBox">
        <h3>Riepilogo</h3>
        <pre class="mono small" id="wizSummary">—</pre>
      </div>`;
    const updTry=()=> EL('tryBonus').textContent = wizard.temp.manual ? '(manuale: senza limiti)' : `tentativi: ${wizard.temp.rolls.bonus}/2`;
    updTry();
    EL('wizBonusRoll').onclick=()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.bonus>=2) return immersion('Tentativi bonus esauriti.','Wizard');
      const r=wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.bonus++;
      wizard.temp.bonusItem = BONUS_MAP[r];
      EL('bonusItemWrap').innerHTML = `<span class="pill">${wizard.temp.bonusItem}</span>`;
      updTry();
      immersion(`Oggetto bonus: ${wizard.temp.bonusItem}`,'Fato');
      renderWizardSummary();
    };
    renderWizardSummary();
  }

  EL('wizPrev').disabled = wizard.step===0;
  EL('wizNext').classList.toggle('hidden', wizard.step!==wizard.total-1?false:true);
  EL('wizFinish').classList.toggle('hidden', wizard.step!==wizard.total-1);
}
function renderWizardSummary(){
  const arti=[...wizard.temp.disciplines].join(', ');
  const ws = wizard.temp.disciplines.has('Scherma') ? (wizard.temp.wsWeapon||'—') : '—';
  const bonus = wizard.temp.bonusItem || '—';
  const txt =
    `Combattività: ${wizard.temp.cs}\n`+
    `Resistenza base: ${wizard.temp.epBase} (senza equip)\n`+
    `Oro: ${wizard.temp.gold}\n`+
    `Arti: ${arti||'—'}\n`+
    `Maestro di Scherma: ${ws}\n`+
    `Equip di base: Ascia, Mappa, 1 Pasto\n`+
    `Bonus: ${bonus}`;
  const box=EL('wizSummary'); if(box) box.textContent=txt;
}
function applyWizard(){
  // Statistiche
  state.player.combattivitaBase = wizard.temp.cs;
  state.player.epBase           = wizard.temp.epBase;
  state.player.resistenzaBase   = wizard.temp.epBase; // gear dopo
  state.player.resistenzaCorrente = state.player.resistenzaBase;

  // Oro
  state.player.gold = wizard.temp.gold;

  // Arti
  state.player.disciplines = new Set(wizard.temp.disciplines);

  // Scherma
  state.player.weaponskillWeapon = state.player.disciplines.has('Scherma') ? (wizard.temp.wsWeapon || WEAPON_LIST[random0to9()]) : null;

  // Equip base
  state.player.weapons  = ["Ascia"]; state.player.equipped="Ascia";
  state.player.backpack = []; state.player.specials=["Mappa"]; state.player.meals=1;

  // Bonus
  if(wizard.temp.bonusItem) applyBonusItemToState(wizard.temp.bonusItem);

  // Ricalcolo EP max con gear
  recomputeEPMaxFromGear();

  // Avvio
  state.flags.started=true;
  syncUI();
  closeWizard();

  // Riepilogo finale popup
  const arti=[...state.player.disciplines].join(', ');
  const riepilogo =
    `Combattività: ${state.player.combattivitaBase}\n`+
    `Resistenza: ${state.player.resistenzaCorrente}/${state.player.resistenzaBase} (base ${state.player.epBase})\n`+
    `Oro: ${state.player.gold}\n`+
    `Arti: ${arti||'—'}\n`+
    `Armi: ${state.player.weapons.join(', ')||'—'}\n`+
    `Bonus iniziale: ${wizard.temp.bonusItem||'—'}\n`+
    (state.player.weaponskillWeapon?`Maestro di Scherma su ${state.player.weaponskillWeapon}`:'');
  immersion(riepilogo,'Avventura al via');
}

/* ===== Eventi ===== */
function initEventListeners(){
  // Tema
  EL('themeToggle')?.addEventListener('change', e=>{
    const mode=e.target.checked?'light':'';
    document.documentElement.setAttribute('data-theme',mode);
    localStorage.setItem(THEME_PREF,mode);
  });

  // DeepL
  EL('btnDeepL')?.addEventListener('click', ()=>{
    const text=(EL('passage')?.innerText||'').trim().slice(0,MAX_DEEPL_FRAGMENT);
    if(!text){ immersion('Nessun testo da tradurre.','DeepL'); return; }
    const url=`https://www.deepl.com/translator#auto/it/${encodeURIComponent(text)}`;
    window.open(url,'_blank','noopener');
  });

  // File libro
  EL('fileInput')?.addEventListener('change', async e=>{
    const file=e.target.files?.[0]; if(!file) return;
    const txt=await file.text(); importBook(txt);
  });

  // Wizard
  EL('openWizardBtn')?.addEventListener('click', openWizard);
  EL('wizSkip')?.addEventListener('click', closeWizard);
  EL('wizPrev')?.addEventListener('click', ()=>{ wizard.step=Math.max(0,wizard.step-1); renderWizard(); });
  EL('wizNext')?.addEventListener('click', ()=>{
    // guard-steps
    if(wizard.step===3 && wizard.temp.disciplines.size!==5) return immersion('Devi scegliere esattamente 5 Arti.','Wizard');
    wizard.step=Math.min(wizard.total-1, wizard.step+1); renderWizard();
  });
  EL('wizFinish')?.addEventListener('click', applyWizard);

  // Inizio rapido
  EL('quickStartBtn')?.addEventListener('click', quickStart);

  // Nuova
  EL('newGameBtn')?.addEventListener('click', ()=>{
    if(confirm('Nuova partita? Perderai i progressi non salvati.')){
      try{ localStorage.removeItem(AUTOSAVE_KEY); }catch{}
      location.reload();
    }
  });

  // Export/Import
  EL('exportSaveBtn')?.addEventListener('click', ()=>{
    EL('saveCode').value=btoa(unescape(encodeURIComponent(JSON.stringify(buildSaveObj()))));
    immersion('Codice di salvataggio generato.','Salvataggio');
  });
  EL('importSaveBtn')?.addEventListener('click', ()=>{
    const raw=prompt('Incolla il codice di salvataggio:',''); if(!raw) return;
    try{ const obj=JSON.parse(decodeURIComponent(escape(atob(raw)))); applySaveObj(obj); immersion('Salvataggio caricato.','Import'); }
    catch(e){ alert('Codice non valido.'); }
  });

  // Resume / autosave
  EL('btnResume')?.addEventListener('click', ()=>{ if(!restoreAutosave()) immersion('Nessun salvataggio trovato.','Riprendi'); });
  EL('toggleAutosave')?.addEventListener('change', e=>{ state.flags.autosave=e.target.checked; try{ localStorage.setItem(AUTOSAVE_PREF, e.target.checked?'1':'0'); }catch{} });

  // Navigazione
  EL('jumpGo')?.addEventListener('click',()=>{ const n=+EL('jumpInput').value; if(Number.isInteger(n)) navGoTo(n); });
  EL('navBack')?.addEventListener('click',()=>{ if(!state.navHistory.length) return; const prev=state.navHistory.pop(); if(prev){ state.navFuture.unshift(state.current.section); navGoTo(prev,false); }});
  EL('navForward')?.addEventListener('click',()=>{ if(!state.navFuture.length) return; const next=state.navFuture.shift(); if(next){ state.navHistory.push(state.current.section); navGoTo(next,false); }});

  EL('passage')?.addEventListener('click', ev=>{
    const a=ev.target.closest('a'); if(!a) return;
    const href=a.getAttribute('href')||''; const m=href.match(/#sect(\d+)/i); if(!m) return;
    const target=+m[1];
    if(state.flags.enforceCond && state.allowedTargets.has(target) && !state.allowedTargets.get(target)){
      ev.preventDefault(); immersion('Scelta bloccata: requisiti non soddisfatti.','Scelta'); return;
    }
    ev.preventDefault(); navGoTo(target);
  });

  // Combattimento
  EL('prepareCombatBtn')?.addEventListener('click', prepareCombatPanel);
  EL('startCombatBtn')?.addEventListener('click', startCombat);
  EL('combatRoundBtn')?.addEventListener('click', ()=>resolveRound(false));
  EL('evadeBtn')?.addEventListener('click', ()=>resolveRound(true));
  EL('endCombatBtn')?.addEventListener('click', ()=>endCombat('Combattimento terminato.'));
  ['useMindblast','youMod','foeMod'].forEach(id=> EL(id)?.addEventListener('input', updateCombatUI));

  // Enforce scelte
  EL('enforceCond')?.addEventListener('change', e=>{ state.flags.enforceCond=e.target.checked; renderChoicesAssist(); });

  // Dado
  EL('btnDice')?.addEventListener('click',()=>EL('diceModal')?.classList.remove('hidden'));
  EL('diceClose')?.addEventListener('click',()=>EL('diceModal')?.classList.add('hidden'));
  EL('diceRoll')?.addEventListener('click',()=>{ const v=random0to9(); EL('diceFace').textContent=String(v); EL('rngVal').textContent=String(v); immersion(`Numero Casuale: ${v}`,'Dado'); });

  // Inventario quick
  EL('addWeaponBtn')?.addEventListener('click',()=>{ const v=(EL('weaponInput').value||'').trim(); if(!v) return;
    if(state.player.weapons.includes(v)) return;
    if(state.player.weapons.length>=2){ immersion('Puoi portare al massimo 2 armi.','Inventario'); return; }
    state.player.weapons.push(v); if(!state.player.equipped) state.player.equipped=v; EL('weaponInput').value=''; syncUI();
  });
  EL('addBackpackBtn')?.addEventListener('click',()=>{ const v=(EL('backpackInput').value||'').trim(); if(!v) return;
    const cap=state.player.backpack.length+state.player.meals; if(cap>=8){ immersion('Zaino pieno (max 8 fra oggetti + pasti)','Inventario'); return; }
    state.player.backpack.push(v); EL('backpackInput').value=''; syncUI();
  });
  EL('addSpecialBtn')?.addEventListener('click',()=>{ const v=(EL('specialInput').value||'').trim(); if(!v) return; state.player.specials.push(v); EL('specialInput').value=''; syncUI(); });
  EL('eatMealBtn')?.addEventListener('click',()=>{ if(state.player.meals>0){ state.player.meals--; state.player.resistenzaCorrente=Math.min(state.player.resistenzaBase,state.player.resistenzaCorrente+4); syncUI(); } else immersion('Nessun Pasto disponibile.','Inventario'); });
  EL('goldPlus1Btn')?.addEventListener('click',()=>{ EL('gold').value=clamp((+EL('gold').value||0)+1,0,50); state.player.gold=+EL('gold').value; scheduleAutosave(); });
  EL('goldMinus1Btn')?.addEventListener('click',()=>{ EL('gold').value=clamp((+EL('gold').value||0)-1,0,50); state.player.gold=+EL('gold').value; scheduleAutosave(); });
  EL('rng0to9Btn')?.addEventListener('click',()=>{ const v=random0to9(); EL('rngVal').textContent=String(v); });
  EL('btnExport')?.addEventListener('click',()=>EL('exportSaveBtn').click());
  EL('btnImport')?.addEventListener('click',()=>EL('importSaveBtn').click());
  EL('btnReset')?.addEventListener('click',()=>{ if(confirm('Reset totale?')){ try{ localStorage.removeItem(AUTOSAVE_KEY);}catch{} location.reload(); }});
  EL('equippedWeapon')?.addEventListener('change', e=>{ state.player.equipped=e.target.value; syncUI(); });

  ['combattivitaBase','resistenzaBase','resistenzaCorrente','meals','gold'].forEach(id=>{
    EL(id)?.addEventListener('input', ()=>{ const v=+EL(id).value;
      if(id==='combattivitaBase') state.player.combattivitaBase=v;
      else if(id==='resistenzaBase') state.player.resistenzaBase=v;
      else if(id==='resistenzaCorrente') state.player.resistenzaCorrente=v;
      else if(id==='meals') state.player.meals=v;
      else if(id==='gold') state.player.gold=clamp(v,0,50);
      scheduleAutosave();
    });
  });
}

/* ===== Init ===== */
(async function init(){
  initEventListeners();
  try{
    const pref=localStorage.getItem(AUTOSAVE_PREF);
    if(pref!==null){ state.flags.autosave=(pref==='1'); EL('toggleAutosave').checked=state.flags.autosave; }
    EL('btnResume').disabled=!hasAutosave();
  }catch(e){}
  EL('enforceCond').checked=state.flags.enforceCond;
  await tryAutoLoad();
  syncUI();
  updateNavButtons();
})();

function syncUI(){ renderDisciplinesList(); renderInventory(); renderChoicesAssist(); scheduleAutosave(); }