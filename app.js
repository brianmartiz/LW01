/* app.js – Motore di Gioco Lupo Solitario (Libro 1)
 * Requisiti: index.html (versione fornita) + style.css + 01fftd.htm nel root
 * Focus: wizard solido, caricamento automatico libro, scelte condizionate,
 *        combattimento guidato con popup, DeepL, autosave.
 */

'use strict';

/* ==================== Utility ==================== */
const EL = id => document.getElementById(id);
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const textOnly = n => (n.textContent || '').replace(/\s+/g, ' ').trim();

function immersion(text, title='Ordine Ramas'){
  const w=EL('immersive');
  if(!w) return alert(`${title}: ${text}`);
  EL('immTitle').textContent=`✦ ${title}`;
  EL('immTxt').textContent=text;
  requestAnimationFrame(()=>{
    w.classList.add('show');
    setTimeout(()=>w.classList.remove('show'),2200);
  });
}

/* ==================== Costanti ==================== */
const AUTOSAVE_KEY  = 'lw_book1_autosave_v8';
const AUTOSAVE_PREF = 'lw_book1_autosave_enabled';
const THEME_PREF    = 'lw_theme';
const MAX_DEEPL_FRAGMENT = 1200;

const WEAPON_LIST = ["Pugnale","Lancia","Mazza","Daga","Martello da Guerra","Spada","Ascia","Asta","Spadone","Arco"];
const DISCIPLINES = ["Mimetismo","Caccia","Sesto Senso","Orientamento","Guarigione","Scherma","Psicoschermo","Psicolaser","Affinità Animale","Telecinesi"];
const DISC_DESC = {
  "Mimetismo":"Ti confondi con l’ambiente per evitare pericoli.",
  "Caccia":"Trovi cibo; spesso non consumi Pasti quando richiesto.",
  "Sesto Senso":"Intuisci trappole, pericoli e opzioni più sicure.",
  "Orientamento":"Segui tracce e scegli la rotta migliore.",
  "Guarigione":"+1 Resistenza entrando in paragrafi senza combattimento.",
  "Scherma":"+2 Combattività con l’arma sorteggiata.",
  "Psicoschermo":"Protegge da attacchi psichici (evita −2 Combattività).",
  "Psicolaser":"+2 Combattività contro nemici non immuni.",
  "Affinità Animale":"Comprendi e influenzi gli animali.",
  "Telecinesi":"Muovi piccoli oggetti con la mente."
};

/* ==================== Stato ==================== */
const state = {
  // libro
  bookDoc: null,
  index: new Map(),        // numero § → ancora nel DOM del libro
  // navigazione
  current: { section:null, lastHadCombat:false, allowEvade:false, psionicAttack:false, enemyImmuneMB:false },
  navHistory: [], navFuture: [],
  // scelte abilitate
  allowedTargets: new Map(),
  // nemici / combattimento
  enemies: [],
  inCombat: { active:false, foe:null, round:0 },
  crt: null,
  // giocatore
  player: {
    combattivitaBase: 10,
    resistenzaBase:   20,
    resistenzaCorrente: 20,
    disciplines: new Set(),
    weapons: ["Ascia"],
    equipped: "Ascia",
    backpack: [],
    specials: ["Mappa"],
    meals: 1,
    gold: 0,
    weaponskillWeapon: null
  },
  // flag
  flags: {
    version: 8,
    started: false,
    autosave: true,
    enforceCond: true,
    rngManual: false,
    rngManualVal: 0
  }
};

/* ==================== Tema ==================== */
(function themeInit(){
  const saved = localStorage.getItem(THEME_PREF);
  if(saved) document.documentElement.setAttribute('data-theme', saved);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if(EL('themeToggle')) EL('themeToggle').checked = isLight;
})();

/* ==================== RNG ==================== */
function random0to9(){
  if(state.flags.rngManual) return clamp(+EL('rngManualVal').value||0,0,9);
  const b=new Uint8Array(1); crypto.getRandomValues(b); return b[0]%10;
}

/* ==================== Caricamento Libro ==================== */
async function tryAutoLoad(){
  const status = EL('bookStatus');
  try{
    const res = await fetch('01fftd.htm', { cache:'no-store' });
    if(res.ok){
      const html = await res.text();
      importBook(html);
      status.textContent = `Libro caricato (${state.index.size} paragrafi)`;
      EL('importHelp')?.classList.add('hidden');
      const first = state.index.has(1) ? 1 : [...state.index.keys()].sort((a,b)=>a-b)[0];
      if(first) navGoTo(first,false);
      return true;
    }
  }catch(e){}
  status.textContent = 'Nessun libro caricato';
  EL('importHelp')?.classList.remove('hidden');
  return false;
}

function importBook(html){
  const dom = new DOMParser().parseFromString(html,'text/html');
  state.bookDoc = dom;
  state.index.clear();

  // Indicizzazione ancore §
  $$('a[id^="sect"], a[name^="sect"]', dom).forEach(a=>{
    const id = (a.id || a.name || '').toString();
    const n  = +id.replace(/[^0-9]/g,'');
    if(Number.isInteger(n) && n>0) state.index.set(n, a);
  });

  parseCRT(dom); // prova a estrarre CRT dal libro, altrimenti fallback
}

/* Estrae il contenuto del paragrafo: aggancia dall’ancora fino alla prossima ancora § */
function sectionContentFromAnchor(a){
  // Project Aon spesso ha <h3><a name="sectX">X</a></h3> seguito da <p>...</p>
  let start = a.closest('h1,h2,h3,h4') || a.parentElement;
  const frag = document.createDocumentFragment();
  let node = start;
  while(node){
    if(node !== start && node.querySelector?.('a[id^="sect"],a[name^="sect"]')) break;
    frag.appendChild(node.cloneNode(true));
    node = node.nextElementSibling;
    // fermati se superi troppo (safety)
    if(frag.childNodes.length>200) break;
  }
  const wrap = document.createElement('div'); wrap.appendChild(frag);
  return wrap;
}

