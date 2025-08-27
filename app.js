/* =========================================================
   Lupo Solitario – app.js
   Motore di gioco: caricamento libro, wizard, scelte, combattimento,
   salvataggi, traduzione DeepL, tema, inventario.
   ========================================================= */
"use strict";

/* ---------- Helpers generali ---------- */
const EL = id => document.getElementById(id);
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const clamp  = (n,a,b)=>Math.max(a,Math.min(b,n));
const textOnly = (n)=> (n.textContent||"").replace(/\s+/g,' ').trim();
const escRx = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/* ---------- Costanti ---------- */
const AUTOSAVE_KEY  = "lw_book1_autosave_v9";
const AUTOSAVE_PREF = "lw_book1_autosave_enabled";
const THEME_PREF    = "lw_theme_pref";
const MAX_DEEPL_FRAGMENT = 1200;

const WEAPON_LIST = ["Pugnale","Lancia","Mazza","Daga","Martello da Guerra","Spada","Ascia","Asta","Spadone","Arco"];
const DISCIPLINES = ["Mimetismo","Caccia","Sesto Senso","Orientamento","Guarigione","Scherma","Psicoschermo","Psicolaser","Affinità Animale","Telecinesi"];
const DISC_DESC = {
  "Mimetismo":"Ti confondi con l’ambiente per evitare pericoli.",
  "Caccia":"Nei territori selvaggi spesso non consumi Pasti quando richiesto.",
  "Sesto Senso":"Intuisci pericoli e scelte più sicure.",
  "Orientamento":"Segui tracce e scegli la rotta migliore.",
  "Guarigione":"All’inizio di paragrafi senza combattimento: +1 Resistenza.",
  "Scherma":"+2 Combattività con l’arma sorteggiata.",
  "Psicoschermo":"Protegge da attacchi psichici (evita −2 Combattività).",
  "Psicolaser":"+2 Combattività contro nemici non immuni.",
  "Affinità Animale":"Comprendi e influenzi gli animali.",
  "Telecinesi":"Muovi piccoli oggetti con la mente."
};

/* ---------- Stato globale ---------- */
const state = {
  bookDoc   : null,
  index     : new Map(),       // numero § -> anchor node
  current   : {
    section: null,
    lastHadCombat: false,
    allowEvade: false,
    psionicAttack: false,
    enemyImmuneMB: false
  },
  enemies   : [],
  inCombat  : { active:false, foe:null, round:0 },
  navHistory: [],
  navFuture : [],
  allowedTargets: new Map(),

  player: {
    combattivitaBase   : 10,
    resistenzaBase     : 20,
    resistenzaCorrente : 20,
    disciplines        : new Set(),
    weapons            : [],
    equipped           : "",
    backpack           : [],
    specials           : [],
    meals              : 1,
    gold               : 0,
    weaponskillWeapon  : null
  },

  flags: {
    version: 9,
    started: false,
    autosave: true,
    enforceCond: true,
    rngManual: false,
    rngManualVal: 0
  },

  crt: null // Combat Results Table
};

/* =========================================================
   TEMA
   ========================================================= */
function initTheme(){
  const saved = localStorage.getItem(THEME_PREF);
  if(saved){ document.documentElement.setAttribute("data-theme", saved); }
  const isLight = (document.documentElement.getAttribute("data-theme")==="light");
  if(EL("themeToggle")) EL("themeToggle").checked = isLight;
}

/* =========================================================
   RNG
   ========================================================= */
function random0to9(){
  if(state.flags.rngManual) return clamp(+EL("rngManualVal").value||0,0,9);
  const b = new Uint8Array(1);
  crypto.getRandomValues(b);
  return b[0] % 10;
}

/* =========================================================
   IMMERSION (popup)
   ========================================================= */
function immersion(text, title='Ordine Ramas'){
  const wrap = EL('immersive');
  if(!wrap) return;
  EL('immTitle').textContent = `✦ ${title}`;
  EL('immTxt').textContent   = text;
  requestAnimationFrame(()=>{
    wrap.classList.add('show');
    setTimeout(()=> wrap.classList.remove('show'), 2100);
  });
}

/* =========================================================
   LIBRO: caricamento, parsing, navigazione
   ========================================================= */
async function tryAutoLoad(){
  // Prova a caricare 01fftd.htm dalla root del repo (GitHub Pages serve stesso path)
  try{
    const res = await fetch('01fftd.htm', { cache: 'force-cache' });
    if(res.ok){
      const html = await res.text();
      importBook(html);
      return true;
    }
  }catch(e){
    console.warn('AutoLoad fallito:', e);
  }
  EL('importHelp')?.classList.remove('hidden');
  EL('bookStatus').textContent = 'Nessun libro caricato';
  return false;
}

function importBook(html){
  const dom = new DOMParser().parseFromString(html,'text/html');
  state.bookDoc = dom;
  state.index.clear();

  // Project Aon: anchor id/name "sect1", "sect2", ...
  $$('a[id^="sect"], a[name^="sect"]', dom).forEach(a=>{
    const id=(a.id||a.name||'')+'';
    const n=+id.replace(/[^\d]/g,'');
    if(Number.isInteger(n) && n>0) state.index.set(n, a);
  });

  parseCRT(dom);

  const count=state.index.size;
  EL('bookStatus').textContent = count ? `Libro caricato (${count} paragrafi)` : 'Libro caricato';
  EL('importHelp')?.classList.add('hidden');

  const first = state.index.has(1) ? 1 : (count ? [...state.index.keys()][0] : null);
  if(first) navGoTo(first, false);
}

function sectionContentFromAnchor(a){
  // Trova il blocco a partire dal titolo che contiene l’anchor fino al prossimo §
  let start = a.closest('h1,h2,h3,h4') || a.parentElement;
  const wrap = document.createElement('div');
  let node = start;
  while(node){
    // Stop se incontriamo un heading con un altro anchor §
    if(node !== start && node.matches?.('h1,h2,h3,h4') && node.querySelector?.('a[id^="sect"],a[name^="sect"]')) break;
    wrap.appendChild(node.cloneNode(true));
    node = node.nextElementSibling;
  }
  return wrap;
}

function navGoTo(n, push=true){
  const a = state.index.get(n);
  if(!a){ immersion(`Paragrafo §${n} non trovato.`,'Errore'); return; }

  if(push && state.current.section) state.navHistory.push(state.current.section);
  if(push) state.navFuture.length = 0;

  state.current.section = n;
  EL('secNo').textContent = String(n);

  const content = sectionContentFromAnchor(a);
  const pass = EL('passage'); pass.innerHTML = ''; pass.appendChild(content);

  EL('autoDetections')?.classList.remove('hidden');
  EL('deadend')?.classList.toggle('hidden', !$('.deadend', content));

  // Guarigione: +1 EP all’inizio dei paragrafi senza combattimento, se non appena usciti da combat
  if(!state.inCombat.active && !state.current.lastHadCombat && state.player.disciplines.has('Guarigione') && state.player.resistenzaCorrente < state.player.resistenzaBase){
    state.player.resistenzaCorrente = Math.min(state.player.resistenzaBase, state.player.resistenzaCorrente + 1);
    immersion('+1 Resistenza (Guarigione)','Recupero');
  }
  state.current.lastHadCombat = false;

  analyzeSection(content.cloneNode(true));
  renderChoicesAssist();

  updateNavButtons();
  syncUI();
  scheduleAutosave();
}

