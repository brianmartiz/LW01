const state = {
  sections: new Map(),
  combatTable: null,
  randomTable: [],
  character: null,
  currentSectionId: null,
  history: [],
  lastSectionHadCombat: false,
  pendingRandomRoll: null,
  logEntries: [],
};

const DOM = {
  wizard: document.getElementById('wizard'),
  game: document.getElementById('game'),
  sectionHeader: document.getElementById('section-header'),
  sectionContent: document.getElementById('section-content'),
  combatPanel: document.getElementById('combat-panel'),
  choicePanel: document.getElementById('choice-panel'),
  sectionActions: document.getElementById('section-actions'),
  log: document.getElementById('log'),
  characterPanel: document.getElementById('character-panel'),
};

const DISCIPLINES = [
  { key: 'Camouflage', title: 'Camouflage', description: 'Ti permette di confonderti con l\'ambiente e agire inosservato.' },
  { key: 'Hunting', title: 'Hunting', description: 'Non consumi un Pasto quando ti viene ordinato di mangiare (salvo aree desertiche).' },
  { key: 'Sixth Sense', title: 'Sixth Sense', description: 'Avverti pericoli e intenzioni nascoste.' },
  { key: 'Tracking', title: 'Tracking', description: 'Ti guida nella scelta del percorso corretto e nell\'individuazione di tracce.' },
  { key: 'Healing', title: 'Healing', description: 'Recuperi 1 ENDURANCE ogni sezione senza combattimenti, fino al massimo.' },
  { key: 'Weaponskill', title: 'Weaponskill', description: 'Ottieni +2 COMBAT SKILL se impugni l\'arma in cui sei addestrato.' },
  { key: 'Mindshield', title: 'Mindshield', description: 'Ti protegge dagli attacchi psichici (Mindforce).' },
  { key: 'Mindblast', title: 'Mindblast', description: 'Aggiungi +2 COMBAT SKILL contro nemici non immuni alla Mindblast.' },
  { key: 'Animal Kinship', title: 'Animal Kinship', description: 'Comunichi con alcuni animali e ne intuisci le intenzioni.' },
  { key: 'Mind Over Matter', title: 'Mind Over Matter', description: 'Manipoli piccoli oggetti con la mente.' },
];

const EXTRA_ITEM_TABLE = {
  1: { type: 'weapon', name: 'Sword' },
  2: { type: 'special', name: 'Helmet', endurance: 2 },
  3: { type: 'meal', quantity: 2 },
  4: { type: 'special', name: 'Chainmail Waistcoat', endurance: 4 },
  5: { type: 'weapon', name: 'Mace' },
  6: { type: 'potion', name: 'Healing Potion', effect: 'Ripristina 4 ENDURANCE dopo un combattimento.' },
  7: { type: 'weapon', name: 'Quarterstaff' },
  8: { type: 'weapon', name: 'Spear' },
  9: { type: 'gold', amount: 12 },
  0: { type: 'weapon', name: 'Broadsword' },
};

const WEAPONSKILL_WEAPONS = {
  0: 'Dagger',
  1: 'Spear',
  2: 'Mace',
  3: 'Short Sword',
  4: 'Warhammer',
  5: 'Sword',
  6: 'Axe',
  7: 'Sword',
  8: 'Quarterstaff',
  9: 'Broadsword',
};

class Character {
  constructor() {
    this.baseCombatSkill = 0;
    this.permanentCombatModifier = 0;
    this.baseEndurance = 0;
    this.permanentEnduranceModifier = 0;
    this.currentEndurance = 0;
    this.gold = 0;
    this.weapons = [];
    this.activeWeapon = null;
    this.backpack = [];
    this.specialItems = [];
    this.disciplines = new Set();
    this.flags = {
      Camouflage: false,
      Hunting: false,
      'Sixth Sense': false,
      Tracking: false,
      Healing: false,
      Weaponskill: false,
      Mindshield: false,
      Mindblast: false,
      'Animal Kinship': false,
      'Mind Over Matter': false,
    };
    this.weaponSkillWeapon = null;
    this.notes = [];
  }

  get maxEndurance() {
    return this.baseEndurance + this.permanentEnduranceModifier;
  }

  get baseCombat() {
    return this.baseCombatSkill + this.permanentCombatModifier;
  }

  setBaseCombatSkill(value) {
    this.baseCombatSkill = value;
  }

  setBaseEndurance(value) {
    this.baseEndurance = value;
    this.currentEndurance = value;
  }

  adjustCombat(delta) {
    this.baseCombatSkill = Math.max(0, this.baseCombatSkill + delta);
  }

  adjustEndurance(delta) {
    this.baseEndurance = Math.max(0, this.baseEndurance + delta);
    this.currentEndurance = Math.min(this.currentEndurance + delta, this.maxEndurance);
    if (this.currentEndurance < 0) this.currentEndurance = 0;
  }

  addPermanentCombatBonus(delta) {
    this.permanentCombatModifier += delta;
  }

  addPermanentEnduranceBonus(delta) {
    this.permanentEnduranceModifier += delta;
    this.currentEndurance = Math.min(this.currentEndurance + delta, this.maxEndurance);
  }

  modifyEndurance(delta) {
    this.currentEndurance = Math.min(this.maxEndurance, this.currentEndurance + delta);
    if (this.currentEndurance < 0) this.currentEndurance = 0;
  }

  setDiscipline(name) {
    if (Object.prototype.hasOwnProperty.call(this.flags, name)) {
      this.flags[name] = true;
    }
    this.disciplines.add(name);
  }