/* ==================== Navigazione ==================== */
function navGoTo(n, push=true){
  const a = state.index.get(n);
  if(!a){ immersion(`Paragrafo §${n} non trovato.`,'Errore'); return; }

  const content = sectionContentFromAnchor(a);
  if(push && state.current.section) state.navHistory.push(state.current.section);
  if(push) state.navFuture.length = 0;
  state.current.section = n;

  EL('secNo').textContent = String(n);
  const pass = EL('passage'); pass.innerHTML = ''; pass.appendChild(content);
  EL('autoDetections')?.classList.remove('hidden');
  EL('deadend')?.classList.add('hidden');

  // Guarigione tra paragrafi (se non c’è stato combattimento)
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
  EL('navBack').disabled   = state.navHistory.length===0;
  EL('navForward').disabled= state.navFuture.length===0;
}

/* ==================== Analisi paragrafo ==================== */
function analyzeSection(root){
  state.enemies.length = 0;

  // 1) Cerca pattern nemici – EN / IT
  const text = textOnly(root);
  // Esempi: "Giak (COMBAT SKILL 15 ENDURANCE 20)" oppure "Combattività 15, Resistenza 20"
  const enemyRegexes = [
    /([A-Za-z][A-Za-z0-9 '\-]+?)\s*\(.*?COMBAT\s*SKILL\s*(\d+)\s*ENDURANCE\s*(\d+)\)/ig,
    /([A-Za-z][A-Za-z0-9 '\-]+?)\s*:\s*COMBAT\s*SKILL\s*(\d+)\s*ENDURANCE\s*(\d+)/ig,
    /([A-Za-zÀ-ÿ][A-Za-z0-9 '\-À-ÿ]+?)\s*:\s*Combattivit[àa]\s*(\d+)\s*Resistenza\s*(\d+)/ig
  ];
  for(const rx of enemyRegexes){
    let m; while((m=rx.exec(text))){
      state.enemies.push({ name:m[1].trim(), cs:+m[2], ep:+m[3] });
    }
  }
  // Se non trovati, prova ricerca più “soft”: paragrafo con entrambe le parole chiave
  if(!state.enemies.length){
    $$('p',root).forEach(p=>{
      const t = textOnly(p);
      const m = t.match(/([A-Za-z][A-Za-z0-9 '\-]+?)?.*?(COMBAT\s*SKILL|Combattivit[àa])\s*(\d+).*?(ENDURANCE|Resistenza)\s*(\d+)/i);
      if(m){
        const name = (m[1]||'Nemico').trim();
        state.enemies.push({ name, cs:+m[3], ep:+m[5] });
      }
    });
  }

  // 2) Flag speciali
  state.current.allowEvade   = /\b(evade|escape|fuggi|evadi|sottrarti)\b/i.test(text);
  state.current.enemyImmuneMB= /(immune\s+to\s+mindblast|immune\s+a\s+psicolaser)/i.test(text);
  state.current.psionicAttack= /(psychic attack|mindblast attack|attacco psichico)/i.test(text);

  renderAutoDetections();
  renderChoicesAssist();
}

/* ========== Scelte condizionate (EN+IT) ========== */
function parseChoiceConditions(txt){
  const conds=[];
  // Discipline
  const discMap = [
    ['Sixth Sense','Sesto Senso'], ['Mind Over Matter','Telecinesi'],
    ['Hunting','Caccia'], ['Animal Kinship','Affinità Animale'],
    ['Mindshield','Psicoschermo'], ['Mindblast','Psicolaser'],
    ['Tracking','Orientamento'], ['Camouflage','Mimetismo'],
    ['Healing','Guarigione'], ['Weaponskill','Scherma']
  ];
  for(const [en,it] of discMap){
    const rx = new RegExp(`\\b(${en}|${it})\\b`,'i');
    if(rx.test(txt) && /(if you (have|possess)|se .* (hai|possiedi))/i.test(txt))
      conds.push({type:'discipline', name:it});
  }
  // Item semplici
  if(/(key|chiave)\b.*\b(gold|d'oro)/i.test(txt)) conds.push({type:'item',name:"Chiave d'Oro"});
  if(/gemma\s+vordak|vordak\s+gem/i.test(txt)) conds.push({type:'item',name:"Gemma Vordak"});
  // Gold payment
  const mGold = txt.match(/(\d+)\s+(gold|corone d'oro)/i);
  if(mGold && /(pay|paga|pagare)/i.test(txt)) conds.push({type:'goldAtLeast',amount:+mGold[1],consume:true});
  return conds;
}
function meetsCondition(c){
  const hasItem = name => [...state.player.weapons, ...state.player.backpack, ...state.player.specials]
                          .some(x => new RegExp(name,'i').test(x));
  if(c.type==='discipline') return state.player.disciplines.has(c.name);
  if(c.type==='item')       return hasItem(c.name);
  if(c.type==='goldAtLeast')return state.player.gold >= c.amount;
  return true;
}
function renderChoicesAssist(){
  state.allowedTargets.clear();
  const root = EL('passage');
  $$('a[href*="#sect"]',root).forEach(a=>{
    const href=a.getAttribute('href')||'';
    const m = href.match(/#sect(\d+)/i); if(!m) return;
    const target=+m[1];
    const parent=a.closest('p')||a.parentElement;
    const txt=textOnly(parent);
    const conds=parseChoiceConditions(txt);
    const isOk=conds.every(meetsCondition);
    state.allowedTargets.set(target,isOk);
    a.classList.add('choiceLink');
    a.classList.toggle('disabled', !isOk && state.flags.enforceCond);
    a.title = (!isOk && conds.length)
      ? conds.map(c=>c.type==='discipline' ? `Richiede Arte: ${c.name}` :
                     c.type==='goldAtLeast' ? `Richiede ≥ ${c.amount} Corone` :
                     `Richiede: ${c.name}`).join(' • ')
      : '';
  });
}

/* ==================== Combattimento ==================== */
function effectiveWeaponBonus(name){
  if(!name) return -4;
  let b=0;
  if(state.player.disciplines.has('Scherma') && state.player.weaponskillWeapon &&
     new RegExp(`\\b${state.player.weaponskillWeapon}\\b`,'i').test(name)) b+=2;
  return b;
}
function playerCurrentCS(){
  let cs = state.player.combattivitaBase + effectiveWeaponBonus(state.player.equipped||"");
  if(EL('useMindblast')?.checked && state.player.disciplines.has('Psicolaser') && !state.current.enemyImmuneMB) cs += 2;
  if(state.current.psionicAttack && !state.player.disciplines.has('Psicoschermo')) cs -= 2;
  cs += (+EL('youMod').value || 0);
  return cs;
}
function enemyCurrentCS(base){ return base + (+EL('foeMod').value||0); }
function computeCR(){ if(!state.inCombat.foe) return 0; return playerCurrentCS() - enemyCurrentCS(state.inCombat.foe.cs); }

function consultCRT(cr, rn){
  if(!state.crt){ fallbackCRT(); }
  const col = state.crt.ranges.findIndex(r => cr>=r.min && cr<=r.max);
  const idx = (col===-1) ? (cr<0?0:state.crt.ranges.length-1) : col;
  return state.crt.rows[rn]?.[idx] || {eLoss:0,lwLoss:0,eKill:false,lwKill:false};
}

function prepareCombatPanel(){
  if(!state.enemies.length){ immersion('Nessun nemico rilevato in questo paragrafo.','Combattimento'); return; }
  const foe = state.enemies[0];
  state.inCombat = { active:false, foe:{...foe, epNow:foe.ep}, round:0 };
  EL('combatPanel').classList.remove('hidden');
  EL('crNow').textContent = '—';
  EL('lastRN').textContent = '–';
  EL('lastResult').textContent = '–';
  EL('combatLog').textContent = '';
  $('#mbWrap')?.classList.toggle('hidden', !state.player.disciplines.has('Psicolaser'));
  if(EL('useMindblast')) EL('useMindblast').checked = false;
  EL('evadeBtn').style.display = state.current.allowEvade ? '' : 'none';
  EL('startCombatBtn').disabled=false;
  EL('combatRoundBtn').disabled=true;
  EL('endCombatBtn').disabled=true;
  updateCombatUI();
}

function updateHPBars(){
  const youPct = state.player.resistenzaBase ? (state.player.resistenzaCorrente / state.player.resistenzaBase) : 0;
  const foePct = state.inCombat.foe?.ep ? (state.inCombat.foe.epNow / state.inCombat.foe.ep) : 0;
  const fillY=EL('youHPFill'), labelY=EL('youHPLabel');
  const fillF=EL('foeHPFill') , labelF=EL('foeHPLabel');
  if(fillY){ fillY.style.width = `${clamp(youPct*100,0,100)}%`; }
  if(labelY){ labelY.textContent = `${state.player.resistenzaCorrente}/${state.player.resistenzaBase}`; }
  if(fillF && state.inCombat.foe){ fillF.style.width = `${clamp(foePct*100,0,100)}%`; }
  if(labelF && state.inCombat.foe){ labelF.textContent = `${state.inCombat.foe.epNow}/${state.inCombat.foe.ep}`; }
}

function updateCombatUI(){
  const foe=state.inCombat.foe; if(!foe) return;
  EL('foeName').textContent = foe.name || 'Nemico';
  const foeCS = enemyCurrentCS(foe.cs);
  EL('foeCS').textContent = String(foeCS);
  EL('foeEP').textContent = String(foe.epNow);
  EL('foeEPmax').textContent = `/ ${foe.ep}`;

  const youCS = playerCurrentCS();
  EL('youCS').textContent = String(youCS);
  EL('youEP').textContent = String(state.player.resistenzaCorrente);
  EL('youEPmax').textContent = `/ ${state.player.resistenzaBase}`;
  EL('youNotes').textContent = state.player.equipped ? `Arma: ${state.player.equipped}` : 'Senza arma (−4)';
  const cr = youCS - foeCS;
  EL('crNow').textContent = cr>=0?`+${cr}`:String(cr);

  updateHPBars();
}

function startCombat(){
  if(!state.inCombat.foe) return;
  state.inCombat.active = true;
  state.inCombat.round  = 0;
  EL('startCombatBtn').disabled=true;
  EL('combatRoundBtn').disabled=false;
  EL('endCombatBtn').disabled=false;
  updateCombatUI();
  immersion(`Inizia il combattimento contro ${state.inCombat.foe.name}.`,'Combattimento');
  logLine(`— Inizia combattimento: ${state.inCombat.foe.name} —`);
}

function endCombat(msg){
  EL('startCombatBtn').disabled=true;
  EL('combatRoundBtn').disabled=true;
  EL('endCombatBtn').disabled=true;
  state.inCombat.active=false;
  state.current.lastHadCombat=true;
  if(msg) immersion(msg,'Combattimento');
  syncUI();
}

function resolveRound(evading=false){
  if(!state.inCombat.active) return;
  const rn = random0to9();
  EL('rngVal').textContent = String(rn);
  EL('lastRN').textContent = String(rn);

  const cr = computeCR();
  const cell = consultCRT(cr, rn);

  let yourLoss = cell.lwKill ? state.player.resistenzaCorrente : (cell.lwLoss||0);
  let foeLoss  = cell.eKill  ? state.inCombat.foe.epNow      : (cell.eLoss||0);
  if(evading){ foeLoss = 0; }

  state.player.resistenzaCorrente = Math.max(0, state.player.resistenzaCorrente - yourLoss);
  state.inCombat.foe.epNow         = Math.max(0, state.inCombat.foe.epNow - foeLoss);

  const line = `${evading ? '(Evasione) ' : ''}Tu −${yourLoss}, Nemico −${foeLoss}`;
  EL('lastResult').textContent = line;
  logLine(`Round ${++state.inCombat.round}: RN ${rn}, CR ${cr>=0?`+${cr}`:cr} → ${line}`);

  updateCombatUI();

  // Popup “stile Pokémon”
  immersion(`${evading?'Tenti la fuga… ':''}Perdi ${yourLoss}, infliggi ${foeLoss}.`,'Round');

  if(state.player.resistenzaCorrente<=0){
    logLine('✖ Sei caduto.');
    EL('deadend')?.classList.remove('hidden');
    endCombat('Sei stato sconfitto.');
    return;
  }
  if(state.inCombat.foe.epNow<=0){
    logLine(`✔ ${state.inCombat.foe.name} sconfitto.`);
    endCombat(`${state.inCombat.foe.name} è stato sconfitto!`);
    return;
  }
  if(evading){
    logLine('Fuga riuscita.');
    endCombat('Sei riuscito a fuggire.');
  }
}

function logLine(s){ const el=EL('combatLog'); el.textContent += s+'\n'; el.scrollTop = el.scrollHeight; }

/* ==================== CRT ==================== */
function parseCRT(dom){
  try{
    const table = Array.from(dom.querySelectorAll('table')).find(t => /combat results table/i.test(t.textContent));
    if(!table) throw new Error('CRT not found');
    const rows = Array.from(table.querySelectorAll('tr'));
    const header = rows[1]?.querySelectorAll('th') || [];
    const ranges = Array.from(header).slice(1).map(th=>{
      const txt = textOnly(th).replace(/or lower|or higher|−/gi,'-');
      if(/-?\d+\s*\/\s*-?\d+/.test(txt)){
        const [min,max] = txt.split('/').map(x=>parseInt(x.trim(),10));
        return {min, max};
      }
      const v = parseInt(txt,10);
      if(/lower/i.test(txt)) return {min:-Infinity, max:v};
      if(/higher/i.test(txt))return {min:v, max:Infinity};
      return {min:v, max:v};
    });
    const crtRows = rows.slice(2).map(tr=>{
      return Array.from(tr.querySelectorAll('td')).map(td=>{
        const txt = textOnly(td);
        if(/k/i.test(txt)){
          const [e,lw] = txt.split('/').map(s=>s.trim());
          return {eLoss:0,lwLoss:0,eKill: e==='k', lwKill: lw==='k'};
        }
        const [eLoss,lwLoss] = txt.split('/').map(n=>parseInt(n,10));
        return {eLoss:eLoss||0, lwLoss:lwLoss||0, eKill:false, lwKill:false};
      });
    });
    if(!ranges.length || !crtRows.length) throw new Error('bad CRT');
    state.crt = { ranges, rows: crtRows };
  }catch(e){
    fallbackCRT();
  }
}
function fallbackCRT(){
  // Tabella generica “dolce”, simile ai valori canonici
  const ranges=[{min:-Infinity,max:-11},{min:-10,max:-9},{min:-8,max:-7},{min:-6,max:-5},{min:-4,max:-3},{min:-2,max:-1},{min:0,max:0},{min:1,max:2},{min:3,max:4},{min:5,max:6},{min:7,max:8},{min:9,max:10},{min:11,max:Infinity}];
  const r=(a,b)=>({eLoss:a,lwLoss:b,eKill:false,lwKill:false});
  const K=(who)=>({eLoss:0,lwLoss:0,eKill:who==='e',lwKill:who==='lw'});
  const rows=[
    [K('lw'),K('lw'),r(0,8),r(0,6),r(1,6),r(2,5),r(3,5),r(4,5),r(5,4),r(6,4),r(7,4),r(8,3),r(9,3)],
    [K('lw'),r(0,8),r(0,7),r(1,6),r(2,5),r(3,5),r(4,4),r(5,4),r(6,3),r(7,3),r(8,3),r(9,3),r(10,2)],
    [r(0,8),r(0,7),r(1,6),r(2,5),r(3,5),r(4,4),r(5,4),r(6,3),r(7,3),r(8,3),r(9,2),r(10,2),r(11,2)],
    [r(0,8),r(1,7),r(2,6),r(3,5),r(4,4),r(5,4),r(6,3),r(7,3),r(8,2),r(9,2),r(10,2),r(11,2),r(12,2)],
    [r(1,7),r(2,6),r(3,5),r(4,4),r(5,4),r(6,3),r(7,2),r(8,2),r(9,2),r(10,2),r(11,2),r(12,2),r(14,1)],
    [r(2,6),r(3,6),r(4,5),r(5,4),r(6,3),r(7,2),r(8,2),r(9,2),r(10,2),r(11,1),r(12,1),r(14,1),r(16,1)],
    [r(3,5),r(4,5),r(5,4),r(6,3),r(7,2),r(8,2),r(9,1),r(10,1),r(11,1),r(12,0),r(14,0),r(16,0),r(18,0)],
    [r(4,4),r(5,4),r(6,3),r(7,2),r(8,1),r(9,1),r(10,0),r(11,0),r(12,0),r(14,0),r(16,0),r(18,0),K('e')],
    [r(5,3),r(6,3),r(7,2),r(8,0),r(9,0),r(10,0),r(11,0),r(12,0),r(14,0),r(16,0),r(18,0),K('e'),K('e')],
    [r(6,0),r(7,0),r(8,0),r(9,0),r(10,0),r(11,0),r(12,0),r(14,0),r(16,0),r(18,0),K('e'),K('e'),K('e')]
  ];
  state.crt={ranges, rows};
}

/* ==================== UI/Inventario ==================== */
function weaponInfoLabel(name){
  if(!name) return "(nessuna) — eff. −4";
  const eff = effectiveWeaponBonus(name);
  const spec = state.player.disciplines.has('Scherma') ? `; +2 con ${state.player.weaponskillWeapon||'—'}` : '';
  return `${name} — eff. ${eff>=0?`+${eff}`:eff}${spec}`;
}
function enforceCapacity(){
  const maxMeals = Math.max(0, 8 - state.player.backpack.length);
  if(state.player.meals>maxMeals) state.player.meals = maxMeals;
  EL('meals').max = String(maxMeals);
  EL('capInfo').textContent = `capienza: ${state.player.backpack.length + state.player.meals}/8`;
}
function renderInventory(){
  const wRoot=EL('weaponsList');
  wRoot.innerHTML = state.player.weapons.length
    ? state.player.weapons.map((w,i)=>`<div class="row small"><span>${w}</span><button class="btn soft" data-delw="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Nessuna arma.</div>';
  wRoot.querySelectorAll('button[data-delw]').forEach(b=>b.onclick=()=>{
    state.player.weapons.splice(+b.dataset.delw,1);
    if(state.player.equipped && !state.player.weapons.includes(state.player.equipped)) state.player.equipped = state.player.weapons[0]||'';
    syncUI();
  });

  const eq=EL('equippedWeapon');
  eq.innerHTML = `<option value="">(nessuna)</option>` + state.player.weapons.map(w=>`<option value="${w}">${weaponInfoLabel(w)}</option>`).join('');
  eq.value = state.player.equipped || '';

  const bRoot=EL('backpackList');
  bRoot.innerHTML = state.player.backpack.length
    ? state.player.backpack.map((it,i)=>`<div class="row small"><span>${it}</span><button class="btn soft" data-deli="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Zaino vuoto.</div>';
  bRoot.querySelectorAll('button[data-deli]').forEach(b=>b.onclick=()=>{ state.player.backpack.splice(+b.dataset.deli,1); syncUI(); });

  const sRoot=EL('specialsList');
  sRoot.innerHTML = state.player.specials.length
    ? state.player.specials.map((it,i)=>`<div class="row small"><span>${it}</span><button class="btn soft" data-dels="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Nessuno.</div>';
  sRoot.querySelectorAll('button[data-dels]').forEach(b=>b.onclick=()=>{ state.player.specials.splice(+b.dataset.dels,1); syncUI(); });

  // Bonus Resistenza da Elmo/Cotta
  const helm = state.player.specials.some(x=>/^elmo$/i.test(x)) ? 2 : 0;
  const mail = state.player.specials.some(x=>/cotta di maglia/i.test(x)) ? 4 : 0;
  const bonus = helm + mail;
  if(state._lastSpecBonus===undefined) state._lastSpecBonus=0;
  const baseNoBonus = state.player.resistenzaBase - state._lastSpecBonus;
  state._lastSpecBonus = bonus;
  state.player.resistenzaBase = Math.max(1, baseNoBonus + bonus);
  if(state.player.resistenzaCorrente>state.player.resistenzaBase) state.player.resistenzaCorrente = state.player.resistenzaBase;

  enforceCapacity();
}

function renderDisciplinesList(){
  const root=EL('disciplinesList'); root.innerHTML='';
  const note=EL('discNote');
  if(state.flags.started){
    note.textContent='(bloccate: avventura in corso)';
    const sel=[...state.player.disciplines];
    root.innerHTML = sel.length
      ? sel.map(s=>`<div class="row small"><strong>${s}</strong> <span class="tag">— ${DISC_DESC[s]}</span></div>`).join('')
      : '<div class="small tag">Nessuna arte selezionata.</div>';
  }else{
    note.textContent='seleziona 5';
    DISCIPLINES.forEach(name=>{
      const id=`disc_${name.replace(/\s+/g,'_')}`;
      root.insertAdjacentHTML('beforeend', `<label class="row small"><input type="checkbox" id="${id}"> <strong>${name}</strong> <span class="tag">— ${DISC_DESC[name]}</span></label>`);
      const cb=EL(id);
      cb.addEventListener('change',e=>{
        if(e.target.checked){
          const set=state.player.disciplines;
          if(set.size>=5){ e.target.checked=false; immersion('Puoi selezionare al massimo 5 Arti.','Wizard'); return; }
          set.add(name);
          if(name==='Scherma' && !state.player.weaponskillWeapon){
            const rn=random0to9(); state.player.weaponskillWeapon = WEAPON_LIST[rn];
            immersion(`Maestro di Scherma in: ${state.player.weaponskillWeapon}`,'Scherma');
          }
        }else{
          state.player.disciplines.delete(name);
        }
      });
    });
  }
}

function syncUI(){
  // stats
  EL('combattivitaBase').value = state.player.combattivitaBase;
  EL('resistenzaBase').value   = state.player.resistenzaBase;
  EL('resistenzaCorrente').value = state.player.resistenzaCorrente;
  EL('meals').value = state.player.meals;
  EL('gold').value  = state.player.gold;

  renderDisciplinesList();
  renderInventory();
  renderChoicesAssist();

  // Weaponskill info
  EL('wsPanel').classList.toggle('hidden', !state.player.disciplines.has('Scherma'));
  EL('wsWeapon').textContent = state.player.weaponskillWeapon || '—';

  scheduleAutosave();
}

function renderAutoDetections(){
  const dc=EL('detectedCombat');
  const eList=EL('enemyList');
  const eCount=EL('enemyCount');
  if(state.enemies.length){
    dc.classList.remove('hidden');
    eCount.textContent = String(state.enemies.length);
    eList.innerHTML = state.enemies.map(e=>`<div class="enemyBox"><strong>${e.name}</strong> — Combattività <strong>${e.cs}</strong>, Resistenza <strong>${e.ep}</strong></div>`).join('');
  }else{
    dc.classList.add('hidden');
    EL('combatPanel').classList.add('hidden');
  }
  const hints=EL('psionHints');
  const parts=[];
  if(state.current.enemyImmuneMB) parts.push('Nemico <strong>immune a Psicolaser</strong>.');
  if(state.current.psionicAttack) parts.push('Usa <strong>attacchi psichici</strong> (−2 senza Psicoschermo).');
  hints.style.display = parts.length ? 'flex' : 'none';
  hints.innerHTML = parts.map(p=>`<span class="tag">${p}</span>`).join(' ');
}

/* ==================== Wizard ==================== */
const wizard = { step:0, total:4, temp:{} };

function openWizardModal(){
  wizard.step = 0;
  wizard.temp = {
    combattivitaBase:10, resistenzaBase:20,
    disciplines:new Set(), weapons:["Ascia"], meals:1, specials:["Mappa"],
    weaponskillWeapon:null, manual:false,
    rolls:{cs:0, ep:0}
  };
  EL('wizard').classList.remove('hidden');
  renderWizard();
}
function closeWizard(){ EL('wizard').classList.add('hidden'); }

function renderWizard(){
  EL('wizStepTag').textContent = `Passo ${wizard.step+1} di ${wizard.total}`;
  EL('wizDots').innerHTML = Array(wizard.total).fill(0).map((_,i)=>`<div class="step-dot ${i===wizard.step?'active':''}"></div>`).join('');
  const body=EL('wizBody'); body.innerHTML='';

  if(wizard.step===0){
    body.innerHTML = `
      <div class="box">
        <h3>Benvenuto, Ramas</h3>
        <p>Crea il tuo personaggio: Statistiche, Arti, Equipaggiamento, Riepilogo.</p>
        <label class="row small"><input type="checkbox" id="wizManual"> Tiri manuali (inserirai tu un numero 0–9)</label>
      </div>`;
    EL('wizManual').checked = wizard.temp.manual;
    EL('wizManual').onchange = e => wizard.temp.manual = e.target.checked;
  }

  if(wizard.step===1){
    body.innerHTML = `
      <div class="two">
        <div class="box">
          <h3>Combattività</h3>
          <div class="row">
            <button class="btn" id="wizRollCS">Estrai</button>
            <input id="wizCS" type="number" readonly style="width:100px" value="${wizard.temp.combattivitaBase}">
            <span class="tag">= 10 + Numero</span>
            <span class="tag" id="tryCS"></span>
          </div>
        </div>
        <div class="box">
          <h3>Resistenza</h3>
          <div class="row">
            <button class="btn" id="wizRollEP">Estrai</button>
            <input id="wizEP" type="number" readonly style="width:100px" value="${wizard.temp.resistenzaBase}">
            <span class="tag">= 20 + Numero</span>
            <span class="tag" id="tryEP"></span>
          </div>
        </div>
      </div>
      <div class="small tag">Con tiri automatici hai <strong>max 2 tentativi</strong> per ciascuna statistica.</div>`;
    const upd=()=>{ EL('tryCS').textContent=`tentativi: ${wizard.temp.rolls.cs}/2`; EL('tryEP').textContent=`tentativi: ${wizard.temp.rolls.ep}/2`; };
    upd();
    EL('wizRollCS').onclick=()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.cs>=2) return;
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.cs++;
      wizard.temp.combattivitaBase = 10 + r;
      EL('wizCS').value = wizard.temp.combattivitaBase;
      upd(); immersion(`Numero ${r}. Combattività = 10 + ${r}.`,'Tiro');
    };
    EL('wizRollEP').onclick=()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.ep>=2) return;
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.ep++;
      wizard.temp.resistenzaBase = 20 + r;
      EL('wizEP').value = wizard.temp.resistenzaBase;
      upd(); immersion(`Numero ${r}. Resistenza = 20 + ${r}.`,'Tiro');
    };
  }

  if(wizard.step===2){
    body.innerHTML = `<div class="box">
      <h3>Scegli 5 Arti Ramas</h3>
      <div class="row"><button id="wizRandom5Btn" class="btn soft">Scegli 5 casuali</button></div>
      <div id="wizDiscList" class="list" style="margin-top: 8px;"></div>
    </div>`;
    const list=EL('wizDiscList');
    DISCIPLINES.forEach(name=>{
      const id=`wd_${name.replace(/\s+/g,'_')}`;
      list.insertAdjacentHTML('beforeend', `<label class="row small"><input type="checkbox" id="${id}"> <strong>${name}</strong> <span class="tag">— ${DISC_DESC[name]}</span></label>`);
      const cb=EL(id);
      cb.checked = wizard.temp.disciplines?.has?.(name) || false;
      cb.onchange=(e)=>{
        if(e.target.checked){
          if(wizard.temp.disciplines.size>=5){ e.target.checked=false; immersion('Massimo 5 Arti.','Wizard'); return; }
          wizard.temp.disciplines.add(name);
        }else{
          wizard.temp.disciplines.delete(name);
        }
      };
    });
    EL('wizRandom5Btn').onclick=()=>{
      wizard.temp.disciplines = new Set([...DISCIPLINES].sort(()=>0.5-Math.random()).slice(0,5));
      renderWizard();
    };
  }

  if(wizard.step===3){
    body.innerHTML = `<div class="box">
      <h3>Equipaggiamento iniziale</h3>
      <p class="small tag">Parti con Ascia, 1 Pasto e Mappa. Tira un oggetto bonus.</p>
      <div class="row"><button id="wizBonusRoll" class="btn">Tira per l'oggetto bonus</button><span id="bonusItem" class="pill">—</span></div>
      <div class="divider"></div>
      <div class="row"><button id="wizApply" class="btn success">Applica e inizia</button></div>
    </div>`;
    EL('wizBonusRoll').onclick=()=>{
      const r=random0to9();
      const map={0:"Spadone",1:"Spada",2:"Elmo",3:"Due Pasti",4:"Cotta di Maglia",5:"Mazza",6:"Pozione Magica",7:"Asta",8:"Lancia",9:"12 Corone d'Oro"};
      wizard.temp.bonusItem = map[r];
      EL('bonusItem').textContent = map[r];
      immersion(`Oggetto bonus: ${map[r]}`,'Fato');
    };
    EL('wizApply').onclick=applyWizard;
  }

  EL('wizPrev').disabled = wizard.step===0;
  EL('wizNext').classList.toggle('hidden', wizard.step===wizard.total-1);
  EL('wizFinish').classList.add('hidden'); // usiamo il bottone interno allo step 3
}

function applyWizard(){
  // Valida
  if(!(wizard.temp.disciplines instanceof Set) || wizard.temp.disciplines.size!==5){
    immersion('Devi scegliere esattamente 5 Arti.','Wizard'); return;
  }
  // Applica
  state.player.combattivitaBase    = wizard.temp.combattivitaBase;
  state.player.resistenzaBase      = wizard.temp.resistenzaBase;
  state.player.resistenzaCorrente  = wizard.temp.resistenzaBase;
  state.player.disciplines         = new Set(wizard.temp.disciplines);
  state.player.weapons             = ["Ascia"];
  state.player.equipped            = "Ascia";
  state.player.backpack            = [];
  state.player.specials            = ["Mappa"];
  state.player.meals               = 1;
  state.player.gold                = random0to9();
  // Weaponskill
  if(state.player.disciplines.has('Scherma')){
    state.player.weaponskillWeapon = WEAPON_LIST[random0to9()];
  } else {
    state.player.weaponskillWeapon = null;
  }
  // Bonus item
  const bonus = wizard.temp.bonusItem;
  if(bonus){
    if(["Spadone","Spada","Mazza","Asta","Lancia"].includes(bonus) && state.player.weapons.length<2) state.player.weapons.push(bonus);
    if(bonus==="Due Pasti") state.player.meals += 2;
    if(bonus==="Pozione Magica") state.player.backpack.push("Pozione Magica");
    if(bonus==="Elmo") state.player.specials.push("Elmo");
    if(bonus==="Cotta di Maglia") state.player.specials.push("Cotta di Maglia");
    if(bonus==="12 Corone d'Oro") state.player.gold = Math.min(50, state.player.gold + 12);
  }
  state.flags.started = true;
  syncUI();
  closeWizard();
  immersion('Il tuo viaggio ha inizio…','Avventura');
}

/* ==================== Salvataggi ==================== */
function buildSaveObj(){ return {
  player:{
    ...state.player,
    disciplines:[...state.player.disciplines]
  },
  section:state.current.section,
  flags:state.flags,
  history:state.navHistory
};}
function applySaveObj(obj){
  if(!obj) return;
  state.player = {...state.player, ...obj.player, disciplines:new Set(obj.player.disciplines||[])};
  state.flags  = {...state.flags , ...obj.flags};
  state.navHistory = obj.history||[];
  if(obj.section) navGoTo(obj.section,false);
  syncUI();
}
function scheduleAutosave(){
  if(!state.flags.autosave) return;
  try{
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildSaveObj()));
    if(EL('btnResume')) EL('btnResume').disabled=false;
  }catch(e){}
}
function restoreAutosave(){
  try{
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if(!raw) return false;
    const obj = JSON.parse(raw);
    applySaveObj(obj);
    immersion('Salvataggio automatico ripristinato.','Riprendi');
    return true;
  }catch(e){ return false; }
}

/* ==================== DeepL ==================== */
function openDeepLForCurrent(){
  const pass = EL('passage');
  const txt = textOnly(pass).slice(0, MAX_DEEPL_FRAGMENT);
  if(!txt){ immersion('Nessun testo da tradurre.','Traduzione'); return; }
  const url = `https://www.deepl.com/translator#en/it/${encodeURIComponent(txt)}`;
  window.open(url, '_blank', 'noopener');
}

/* ==================== Eventi ==================== */
function initListeners(){
  // Tema
  EL('themeToggle')?.addEventListener('change', e=>{
    const mode = e.target.checked ? 'light' : '';
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem(THEME_PREF, mode);
  });

  // Import manuale libro
  EL('fileInput')?.addEventListener('change', async (e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const txt = await file.text();
    importBook(txt);
    EL('bookStatus').textContent = `Libro caricato (${state.index.size} paragrafi)`;
    EL('importHelp')?.classList.add('hidden');
    const first = state.index.has(1) ? 1 : [...state.index.keys()].sort((a,b)=>a-b)[0];
    if(first) navGoTo(first,false);
  });

  // Navigazione
  EL('jumpGo')?.addEventListener('click', ()=>{
    const n=+EL('jumpInput').value; if(Number.isInteger(n)) navGoTo(n);
  });
  EL('navBack')?.addEventListener('click',()=>{
    if(state.navHistory.length===0) return;
    const prev = state.navHistory.pop();
    if(prev){ state.navFuture.unshift(state.current.section); navGoTo(prev,false); }
  });
  EL('navForward')?.addEventListener('click',()=>{
    if(state.navFuture.length===0) return;
    const next = state.navFuture.shift();
    if(next){ state.navHistory.push(state.current.section); navGoTo(next,false); }
  });
  EL('passage')?.addEventListener('click', ev=>{
    const a = ev.target.closest('a'); if(!a) return;
    const m = (a.getAttribute('href')||'').match(/#sect(\d+)/i); if(!m) return;
    const target = +m[1];
    if(state.flags.enforceCond && state.allowedTargets.has(target) && !state.allowedTargets.get(target)){
      ev.preventDefault();
      immersion('Scelta bloccata: requisiti non soddisfatti.','Scelta');
      return;
    }
    ev.preventDefault(); navGoTo(target);
  });

  // Traduzione
  EL('btnDeepL')?.addEventListener('click', openDeepLForCurrent);

  // Wizard
  EL('openWizardBtn')?.addEventListener('click', openWizardModal);
  EL('wizSkip')?.addEventListener('click', closeWizard);
  EL('wizPrev')?.addEventListener('click', ()=>{
    wizard.step = Math.max(0, wizard.step-1); renderWizard();
  });
  EL('wizNext')?.addEventListener('click', ()=>{
    if(wizard.step===2 && (!wizard.temp.disciplines || wizard.temp.disciplines.size!==5)){
      immersion('Devi scegliere esattamente 5 Arti Ramas.','Wizard'); return;
    }
    wizard.step = Math.min(wizard.total-1, wizard.step+1); renderWizard();
  });

  // Start rapido / nuova / import-export
  EL('quickStartBtn')?.addEventListener('click', ()=>{
    state.player = {
      combattivitaBase: 10+random0to9(),
      resistenzaBase:   20+random0to9(),
      resistenzaCorrente: 0, // ri-settato sotto
      disciplines: new Set([...DISCIPLINES].sort(()=>0.5-Math.random()).slice(0,5)),
      weapons: ["Ascia"], equipped:"Ascia",
      backpack:[], specials:["Mappa"], meals:1, gold: random0to9(),
      weaponskillWeapon: null
    };
    if(state.player.disciplines.has('Scherma')) state.player.weaponskillWeapon = WEAPON_LIST[random0to9()];
    state.player.resistenzaCorrente = state.player.resistenzaBase;
    state.flags.started=true; syncUI(); immersion('Personaggio rapido creato!','Inizio Rapido');
  });
  EL('newGameBtn')?.addEventListener('click', ()=>{
    if(confirm('Nuova partita? Perderai i progressi non salvati.')){
      localStorage.removeItem(AUTOSAVE_KEY); location.reload();
    }
  });
  EL('exportSaveBtn')?.addEventListener('click', ()=>{
    EL('saveCode').value = btoa(unescape(encodeURIComponent(JSON.stringify(buildSaveObj()))));
    immersion('Codice di salvataggio generato.','Salvataggio');
  });
  EL('importSaveBtn')?.addEventListener('click', ()=>{
    const raw = prompt('Incolla il codice di salvataggio:','');
    if(!raw) return;
    try{
      const obj = JSON.parse(decodeURIComponent(escape(atob(raw))));
      applySaveObj(obj);
      immersion('Salvataggio caricato.','Import');
    }catch(e){ alert('Codice non valido.'); }
  });
  EL('btnResume')?.addEventListener('click', ()=>{ if(!restoreAutosave()) immersion('Nessun salvataggio trovato.','Riprendi'); });

  EL('toggleAutosave')?.addEventListener('change', e=>{
    state.flags.autosave = e.target.checked;
    try{ localStorage.setItem(AUTOSAVE_PREF, e.target.checked?'1':'0'); }catch(e){}
  });

  // RNG / Dado
  EL('rng0to9Btn')?.addEventListener('click', ()=>{ const v=random0to9(); EL('rngVal').textContent=String(v); });
  EL('btnDice')?.addEventListener('click', ()=> EL('diceModal').classList.remove('hidden'));
  EL('diceClose')?.addEventListener('click', ()=> EL('diceModal').classList.add('hidden'));
  EL('diceRoll')?.addEventListener('click', ()=>{ const v=random0to9(); EL('diceFace').textContent=String(v); EL('rngVal').textContent=String(v); immersion(`Numero Casuale: ${v}`,'Dado'); });

  // Combattimento
  EL('prepareCombatBtn')?.addEventListener('click', prepareCombatPanel);
  EL('startCombatBtn')?.addEventListener('click', startCombat);
  EL('combatRoundBtn')?.addEventListener('click', ()=>resolveRound(false));
  EL('evadeBtn')?.addEventListener('click',     ()=>resolveRound(true));
  EL('endCombatBtn')?.addEventListener('click', ()=>endCombat('Combattimento terminato.'));
  ;['useMindblast','youMod','foeMod'].forEach(id=> EL(id)?.addEventListener('input', updateCombatUI));

  // Scelte condizionate attive
  EL('enforceCond')?.addEventListener('change', e=>{
    state.flags.enforceCond = e.target.checked; renderChoicesAssist();
  });

  // Inventario inputs
  EL('addWeaponBtn')?.addEventListener('click',()=>{
    const v=(EL('weaponInput').value||'').trim(); if(!v) return;
    if(state.player.weapons.includes(v)) return;
    if(state.player.weapons.length>=2){ immersion('Puoi portare al massimo 2 armi.','Inventario'); return; }
    state.player.weapons.push(v); if(!state.player.equipped) state.player.equipped=v;
    EL('weaponInput').value=''; syncUI();
  });
  EL('equippedWeapon')?.addEventListener('change', e=>{ state.player.equipped = e.target.value; syncUI(); });

  EL('addBackpackBtn')?.addEventListener('click',()=>{
    const v=(EL('backpackInput').value||'').trim(); if(!v) return;
    const cap=state.player.backpack.length + state.player.meals;
    if(cap>=8){ immersion('Zaino pieno (max 8 fra oggetti + pasti).','Inventario'); return; }
    state.player.backpack.push(v); EL('backpackInput').value=''; syncUI();
  });

  EL('addSpecialBtn')?.addEventListener('click',()=>{
    const v=(EL('specialInput').value||'').trim(); if(!v) return;
    state.player.specials.push(v); EL('specialInput').value=''; syncUI();
  });

  EL('eatMealBtn')?.addEventListener('click',()=>{
    if(state.player.meals>0){
      state.player.meals--;
      state.player.resistenzaCorrente = Math.min(state.player.resistenzaBase, state.player.resistenzaCorrente+4);
      syncUI();
    }else immersion('Nessun Pasto disponibile.','Inventario');
  });

  EL('goldPlus1Btn')?.addEventListener('click',()=>{ EL('gold').value = clamp((+EL('gold').value||0)+1,0,50); EL('gold').dispatchEvent(new Event('input')); });
  EL('goldMinus1Btn')?.addEventListener('click',()=>{ EL('gold').value = clamp((+EL('gold').value||0)-1,0,50); EL('gold').dispatchEvent(new Event('input')); });

  EL('btnExport')?.addEventListener('click', ()=> EL('exportSaveBtn').click());
  EL('btnImport')?.addEventListener('click', ()=> EL('importSaveBtn').click());
  EL('btnReset') ?.addEventListener('click', ()=>{
    if(confirm('Reset totale?')){ localStorage.removeItem(AUTOSAVE_KEY); location.reload(); }
  });

  // Sync manuale dei campi numerici principali
  EL('combattivitaBase')?.addEventListener('input', ()=>{ state.player.combattivitaBase = +EL('combattivitaBase').value||0; scheduleAutosave(); updateCombatUI(); });
  EL('resistenzaBase')  ?.addEventListener('input', ()=>{ state.player.resistenzaBase   = Math.max(1,+EL('resistenzaBase').value||1); if(state.player.resistenzaCorrente>state.player.resistenzaBase) state.player.resistenzaCorrente=state.player.resistenzaBase; scheduleAutosave(); updateCombatUI(); });
  EL('resistenzaCorrente')?.addEventListener('input', ()=>{ state.player.resistenzaCorrente = clamp(+EL('resistenzaCorrente').value||0,0,state.player.resistenzaBase); scheduleAutosave(); updateCombatUI(); });
  EL('meals')?.addEventListener('input', ()=>{ state.player.meals = clamp(+EL('meals').value||0,0,8); enforceCapacity(); scheduleAutosave(); });
  EL('gold') ?.addEventListener('input', ()=>{ state.player.gold  = clamp(+EL('gold').value||0,0,50); scheduleAutosave(); });
}

/* ==================== Init ==================== */
async function init(){
  initListeners();
  try{
    const pref = localStorage.getItem(AUTOSAVE_PREF);
    if(pref!==null){
      state.flags.autosave = (pref==='1');
      if(EL('toggleAutosave')) EL('toggleAutosave').checked = state.flags.autosave;
    }
    if(EL('btnResume')) EL('btnResume').disabled = !localStorage.getItem(AUTOSAVE_KEY);
  }catch(e){}
  if(EL('enforceCond')) EL('enforceCond').checked = state.flags.enforceCond;

  await tryAutoLoad();
  syncUI();
  updateNavButtons();

  // Click su testo: abilita blocco scelte
  // (già gestito in initListeners)
}

// Avvio
window.addEventListener('DOMContentLoaded', init);