function updateNavButtons(){
  EL('navBack').disabled    = state.navHistory.length===0;
  EL('navForward').disabled = state.navFuture.length===0;
}

function analyzeSection(root){
  // Reset rilevazioni
  state.enemies.length = 0;
  state.current.allowEvade     = false;
  state.current.psionicAttack  = false;
  state.current.enemyImmuneMB  = false;

  const txt = textOnly(root);

  // Rileva possibilità di fuga / evasione
  if(/\b(evadi|puoi fuggire|sottrarti al combattimento)\b/i.test(txt) ||
     /\b(you may evade|you can escape|evade the combat|run away)\b/i.test(txt)){
    state.current.allowEvade = true;
  }

  // Psionica
  if(/immune a (?:psicolaser|psionica)|immune to mindblast/i.test(txt)){
    state.current.enemyImmuneMB = true;
  }
  if(/attacchi psichici|psicologici|mind attack|uses mindblast|psychic attack/i.test(txt) ||
     /a meno che tu non abbia lo psicoschermo|unless you possess the mindshield/i.test(txt)){
    state.current.psionicAttack = true;
  }

  // Rilevazione nemici (tollerante a IT/EN)
  // Es: "Giak: COMBAT SKILL 15 ENDURANCE 20" oppure "CS 16, END 20"
  const paras = $$('p,li,div', root);
  for(const p of paras){
    const t = textOnly(p);
    // Nome (opzionale) + CS + END
    const m = t.match(/([A-Za-zÀ-ÖØ-öø-ÿ'’\-\s]+?)?\s*(?:—|-|:)?\s*(?:COMBAT(?:\s+SKILL)?|CS)\s*(\d{1,2})\s*(?:,?\s*(?:ENDURANCE|END|EP|ENDURANCE\s+POINTS))\s*(\d{1,2})/i);
    if(m){
      const name = (m[1]||'Nemico').trim().replace(/\s+/g,' ');
      const cs   = +m[2];
      const ep   = +m[3];
      state.enemies.push({ name, cs, ep });
    }
  }

  renderAutoDetections();
}

/* =========================================================
   SCELTE: assistente e vincoli
   ========================================================= */
function parseChoiceConditions(text){
  const conds=[];
  // Disciplines (IT/EN qualche esempio comune)
  if(/sesto senso|sixth sense/i.test(text)) conds.push({type:'discipline',name:'Sesto Senso'});
  if(/telecinesi|mind over matter/i.test(text)) conds.push({type:'discipline',name:'Telecinesi'});
  if(/psicolaser|mindblast/i.test(text)) conds.push({type:'discipline',name:'Psicolaser'});
  if(/psicoschermo|mindshield/i.test(text)) conds.push({type:'discipline',name:'Psicoschermo'});
  if(/caccia|hunting/i.test(text)) conds.push({type:'discipline',name:'Caccia'});

  // Items (esempi)
  if(/gemma vordak|vordak gem/i.test(text)) conds.push({type:'item',name:'Gemma Vordak'});
  if(/chiave d.?oro|golden key/i.test(text)) conds.push({type:'item',name:"Chiave d'Oro"});

  // Gold requirement
  const g = text.match(/(?:\b|≥|almeno)\s*(\d+)\s*(?:corone d'?oro|gold crowns?)\b.*?(?:paga|pay|pagare|pagato)?/i);
  if(g) conds.push({type:'goldAtLeast',amount:+g[1],consume:/paga|pay|pagare|pagato/i.test(text)});

  // Meals requirement
  const m = text.match(/(?:mangia|mangi|eat)\s+(?:un|one)?\s*(?:pasto|meal)s?/i);
  if(m) conds.push({type:'mealAtLeast',amount:1,consume:true});

  return conds;
}

function meetsCondition(c){
  const haveItem = (name)=>{
    const rx=new RegExp(escRx(name),'i');
    return [...state.player.weapons, ...state.player.backpack, ...state.player.specials].some(x=>rx.test(x));
  };
  if(c.type==='discipline') return state.player.disciplines.has(c.name);
  if(c.type==='item')       return haveItem(c.name);
  if(c.type==='goldAtLeast')return state.player.gold >= (c.amount||0);
  if(c.type==='mealAtLeast')return state.player.meals >= (c.amount||0);
  return true;
}

function renderChoicesAssist(){
  state.allowedTargets.clear();
  const root = EL('passage');
  const links = $$('a[href*="#sect"]', root);
  links.forEach(a=>{
    const href=a.getAttribute('href')||'';
    const m = href.match(/#sect(\d+)/i);
    if(!m) return;
    const target = +m[1];
    const context = textOnly(a.closest('p,li,div') || a);
    const conds = parseChoiceConditions(context);
    const ok = conds.every(meetsCondition);
    state.allowedTargets.set(target, ok);
    a.classList.add('choiceLink');
    a.classList.toggle('disabled', !ok && state.flags.enforceCond);
    if(!ok && state.flags.enforceCond){
      a.title = conds.map(c=>{
        if(c.type==='discipline') return `Richiede arte: ${c.name}`;
        if(c.type==='item') return `Richiede: ${c.name}`;
        if(c.type==='goldAtLeast') return `Richiede ≥ ${c.amount} Corone d'Oro${c.consume?' (si pagano)':''}`;
        if(c.type==='mealAtLeast') return `Richiede un Pasto`;
        return 'Vincolo';
      }).join(' • ');
    }else a.title='';
  });
}

/* =========================================================
   COMBATTIMENTO
   ========================================================= */
function weaponEffectiveBonus(name){
  if(!name) return -4; // disarmato
  let bonus = 0; // base 0 per tutte le armi standard, si può espandere
  if(state.player.disciplines.has('Scherma') && state.player.weaponskillWeapon){
    const rx = new RegExp(`\\b${escRx(state.player.weaponskillWeapon)}\\b`,'i');
    if(rx.test(name)) bonus += 2;
  }
  return bonus;
}
function playerCurrentCS(){
  let cs = state.player.combattivitaBase + weaponEffectiveBonus(state.player.equipped||"");
  // Psionica
  const mb = EL('useMindblast');
  if(mb && mb.checked && state.player.disciplines.has('Psicolaser') && !state.current.enemyImmuneMB) cs += 2;
  if(state.current.psionicAttack && !state.player.disciplines.has('Psicoschermo')) cs -= 2;
  // Mod temporanei
  cs += (+EL('youMod').value || 0);
  return cs;
}
function enemyCurrentCS(base){ return base + (+EL('foeMod').value || 0); }
function computeCR(){
  if(!state.inCombat.foe) return 0;
  return playerCurrentCS() - enemyCurrentCS(state.inCombat.foe.cs);
}

function consultCRT(cr, rn){
  if(!state.crt) return { eLoss:0, lwLoss:0, eKill:false, lwKill:false };
  const col = state.crt.ranges.findIndex(r => cr>=r.min && cr<=r.max);
  const idx = (col===-1) ? (cr<state.crt.ranges[0].min ? 0 : state.crt.ranges.length-1) : col;
  const row = state.crt.rows[rn] || [];
  return row[idx] || { eLoss:0, lwLoss:0, eKill:false, lwKill:false };
}

function renderAutoDetections(){
  const dc = EL('detectedCombat');
  const eList = EL('enemyList');
  const eCount= EL('enemyCount');
  const hints = EL('psionHints');

  if(state.enemies.length){
    dc.classList.remove('hidden');
    eCount.textContent = String(state.enemies.length);
    eList.innerHTML = state.enemies.map(e=>`<div class="enemyBox"><strong>${e.name}</strong> — Combattività <strong>${e.cs}</strong>, Resistenza <strong>${e.ep}</strong></div>`).join('');
  }else{
    dc.classList.add('hidden');
    EL('combatPanel').classList.add('hidden');
  }

  const parts=[];
  if(state.current.enemyImmuneMB) parts.push('Nemico <strong>immune a Psicolaser</strong>.');
  if(state.current.psionicAttack) parts.push('Usa <strong>attacchi psichici</strong> (−2 se non hai Psicoschermo).');
  hints.style.display = parts.length?'flex':'none';
  hints.innerHTML = parts.map(p=>`<span class="tag">${p}</span>`).join(' ');
}

function prepareCombatPanel(){
  if(!state.enemies.length) return;
  // Per semplicità: primo nemico. (Espandibile per multi-foe a catena)
  const foe = state.enemies[0];
  state.inCombat = { active:false, foe:{...foe, epNow:foe.ep}, round:0 };

  EL('combatPanel').classList.remove('hidden');
  EL('startCombatBtn').disabled = false;
  EL('combatRoundBtn').disabled = true;
  EL('endCombatBtn').disabled   = true;
  EL('evadeBtn').style.display  = state.current.allowEvade ? '' : 'none';

  $('#mbWrap').classList.toggle('hidden', !state.player.disciplines.has('Psicolaser'));
  $('#mbWrap').classList.toggle('immune', state.current.enemyImmuneMB);
  EL('useMindblast').checked = false;

  EL('crNow').textContent='—';
  EL('lastRN').textContent='–';
  EL('lastResult').textContent='–';
  EL('combatLog').textContent='';

  updateCombatUI();
}

function updateCombatUI(){
  const foe = state.inCombat.foe;
  if(!foe) return;
  EL('foeName').textContent = foe.name || 'Nemico';
  const foeCS = enemyCurrentCS(foe.cs);
  EL('foeCS').textContent   = String(foeCS);
  EL('foeEP').textContent   = String(foe.epNow);
  EL('foeEPmax').textContent= `/ ${foe.ep}`;

  const plCS = playerCurrentCS();
  EL('youCS').textContent   = String(plCS);
  EL('youEP').textContent   = String(state.player.resistenzaCorrente);
  EL('youEPmax').textContent= `/ ${state.player.resistenzaBase}`;
  EL('youNotes').textContent = state.player.equipped ? `Arma: ${state.player.equipped}` : 'Senza arma (−4)';

  const cr = plCS - foeCS;
  EL('crNow').textContent = cr>=0?`+${cr}`:String(cr);
}

function logLine(s){
  const el = EL('combatLog');
  el.textContent += s + '\n';
  el.scrollTop = el.scrollHeight;
}

function startCombat(){
  if(!state.inCombat.foe) return;
  state.inCombat.active = true;
  state.inCombat.round  = 0;
  EL('startCombatBtn').disabled   = true;
  EL('combatRoundBtn').disabled   = false;
  EL('endCombatBtn').disabled     = false;
  updateCombatUI();
  immersion(`Inizia il combattimento contro ${state.inCombat.foe.name}.`,'Combattimento');
  logLine(`— Inizia combattimento: ${state.inCombat.foe.name} —`);
}

function endCombat(msg){
  EL('startCombatBtn').disabled = true;
  EL('combatRoundBtn').disabled = true;
  EL('endCombatBtn').disabled   = true;
  state.inCombat.active = false;
  state.current.lastHadCombat = true;
  if(msg) immersion(msg,'Combattimento');
  syncUI();
}

function resolveRound(evading=false){
  if(!state.inCombat.active) return;
  const rn = random0to9();
  EL('rngVal').textContent = String(rn);
  EL('lastRN').textContent = String(rn);

  const cr   = computeCR();
  const cell = consultCRT(cr, rn);

  let yourLoss = cell.lwKill ? state.player.resistenzaCorrente : (cell.lwLoss||0);
  let foeLoss  = cell.eKill  ? state.inCombat.foe.epNow       : (cell.eLoss||0);

  if(evading){ // fuga: il round costa a te ma non al nemico (o si può adattare)
    foeLoss = 0;
    immersion('Tenti la fuga…','Evasione');
  }

  // Applica danni
  state.player.resistenzaCorrente   = Math.max(0, state.player.resistenzaCorrente - yourLoss);
  state.inCombat.foe.epNow          = Math.max(0, state.inCombat.foe.epNow - foeLoss);

  updateCombatUI();

  const line = `${evading?'(Evasione) ':''}Tu −${yourLoss}, Nemico −${foeLoss}`;
  EL('lastResult').textContent = line;
  logLine(`Round ${++state.inCombat.round}: ${line}`);

  // Esiti
  if(state.player.resistenzaCorrente<=0){
    logLine('✖ Sei caduto.');
    EL('deadend').classList.remove('hidden');
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

/* =========================================================
   CRT (Combat Results Table): parse o fallback
   ========================================================= */
function parseCRT(dom){
  try{
    // Trovare tabella che contenga "Combat Results"
    const tables = $$('table', dom);
    const cand = tables.find(t => /combat results/i.test(t.textContent));
    if(!cand) { console.warn('CRT non trovata, uso fallback'); return fallbackCRT(); }

    // Heuristica base: prima riga intestazione colonne (range CR), poi 10 righe per RN 0..9
    const rows = $$('tr', cand).map(tr => Array.from(tr.children));
    // Cerca header con ranges
    const headerRow = rows.find(r => r.some(c => /-?\d+/.test(textOnly(c))));
    const ranges = headerRow.slice(1).map(th=>{
      const s = textOnly(th).toLowerCase().replace('−','-');
      // Esempi: "-11 or lower", "-10/-9", "0", "11 or higher"
      if(/lower/.test(s)) return {min:-Infinity, max:parseInt(s,10)};
      if(/higher/.test(s))return {min:parseInt(s,10), max:Infinity};
      if(/-?\d+\s*\/\s*-?\d+/.test(s)){
        const [a,b]=s.split('/').map(v=>parseInt(v,10));
        return {min:Math.min(a,b), max:Math.max(a,b)};
      }
      const v = parseInt(s,10);
      return {min:v, max:v};
    });

    // Righe risultati: assumiamo le successive 10 righe hanno 1 colonna per RN e poi risultati
    const dataRows = rows.filter(r => r.length===ranges.length+1).slice(0,10);
    const parsed = dataRows.map(r => r.slice(1).map(td=>{
      const t=textOnly(td).toLowerCase();
      // Formati: "4/2" (eLoss/lwLoss) o "k/4" (kill/4) ecc.
      const kill = s => s==='k' || s==='kill';
      const parts = t.split('/');
      let eLoss=0,lwLoss=0,eKill=false,lwKill=false;
      if(parts.length===2){
        const [a,b] = parts;
        if(kill(a)) eKill = true; else eLoss = parseInt(a,10)||0;
        if(kill(b)) lwKill = true; else lwLoss = parseInt(b,10)||0;
      }
      return {eLoss,lwLoss,eKill,lwKill};
    }));

    if(!parsed.length || !ranges.length) throw new Error('CRT parse incompleta');
    state.crt = { ranges, rows: parsed };
  }catch(e){
    console.warn('Parse CRT fallita, uso fallback:', e);
    fallbackCRT();
  }
}

function fallbackCRT(){
  // Tabella bilanciata, 13 colonne di CR e 10 righe RN
  const ranges = [
    {min:-Infinity,max:-11},{min:-10,max:-9},{min:-8,max:-7},{min:-6,max:-5},{min:-4,max:-3},
    {min:-2,max:-1},{min:0,max:0},{min:1,max:2},{min:3,max:4},{min:5,max:6},
    {min:7,max:8},{min:9,max:10},{min:11,max:Infinity}
  ];
  const rows = [
    [{eLoss:0,lwLoss:0,lwKill:true},{eLoss:0,lwLoss:0,lwKill:true},{eLoss:0,lwLoss:8},{eLoss:0,lwLoss:6},{eLoss:1,lwLoss:6},{eLoss:2,lwLoss:5},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:5},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:4},{eLoss:7,lwLoss:4},{eLoss:8,lwLoss:3},{eLoss:9,lwLoss:3}],
    [{eLoss:0,lwLoss:8},{eLoss:0,lwLoss:7},{eLoss:1,lwLoss:6},{eLoss:2,lwLoss:5},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:3},{eLoss:8,lwLoss:3},{eLoss:9,lwLoss:2},{eLoss:10,lwLoss:2},{eLoss:11,lwLoss:2}],
    [{eLoss:0,lwLoss:7},{eLoss:1,lwLoss:6},{eLoss:2,lwLoss:5},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:3},{eLoss:8,lwLoss:3},{eLoss:9,lwLoss:2},{eLoss:10,lwLoss:2},{eLoss:11,lwLoss:2},{eLoss:12,lwLoss:2}],
    [{eLoss:1,lwLoss:6},{eLoss:2,lwLoss:5},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:3},{eLoss:8,lwLoss:2},{eLoss:9,lwLoss:2},{eLoss:10,lwLoss:2},{eLoss:11,lwLoss:2},{eLoss:12,lwLoss:2},{eLoss:13,lwLoss:2}],
    [{eLoss:2,lwLoss:5},{eLoss:3,lwLoss:5},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:4},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:2},{eLoss:9,lwLoss:2},{eLoss:10,lwLoss:2},{eLoss:11,lwLoss:2},{eLoss:12,lwLoss:1},{eLoss:13,lwLoss:1},{eLoss:14,lwLoss:1}],
    [{eLoss:3,lwLoss:4},{eLoss:4,lwLoss:4},{eLoss:5,lwLoss:3},{eLoss:6,lwLoss:3},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:2},{eLoss:9,lwLoss:1},{eLoss:10,lwLoss:1},{eLoss:11,lwLoss:1},{eLoss:12,lwLoss:0},{eLoss:13,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:15,lwLoss:0}],
    [{eLoss:4,lwLoss:3},{eLoss:5,lwLoss:3},{eLoss:6,lwLoss:2},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:2},{eLoss:9,lwLoss:1},{eLoss:10,lwLoss:1},{eLoss:11,lwLoss:1},{eLoss:12,lwLoss:0},{eLoss:13,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:15,lwLoss:0},{eLoss:0,lwLoss:0,eKill:true}],
    [{eLoss:5,lwLoss:2},{eLoss:6,lwLoss:2},{eLoss:7,lwLoss:2},{eLoss:8,lwLoss:1},{eLoss:9,lwLoss:1},{eLoss:10,lwLoss:0},{eLoss:11,lwLoss:0},{eLoss:12,lwLoss:0},{eLoss:13,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:15,lwLoss:0},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true}],
    [{eLoss:6,lwLoss:1},{eLoss:7,lwLoss:1},{eLoss:8,lwLoss:0},{eLoss:9,lwLoss:0},{eLoss:10,lwLoss:0},{eLoss:11,lwLoss:0},{eLoss:12,lwLoss:0},{eLoss:13,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:15,lwLoss:0},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true}],
    [{eLoss:7,lwLoss:0},{eLoss:8,lwLoss:0},{eLoss:9,lwLoss:0},{eLoss:10,lwLoss:0},{eLoss:11,lwLoss:0},{eLoss:12,lwLoss:0},{eLoss:13,lwLoss:0},{eLoss:14,lwLoss:0},{eLoss:15,lwLoss:0},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true},{eLoss:0,lwLoss:0,eKill:true}]
  ];
  state.crt = { ranges, rows };
}