  addWeapon(name) {
    if (this.weapons.includes(name)) return true;
    if (this.weapons.length >= 2) {
      addLog(`Non puoi portare pi\u00f9 di due armi. Scarta un'arma prima di raccogliere ${name}.`);
      return false;
    }
    this.weapons.push(name);
    if (!this.activeWeapon) {
      this.activeWeapon = name;
    }
    return true;
  }

  removeWeapon(name) {
    this.weapons = this.weapons.filter((weapon) => weapon !== name);
    if (this.activeWeapon === name) {
      this.activeWeapon = this.weapons[0] ?? null;
    }
  }

  setActiveWeapon(name) {
    if (this.weapons.includes(name)) {
      this.activeWeapon = name;
      return true;
    }
    return false;
  }

  getWeaponSkillBonus() {
    if (this.flags.Weaponskill && this.activeWeapon && this.weaponSkillWeapon === this.activeWeapon) {
      return 2;
    }
    return 0;
  }

  getWeaponMalus() {
    return this.activeWeapon ? 0 : -4;
  }

  findBackpackItem(name) {
    return this.backpack.find((item) => item.name === name);
  }

  backpackSlotsUsed() {
    return this.backpack.reduce((sum, item) => sum + item.quantity, 0);
  }

  addBackpackItem(name, quantity = 1, type = 'generic', metadata = {}) {
    if (this.backpackSlotsUsed() + quantity > 8) {
      addLog(`Lo zaino \u00e8 pieno: impossibile aggiungere ${name}.`);
      return false;
    }
    const existing = this.findBackpackItem(name);
    if (existing) {
      existing.quantity += quantity;
      existing.metadata = { ...existing.metadata, ...metadata };
    } else {
      this.backpack.push({ name, quantity, type, metadata });
    }
    return true;
  }

  removeBackpackItem(name, quantity = 1) {
    const item = this.findBackpackItem(name);
    if (!item) return false;
    if (item.quantity <= quantity) {
      this.backpack = this.backpack.filter((entry) => entry !== item);
    } else {
      item.quantity -= quantity;
    }
    return true;
  }

  addSpecialItem(name) {
    if (!this.specialItems.includes(name)) {
      this.specialItems.push(name);
    }
  }

  removeSpecialItem(name) {
    this.specialItems = this.specialItems.filter((item) => item !== name);
  }

  addGold(amount) {
    this.gold = Math.min(50, this.gold + amount);
  }

  spendGold(amount) {
    if (this.gold >= amount) {
      this.gold -= amount;
      return true;
    }
    return false;
  }
}

function addLog(message) {
  const timestamp = new Date().toLocaleTimeString('it-IT', { hour12: false });
  state.logEntries.unshift(`[${timestamp}] ${message}`);
  if (state.logEntries.length > 200) {
    state.logEntries.length = 200;
  }
  renderLog();
}

function renderLog() {
  DOM.log.innerHTML = '<h2>Registro eventi</h2>' + state.logEntries.map((entry) => `<p class="log-entry">${entry}</p>`).join('');
}

async function init() {
  addLog('Caricamento del libro in corso...');
  const doc = await loadDocument('01fftd.htm');
  state.sections = parseSections(doc);
  state.combatTable = parseCombatTable(doc);
  state.randomTable = parseRandomNumberTable(doc);
  addLog('Libro caricato. Prepara il tuo personaggio.');
  renderWizard();
}

document.addEventListener('DOMContentLoaded', init);

async function loadDocument(path) {
  const response = await fetch(path);
  const text = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(text, 'text/html');
}

function parseSections(doc) {
  const sectionsMap = new Map();
  const numberedContainer = doc.querySelector('.numbered');
  if (!numberedContainer) {
    throw new Error('Impossibile trovare le sezioni numerate nel file HTML.');
  }
  const headings = Array.from(numberedContainer.querySelectorAll('h3'));
  headings.forEach((heading) => {
    const anchor = heading.querySelector('a');
    if (!anchor) return;
    const number = parseInt(anchor.textContent.trim(), 10);
    if (Number.isNaN(number)) return;
    const section = {
      id: number,
      anchor: anchor.id,
      content: [],
      choices: [],
      combats: [],
      requiresRandom: false,
      randomPrompt: null,
      flags: {
        enemyImmuneMindblast: false,
      },
      combatModifiers: [],
      immediateEffects: [],
      death: false,
    };
    let node = heading.nextElementSibling;
    while (node && node.tagName !== 'H3') {
      if (node.tagName === 'H2') {
        break;
      }
      if (node.classList?.contains('choice')) {
        section.choices.push(parseChoiceNode(node));
      } else if (node.classList?.contains('combat')) {
        const combat = parseCombatNode(node);
        if (combat) {
          section.combats.push(combat);
        }
      } else if (node.classList?.contains('deadend')) {
        section.death = true;
        section.content.push({ html: node.innerHTML, text: node.textContent.trim(), className: 'deadend' });
      } else {
        const html = node.outerHTML ?? node.textContent;
        const text = node.textContent ? node.textContent.trim() : '';
        section.content.push({ html, text, className: node.className });
        analyseTextEffects(text, section);
      }
      node = node.nextElementSibling;
    }
    sectionsMap.set(number, section);
  });
  return sectionsMap;
}

function parseChoiceNode(node) {
  const link = node.querySelector('a');
  const targetId = link ? link.getAttribute('href') : null;
  const sectionNumber = targetId ? parseInt(targetId.replace(/[^0-9]/g, ''), 10) : null;
  const text = node.textContent.trim();
  const requirements = inferChoiceRequirements(text);
  const randomRange = inferRandomRange(text);
  return {
    html: node.innerHTML,
    text,
    target: sectionNumber,
    requirements,
    randomRange,
  };
}

