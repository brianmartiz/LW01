/* =========================
 * Lupo Solitario — Motore
 * (index.html + style.css nel root)
 * ========================= */
'use strict';

/* ===== Shortcuts & Helpers ===== */
const EL = id => document.getElementById(id);
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const textOnly = n => (n.textContent || '').replace(/\s+/g, ' ').trim();

/* ===== Const ===== */
const AUTOSAVE_KEY  = 'lw_book1_autosave_v9';
const AUTOSAVE_PREF = 'lw_book1_autosave_enabled';
const THEME_PREF    = 'lw_theme';

const WEAPON_LIST = ["Pugnale","Lancia","Mazza","Daga","Martello da Guerra","Spada","Ascia","Asta","Spadone","Arco"];
const DISCIPLINES = ["Mimetismo","Caccia","Sesto Senso","Orientamento","Guarigione","Scherma","Psicoschermo","Psicolaser","Affinità Animale","Telecinesi"];
const DISC_ALIAS  = {
  "Tracking":"Orientamento",
  "Sixth Sense":"Sesto Senso",
  "Animal Kinship":"Affinità Animale",
  "Mind Over Matter":"Telecinesi",
  "Mindshield":"Psicoschermo",
  "Mindblast":"Psicolaser",
  "Weaponskill":"Scherma",
};

/* ===== Global State ===== */
let state = {
  bookDoc: null,
  index: new Map(),
  current: {
    section: null,
    lastHadCombat: false,
    allowEvade: false,
    enemyImmuneMB: false,
    psionicAttack: false,
  },
  enemies: [],
  inCombat: { active:false, foe:null, round:0 },
  sectionOnce: new Set(), // effetti una tantum (es. §144/§147)
  navHistory: [], navFuture: [],
  player: {
    combattivitaBase: 10,
    resistenzaBase: 20,
    resistenzaCorrente: 20,
    disciplines: new Set(),
    weapons: [],
    equipped: "",
    backpack: [],
    specials: [],
    meals: 1,
    gold: 0,
    weaponskillWeapon: null,
  },
  flags: {
    version: 9,
    autosave: true,
    started: false,
    enforceCond: true,
    rngManual: false,
    rngManualVal: 0,
  },
  allowedTargets: new Map(),
  crt: null,
};

/* ===== UI feedback ===== */
function immersion(text, title='Ordine Ramas') {
  const wrap = EL('immersive');
  EL('immTitle').textContent = `✦ ${title}`;
  EL('immTxt').textContent = text;
  requestAnimationFrame(() => {
    wrap.classList.add('show');
    setTimeout(() => wrap.classList.remove('show'), 2100);
  });
}

/* ===== Random 0–9 ===== */
function random0to9() {
  if (state.flags.rngManual) return clamp(+EL('rngManualVal').value, 0, 9);
  const b = new Uint8Array(1); crypto.getRandomValues(b);
  return b[0] % 10;
}

/* ===== Theme ===== */
(function themeInit(){
  const saved = localStorage.getItem(THEME_PREF);
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  EL('themeToggle').checked = document.documentElement.getAttribute('data-theme') === 'light';
})();

/* ===== Book Load & Index ===== */
async function tryAutoLoad(){
  try{
    const res = await fetch('01fftd.htm', {cache: 'no-store'});
    if (res.ok){
      const html = await res.text();
      importBook(html);
      return true;
    }
  }catch(_){}
  EL('importHelp').classList.remove('hidden');
  return false;
}

function importBook(html){
  const dom = new DOMParser().parseFromString(html, 'text/html');
  state.bookDoc = dom;
  state.index.clear();

  // indicizza #sectXXX o name="sectXXX"
  $$('a[id^="sect"], a[name^="sect"]', dom).forEach(a=>{
    const id = (a.id || a.name || '').toString();
    const n = +id.replace(/[^0-9]/g,'');
    if (Number.isInteger(n) && n>0) state.index.set(n, a);
  });

  parseCRT(dom);
  EL('bookStatus').textContent = `Libro caricato (${state.index.size} paragrafi)`;
  EL('importHelp').classList.add('hidden');

  const first = state.index.has(1) ? 1 : state.index.keys().next().value;
  if (first) navGoTo(first, false);
}

/* copia il contenuto visuale di una sezione */
function sectionContentFromAnchor(a){
  // trova il titolo/paragrafo di partenza
  let start = a.closest('h1,h2,h3,h4') || a.parentElement;
  const wrap = document.createElement('div');
  let node = start;
  while (node){
    if (node !== start && node.matches?.('h1,h2,h3,h4') && node.querySelector?.('a[id^="sect"],a[name^="sect"]')) break;
    wrap.appendChild(node.cloneNode(true));
    node = node.nextElementSibling;
  }
  return wrap;
}

/* ===== Navigation ===== */
function navGoTo(n, push=true){
  const a = state.index.get(n);
  if (!a){ immersion(`Paragrafo §${n} non trovato.`, 'Errore'); return; }

  const content = sectionContentFromAnchor(a);
  if (push && state.current.section) state.navHistory.push(state.current.section);
  if (push) state.navFuture.length = 0;

  state.current.section = n;
  EL('secNo').textContent = String(n);
  const pass = EL('passage'); pass.innerHTML=''; pass.appendChild(content);

  // scroll-to-top
  window.scrollTo({top:0, behavior:'smooth'});

  EL('autoDetections').classList.remove('hidden');
  EL('deadend').classList.add('hidden');

  // Guarigione (se no combattimento precedente)
  if (!state.inCombat.active && !state.current.lastHadCombat &&
      state.player.disciplines.has('Guarigione') &&
      state.player.resistenzaCorrente < state.player.resistenzaBase){
    state.player.resistenzaCorrente = Math.min(state.player.resistenzaBase, state.player.resistenzaCorrente + 1);
    immersion('+1 Resistenza (Guarigione)', 'Recupero');
  }
  state.current.lastHadCombat = false;

  analyzeSection(content.cloneNode(true));
  applySectionSpecials(n); // regole speciali paragrafi
  updateNavButtons();
  renderChoicesAssist();
  syncUI();
  scheduleAutosave();
}

function updateNavButtons(){
  EL('navBack').disabled = state.navHistory.length===0;
  EL('navForward').disabled = state.navFuture.length===0;
}