/* =========================================================
   INVENTARIO / STATS UI
   ========================================================= */
function enforceCapacity(){
  const maxMeals = Math.max(0, 8 - state.player.backpack.length);
  if(state.player.meals > maxMeals) state.player.meals = maxMeals;
  EL('meals').value = state.player.meals;
  EL('meals').max   = String(maxMeals);
  const cap = state.player.backpack.length + state.player.meals;
  EL('capInfo').textContent = `capienza: ${cap}/8`;
}

function renderInventory(){
  // Armi
  const wRoot = EL('weaponsList');
  wRoot.innerHTML = state.player.weapons.length
    ? state.player.weapons.map((w,i)=>`<div class="row small"><span>${w}</span><button class="btn soft" data-delw="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Nessuna arma.</div>';
  wRoot.querySelectorAll('button[data-delw]').forEach(b=>{
    b.onclick = ()=>{
      state.player.weapons.splice(+b.dataset.delw,1);
      if(state.player.equipped && !state.player.weapons.includes(state.player.equipped)){
        state.player.equipped = state.player.weapons[0] || "";
      }
      syncUI();
    };
  });

  const eq = EL('equippedWeapon');
  eq.innerHTML = `<option value="">(nessuna)</option>` + state.player.weapons.map(w=>`<option value="${w}">${w}</option>`).join('');
  eq.value = state.player.equipped;

  // Zaino
  const bRoot = EL('backpackList');
  bRoot.innerHTML = state.player.backpack.length
    ? state.player.backpack.map((it,i)=>`<div class="row small"><span>${it}</span><button class="btn soft" data-deli="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Zaino vuoto.</div>';
  bRoot.querySelectorAll('button[data-deli]').forEach(b=>{
    b.onclick = ()=>{ state.player.backpack.splice(+b.dataset.deli,1); syncUI(); };
  });

  // Speciali
  const sRoot = EL('specialsList');
  sRoot.innerHTML = state.player.specials.length
    ? state.player.specials.map((it,i)=>`<div class="row small"><span>${it}</span><button class="btn soft" data-dels="${i}">Rimuovi</button></div>`).join('')
    : '<div class="small tag">Nessuno.</div>';
  sRoot.querySelectorAll('button[data-dels]').forEach(b=>{
    b.onclick = ()=>{ state.player.specials.splice(+b.dataset.dels,1); syncUI(); };
  });

  // Bonus EP da Elmo/Cotta
  const helm = state.player.specials.some(x=>/^elmo$/i.test(x)) ? 2 : 0;
  const mail = state.player.specials.some(x=>/cotta di maglia/i.test(x)) ? 4 : 0;
  const bonus = helm + mail;

  if(state._lastSpecBonus === undefined) state._lastSpecBonus = 0;
  const baseWithout = state.player.resistenzaBase - state._lastSpecBonus;
  state._lastSpecBonus = bonus;
  state.player.resistenzaBase = Math.max(1, baseWithout + bonus);
  if(state.player.resistenzaCorrente > state.player.resistenzaBase) state.player.resistenzaCorrente = state.player.resistenzaBase;

  enforceCapacity();
}

function renderDisciplinesList(){
  const root = EL('disciplinesList'); root.innerHTML = "";
  const note = EL('discNote');
  if(state.flags.started){
    note.textContent = "(bloccate: avventura in corso)";
    const sel = [...state.player.disciplines];
    root.innerHTML = sel.length
      ? sel.map(s=>`<div class="row small"><strong>${s}</strong> <span class="tag">— ${DISC_DESC[s]}</span></div>`).join('')
      : '<div class="small tag">Nessuna arte selezionata.</div>';
  }else{
    note.textContent = "seleziona 5";
    DISCIPLINES.forEach(name=>{
      const id = `disc_${name.replace(/\s+/g,'_')}`;
      const line = document.createElement('label');
      line.className='row small';
      line.innerHTML = `<input type="checkbox" id="${id}"> <strong>${name}</strong> <span class="tag">— ${DISC_DESC[name]}</span>`;
      root.appendChild(line);
      const cb = EL(id);
      cb.checked = state.player.disciplines.has(name);
      cb.onchange = (e)=>{
        if(e.target.checked){
          if(state.player.disciplines.size>=5){
            e.target.checked=false; immersion('Puoi selezionare al massimo 5 Arti.','Wizard'); return;
          }
          state.player.disciplines.add(name);
        }else{
          state.player.disciplines.delete(name);
        }
      };
    });
  }
  EL('wsPanel').classList.toggle('hidden', !state.player.disciplines.has('Scherma'));
  EL('wsWeapon').textContent = state.player.weaponskillWeapon || '—';
}

function syncUI(){
  // Stats
  EL('combattivitaBase').value   = state.player.combattivitaBase;
  EL('resistenzaBase').value     = state.player.resistenzaBase;
  EL('resistenzaCorrente').value = state.player.resistenzaCorrente;
  EL('meals').value              = state.player.meals;
  EL('gold').value               = state.player.gold;

  // Disciplines / Inventory
  renderDisciplinesList();
  renderInventory();

  // Choices
  renderChoicesAssist();

  // Toggles
  EL('enforceCond').checked = state.flags.enforceCond;

  scheduleAutosave();
}

/* =========================================================
   Wizard
   ========================================================= */
const wizard = { step:0, total:4, temp:{} };

function openWizard(){
  wizard.step = 0;
  wizard.temp = {
    manual:false,
    combattivitaBase:10,
    resistenzaBase:20,
    gold:0,
    disciplines:new Set(),
    weapons:["Ascia"],
    equipped:"Ascia",
    specials:["Mappa"],
    meals:1,
    bonusItem:null,
    weaponskillWeapon:null,
    rolls:{cs:0,ep:0,gold:0,bonus:0,ws:0}
  };
  EL('wizard').classList.remove('hidden');
  renderWizard();
}

function renderWizard(){
  EL('wizStepTag').textContent = `Passo ${wizard.step+1} di ${wizard.total}`;
  EL('wizDots').innerHTML = Array(wizard.total).fill(0).map((_,i)=>`<div class="step-dot ${i===wizard.step?'active':''}"></div>`).join('');
  const body = EL('wizBody'); body.innerHTML = '';

  if(wizard.step===0){
    body.innerHTML = `
      <div class="box">
        <h3>Benvenuto, Ramas</h3>
        <p>Creiamo il tuo personaggio in 4 passi: <strong>Statistiche</strong>, <strong>Arti</strong>, <strong>Equipaggiamento Bonus</strong>, <strong>Riepilogo</strong>.</p>
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
            <span class="tag">= 10 + Numero</span><span class="tag" id="tryCS"></span>
          </div>
        </div>
        <div class="box">
          <h3>Resistenza</h3>
          <div class="row">
            <button class="btn" id="wizRollEP">Estrai</button>
            <input id="wizEP" type="number" readonly style="width:100px" value="${wizard.temp.resistenzaBase}">
            <span class="tag">= 20 + Numero</span><span class="tag" id="tryEP"></span>
          </div>
        </div>
      </div>
      <div class="box">
        <h3>Corone d’Oro iniziali</h3>
        <div class="row">
          <button class="btn" id="wizRollGold">Estrai</button>
          <input id="wizGold" type="number" readonly style="width:100px" value="${wizard.temp.gold}">
          <span class="tag">= Numero (0–9)</span><span class="tag" id="tryGold"></span>
        </div>
      </div>
      <div class="small tag">Con tiri automatici hai <strong>max 2 tentativi</strong> per ciascuna statistica (CS, EP) e per l’oro.</div>`;

    const upd = ()=>{
      EL('tryCS').textContent   = `tentativi: ${wizard.temp.rolls.cs}/2`;
      EL('tryEP').textContent   = `tentativi: ${wizard.temp.rolls.ep}/2`;
      EL('tryGold').textContent = `tentativi: ${wizard.temp.rolls.gold}/2`;
    };
    upd();

    EL('wizRollCS').onclick = ()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.cs>=2) return immersion('Tentativi esauriti per la Combattività.','Wizard');
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.cs++;
      wizard.temp.combattivitaBase = 10 + r;
      EL('wizCS').value = wizard.temp.combattivitaBase;
      upd(); immersion(`Numero ${r}. Combattività = 10 + ${r} = ${10+r}.`,'Tiro');
    };
    EL('wizRollEP').onclick = ()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.ep>=2) return immersion('Tentativi esauriti per la Resistenza.','Wizard');
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.ep++;
      wizard.temp.resistenzaBase = 20 + r;
      EL('wizEP').value = wizard.temp.resistenzaBase;
      upd(); immersion(`Numero ${r}. Resistenza = 20 + ${r} = ${20+r}.`,'Tiro');
    };
    EL('wizRollGold').onclick = ()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.gold>=2) return immersion('Tentativi esauriti per l’Oro.','Wizard');
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.gold++;
      wizard.temp.gold = r;
      EL('wizGold').value = r;
      upd(); immersion(`Numero ${r}. Oro iniziale = ${r}.`,'Tiro');
    };
  }

  if(wizard.step===2){
    body.innerHTML = `
      <div class="box">
        <h3>Scegli 5 Arti Ramas</h3>
        <div class="row"><button id="wizRandom5Btn" class="btn soft">Scegli 5 casuali</button></div>
        <div id="wizDiscList" class="list" style="margin-top:8px;"></div>
      </div>`;
    const list = EL('wizDiscList');
    DISCIPLINES.forEach(name=>{
      const id=`wd_${name.replace(/\s+/g,'_')}`;
      list.insertAdjacentHTML('beforeend', `<label class="row small"><input type="checkbox" id="${id}"> <strong>${name}</strong> <span class="tag">— ${DISC_DESC[name]}</span></label>`);
      const cb = EL(id);
      cb.checked = wizard.temp.disciplines.has(name);
      cb.onchange = (e)=>{
        if(e.target.checked){
          if(wizard.temp.disciplines.size>=5){
            e.target.checked=false; immersion('Massimo 5 Arti.','Wizard'); return;
          }
          wizard.temp.disciplines.add(name);
        }else{
          wizard.temp.disciplines.delete(name);
        }
      };
    });
    EL('wizRandom5Btn').onclick = ()=>{
      wizard.temp.disciplines.clear();
      const shuffled = [...DISCIPLINES].sort(()=>0.5-Math.random());
      shuffled.slice(0,5).forEach(d=>wizard.temp.disciplines.add(d));
      renderWizard();
    };
  }

  if(wizard.step===3){
    // Bonus + Riepilogo
    const bonusText = wizard.temp.bonusItem ? `<span class="pill">${wizard.temp.bonusItem}</span>` : `<span class="tag">— nessuno —</span>`;
    body.innerHTML = `
      <div class="two">
        <div class="box">
          <h3>Oggetto Bonus</h3>
          <p class="small tag">Hai <strong>max 2 tentativi</strong> per estrarre l'oggetto bonus (solo in modalità automatica).</p>
          <div class="row">
            <button id="wizBonusRoll" class="btn">Estrai bonus</button>
            <span id="bonusItemWrap">${bonusText}</span>
            <span class="tag" id="tryBonus"></span>
          </div>
          <div class="row" id="wsRow" style="margin-top:6px; display:${wizard.temp.disciplines.has('Scherma')?'flex':'none'}">
            <button id="wizRollWS" class="btn soft">Tira arma di Scherma</button>
            <span class="tag">Arma: <strong id="wsVal">${wizard.temp.weaponskillWeapon||'—'}</strong></span>
          </div>
        </div>
        <div class="box">
          <h3>Riepilogo</h3>
          <div id="wizSummary" class="small"></div>
        </div>
      </div>
      <div class="tag">Premi “Inizia l’Avventura” per applicare le scelte.</div>`;

    const bonusMap = {
      0:"Spadone",1:"Spada",2:"Elmo",3:"Due Pasti",4:"Cotta di Maglia",
      5:"Mazza",6:"Pozione Magica",7:"Asta",8:"Lancia",9:"12 Corone d'Oro"
    };
    const updSummary = ()=>{
      const d = [...wizard.temp.disciplines];
      const sum = `
        <p><strong>Combattività:</strong> ${wizard.temp.combattivitaBase} &nbsp; • &nbsp; <strong>Resistenza:</strong> ${wizard.temp.resistenzaBase}</p>
        <p><strong>Corone d’Oro:</strong> ${wizard.temp.gold}</p>
        <p><strong>Arti Ramas (5):</strong> ${d.length?d.join(', '):'—'}</p>
        <p><strong>Armi:</strong> ${wizard.temp.weapons.join(', ')} (equip.: ${wizard.temp.equipped||'—'})</p>
        <p><strong>Zaino:</strong> ${wizard.temp.meals} Pasto${wizard.temp.meals!==1?'i':''}${wizard.temp.specials.includes('Pozione Magica')?', Pozione Magica':''}</p>
        <p><strong>Oggetti Speciali:</strong> ${wizard.temp.specials.join(', ')||'—'}</p>
        ${wizard.temp.disciplines.has('Scherma')?`<p><strong>Maestro di Scherma:</strong> ${wizard.temp.weaponskillWeapon||'—'}</p>`:''}
        ${wizard.temp.bonusItem?`<p><strong>Bonus:</strong> ${wizard.temp.bonusItem}</p>`:''}
      `;
      EL('wizSummary').innerHTML = sum;
    };
    const updTry = ()=> { EL('tryBonus').textContent = `tentativi: ${wizard.temp.rolls.bonus}/2`; };
    updTry(); updSummary();

    EL('wizBonusRoll').onclick = ()=>{
      if(!wizard.temp.manual && wizard.temp.rolls.bonus>=2) return immersion('Tentativi bonus esauriti.','Wizard');
      const r = wizard.temp.manual ? (+prompt('Numero 0–9','0')||0) : random0to9();
      if(!wizard.temp.manual) wizard.temp.rolls.bonus++;
      const got = bonusMap[r];
      wizard.temp.bonusItem = got;
      EL('bonusItemWrap').innerHTML = `<span class="pill">${got}</span>`;
      if(got==="Due Pasti") wizard.temp.meals = (wizard.temp.meals||0) + 2;
      if(got==="Pozione Magica" && !wizard.temp.backpack?.includes?.("Pozione Magica")){
        wizard.temp.backpack = (wizard.temp.backpack||[]);
        wizard.temp.backpack.push("Pozione Magica");
      }
      if(got==="Elmo" && !wizard.temp.specials.includes("Elmo")) wizard.temp.specials.push("Elmo");
      if(got==="Cotta di Maglia" && !wizard.temp.specials.includes("Cotta di Maglia")) wizard.temp.specials.push("Cotta di Maglia");
      if(got==="12 Corone d'Oro") wizard.temp.gold = Math.min(50,(wizard.temp.gold||0)+12);
      // Armi bonus se c'è spazio
      if(["Spadone","Spada","Mazza","Asta","Lancia"].includes(got) && wizard.temp.weapons.length<2 && !wizard.temp.weapons.includes(got)){
        wizard.temp.weapons.push(got);
      }
      updTry(); updSummary();
      immersion(`Oggetto bonus: ${got}`,'Fato');
    };

    EL('wizRollWS')?.addEventListener('click', ()=>{
      const r = random0to9();
      wizard.temp.weaponskillWeapon = WEAPON_LIST[r];
      EL('wsVal').textContent = wizard.temp.weaponskillWeapon;
      updSummary();
      immersion(`Maestro di Scherma → ${WEAPON_LIST[r]}`,'Specializzazione');
    });
  }

  EL('wizPrev').disabled = wizard.step===0;
  EL('wizNext').classList.toggle('hidden', wizard.step===wizard.total-1);
  EL('wizFinish').classList.toggle('hidden', wizard.step!==wizard.total-1);
}