function parseCombatNode(node) {
  const text = node.textContent.replace(/\s+/g, ' ').trim();
  const match = /^(.+?):\s*COMBAT SKILL\s*(\d+)\s*ENDURANCE\s*(\d+)/i.exec(text);
  if (!match) {
    return null;
  }
  return {
    name: match[1].trim(),
    combatSkill: parseInt(match[2], 10),
    endurance: parseInt(match[3], 10),
  };
}

function analyseTextEffects(text, section) {
  if (!text) return;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (/Pick a number from the Random Number Table/i.test(normalized)) {
    section.requiresRandom = true;
    section.randomPrompt = normalized;
  }
  if (/immune to Mindblast/i.test(normalized)) {
    section.flags.enemyImmuneMindblast = true;
  }
  const csMatch = /(Add|Deduct) (\d+) point(?:s)? (?:to|from) your COMBAT SKILL([^.]*)/i.exec(normalized);
  if (csMatch) {
    const sign = csMatch[1].toLowerCase() === 'add' ? 1 : -1;
    const value = parseInt(csMatch[2], 10);
    const remainder = csMatch[3] ?? '';
    section.combatModifiers.push({
      type: 'combatSkill',
      value: sign * value,
      scope: determineModifierScope(remainder),
      disciplineExemption: /unless you have the Kai Discipline of Mindshield/i.test(normalized)
        ? 'Mindshield'
        : null,
    });
  }
  const enduranceLossMatch = /(lose|deduct) (\d+) ENDURANCE point/i.exec(normalized);
  if (enduranceLossMatch) {
    const amount = parseInt(enduranceLossMatch[2], 10);
    section.immediateEffects.push({
      type: 'endurance',
      value: -amount,
      conditionDiscipline: /unless you have the Kai Discipline of Mindshield/i.test(normalized)
        ? 'Mindshield'
        : null,
    });
  }
  const enduranceGainMatch = /(restore|recover|gain|add) (\d+) ENDURANCE point/i.exec(normalized);
  if (enduranceGainMatch) {
    const amount = parseInt(enduranceGainMatch[2], 10);
    section.immediateEffects.push({ type: 'endurance', value: amount });
  }
  if (/for the rest of your life/i.test(normalized) && /COMBAT SKILL/i.test(normalized)) {
    const changeMatch = /(increase|raise|add|reduce|deduct) (?:your )?COMBAT SKILL by (\d+)/i.exec(normalized);
    if (changeMatch) {
      const isNegative = /reduce|deduct/i.test(changeMatch[1]);
      const amount = parseInt(changeMatch[2], 10);
      section.immediateEffects.push({ type: 'permanentCombat', value: isNegative ? -amount : amount });
    }
  }
  if (/for the rest of your life/i.test(normalized) && /ENDURANCE/i.test(normalized)) {
    const changeMatch = /(increase|raise|add|reduce|deduct) (?:your )?ENDURANCE by (\d+)/i.exec(normalized);
    if (changeMatch) {
      const isNegative = /reduce|deduct/i.test(changeMatch[1]);
      const amount = parseInt(changeMatch[2], 10);
      section.immediateEffects.push({ type: 'permanentEndurance', value: isNegative ? -amount : amount });
    }
  }
}

function determineModifierScope(remainder) {
  const lower = remainder.toLowerCase();
  if (lower.includes('first round')) return 'first-round';
  if (lower.includes('second and subsequent')) return 'second-and-subsequent';
  if (lower.includes('for the duration') || lower.includes('during this fight')) return 'fight';
  return 'fight';
}

function inferChoiceRequirements(text) {
  const requirements = [];
  DISCIPLINES.forEach((discipline) => {
    if (new RegExp(`Kai Discipline of ${discipline.title}`, 'i').test(text)) {
      requirements.push({ type: 'discipline', value: discipline.title });
    }
  });
  if (/If you have a Weapon called the Sommerswerd/i.test(text)) {
    requirements.push({ type: 'specialItem', value: 'Sommerswerd' });
  }
  const itemMatch = /If you have (?:an?|the) ([A-Z][A-Za-z\s'-]+)/.exec(text);
  if (itemMatch) {
    const item = itemMatch[1].trim();
    requirements.push({ type: 'item', value: item });
  }
  return requirements;
}

function inferRandomRange(text) {
  const match = /number(?: that is)?\s*(\d)[\u2013-](\d)/i.exec(text);
  if (match) {
    return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  }
  return null;
}

function parseCombatTable(doc) {
  const container = doc.querySelector('#crtable');
  if (!container) {
    throw new Error('Impossibile trovare la tabella dei risultati di combattimento.');
  }
  const table = container.closest('div').querySelector('table');
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const ratioBands = [
    { min: -Infinity, max: -11 },
    { min: -10, max: -9 },
    { min: -8, max: -7 },
    { min: -6, max: -5 },
    { min: -4, max: -3 },
    { min: -2, max: -1 },
    { min: 0, max: 0 },
    { min: 1, max: 2 },
    { min: 3, max: 4 },
    { min: 5, max: 6 },
    { min: 7, max: 8 },
    { min: 9, max: 10 },
    { min: 11, max: Infinity },
  ];
  const data = {};
  rows.forEach((row) => {
    const header = row.querySelector('th');
    const randomNumber = parseInt(header.textContent.trim(), 10);
    const cells = Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent.trim());
    data[randomNumber] = { cells, ratioBands };
  });
  return data;
}

function parseRandomNumberTable(doc) {
  const container = doc.querySelector('#random');
  if (!container) return [];
  const table = container.closest('div').querySelector('table');
  return Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent.trim()),
  );
}