/* ===== Section Analysis ===== */
function analyzeSection(root){
  state.enemies = [];
  state.current.allowEvade   = /\bevadi\b|fuggire|escape|evade/i.test(textOnly(root));
  state.current.psionicAttack= /psionic|psichic[io]|mind[- ]attack|attacco psichico/i.test(textOnly(root));
  state.current.enemyImmuneMB= /immune.*(mindblast|psicolaser)/i.test(textOnly(root));

  // Nemici — parsing flessibile (EN/IT)
  const raw = textOnly(root);
  // Match pattern: "Name: COMBAT SKILL 14 ENDURANCE 20" o simili
  const re = /([A-Za-zÀ-ÖØ-öø-ÿ0-9 '\-]+?)\s*[:\-–]\s*COMBAT\s*SKILL\s*(\d+)\s*(?:ENDURANCE|ENDURANCE\s*POINTS|RESISTENZA)\s*(\d+)/gi;
  let m;
  while ((m = re.exec(raw))){
    state.enemies.push({ name:m[1].trim(), cs:+m[2], ep:+m[3] });
  }

  renderAutoDetections();
}

/* ===== Choices Assist (enforce conditions in-text) ===== */
function parseChoiceConditions(txt){
  const conds = [];
  // Discipline
  if (/sixth sense|sesto senso/i.test(txt)) conds.push({type:'discipline', name:'Sesto Senso'});
  if (/tracking|orientamento\b/i.test(txt)) conds.push({type:'discipline', name:'Orientamento'});
  if (/animal kinship|affinit[aà] animale/i.test(txt)) conds.push({type:'discipline', name:'Affinità Animale'});
  if (/mind over matter|telecinesi/i.test(txt)) conds.push({type:'discipline', name:'Telecinesi'});
  // Oggetti
  if (/golden key|chiave d'?oro/i.test(txt)) conds.push({type:'item', name:"Chiave d'Oro"});
  if (/vordak gem|gemma vordak/i.test(txt)) conds.push({type:'item', name:'Gemma Vordak'});
  // Oro
  const gm = txt.match(/(\d+)\s+corone d[' ]?oro/i);
  if (gm && /pag/i.test(txt)) conds.push({type:'goldAtLeast', amount:+gm[1], consume:true});
  return conds;
}
function meetsCondition(c){
  const hasItem = name => [...state.player.weapons, ...state.player.backpack, ...state.player.specials]
    .some(x=> new RegExp(name,'i').test(x));
  if (c.type==='discipline') return state.player.disciplines.has(c.name);
  if (c.type==='item')       return hasItem(c.name);
  if (c.type==='goldAtLeast')return state.player.gold >= c.amount;
  return true;
}
function renderChoicesAssist(){
  state.allowedTargets.clear();
  const root = EL('passage');
  $$('a[href*="sect"]', root).forEach(a=>{
    const m = (a.getAttribute('href')||'').match(/#sect(\d+)/i);
    if (!m) return;
    const target = +m[1];
    const parent = a.closest('p') || a.parentElement;
    const txt = textOnly(parent);
    const conds = parseChoiceConditions(txt);
    const ok = conds.every(meetsCondition);

    state.allowedTargets.set(target, ok);
    a.classList.add('choiceLink');
    a.classList.toggle('disabled', !ok && state.flags.enforceCond);
    if (!ok && state.flags.enforceCond) {
      a.title = 'Requisiti non soddisfatti';
    } else {
      a.title = '';
    }
  });
}

/* ===== Section Specials (hard rules per anomalie) ===== */
function applySectionSpecials(n){
  // §19 — Tracking -> 69 abilitato solo se hai Orientamento
  if (n===19){
    toggleLinkTo(69, state.player.disciplines.has('Orientamento'));
  }

  // §21 — Estrai numero: se 9 -> 312, altrimenti morte
  if (n===21 && !state.sectionOnce.has(21)){
    state.sectionOnce.add(21);
    const r = random0to9();
    EL('rngVal').textContent = String(r);
    immersion(`Numero del Destino: ${r}`, 'Prova');
    if (r===9){ setTimeout(()=>navGoTo(312), 400); return; }
    EL('deadend').classList.remove('hidden');
  }

  // §23 — Golden Key -> 326 ; Mind Over Matter/Telecinesi -> 151
  if (n===23){
    const hasKey = hasItemName(/golden key|chiave d'?oro/i);
    toggleLinkTo(326, hasKey);
    toggleLinkTo(151, state.player.disciplines.has('Telecinesi'));
  }

  // §52 — Animal Kinship -> 225 ; altrimenti auto -> 250
  if (n===52 && !state.sectionOnce.has(52)){
    if (state.player.disciplines.has('Affinità Animale')){
      // mostra la scelta a 225 normalmente
    } else {
      state.sectionOnce.add(52);
      setTimeout(()=>navGoTo(250), 300);
      return;
    }
  }

  // §91 — Sixth Sense -> 198 (abilita solo se hai Sesto Senso)
  if (n===91){
    toggleLinkTo(198, state.player.disciplines.has('Sesto Senso'));
  }

  // §105 — Animal Kinship -> 298 ; altrimenti auto -> 335
  if (n===105 && !state.sectionOnce.has(105)){
    if (state.player.disciplines.has('Affinità Animale')){
      // mostra 298
    } else {
      state.sectionOnce.add(105);
      setTimeout(()=>navGoTo(335), 300);
      return;
    }
  }

  // §125 — Tracking -> 301 (abilitato solo con Orientamento)
  if (n===125){
    toggleLinkTo(301, state.player.disciplines.has('Orientamento'));
  }

  // §144 — perdi 1 oggetto zaino, se vuoto perdi 1 arma (una sola volta)
  if (n===144 && !state.sectionOnce.has(144)){
    state.sectionOnce.add(144);
    if (state.player.backpack.length>0){
      const removed = state.player.backpack.pop();
      immersion(`Un oggetto è stato rubato dallo zaino: ${removed}`, 'Furto');
    } else if (state.player.weapons.length>0){
      const removed = state.player.weapons.pop();
      if (state.player.equipped===removed) state.player.equipped = state.player.weapons[0]||"";
      immersion(`Hai perso un’arma: ${removed}`, 'Sventura');
    }
    syncUI();
  }

  // §147 — Pasto obbligatorio, altrimenti −3 EP (una sola volta)
  if (n===147 && !state.sectionOnce.has(147)){
    state.sectionOnce.add(147);
    if (state.player.meals>0 && !state.player.disciplines.has('Caccia')){
      state.player.meals--;
      immersion('Hai consumato 1 Pasto.', 'Sostentamento');
    } else if (state.player.meals===0){
      state.player.resistenzaCorrente = Math.max(0, state.player.resistenzaCorrente - 3);
      immersion('Niente Pasti: −3 Resistenza.', 'Fame');
    }
    syncUI();
  }
}

function toggleLinkTo(target, enabled){
  const root = EL('passage');
  $$(`a[href="#sect${target}"]`, root).forEach(a=>{
    a.classList.add('choiceLink');
    if (!enabled){
      a.classList.add('disabled');
      a.title = 'Requisiti non soddisfatti';
    } else {
      a.classList.remove('disabled');
      a.title = '';
    }
  });
}
function hasItemName(rx){
  return [...state.player.weapons, ...state.player.backpack, ...state.player.specials].some(x=> rx.test(x));
}

/* ===== Combat ===== */
function parseCRT(dom){
  try{
    const table = Array.from(dom.querySelectorAll('table')).find(t=>/combat results table/i.test(t.textContent));
    if (!table) throw new Error('CRT non trovata');
    const rows = Array.from(table.querySelectorAll('tr'));
    // header con ranges (colonne dalla seconda in poi)
    const headerCells = rows[1].querySelectorAll('th,td');
    const ranges = Array.from(headerCells).slice(1).map(th=>{
      const txt = textOnly(th).replace(/or lower|or higher/ig,'').replace('−','-');
      // formati tipo "-11/-10", "-9/-8", "0", "11+"
      if (/^\s*\d+\s*$/.test(txt)) return {min:+txt, max:+txt};
      if (/\+/.test(txt)) { const v = parseInt(txt,10); return {min:v, max:Infinity}; }
      const parts = txt.split('/').map(s=>parseInt(s.trim(),10));
      if (parts.length===2) return {min:parts[0], max:parts[1]};
      // fallback
      return {min:-Infinity, max:Infinity};
    });

    const dataRows = rows.slice(2);
    const crtRows = dataRows.map(tr=>{
      const cells = Array.from(tr.querySelectorAll('td'));
      return cells.map(td=>{
        const t = textOnly(td).toLowerCase();
        if (t.includes('k')){ // kill markers "k/k" etc
          const [e,lw] = t.split('/');
          return { eLoss:0, lwLoss:0, eKill:e.includes('k'), lwKill:lw?.includes('k') };
        }
        const [eLoss, lwLoss] = t.split('/').map(x=>parseInt(x,10));
        return { eLoss:isNaN(eLoss)?0:eLoss, lwLoss:isNaN(lwLoss)?0:lwLoss, eKill:false, lwKill:false };
      });
    });

    // alcune CRT Project Aon hanno 10 righe (0..9)
    state.crt = { ranges, rows: crtRows };
  }catch(_){
    fallbackCRT();
  }
}
function fallbackCRT(){
  // 10 righe (RN 0..9), 13 colonne di CR
  const ranges = [
    {min:-Infinity,max:-11},{min:-10,max:-9},{min:-8,max:-7},{min:-6,max:-5},{min:-4,max:-3},{min:-2,max:-1},
    {min:0,max:0},{min:1,max:2},{min:3,max:4},{min:5,max:6},{min:7,max:8},{min:9,max:10},{min:11,max:Infinity},
  ];
  const rows = [
    [{eLoss:0,lwLoss:0,lwKill:true},{eLoss:0,lwLoss:0,lwKill:true},{eLoss:0,lwLoss:8},{eLoss:0,lwLoss:6},{eLoss:1,lwLoss:6},{eLoss:2,lwLoss:5},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:5},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:4},{eLoss:7,lwLoss:4},{eLoss:8,lwLoss:3},{eLoss:9,lwLoss:3}],
    [{eLoss:0,lwLoss:0,lwKill:true},{eLoss:0,lwLoss:8},{eLoss:0,lwLoss:7},{eLoss:1,lwLoss:6},{eLoss:2,lwLoss:5},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:3},{eLoss:8,lwLoss:3},{eLoss:9,lwLoss:3},{eLoss:10,lwLoss:2}],
    [{eLoss:0,lwLoss:8},{eLoss:0,lwLoss:7},{eLoss:1,lwLoss:6},{eLoss:2,lwLoss:5},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:3},{eLoss:8,lwLoss:3},{eLoss:9,lwLoss:2},{eLoss:10,lwLoss:2},{eLoss:11,lwLoss:2}],
    [{eLoss:0,lwLoss:8},{eLoss:1,lwLoss:7},{eLoss:2,lwLoss:6},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:3},{eLoss:8,lwLoss:2},{eLoss:9,lwLoss:2},{eLoss:10,lwLoss:2},{eLoss:11,lwLoss:2},{eLoss:12,lwLoss:2}],
    [{eLoss:1,lwLoss:7},{eLoss:2,lwLoss:6},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:2},{eLoss:9,lwLoss:2},{eLoss:10,lwLoss:2},{eLoss:11,lwLoss:2},{eLoss:12,lwLoss:2},{eLoss:14,lwLoss:1}],
    [{eLoss:2,lwLoss:6},{eLoss:3,lwLoss:6},{eLoss:4,lwLoss:5},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:2},{eLoss:9,lwLoss:2},{eLoss:10,lwLoss:2},{eLoss:11,lwLoss:1},{eLoss:12,lwLoss:1},{eLoss:14,lwLoss:1},{eLoss:16,lwLoss:1}],
    [{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:5},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:2},{eLoss:9,lwLoss:1},{eLoss:10,lwLoss:1},{eLoss:11,lwLoss:1},{eLoss:12,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:16,lwLoss:0},{eLoss:18,lwLoss:0}],
    [{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:1},{eLoss:9,lwLoss:1},{eLoss:10,lwLoss:0},{eLoss:11,lwLoss:0},{eLoss:12,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:16,lwLoss:0},{eLoss:18,lwLoss:0},{eLoss:0,lwLoss:0,eKill:true}],
    [{eLoss:5,lwLoss:3},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:0},{eLoss:9,lwLoss:0},{eLoss:10,lwLoss:0},{eLoss:11,lwLoss:0},{eLoss:12,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:16,lwLoss:0},{eLoss:18,lwLoss:0},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true}],
    [{eLoss:6,lwLoss:0},{eLoss:7,lwLoss:0},{eLoss:8,lwLoss:0},{eLoss:9,lwLoss:0},{eLoss:10,lwLoss:0},{eLoss:11,lwLoss:0},{eLoss:12,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:16,lwLoss:0},{eLoss:18,lwLoss:0},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true}],
  ];
  state.crt = { ranges, rows };
}