function applyWizard(){
  // Applica dati temporanei -> stato di gioco
  state.player.combattivitaBase   = wizard.temp.combattivitaBase;
  state.player.resistenzaBase     = wizard.temp.resistenzaBase;
  state.player.resistenzaCorrente = wizard.temp.resistenzaBase;
  state.player.gold               = wizard.temp.gold;
  state.player.disciplines        = new Set(wizard.temp.disciplines);
  state.player.weapons            = [...wizard.temp.weapons];
  state.player.equipped           = wizard.temp.equipped || state.player.weapons[0] || "";
  state.player.backpack           = wizard.temp.backpack || [];
  state.player.specials           = [...new Set(wizard.temp.specials)];
  state.player.meals              = wizard.temp.meals||1;

  if(state.player.disciplines.has('Scherma')){
    state.player.weaponskillWeapon = wizard.temp.weaponskillWeapon || WEAPON_LIST[random0to9()];
  }else{
    state.player.weaponskillWeapon = null;
  }

  state.flags.started = true;
  syncUI();
  closeWizard();
  immersion('Il tuo viaggio ha inizio…','Avventura');
}

function closeWizard(){ EL('wizard').classList.add('hidden'); }

/* =========================================================
   SALVATAGGIO
   ========================================================= */
function buildSave(){
  // Serializza Set -> Array
  const player = {...state.player, disciplines:[...state.player.disciplines]};
  return {
    player, section:state.current.section, flags:state.flags, history:state.navHistory
  };
}
function applySave(obj){
  if(!obj) return;
  state.player = obj.player;
  state.player.disciplines = new Set(obj.player.disciplines||[]);
  state.flags  = obj.flags;
  state.navHistory = obj.history||[];
  if(obj.section) navGoTo(obj.section,false);
  syncUI();
}
function hasAutosave(){
  try{ return !!localStorage.getItem(AUTOSAVE_KEY); }catch{ return false; }
}
function scheduleAutosave(){
  if(!state.flags.autosave) return;
  try{
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildSave()));
    EL('btnResume').disabled = false;
  }catch(e){}
}
function restoreAutosave(){
  try{
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if(!raw) return false;
    const obj = JSON.parse(raw);
    applySave(obj);
    immersion('Salvataggio automatico ripristinato.','Riprendi');
    return true;
  }catch(e){ return false; }
}