function renderWizard() {
  const wizardState = {
    step: 0,
    combatRoll: null,
    enduranceRoll: null,
    disciplines: [],
    weaponskillWeapon: null,
    goldRoll: null,
    extraItemRoll: null,
    extraItem: null,
  };
  showWizardStep(wizardState);
}

function showWizardStep(wizardState) {
  DOM.wizard.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'wizard-step';
  if (wizardState.step === 0) {
    container.innerHTML = `
      <h2>Benvenuto, iniziato Kai</h2>
      <p>Segui la procedura guidata per generare il tuo personaggio secondo le regole originali.</p>
      <button type="button" class="primary">Inizia</button>
    `;
    container.querySelector('button').addEventListener('click', () => {
      wizardState.step = 1;
      showWizardStep(wizardState);
    });
  } else if (wizardState.step === 1) {
    container.innerHTML = `
      <h2>Tiro per la COMBAT SKILL</h2>
      <p>Estrai un numero casuale (0 vale zero) e aggiungi 10.</p>
      <button type="button" class="primary" id="roll-cs">Estrai numero</button>
      ${wizardState.combatRoll !== null ? `<p class="roll-display">Numero: ${wizardState.combatRoll} &rarr; COMBAT SKILL ${10 + wizardState.combatRoll}</p>` : ''}
    `;
    container.querySelector('#roll-cs').addEventListener('click', () => {
      wizardState.combatRoll = rollRandomNumber();
      addLog(`Tiro COMBAT SKILL: ${wizardState.combatRoll}`);
      showWizardStep(wizardState);
    });
    if (wizardState.combatRoll !== null) {
      const next = document.createElement('button');
      next.className = 'primary';
      next.textContent = 'Continua';
      next.addEventListener('click', () => {
        wizardState.step = 2;
        showWizardStep(wizardState);
      });
      container.appendChild(next);
    }
  } else if (wizardState.step === 2) {
    container.innerHTML = `
      <h2>Tiro per la ENDURANCE</h2>
      <p>Estrai un numero casuale e aggiungi 20.</p>
      <button type="button" class="primary" id="roll-endurance">Estrai numero</button>
      ${wizardState.enduranceRoll !== null ? `<p class="roll-display">Numero: ${wizardState.enduranceRoll} &rarr; ENDURANCE ${20 + wizardState.enduranceRoll}</p>` : ''}
    `;
    container.querySelector('#roll-endurance').addEventListener('click', () => {
      wizardState.enduranceRoll = rollRandomNumber();
      addLog(`Tiro ENDURANCE: ${wizardState.enduranceRoll}`);
      showWizardStep(wizardState);
    });
    if (wizardState.enduranceRoll !== null) {
      const next = document.createElement('button');
      next.className = 'primary';
      next.textContent = 'Continua';
      next.addEventListener('click', () => {
        wizardState.step = 3;
        showWizardStep(wizardState);
      });
      container.appendChild(next);
    }
  } else if (wizardState.step === 3) {
    container.innerHTML = `
      <h2>Scegli cinque Kai Disciplines</h2>
      <p>Seleziona esattamente cinque discipline da utilizzare nell'avventura.</p>
    `;
    const list = document.createElement('div');
    list.className = 'discipline-list';
    DISCIPLINES.forEach((discipline) => {
      const id = `discipline-${discipline.key.toLowerCase().replace(/\s+/g, '-')}`;
      const wrapper = document.createElement('label');
      wrapper.className = 'discipline-item';
      wrapper.innerHTML = `
        <input type="checkbox" id="${id}" value="${discipline.title}" ${
          wizardState.disciplines.includes(discipline.title) ? 'checked' : ''
        } />
        <strong>${discipline.title}</strong>
        <span>${discipline.description}</span>
      `;
      wrapper.querySelector('input').addEventListener('change', (event) => {
        if (event.target.checked) {
          if (wizardState.disciplines.length >= 5) {
            event.target.checked = false;
            addLog('Puoi scegliere solo cinque Discipline.');
            return;
          }
          wizardState.disciplines.push(discipline.title);
        } else {
          wizardState.disciplines = wizardState.disciplines.filter((name) => name !== discipline.title);
        }
      });
      list.appendChild(wrapper);
    });
    container.appendChild(list);
    const next = document.createElement('button');
    next.className = 'primary';
    next.textContent = 'Conferma Discipline';
    next.addEventListener('click', () => {
      if (wizardState.disciplines.length !== 5) {
        addLog('Devi selezionare esattamente cinque Discipline.');
        return;
      }
      wizardState.step = 4;
      showWizardStep(wizardState);
    });
    container.appendChild(next);
  } else if (wizardState.step === 4) {
    const hasWeaponskill = wizardState.disciplines.includes('Weaponskill');
    container.innerHTML = `
      <h2>Risorse iniziali</h2>
      <p>Tira per determinare le risorse trovate tra le rovine del monastero.</p>
      <div class="actions">
        <button type="button" class="primary" id="roll-gold">Tira per l'oro</button>
        ${wizardState.goldRoll !== null ? `<span class="roll-display">${wizardState.goldRoll} Corone</span>` : ''}
      </div>
      <div class="actions">
        <button type="button" class="primary" id="roll-item">Tira per l'oggetto</button>
        ${wizardState.extraItemRoll !== null ? `<span class="roll-display">${describeExtraItem(wizardState.extraItem)}</span>` : ''}
      </div>
      ${
        hasWeaponskill
          ? `<div class="actions">
               <button type="button" class="primary" id="roll-weaponskill">Tira arma di maestria</button>
               ${wizardState.weaponskillWeapon ? `<span class="roll-display">${wizardState.weaponskillWeapon}</span>` : ''}
             </div>`
          : ''
      }
    `;
    container.querySelector('#roll-gold').addEventListener('click', () => {
      wizardState.goldRoll = rollRandomNumber();
      addLog(`Oro iniziale: ${wizardState.goldRoll}`);
      showWizardStep(wizardState);
    });
    container.querySelector('#roll-item').addEventListener('click', () => {
      const roll = rollRandomNumber();
      wizardState.extraItemRoll = roll;
      wizardState.extraItem = EXTRA_ITEM_TABLE[roll];
      addLog(`Oggetto iniziale: ${describeExtraItem(wizardState.extraItem)} (tiro ${roll}).`);
      showWizardStep(wizardState);
    });
    if (hasWeaponskill) {
      container.querySelector('#roll-weaponskill').addEventListener('click', () => {
        const roll = rollRandomNumber();
        wizardState.weaponskillWeapon = WEAPONSKILL_WEAPONS[roll];
        addLog(`Arma di maestria: ${wizardState.weaponskillWeapon} (tiro ${roll}).`);
        showWizardStep(wizardState);
      });
    }
    if (
      wizardState.goldRoll !== null &&
      wizardState.extraItemRoll !== null &&
      (!hasWeaponskill || wizardState.weaponskillWeapon)
    ) {
      const next = document.createElement('button');
      next.className = 'primary';
      next.textContent = 'Riepilogo';
      next.addEventListener('click', () => {
        wizardState.step = 5;
        showWizardStep(wizardState);
      });
      container.appendChild(next);
    }
  } else if (wizardState.step === 5) {
    const combatSkill = 10 + wizardState.combatRoll;
    const endurance = 20 + wizardState.enduranceRoll;
    const summary = document.createElement('div');
    summary.innerHTML = `
      <h2>Riepilogo</h2>
      <ul>
        <li>COMBAT SKILL iniziale: ${combatSkill}</li>
        <li>ENDURANCE iniziale: ${endurance}</li>
        <li>Discipline: ${wizardState.disciplines.join(', ')}</li>
        <li>Oro: ${wizardState.goldRoll} Corone</li>
        <li>Oggetto trovato: ${describeExtraItem(wizardState.extraItem)}</li>
        ${wizardState.weaponskillWeapon ? `<li>Arma di maestria: ${wizardState.weaponskillWeapon}</li>` : ''}
      </ul>
      <button type="button" class="primary" id="start-adventure">Inizia l'avventura</button>
    `;
    summary.querySelector('#start-adventure').addEventListener('click', () => {
      finalizeCharacter(wizardState);
      DOM.wizard.hidden = true;
      DOM.game.hidden = false;
      goToSection(1);
    });
    container.appendChild(summary);
  }
  DOM.wizard.appendChild(container);
}