function effectiveWeaponBonus(name){
  if (!name) return -4;
  let b = 0;
  if (state.player.disciplines.has('Scherma') && state.player.weaponskillWeapon &&
      new RegExp(`\\b${state.player.weaponskillWeapon}\\b`,'i').test(name)) b += 2;
  return b;
}
function playerCurrentCS(){
  let cs = state.player.combattivitaBase + effectiveWeaponBonus(state.player.equipped||"");
  if (EL('useMindblast')?.checked && state.player.disciplines.has('Psicolaser') && !state.current.enemyImmuneMB) cs += 2;
  if (state.current.psionicAttack && !state.player.disciplines.has('Psicoschermo')) cs -= 2;
  cs += (+EL('youMod').value || 0);
  return cs;
}
function enemyCurrentCS(base){
  return base + (+EL('foeMod').value || 0);
}
function computeCR(){
  if (!state.inCombat.foe) return 0;
  return playerCurrentCS() - enemyCurrentCS(state.inCombat.foe.cs);
}
function consultCRT(cr, rn){
  const ranges = state.crt?.ranges || [];
  const rows   = state.crt?.rows   || [];
  const col = ranges.findIndex(r=> cr>=r.min && cr<=r.max);
  const idx = (col===-1) ? (cr<0?0:ranges.length-1) : col;
  const row = rows[rn] || rows[rows.length-1] || [];
  return row[idx] || {eLoss:0,lwLoss:0,eKill:false,lwKill:false};
}