/* =========================================================
   EVENTI
   ========================================================= */
function initEvents(){
  // Tema
  EL('themeToggle')?.addEventListener('change', e=>{
    const mode = e.target.checked ? 'light' : '';
    if(mode) document.documentElement.setAttribute('data-theme','light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(THEME_PREF, mode);
  });

  // Import libro manuale
  EL('fileInput')?.addEventListener('change', async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    const txt = await file.text();
    importBook(txt);
  });

  // Traduzione DeepL del § corrente (prende il testo in pagina)
  EL('btnDeepL')?.addEventListener('click', ()=>{
    const txt = textOnly(EL('passage')).slice(0,MAX_DEEPL_FRAGMENT);
    if(!txt){ immersion('Nessun testo da tradurre.','Traduzione'); return; }
    const url = `https://www.deepl.com/translator#en/it/${encodeURIComponent(txt)}`;
    window.open(url, '_blank', 'noopener');
  });

  // Wizard
  EL('openWizardBtn')?.addEventListener('click', openWizard);
  EL('wizSkip')?.addEventListener('click', closeWizard);
  EL('wizPrev')?.addEventListener('click', ()=>{ wizard.step=Math.max(0,wizard.step-1); renderWizard(); });
  EL('wizNext')?.addEventListener('click', ()=>{
    if(wizard.step===2 && wizard.temp.disciplines.size!==5){
      immersion('Seleziona esattamente 5 Arti.','Wizard'); return;
    }
    wizard.step=Math.min(wizard.total-1, wizard.step+1);
    renderWizard();
  });
  EL('wizFinish')?.addEventListener('click', applyWizard);

  // Inizio rapido
  EL('quickStartBtn')?.addEventListener('click', ()=>{
    const cs=10+random0to9(), ep=20+random0to9(), gold=random0to9();
    const d = new Set([...DISCIPLINES].sort(()=>0.5-Math.random()).slice(0,5));
    state.player = {
      combattivitaBase:cs, resistenzaBase:ep, resistenzaCorrente:ep,
      disciplines:d, weapons:["Ascia"], equipped:"Ascia",
      backpack:[], specials:["Mappa"], meals:1, gold, weaponskillWeapon:null
    };
    if(d.has('Scherma')) state.player.weaponskillWeapon = WEAPON_LIST[random0to9()];
    state.flags.started = true;
    syncUI();
    immersion('Personaggio rapido creato!','Inizio Rapido');
  });

  // Nuova / Reset / Export / Import
  EL('newGameBtn')?.addEventListener('click', ()=>{
    if(confirm('Nuova partita? Perderai i progressi non salvati.')){
      localStorage.removeItem(AUTOSAVE_KEY);
      location.reload();
    }
  });
  EL('exportSaveBtn')?.addEventListener('click', ()=>{
    EL('saveCode').value = btoa(unescape(encodeURIComponent(JSON.stringify(buildSave()))));
    immersion('Codice di salvataggio generato.','Salvataggio');
  });
  EL('importSaveBtn')?.addEventListener('click', ()=>{
    const raw = prompt('Incolla il codice di salvataggio:','');
    if(!raw) return;
    try{
      const obj = JSON.parse(decodeURIComponent(escape(atob(raw))));
      applySave(obj);
      immersion('Salvataggio caricato.','Import');
    }catch(e){ alert('Codice non valido.'); }
  });
  EL('btnResume')?.addEventListener('click', ()=>{
    if(!restoreAutosave()) immersion('Nessun salvataggio trovato.','Riprendi');
  });

  // Autosave toggle
  EL('toggleAutosave')?.addEventListener('change', e=>{
    state.flags.autosave = e.target.checked;
    try{ localStorage.setItem(AUTOSAVE_PREF, e.target.checked?'1':'0'); }catch{}
  });

  // Navigazione
  EL('jumpGo')?.addEventListener('click', ()=>{
    const n = +EL('jumpInput').value;
    if(Number.isInteger(n) && n>0) navGoTo(n);
  });
  EL('navBack')?.addEventListener('click', ()=>{
    if(!state.navHistory.length) return;
    const prev = state.navHistory.pop();
    if(prev!=null){
      state.navFuture.unshift(state.current.section);
      navGoTo(prev, false);
    }
  });
  EL('navForward')?.addEventListener('click', ()=>{
    if(!state.navFuture.length) return;
    const next = state.navFuture.shift();
    if(next!=null){
      state.navHistory.push(state.current.section);
      navGoTo(next, false);
    }
  });

  // Cattura click sui link § dentro al passaggio
  EL('passage')?.addEventListener('click', (ev)=>{
    const a = ev.target.closest('a');
    if(!a) return;
    const href = a.getAttribute('href')||'';
    const m = href.match(/#sect(\d+)/i);
    if(!m) return;
    const target = +m[1];
    if(state.flags.enforceCond && state.allowedTargets.has(target) && !state.allowedTargets.get(target)){
      ev.preventDefault();
      immersion('Scelta bloccata: requisiti non soddisfatti.','Scelta');
      return;
    }
    ev.preventDefault();
    navGoTo(target);
  });

  // Combattimento
  EL('prepareCombatBtn')?.addEventListener('click', prepareCombatPanel);
  EL('startCombatBtn')?.addEventListener('click', startCombat);
  EL('combatRoundBtn')?.addEventListener('click', ()=> resolveRound(false));
  EL('evadeBtn')?.addEventListener('click', ()=> resolveRound(true));
  EL('endCombatBtn')?.addEventListener('click', ()=> endCombat('Combattimento terminato.'));

  ['useMindblast','youMod','foeMod'].forEach(id=>{
    EL(id)?.addEventListener('input', updateCombatUI);
  });

  // Enforce condizioni
  EL('enforceCond')?.addEventListener('change', e=>{
    state.flags.enforceCond = e.target.checked;
    renderChoicesAssist();
  });

  // Dado
  EL('btnDice')?.addEventListener('click', ()=> EL('diceModal').classList.remove('hidden'));
  EL('diceClose')?.addEventListener('click', ()=> EL('diceModal').classList.add('hidden'));
  EL('diceRoll')?.addEventListener('click', ()=>{
    const v = random0to9();
    EL('diceFace').textContent = String(v);
    EL('rngVal').textContent   = String(v);
    immersion(`Numero Casuale: ${v}`,'Dado');
  });

  // RNG singolo
  EL('rng0to9Btn')?.addEventListener('click', ()=>{
    const v = random0to9();
    EL('rngVal').textContent = String(v);
  });

  // Inventario quick
  EL('addWeaponBtn')?.addEventListener('click', ()=>{
    const v=(EL('weaponInput').value||'').trim();
    if(!v) return;
    if(state.player.weapons.includes(v)) return;
    if(state.player.weapons.length>=2){ immersion('Puoi portare al massimo 2 armi.','Inventario'); return; }
    state.player.weapons.push(v);
    if(!state.player.equipped) state.player.equipped=v;
    EL('weaponInput').value='';
    syncUI();
  });
  EL('equippedWeapon')?.addEventListener('change', e=>{
    state.player.equipped = e.target.value;
    syncUI();
  });
  EL('addBackpackBtn')?.addEventListener('click', ()=>{
    const v=(EL('backpackInput').value||'').trim(); if(!v) return;
    const cap = state.player.backpack.length + state.player.meals;
    if(cap>=8){ immersion('Zaino pieno (max 8 fra oggetti + pasti).','Inventario'); return; }
    state.player.backpack.push(v);
    EL('backpackInput').value='';
    syncUI();
  });
  EL('addSpecialBtn')?.addEventListener('click', ()=>{
    const v=(EL('specialInput').value||'').trim(); if(!v) return;
    state.player.specials.push(v);
    EL('specialInput').value='';
    syncUI();
  });
  EL('eatMealBtn')?.addEventListener('click', ()=>{
    if(state.player.meals>0){
      state.player.meals--;
      state.player.resistenzaCorrente = Math.min(state.player.resistenzaBase, state.player.resistenzaCorrente+4);
      syncUI();
    }else immersion('Nessun Pasto disponibile.','Inventario');
  });
  EL('goldPlus1Btn')?.addEventListener('click', ()=>{
    state.player.gold = clamp(state.player.gold+1,0,50); syncUI();
  });
  EL('goldMinus1Btn')?.addEventListener('click', ()=>{
    state.player.gold = clamp(state.player.gold-1,0,50); syncUI();
  });

  // Inputs diretti (mantieni sync)
  EL('combattivitaBase')?.addEventListener('input', e=>{
    state.player.combattivitaBase = +e.target.value||0; scheduleAutosave(); updateCombatUI();
  });
  EL('resistenzaBase')?.addEventListener('input', e=>{
    state.player.resistenzaBase = Math.max(1,+e.target.value||1);
    if(state.player.resistenzaCorrente>state.player.resistenzaBase) state.player.resistenzaCorrente = state.player.resistenzaBase;
    scheduleAutosave(); updateCombatUI();
  });
  EL('resistenzaCorrente')?.addEventListener('input', e=>{
    state.player.resistenzaCorrente = clamp(+e.target.value||0,0,state.player.resistenzaBase); scheduleAutosave(); updateCombatUI();
  });
  EL('meals')?.addEventListener('input', e=>{
    state.player.meals = Math.max(0,+e.target.value||0); enforceCapacity(); scheduleAutosave();
  });
  EL('gold')?.addEventListener('input', e=>{
    state.player.gold = clamp(+e.target.value||0,0,50); scheduleAutosave();
  });
}

/* =========================================================
   INIT
   ========================================================= */
async function init(){
  initTheme();
  initEvents();

  try{
    const pref = localStorage.getItem(AUTOSAVE_PREF);
    if(pref!==null){ state.flags.autosave = (pref==='1'); EL('toggleAutosave').checked = state.flags.autosave; }
    EL('btnResume').disabled = !hasAutosave();
  }catch{}

  EL('enforceCond').checked = state.flags.enforceCond;

  await tryAutoLoad(); // tenta autocaricamento 01fftd.htm
  syncUI();
  updateNavButtons();
}

document.addEventListener('DOMContentLoaded', init);