function describeExtraItem(item) {
  if (!item) return 'nessuno';
  switch (item.type) {
    case 'weapon':
      return `Arma: ${item.name}`;
    case 'special':
      return `${item.name} (+${item.endurance} ENDURANCE)`;
    case 'meal':
      return `${item.quantity} Pasti`;
    case 'potion':
      return `${item.name} (${item.effect})`;
    case 'gold':
      return `${item.amount} Corone d'oro`;
    default:
      return item.name ?? 'Oggetto speciale';
  }
}

function finalizeCharacter(wizardState) {
  const character = new Character();
  character.setBaseCombatSkill(10 + wizardState.combatRoll);
  character.setBaseEndurance(20 + wizardState.enduranceRoll);
  character.addWeapon('Axe');
  character.activeWeapon = 'Axe';
  character.addBackpackItem('Meal', 1, 'meal');
  character.addSpecialItem('Map of Sommerlund');
  character.gold = wizardState.goldRoll;
  wizardState.disciplines.forEach((discipline) => {
    character.setDiscipline(discipline);
  });
  if (character.flags.Weaponskill) {
    character.weaponSkillWeapon = wizardState.weaponskillWeapon ?? 'Axe';
  }
  applyExtraItem(character, wizardState.extraItem);
  state.character = character;
  renderCharacterPanel();
  addLog('Personaggio pronto per l\'avventura.');
}

function applyExtraItem(character, item) {
  if (!item) return;
  switch (item.type) {
    case 'weapon':
      if (character.addWeapon(item.name)) {
        addLog(`Hai trovato un\'arma aggiuntiva: ${item.name}.`);
      }
      break;
    case 'special':
      character.addSpecialItem(item.name);
      character.addPermanentEnduranceBonus(item.endurance);
      addLog(`${item.name}: ENDURANCE massima +${item.endurance}.`);
      break;
    case 'meal':
      character.addBackpackItem('Meal', item.quantity, 'meal');
      addLog(`Hai trovato ${item.quantity} pasti.`);
      break;
    case 'potion':
      character.addBackpackItem(item.name, 1, 'potion', { restore: 4 });
      addLog('Hai trovato una Pozione Curativa (ripristina 4 ENDURANCE dopo un combattimento).');
      break;
    case 'gold':
      character.addGold(item.amount);
      addLog(`Hai raccolto ${item.amount} Corone extra.`);
      break;
    default:
      break;
  }
}