function renderAutoDetections(){
  const dc = EL('detectedCombat'), eList=EL('enemyList'), eCount=EL('enemyCount');
  if (state.enemies.length){
    dc.classList.remove('hidden');
    eCount.textContent = String(state.enemies.length);
    eList.innerHTML = state.enemies
      .map(e=>`<div class="enemyBox"><strong>${e.name}</strong> — Combattività <strong>${e.cs}</strong>, Resistenza <strong>${e.ep}</strong></div>`)
      .join('');
  } else {
    dc.classList.add('hidden');
    EL('combatPanel').classList.add('hidden');
  }
  const hints = EL('psionHints');
  const parts=[];
  if (state.current.enemyImmuneMB) parts.push('Nemico <strong>immune a Psicolaser</strong>.');
  if (state.current.psionicAttack) parts.push('Usa <strong>attacchi psichici</strong> (−2 se non hai Psicoschermo).');
  hints.style.display = parts.length ? 'flex' : 'none';
  hints.innerHTML = parts.map(p=>`<span class="tag">${p}</span>`).join(' ');
}

function prepareCombatPanel(){
  if (state.enemies.length===0) return;
  const foe = state.enemies[0]; // per ora 1 nemico
  state.inCombat = {active:false, foe:{...foe, epNow:foe.ep}, round:0};
  EL('combatPanel').classList.remove('hidden');

  // setup UI
  $('#mbWrap').classList.toggle('hidden', !state.player.disciplines.has('Psicolaser'));
  EL('useMindblast').checked = false;
  EL('evadeBtn').style.display = state.current.allowEvade ? '' : 'none';

  EL('startCombatBtn').disabled = false;
  EL('combatRoundBtn').disabled = true;
  EL('endCombatBtn').disabled = true;

  EL('crNow').textContent = '—';
  EL('lastRN').textContent = '–';
  EL('lastResult').textContent = '–';
  EL('combatLog').textContent = '';

  updateCombatUI();
}
function updateCombatUI(){
  const foe = state.inCombat.foe; if (!foe) return;
  const foeCS = enemyCurrentCS(foe.cs);
  EL('foeName').textContent = foe.name || 'Nemico';
  EL('foeCS').textContent = String(foeCS);
  EL('foeEP').textContent = String(foe.epNow);
  EL('foeEPmax').textContent = `/ ${foe.ep}`;

  const youCS = playerCurrentCS();
  EL('youCS').textContent = String(youCS);
  EL('youEP').textContent = String(state.player.resistenzaCorrente);
  EL('youEPmax').textContent = `/ ${state.player.resistenzaBase}`;
  EL('youNotes').textContent = state.player.equipped ? `Arma: ${state.player.equipped}` : 'Senza arma (−4)';

  const cr = youCS - foeCS;
  EL('crNow').textContent = cr>=0 ? `+${cr}` : String(cr);
}

function startCombat(){
  if (!state.inCombat.foe) return;
  state.inCombat.active = true;
  state.inCombat.round  = 0;
  EL('startCombatBtn').disabled = true;
  EL('combatRoundBtn').disabled = false;
  EL('endCombatBtn').disabled = false;

  updateCombatUI();
  immersion(`Inizia il combattimento contro ${state.inCombat.foe.name}!`, 'Combattimento');
  logLine(`— Combattimento iniziato: ${state.inCombat.foe.name} —`);
}
function endCombat(msg){
  EL('startCombatBtn').disabled = true;
  EL('combatRoundBtn').disabled = true;
  EL('endCombatBtn').disabled = true;
  state.inCombat.active = false;
  state.current.lastHadCombat = true;
  if (msg) immersion(msg, 'Combattimento');
  syncUI();
}
function resolveRound(evading=false){
  if (!state.inCombat.active) return;
  const rn = random0to9();
  EL('rngVal').textContent = String(rn);
  EL('lastRN').textContent = String(rn);

  const cr    = computeCR();
  const cell  = consultCRT(cr, rn);

  let yourLoss = cell.lwKill ? state.player.resistenzaCorrente : (cell.lwLoss || 0);
  let foeLoss  = cell.eKill  ? state.inCombat.foe.epNow       : (cell.eLoss  || 0);

  if (evading){ foeLoss = 0; }

  state.player.resistenzaCorrente = Math.max(0, state.player.resistenzaCorrente - yourLoss);
  state.inCombat.foe.epNow        = Math.max(0, state.inCombat.foe.epNow - foeLoss);
  updateCombatUI();

  const line = `${evading ? '[Fuga] ' : ''}Tu −${yourLoss}, Nemico −${foeLoss}`;
  EL('lastResult').textContent = line;
  logLine(`Round ${++state.inCombat.round}: ${line}`);

  // Pop-up descrittivo stile “Pokémon”
  const flavor = evading
    ? `Tentativo di fuga! Numero ${rn}. Te: −${yourLoss}, Nemico: −${foeLoss}.`
    : `Numero ${rn} con CR ${cr>=0?`+${cr}`:cr}. Infliggi ${foeLoss} e subisci ${yourLoss}.`;
  immersion(flavor, 'Esito del Round');

  if (state.player.resistenzaCorrente <= 0){
    logLine('✖ Sei caduto.');
    EL('deadend').classList.remove('hidden');
    endCombat('Sei stato sconfitto.');
    return;
  }
  if (state.inCombat.foe.epNow <= 0){
    logLine(`✔ ${state.inCombat.foe.name} sconfitto.`);
    endCombat(`${state.inCombat.foe.name} è stato sconfitto!`);
    return;
  }
  if (evading){
    logLine('Fuga riuscita.');
    endCombat('Sei riuscito a fuggire.');
  }
}
function logLine(s){ const el=EL('combatLog'); el.textContent += s+'\n'; el.scrollTop=el.scrollHeight; }