function renderCharacterPanel() {
  const character = state.character;
  if (!character) {
    DOM.characterPanel.innerHTML = '<h2>Foglio del personaggio</h2><p>Nessun personaggio creato.</p>';
    return;
  }
  const meals = character.findBackpackItem('Meal')?.quantity ?? 0;
  DOM.characterPanel.innerHTML = `
    <h2>Foglio del personaggio</h2>
    <div class="stat-grid">
      <div class="stat-box"><strong>COMBAT SKILL</strong><br />${character.baseCombat} (base ${character.baseCombatSkill})</div>
      <div class="stat-box"><strong>ENDURANCE</strong><br />${character.currentEndurance} / ${character.maxEndurance}</div>
      <div class="stat-box"><strong>Oro</strong><br />${character.gold}</div>
      <div class="stat-box"><strong>Pasti</strong><br />${meals}</div>
    </div>
    <div class="inventory-group">
      <h3>Discipline Kai</h3>
      <ul>
        ${Array.from(character.disciplines).map((discipline) => `<li>${discipline}</li>`).join('')}
      </ul>
    </div>
    <div class="inventory-group">
      <h3>Armi</h3>
      <ul>
        ${
          character.weapons.length
            ? character.weapons
                .map(
                  (weapon) => `
                    <li>
                      <span>${weapon}${character.activeWeapon === weapon ? ' (impugnata)' : ''}</span>
                      <div>
                        <button type="button" class="secondary" data-action="equip-weapon" data-weapon="${weapon}">Impugna</button>
                        <button type="button" class="remove" data-action="drop-weapon" data-weapon="${weapon}">Scarta</button>
                      </div>
                    </li>
                  `,
                )
                .join('')
            : '<li>Nessuna arma</li>'
        }
      </ul>
    </div>
    <div class="inventory-group">
      <h3>Zaino (${character.backpackSlotsUsed()}/8)</h3>
      <ul>
        ${
          character.backpack.length
            ? character.backpack
                .map(
                  (item) => `
                    <li>
                      <span>${item.name} &times; ${item.quantity}</span>
                      <div>
                        ${item.type === 'potion' ? `<button type="button" class="secondary" data-action="use-potion" data-item="${item.name}">Usa</button>` : ''}
                        <button type="button" class="remove" data-action="drop-backpack" data-item="${item.name}">Scarta</button>
                      </div>
                    </li>
                  `,
                )
                .join('')
            : '<li>Zaino vuoto</li>'
        }
      </ul>
    </div>
    <div class="inventory-group">
      <h3>Oggetti speciali</h3>
      <ul>
        ${
          character.specialItems.length
            ? character.specialItems.map((item) => `<li>${item}</li>`).join('')
            : '<li>Nessuno</li>'
        }
      </ul>
    </div>
  `;
  DOM.characterPanel.querySelectorAll('button[data-action="equip-weapon"]').forEach((button) => {
    button.addEventListener('click', () => {
      const weapon = button.dataset.weapon;
      if (state.character.setActiveWeapon(weapon)) {
        addLog(`Ora impugni ${weapon}.`);
        renderCharacterPanel();
      }
    });
  });
  DOM.characterPanel.querySelectorAll('button[data-action="drop-weapon"]').forEach((button) => {
    button.addEventListener('click', () => {
      const weapon = button.dataset.weapon;
      state.character.removeWeapon(weapon);
      addLog(`Hai lasciato cadere ${weapon}.`);
      renderCharacterPanel();
    });
  });
  DOM.characterPanel.querySelectorAll('button[data-action="use-potion"]').forEach((button) => {
    button.addEventListener('click', () => {
      useHealingPotion(button.dataset.item);
    });
  });
  DOM.characterPanel.querySelectorAll('button[data-action="drop-backpack"]').forEach((button) => {
    button.addEventListener('click', () => {
      const itemName = button.dataset.item;
      if (state.character.removeBackpackItem(itemName)) {
        addLog(`Hai scartato ${itemName}.`);
        renderCharacterPanel();
      }
    });
  });
}

function useHealingPotion(itemName) {
  const character = state.character;
  const item = character.findBackpackItem(itemName);
  if (!item || item.type !== 'potion') {
    addLog('Non hai questa pozione.');
    return;
  }
  const restore = item.metadata?.restore ?? 4;
  character.removeBackpackItem(itemName);
  character.modifyEndurance(restore);
  addLog(`Pozione curativa usata: +${restore} ENDURANCE (ora ${character.currentEndurance}/${character.maxEndurance}).`);
  renderCharacterPanel();
}

function rollRandomNumber() {
  const value = Math.floor(Math.random() * 10);
  state.pendingRandomRoll = value;
  addLog(`Numero casuale estratto: ${value}`);
  return value;
}

function goToSection(sectionId) {
  const section = state.sections.get(sectionId);
  if (!section) {
    addLog(`Sezione ${sectionId} non trovata.`);
    return;
  }
  applyHealingDiscipline();
  applyImmediateEffects(section);
  state.currentSectionId = sectionId;
  state.history.push(sectionId);
  DOM.sectionHeader.innerHTML = `<h2>Sezione ${sectionId}</h2>`;
  renderSectionContent(section);
  renderCombatPanel(section);
  renderChoices(section);
  renderSectionActions(section);
  renderCharacterPanel();
}