/* ===== Inventory & Stats UI ===== */
function syncUI(){
  EL('combattivitaBase').value = state.player.combattivitaBase;
  EL('resistenzaBase').value   = state.player.resistenzaBase;
  EL('resistenzaCorrente').value = state.player.resistenzaCorrente;
  EL('meals').value = state.player.meals;
  EL('gold').value  = state.player.gold;

  renderDisciplinesList();
  renderInventory();
  renderChoicesAssist(); // dopo aver iniettato il paragrafo
  EL('wsPanel').classList.toggle('hidden', !state.player.disciplines.has("Scherma"));
  EL('wsWeapon').textContent = state.player.weaponskillWeapon || '—';

  scheduleAutosave();
}
function renderDisciplinesList(){
  const root=EL('disciplinesList'); root.innerHTML='';
  const note=EL('discNote');
  if (state.flags.started){
    note.textContent='(bloccate: avventura in corso)';
    const sel = [...state.player.disciplines];
    root.innerHTML = sel.length
      ? sel.map(s=>`<div class="row small"><strong>${s}</strong> <span class="tag">— ${descDisc(s)}</span></div>`).join('')
      : '<div class="small tag">Nessuna arte selezionata.</div>';
  } else {
    note.textContent='seleziona 5 (usa il Wizard)';
    DISCIPLINES.forEach(name=>{
      root.insertAdjacentHTML('beforeend', `<label class="row small"><input type="checkbox" disabled> <strong>${name}</strong> <span class="tag">— ${descDisc(name)}</span></label>`);
    });
  }
}
function descDisc(d){
  const map={
    "Mimetismo":"Ti confondi con l’ambiente.",
    "Caccia":"Spesso non consumi Pasti imposti dal testo.",
    "Sesto Senso":"Intuisci pericoli e opzioni sicure.",
    "Orientamento":"Tracci e scegli la rotta migliore.",
    "Guarigione":"+1 Resistenza in paragrafi senza combattimento.",
    "Scherma":"+2 Combattività con arma sorteggiata.",
    "Psicoschermo":"Protezione contro attacchi psichici.",
    "Psicolaser":"+2 Combattività (se nemico non immune).",
    "Affinità Animale":"Interagisci con gli animali.",
    "Telecinesi":"Muovi piccoli oggetti con la mente."
  };
  return map[d] || '';
}
function renderInventory(){
  // Armi
  const wRoot = EL('weaponsList');
  wRoot.innerHTML = state.player.weapons.length
    ? state.player.weapons.map((w,i)=>`<div class="row small"><span>${w}</span><button class="btn soft" data-delw="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Nessuna arma.</div>';
  wRoot.querySelectorAll('button[data-delw]').forEach(b=>{
    b.onclick=()=>{
      const idx=+b.dataset.delw;
      const removed = state.player.weapons.splice(idx,1)[0];
      if (state.player.equipped===removed) state.player.equipped = state.player.weapons[0]||"";
      syncUI();
    };
  });
  const eq=EL('equippedWeapon');
  eq.innerHTML = `<option value="">(nessuna)</option>` + state.player.weapons.map(w=>`<option value="${w}">${w}</option>`).join('');
  eq.value = state.player.equipped;

  // Zaino
  const bRoot = EL('backpackList');
  bRoot.innerHTML = state.player.backpack.length
    ? state.player.backpack.map((it,i)=>`<div class="row small"><span>${it}</span><button class="btn soft" data-deli="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Zaino vuoto.</div>';
  bRoot.querySelectorAll('button[data-deli]').forEach(b=>{
    b.onclick=()=>{ state.player.backpack.splice(+b.dataset.deli,1); syncUI(); };
  });

  // Speciali
  const sRoot = EL('specialsList');
  sRoot.innerHTML = state.player.specials.length
    ? state.player.specials.map((it,i)=>`<div class="row small"><span>${it}</span><button class="btn soft" data-dels="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Nessuno.</div>';
  sRoot.querySelectorAll('button[data-dels]').forEach(b=>{
    b.onclick=()=>{ state.player.specials.splice(+b.dataset.dels,1); syncUI(); };
  });

  // Bonus Resistenza (Elmo/Cotta)
  const helm = state.player.specials.some(x=>/^elmo$/i.test(x)) ? 2 : 0;
  const mail = state.player.specials.some(x=>/cotta di maglia/i.test(x)) ? 4 : 0;
  const bonus = helm + mail;
  if (state._lastSpecBonus===undefined) state._lastSpecBonus=0;
  const baseWithoutBonus = state.player.resistenzaBase - state._lastSpecBonus;
  state._lastSpecBonus = bonus;
  state.player.resistenzaBase = Math.max(1, baseWithoutBonus + bonus);
  if (state.player.resistenzaCorrente > state.player.resistenzaBase)
    state.player.resistenzaCorrente = state.player.resistenzaBase;

  // Capienza zaino
  const maxMeals = Math.max(0, 8 - state.player.backpack.length);
  if (state.player.meals > maxMeals) state.player.meals = maxMeals;
  EL('meals').value = state.player.meals;
  EL('meals').max   = String(maxMeals);
  EL('capInfo').textContent = `capienza: ${state.player.backpack.length + state.player.meals}/8`;
}

/* ===== Save/Load ===== */
function buildSaveObj(){
  return {
    player:{
      ...state.player,
      disciplines:[...state.player.disciplines]
    },
    section:state.current.section,
    flags:state.flags,
    history:state.navHistory,
    once:[...state.sectionOnce]
  };
}
function applySaveObj(obj){
  state.player = obj.player;
  state.player.disciplines = new Set(obj.player.disciplines || []);
  state.flags = obj.flags;
  state.navHistory = obj.history || [];
  state.sectionOnce = new Set(obj.once || []);
  if (obj.section) navGoTo(obj.section,false);
  syncUI();
}
function hasAutosave(){ try{ return !!localStorage.getItem(AUTOSAVE_KEY); } catch{ return false; } }
function scheduleAutosave(){
  if (!state.flags.autosave) return;
  try{
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildSaveObj()));
    EL('btnResume').disabled = false;
  }catch(_){}
}
function restoreAutosave(){
  try{
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    applySaveObj(obj);
    immersion('Salvataggio automatico ripristinato.','Riprendi');
    return true;
  }catch(_){ return false; }
}

/* ===== Wizard ===== */
const wizard = { step:0, total:4, temp:{} };

function openWizardModal(){
  wizard.step=0;
  wizard.temp = {
    manual:false,
    combattivitaBase:10,
    resistenzaBase:20,
    gold:0,
    disciplines:new Set(),
    weapons:["Ascia"],
    specials:["Mappa"],
    meals:1,
    weaponskillWeapon:null,
    bonusItem:null,
    rolls:{ cs:0, ep:0, gold:0, bonus:0, ws:0 }
  };
  EL('wizard').classList.remove('hidden');
  renderWizard();
}
function closeWizard(){ EL('wizard').classList.add('hidden'); }

function renderWizard(){
  EL('wizStepTag').textContent = `Passo ${wizard.step+1} di ${wizard.total}`;
  EL('wizDots').innerHTML = Array(wizard.total).fill(0).map((_,i)=>`<div class="step-dot ${i===wizard.step?'active':''}"></div>`).join('');
  const body = EL('wizBody'); body.innerHTML='';

  if (wizard.step===0){
    body.innerHTML = `
      <div class="box">
        <h3>Benvenuto, Ramas</h3>
        <p>Crea il tuo personaggio in 4 passi: <strong>Statistiche</strong>, <strong>Arti</strong>, <strong>Equipaggiamento</strong>, <strong>Riepilogo</strong>.</p>
        <label class="row small"><input type="checkbox" id="wizManual"> Tiri manuali (inserirai tu un numero 0–9)</label>
      </div>`;
    EL('wizManual').checked = wizard.temp.manual;
    EL('wizManual').onchange = e => wizard.temp.manual = e.target.checked;
  }

  if (wizard.step===1){
    body.innerHTML = `
      <div class="two">
        <div class="box">
          <h3>Combattività</h3>
          <div class="row">
            <button class="btn" id="wizRollCS">Estrai</button>
            <input id="wizCS" type="number" readonly style="width:100px" value="${wizard.temp.combattivitaBase}"/>
            <span class="tag">= 10 + Numero</span>
            <span class="tag" id="tryCS"></span>
          </div>
        </div>
        <div class="box">
          <h3>Resistenza</h3>
          <div class="row">
            <button class="btn" id="wizRollEP">Estrai</button>
            <input id="wizEP" type="number" readonly style="width:100px" value="${wizard.temp.resistenzaBase}"/>
            <span class="tag">= 20 + Numero</span>
            <span class="tag" id="tryEP"></span>
          </div>
        </div>
      </div>
      <div class="box">
        <h3>Corone d’Oro</h3>
        <div class="row">
          <button class="btn" id="wizRollGold">Estrai</button>
          <input id="wizGold" type="number" readonly style="width:100px" value="${wizard.temp.gold}"/>
          <span class="tag">0–9</span>
          <span class="tag" id="tryGold"></span>
        </div>
      </div>
      <div class="small tag">Con tiri automatici hai <strong>max 2 tentativi</strong> per ogni estrazione.</div>
    `;
    const upd = ()=>{
      EL('tryCS').textContent   = `tentativi: ${wizard.temp.rolls.cs}/2`;
      EL('tryEP').textContent   = `tentativi: ${wizard.temp.rolls.ep}/2`;
      EL('tryGold').textContent = `tentativi: ${wizard.temp.rolls.gold}/2`;
    };
    upd();
    EL('wizRollCS').onclick = ()=>{
      if (!wizard.temp.manual && wizard.temp.rolls.cs>=2) return;
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if (!wizard.temp.manual) wizard.temp.rolls.cs++;
      wizard.temp.combattivitaBase = 10 + r; EL('wizCS').value = wizard.temp.combattivitaBase; upd();
      immersion(`Numero ${r}. Combattività = 10 + ${r} = ${10+r}.`, 'Tiro');
    };
    EL('wizRollEP').onclick = ()=>{
      if (!wizard.temp.manual && wizard.temp.rolls.ep>=2) return;
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if (!wizard.temp.manual) wizard.temp.rolls.ep++;
      wizard.temp.resistenzaBase = 20 + r; EL('wizEP').value = wizard.temp.resistenzaBase; upd();
      immersion(`Numero ${r}. Resistenza = 20 + ${r} = ${20+r}.`, 'Tiro');
    };
    EL('wizRollGold').onclick = ()=>{
      if (!wizard.temp.manual && wizard.temp.rolls.gold>=2) return;
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if (!wizard.temp.manual) wizard.temp.rolls.gold++;
      wizard.temp.gold = r; EL('wizGold').value = r; upd();
      immersion(`Numero ${r}. Parti con ${r} Corone d’Oro.`, 'Tiro');
    };
  }

  if (wizard.step===2){
    body.innerHTML = `
      <div class="box">
        <h3>Scegli 5 Arti Ramas</h3>
        <div class="row"><button id="wizRandom5Btn" class="btn soft">Scegli 5 casuali</button></div>
        <div id="wizDiscList" class="list" style="margin-top: 8px;"></div>
      </div>`;
    const list = EL('wizDiscList');
    DISCIPLINES.forEach(name=>{
      const id = `wd_${name.replace(/\s+/g,'_')}`;
      list.insertAdjacentHTML('beforeend', `<label class="row small"><input type="checkbox" id="${id}"> <strong>${name}</strong> <span class="tag">— ${descDisc(name)}</span></label>`);
      const cb = EL(id);
      cb.checked = wizard.temp.disciplines.has(name);
      cb.onchange = e=>{
        if (e.target.checked){
          if (wizard.temp.disciplines.size>=5){ e.target.checked=false; immersion('Massimo 5 Arti.','Wizard'); return; }
          wizard.temp.disciplines.add(name);
        } else wizard.temp.disciplines.delete(name);
      };
    });
    EL('wizRandom5Btn').onclick = ()=>{
      wizard.temp.disciplines.clear();
      const shuffled = [...DISCIPLINES].sort(()=>0.5-Math.random());
      shuffled.slice(0,5).forEach(d=>wizard.temp.disciplines.add(d));
      renderWizard();
    };
  }

  if (wizard.step===3){
    body.innerHTML = `
      <div class="box">
        <h3>Equipaggiamento iniziale</h3>
        <p class="small tag">
          Parti con: <strong>Ascia</strong>, <strong>1 Pasto</strong>, <strong>Mappa</strong>.
          Tira per un <em>oggetto bonus</em> (max 2 tentativi se automatico).
        </p>
        <div class="row"><button id="wizBonusRoll" class="btn">Tira bonus</button><span id="bonusItem" class="pill">—</span><span class="tag" id="tryBonus"></span></div>
        <div class="divider"></div>
        <h3>Riepilogo</h3>
        <div id="wizSummary" class="tag"></div>
      </div>
    `;
    const updSummary = ()=>{
      const arts = [...wizard.temp.disciplines].join(', ') || '—';
      EL('wizSummary').innerHTML = `
        <div><strong>CS</strong>: ${wizard.temp.combattivitaBase} | <strong>EP</strong>: ${wizard.temp.resistenzaBase} | <strong>Gold</strong>: ${wizard.temp.gold}</div>
        <div><strong>Arti</strong>: ${arts}</div>
        <div><strong>Armi</strong>: ${wizard.temp.weapons.join(', ')}</div>
        <div><strong>Zaino</strong>: ${wizard.temp.meals} Pasto/i</div>
        <div><strong>Speciali</strong>: ${wizard.temp.specials.join(', ')}</div>
        <div><strong>Bonus</strong>: ${wizard.temp.bonusItem||'—'}</div>`;
    };
    const updTries = ()=> EL('tryBonus').textContent = `tentativi: ${wizard.temp.rolls.bonus}/2`;
    updSummary(); updTries();
    EL('wizBonusRoll').onclick = ()=>{
      if (!wizard.temp.manual && wizard.temp.rolls.bonus>=2) return;
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if (!wizard.temp.manual) wizard.temp.rolls.bonus++;
      const map = {0:"Spadone",1:"Spada",2:"Elmo",3:"Due Pasti",4:"Cotta di Maglia",5:"Mazza",6:"Pozione Magica",7:"Asta",8:"Lancia",9:"12 Corone d'Oro"};
      const got = map[r];
      wizard.temp.bonusItem = got;
      EL('bonusItem').textContent = got;
      immersion(`Oggetto bonus: ${got}`, 'Fato');
      updTries(); updSummary();
    };
  }

  EL('wizPrev').disabled = wizard.step===0;
  EL('wizNext').classList.toggle('hidden', wizard.step===wizard.total-1);
  EL('wizFinish').classList.toggle('hidden', wizard.step!==wizard.total-1);
}

function applyWizard(){
  // Applica
  state.player.combattivitaBase   = wizard.temp.combattivitaBase;
  state.player.resistenzaBase     = wizard.temp.resistenzaBase;
  state.player.resistenzaCorrente = wizard.temp.resistenzaBase;
  state.player.gold = wizard.temp.gold;

  state.player.disciplines = new Set(wizard.temp.disciplines);
  state.player.weapons     = ["Ascia"];
  state.player.equipped    = "Ascia";
  state.player.backpack    = [];
  state.player.specials    = ["Mappa"];
  state.player.meals       = 1;

  if (state.player.disciplines.has('Scherma')){
    state.player.weaponskillWeapon = WEAPON_LIST[random0to9()];
  } else {
    state.player.weaponskillWeapon = null;
  }

  const bonus = wizard.temp.bonusItem;
  if (bonus){
    if (["Spadone","Spada","Mazza","Asta","Lancia"].includes(bonus) && state.player.weapons.length<2)
      state.player.weapons.push(bonus);
    if (bonus==="Due Pasti") state.player.meals += 2;
    if (bonus==="Pozione Magica") state.player.backpack.push("Pozione Magica");
    if (bonus==="Elmo") state.player.specials.push("Elmo");
    if (bonus==="Cotta di Maglia") state.player.specials.push("Cotta di Maglia");
    if (bonus==="12 Corone d'Oro") state.player.gold = Math.min(50, state.player.gold + 12);
  }

  state.flags.started = true;
  closeWizard();
  syncUI();

  // riepilogo popup
  const arts = [...state.player.disciplines].join(', ') || '—';
  immersion(`CS ${state.player.combattivitaBase}, EP ${state.player.resistenzaBase}, Gold ${state.player.gold}. Arti: ${arts}.`, 'Personaggio creato');
}

/* ===== Quick Start ===== */
function quickStart(){
  state.player = {
    combattivitaBase: 10 + random0to9(),
    resistenzaBase:   20 + random0to9(),
    resistenzaCorrente: 0, // set dopo
    disciplines: new Set(),
    weapons: ["Ascia"],
    equipped: "Ascia",
    backpack: [],
    specials: ["Mappa"],
    meals: 1,
    gold: random0to9(),
    weaponskillWeapon: null
  };
  state.player.resistenzaCorrente = state.player.resistenzaBase;

  const shuffled = [...DISCIPLINES].sort(()=>0.5-Math.random());
  shuffled.slice(0,5).forEach(d=>state.player.disciplines.add(d));

  if (state.player.disciplines.has('Scherma')) {
    state.player.weaponskillWeapon = WEAPON_LIST[random0to9()];
  }

  // bonus casuale
  const r = random0to9();
  const map = {0:"Spadone",1:"Spada",2:"Elmo",3:"Due Pasti",4:"Cotta di Maglia",5:"Mazza",6:"Pozione Magica",7:"Asta",8:"Lancia",9:"12 Corone d'Oro"};
  const got = map[r];
  if (["Spadone","Spada","Mazza","Asta","Lancia"].includes(got) && state.player.weapons.length<2)
    state.player.weapons.push(got);
  if (got==="Due Pasti") state.player.meals += 2;
  if (got==="Pozione Magica") state.player.backpack.push("Pozione Magica");
  if (got==="Elmo") state.player.specials.push("Elmo");
  if (got==="Cotta di Maglia") state.player.specials.push("Cotta di Maglia");
  if (got==="12 Corone d'Oro") state.player.gold = Math.min(50, state.player.gold + 12);

  state.flags.started = true;
  syncUI();

  immersion(`Avvio rapido! Bonus: ${got}.`, 'Personaggio rapido');
}

/* ===== DeepL current paragraph ===== */
function openDeepLForCurrent(){
  if (!state.bookDoc || !state.current.section) return;
  const a = state.index.get(state.current.section);
  const content = sectionContentFromAnchor(a);
  const text = textOnly(content).slice(0, 1500); // evitare URL troppo lungo
  const url = `https://www.deepl.com/translator#en/it/${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

/* ===== Events ===== */
function initEventListeners(){
  // Theme
  EL('themeToggle').addEventListener('change', e=>{
    const mode = e.target.checked ? 'light' : '';
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem(THEME_PREF, mode);
  });

  // Book import
  EL('fileInput').addEventListener('change', async e=>{
    const f = e.target.files?.[0]; if (!f) return;
    const txt = await f.text();
    importBook(txt);
  });

  // Nav
  EL('passage').addEventListener('click', ev=>{
    const a = ev.target.closest('a'); if (!a) return;
    const href = a.getAttribute('href')||'';
    const m = href.match(/#sect(\d+)/i);
    if (!m) return;
    const target = +m[1];
    if (state.flags.enforceCond && state.allowedTargets.has(target) && !state.allowedTargets.get(target)){
      ev.preventDefault();
      immersion('Scelta bloccata: requisiti non soddisfatti.', 'Scelta');
      return;
    }
    ev.preventDefault();
    navGoTo(target);
  });

  EL('navBack').addEventListener('click', ()=>{
    if (state.navHistory.length===0) return;
    const prev = state.navHistory.pop();
    if (prev!=null){ state.navFuture.unshift(state.current.section); navGoTo(prev, false); }
  });
  EL('navForward').addEventListener('click', ()=>{
    if (state.navFuture.length===0) return;
    const next = state.navFuture.shift();
    if (next!=null){ state.navHistory.push(state.current.section); navGoTo(next, false); }
  });
  EL('jumpGo').addEventListener('click', ()=>{
    const n = +EL('jumpInput').value;
    if (Number.isInteger(n)) navGoTo(n);
  });

  // Buttons topbar
  EL('openWizardBtn').addEventListener('click', openWizardModal);
  EL('quickStartBtn').addEventListener('click', ()=>{ quickStart(); summaryPopup(); });
  EL('newGameBtn').addEventListener('click', ()=>{
    if (confirm('Nuova partita? Perderai i progressi non salvati.')){
      localStorage.removeItem(AUTOSAVE_KEY);
      location.reload();
    }
  });
  EL('exportSaveBtn').addEventListener('click', ()=>{
    EL('saveCode').value = btoa(unescape(encodeURIComponent(JSON.stringify(buildSaveObj()))));
    immersion('Codice di salvataggio generato.','Salvataggio');
  });
  EL('importSaveBtn').addEventListener('click', ()=>{
    const raw = prompt('Incolla il codice di salvataggio:','');
    if (!raw) return;
    try{
      const obj = JSON.parse(decodeURIComponent(escape(atob(raw))));
      applySaveObj(obj);
      immersion('Salvataggio caricato.','Import');
    }catch(_){ alert('Codice non valido.'); }
  });
  EL('btnResume').addEventListener('click', ()=>{
    if (!restoreAutosave()) immersion('Nessun salvataggio trovato.','Riprendi');
  });
  EL('toggleAutosave').addEventListener('change', e=>{
    state.flags.autosave = e.target.checked;
    try{ localStorage.setItem(AUTOSAVE_PREF, e.target.checked ? '1':'0'); }catch(_){}
  });
  EL('btnDeepL').addEventListener('click', openDeepLForCurrent);

  // Combat
  EL('prepareCombatBtn').addEventListener('click', prepareCombatPanel);
  EL('startCombatBtn').addEventListener('click', startCombat);
  EL('combatRoundBtn').addEventListener('click', ()=>resolveRound(false));
  EL('evadeBtn').addEventListener('click', ()=>resolveRound(true));
  EL('endCombatBtn').addEventListener('click', ()=>endCombat('Combattimento terminato.'));
  ['useMindblast','youMod','foeMod'].forEach(id=> EL(id).addEventListener('input', updateCombatUI));

  // Enforce choices
  EL('enforceCond').addEventListener('change', e=>{
    state.flags.enforceCond = e.target.checked;
    renderChoicesAssist();
  });

  // Dice modal
  EL('btnDice').addEventListener('click', ()=>EL('diceModal').classList.remove('hidden'));
  EL('diceClose').addEventListener('click', ()=>EL('diceModal').classList.add('hidden'));
  EL('diceRoll').addEventListener('click', ()=>{
    const v = random0to9(); EL('diceFace').textContent = String(v); EL('rngVal').textContent = String(v);
    immersion(`Numero Casuale: ${v}`,'Dado');
  });

  // Utility
  EL('rng0to9Btn').addEventListener('click', ()=>{
    const v = random0to9(); EL('rngVal').textContent = String(v);
  });

  // Inventory changes
  EL('addWeaponBtn').addEventListener('click', ()=>{
    const v = (EL('weaponInput').value||'').trim(); if (!v) return;
    if (state.player.weapons.includes(v)) return;
    if (state.player.weapons.length>=2){ immersion('Max 2 armi.','Inventario'); return; }
    state.player.weapons.push(v);
    if (!state.player.equipped) state.player.equipped = v;
    EL('weaponInput').value=''; syncUI();
  });
  EL('equippedWeapon').addEventListener('change', e=>{ state.player.equipped = e.target.value; syncUI(); });

  EL('addBackpackBtn').addEventListener('click', ()=>{
    const v=(EL('backpackInput').value||'').trim(); if (!v) return;
    const cap = state.player.backpack.length + state.player.meals;
    if (cap>=8){ immersion('Zaino pieno (max 8 fra oggetti + pasti)','Inventario'); return; }
    state.player.backpack.push(v); EL('backpackInput').value=''; syncUI();
  });
  EL('addSpecialBtn').addEventListener('click', ()=>{
    const v=(EL('specialInput').value||'').trim(); if (!v) return;
    state.player.specials.push(v); EL('specialInput').value=''; syncUI();
  });

  EL('eatMealBtn').addEventListener('click', ()=>{
    if (state.player.meals>0){
      state.player.meals--;
      state.player.resistenzaCorrente = Math.min(state.player.resistenzaBase, state.player.resistenzaCorrente+4);
      syncUI();
    } else immersion('Nessun Pasto disponibile.','Inventario');
  });
  EL('goldPlus1Btn').addEventListener('click', ()=>{
    EL('gold').value = clamp((+EL('gold').value||0)+1,0,50);
    EL('gold').dispatchEvent(new Event('input'));
  });
  EL('goldMinus1Btn').addEventListener('click', ()=>{
    EL('gold').value = clamp((+EL('gold').value||0)-1,0,50);
    EL('gold').dispatchEvent(new Event('input'));
  });

  ['combattivitaBase','resistenzaBase','resistenzaCorrente','meals','gold'].forEach(id=>{
    EL(id).addEventListener('input', ()=>{
      const v = +EL(id).value;
      if (id==='combattivitaBase') state.player.combattivitaBase=v;
      if (id==='resistenzaBase') { state.player.resistenzaBase=v; if (state.player.resistenzaCorrente>v) state.player.resistenzaCorrente=v; }
      if (id==='resistenzaCorrente') state.player.resistenzaCorrente=v;
      if (id==='meals') state.player.meals = v;
      if (id==='gold') state.player.gold = clamp(v,0,50);
      scheduleAutosave();
    });
  });

  // Wizard buttons
  EL('wizSkip').addEventListener('click', closeWizard);
  EL('wizPrev').addEventListener('click', ()=>{ wizard.step=Math.max(0,wizard.step-1); renderWizard(); });
  EL('wizNext').addEventListener('click', ()=>{
    if (wizard.step===2 && wizard.temp.disciplines.size!==5){
      immersion('Devi scegliere esattamente 5 Arti Ramas.','Wizard');
      return;
    }
    wizard.step = Math.min(wizard.total-1, wizard.step+1);
    renderWizard();
  });
  EL('wizFinish').addEventListener('click', applyWizard);

  // Export/Import quick
  EL('btnExport').addEventListener('click', ()=>EL('exportSaveBtn').click());
  EL('btnImport').addEventListener('click', ()=>EL('importSaveBtn').click());
  EL('btnReset').addEventListener('click', ()=>{
    if (confirm('Reset totale?')){ localStorage.removeItem(AUTOSAVE_KEY); location.reload(); }
  });
}

function summaryPopup(){
  const arts = [...state.player.disciplines].join(', ') || '—';
  immersion(`CS ${state.player.combattivitaBase}, EP ${state.player.resistenzaBase}, Gold ${state.player.gold}. Arti: ${arts}.`, 'Profilo');
}

/* ===== Init ===== */
(async function init(){
  initEventListeners();
  try{
    const pref = localStorage.getItem(AUTOSAVE_PREF);
    if (pref!==null){ state.flags.autosave = (pref==='1'); EL('toggleAutosave').checked = state.flags.autosave; }
    EL('btnResume').disabled = !hasAutosave();
  }catch(_){}
  EL('enforceCond').checked = state.flags.enforceCond;

  await tryAutoLoad();
  syncUI();
  updateNavButtons();
})();