function applyHealingDiscipline() {
  const character = state.character;
  if (!character?.flags.Healing) return;
  if (!state.lastSectionHadCombat && state.history.length > 0 && character.currentEndurance < character.maxEndurance) {
    character.modifyEndurance(1);
    addLog(`Healing: recuperi 1 ENDURANCE (${character.currentEndurance}/${character.maxEndurance}).`);
  }
}

function applyImmediateEffects(section) {
  state.lastSectionHadCombat = section.combats.length > 0;
  section.immediateEffects.forEach((effect) => {
    if (effect.type === 'endurance') {
      if (effect.conditionDiscipline && state.character.flags[effect.conditionDiscipline]) {
        addLog(`Effetto evitato grazie a ${effect.conditionDiscipline}.`);
        return;
      }
      state.character.modifyEndurance(effect.value);
      if (effect.value < 0) {
        addLog(`Perdi ${Math.abs(effect.value)} ENDURANCE (ora ${state.character.currentEndurance}/${state.character.maxEndurance}).`);
      } else if (effect.value > 0) {
        addLog(`Recuperi ${effect.value} ENDURANCE (ora ${state.character.currentEndurance}/${state.character.maxEndurance}).`);
      }
    } else if (effect.type === 'permanentCombat') {
      state.character.addPermanentCombatBonus(effect.value);
      addLog(`COMBAT SKILL permanente ${effect.value > 0 ? '+' : ''}${effect.value}.`);
    } else if (effect.type === 'permanentEndurance') {
      state.character.addPermanentEnduranceBonus(effect.value);
      addLog(`ENDURANCE massima ${effect.value > 0 ? '+' : ''}${effect.value}.`);
    }
  });
}

function renderSectionContent(section) {
  DOM.sectionContent.innerHTML = section.content
    .map((block) => {
      if (block.className === 'deadend') {
        return `<p class="deadend">${block.text}</p>`;
      }
      return block.html;
    })
    .join('');
  if (section.death) {
    DOM.choicePanel.innerHTML = '';
    DOM.combatPanel.innerHTML = '';
    DOM.sectionActions.innerHTML = '<p class="deadend">L\'avventura termina qui.</p>';
  }
}

function renderChoices(section) {
  if (section.death) return;
  DOM.choicePanel.innerHTML = '';
  section.choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.innerHTML = `<span>${choice.text}</span>`;
    const unmet = evaluateChoiceRequirements(choice);
    if (unmet.length > 0) {
      button.disabled = true;
      button.innerHTML += `<small class="requirement-warning">${unmet.join(' | ')}</small>`;
    } else if (choice.randomRange && state.pendingRandomRoll !== null) {
      if (state.pendingRandomRoll < choice.randomRange.min || state.pendingRandomRoll > choice.randomRange.max) {
        button.disabled = true;
        button.innerHTML += '<small class="requirement-warning">Numero non valido</small>';
      }
    }
    button.addEventListener('click', () => {
      state.pendingRandomRoll = null;
      goToSection(choice.target);
    });
    DOM.choicePanel.appendChild(button);
  });
}

function evaluateChoiceRequirements(choice) {
  const unmet = [];
  const character = state.character;
  choice.requirements.forEach((requirement) => {
    if (requirement.type === 'discipline') {
      if (!character.disciplines.has(requirement.value)) {
        unmet.push(`Richiede ${requirement.value}`);
      }
    } else if (requirement.type === 'item') {
      if (
        !character.backpack.some((item) => item.name === requirement.value) &&
        !character.weapons.includes(requirement.value) &&
        !character.specialItems.includes(requirement.value)
      ) {
        unmet.push(`Richiede ${requirement.value}`);
      }
    } else if (requirement.type === 'specialItem') {
      if (!character.specialItems.includes(requirement.value)) {
        unmet.push(`Richiede ${requirement.value}`);
      }
    }
  });
  return unmet;
}

function renderCombatPanel(section) {
  if (section.combats.length === 0) {
    DOM.combatPanel.innerHTML = '';
    state.lastSectionHadCombat = false;
    return;
  }
  const enemyRows = section.combats
    .map(
      (enemy, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${enemy.name}</td>
          <td>${enemy.combatSkill}</td>
          <td>${enemy.endurance}</td>
        </tr>
      `,
    )
    .join('');
  const modifierInfo = section.combatModifiers.length
    ? `<p>Modificatori: ${section.combatModifiers
        .map((mod) => `${mod.value > 0 ? '+' : ''}${mod.value} CS (${mod.scope})${mod.disciplineExemption ? ' salvo ' + mod.disciplineExemption : ''}`)
        .join('; ')}</p>`
    : '';
  const immuneMindblast = section.flags.enemyImmuneMindblast ? '<p>I nemici sono immuni alla Mindblast.</p>' : '';
  DOM.combatPanel.innerHTML = `
    <h3>Combattimento</h3>
    <table>
      <thead>
        <tr><th>#</th><th>Nemico</th><th>COMBAT SKILL</th><th>ENDURANCE</th></tr>
      </thead>
      <tbody>${enemyRows}</tbody>
    </table>
    ${modifierInfo}
    ${immuneMindblast}
    <button type="button" class="primary" id="start-combat">Risolvi combattimento</button>
    <div id="combat-log"></div>
  `;
  DOM.combatPanel.querySelector('#start-combat').addEventListener('click', () => {
    startCombat(section);
  });
}

function renderSectionActions(section) {
  if (section.requiresRandom) {
    DOM.sectionActions.innerHTML = `
      <p>${section.randomPrompt}</p>
      <button type="button" class="primary" id="roll-random">Estrai numero</button>
      ${state.pendingRandomRoll !== null ? `<span class="roll-display">Ultimo risultato: ${state.pendingRandomRoll}</span>` : ''}
    `;
    DOM.sectionActions.querySelector('#roll-random').addEventListener('click', () => {
      const value = rollRandomNumber();
      renderSectionActions(section);
      autoSelectRandomChoice(section, value);
    });
  } else {
    DOM.sectionActions.innerHTML = '';
  }
}

function autoSelectRandomChoice(section, value) {
  const matching = section.choices.filter((choice) => {
    if (!choice.randomRange) return false;
    return value >= choice.randomRange.min && value <= choice.randomRange.max;
  });
  if (matching.length === 1 && evaluateChoiceRequirements(matching[0]).length === 0) {
    setTimeout(() => goToSection(matching[0].target), 400);
  }
}

function startCombat(section) {
  const combatLog = DOM.combatPanel.querySelector('#combat-log');
  combatLog.innerHTML = '';
  const character = state.character;
  let currentEndurance = character.currentEndurance;
  const results = [];
  for (let index = 0; index < section.combats.length; index += 1) {
    const enemy = { ...section.combats[index] };
    const enemyResult = resolveCombat({
      heroEndurance: currentEndurance,
      enemy,
      section,
    });
    results.push(enemyResult);
    currentEndurance = enemyResult.heroEndurance;
    if (enemyResult.heroDead) {
      break;
    }
  }
  character.currentEndurance = currentEndurance;
  renderCharacterPanel();
  results.forEach((result, index) => {
    const block = document.createElement('div');
    block.className = 'combat-result';
    block.innerHTML = `
      <h4>Scontro ${index + 1}: ${section.combats[index].name}</h4>
      <p>Esito: ${result.heroDead ? 'Lone Wolf caduto' : result.enemyDead ? 'Nemico sconfitto' : 'Combattimento interrotto'}</p>
      <ul>${result.rounds
        .map(
          (round, roundIndex) => `
            <li>Round ${roundIndex + 1}: numero ${round.random} &mdash; Nemico ${round.enemyLoss}${round.enemyKilled ? ' (ucciso)' : ''}, Lone Wolf ${round.heroLoss}${round.heroKilled ? ' (ucciso)' : ''}</li>
          `,
        )
        .join('')}</ul>
    `;
    combatLog.appendChild(block);
  });
  if (currentEndurance <= 0) {
    addLog('Lone Wolf \u00e8 stato sconfitto in combattimento.');
  } else {
    addLog(`Combattimento terminato. ENDURANCE attuale: ${character.currentEndurance}/${character.maxEndurance}.`);
  }
}

function resolveCombat({ heroEndurance, enemy, section }) {
  const character = state.character;
  const rounds = [];
  let heroDead = false;
  let enemyDead = false;
  let roundIndex = 0;
  let enemyEndurance = enemy.endurance;
  const immuneMindblast = section.flags.enemyImmuneMindblast;
  while (heroEndurance > 0 && enemyEndurance > 0) {
    const ratio = computeCombatRatio({ enemy, section, roundIndex, immuneMindblast });
    const random = rollRandomNumber();
    const result = getCombatResult(random, ratio);
    const enemyLoss = result.enemyKilled ? enemyEndurance : Math.min(result.enemyLoss, enemyEndurance);
    const heroLoss = result.heroKilled ? heroEndurance : Math.min(result.heroLoss, heroEndurance);
    enemyEndurance -= enemyLoss;
    heroEndurance -= heroLoss;
    rounds.push({ random, enemyLoss, heroLoss, enemyKilled: result.enemyKilled, heroKilled: result.heroKilled });
    if (heroEndurance <= 0 || result.heroKilled) {
      heroDead = true;
      break;
    }
    if (enemyEndurance <= 0 || result.enemyKilled) {
      enemyDead = true;
      break;
    }
    roundIndex += 1;
  }
  return { heroEndurance: Math.max(heroEndurance, 0), heroDead, enemyDead, rounds };
}

function computeCombatRatio({ enemy, section, roundIndex, immuneMindblast }) {
  const character = state.character;
  let heroSkill = character.baseCombat;
  heroSkill += character.getWeaponSkillBonus();
  heroSkill += character.getWeaponMalus();
  if (character.flags.Mindblast && !immuneMindblast) {
    heroSkill += 2;
  }
  section.combatModifiers.forEach((modifier) => {
    const applicable =
      modifier.scope === 'fight' ||
      (modifier.scope === 'first-round' && roundIndex === 0) ||
      (modifier.scope === 'second-and-subsequent' && roundIndex >= 1);
    if (applicable) {
      if (modifier.disciplineExemption && character.flags[modifier.disciplineExemption]) {
        return;
      }
      heroSkill += modifier.value;
    }
  });
  return heroSkill - enemy.combatSkill;
}

function getCombatResult(randomNumber, ratio) {
  const table = state.combatTable[randomNumber];
  if (!table) {
    throw new Error(`Risultato di combattimento mancante per il numero casuale ${randomNumber}`);
  }
  const columnIndex = table.ratioBands.findIndex((band) => ratio >= band.min && ratio <= band.max);
  const entry = table.cells[columnIndex] ?? '0/0';
  const [enemyLossText, heroLossText] = entry.split('/');
  return {
    enemyLoss: enemyLossText === 'k' ? 999 : parseInt(enemyLossText, 10),
    heroLoss: heroLossText === 'k' ? 999 : parseInt(heroLossText, 10),
    enemyKilled: enemyLossText === 'k',
    heroKilled: heroLossText === 'k',
  };
}
