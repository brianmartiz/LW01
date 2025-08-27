// Stato globale dell'eroe
let state = {
    combatSkill: 0,
    endurance: 0,
    maxEndurance: 0,
    disciplines: [],
    meals: 0,
    crowns: 0,
    backpack: [],
    currentSection: null
};

// Oggetto per memorizzare i contenuti delle sezioni del libro
let sections = {};

// Carica e parse del file HTML del libro
async function loadBook() {
    const res = await fetch('01fftd.htm');
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    // Trova tutte le intestazioni <h3> con id "sectX"
    const headers = doc.querySelectorAll('h3 > a[id^="sect"]');
    headers.forEach(h3 => {
        const id = h3.id.replace('sect', '');
        let contentHtml = '';
        let node = h3.parentElement.nextElementSibling;
        // Concatena il testo fino alla prossima sezione (<h3> o <h2>)
        while(node && !(node.matches('h3') || node.matches('h2'))) {
            if (node.classList.contains('choice') || node.classList.contains('combat')) {
                contentHtml += node.outerHTML;
            } else {
                // Normale paragrafo di testo
                contentHtml += `<p>${node.textContent}</p>`;
            }
            node = node.nextElementSibling;
        }
        sections[id] = contentHtml;
    });
}

// Visualizza una sezione in base all’ID
function showSection(id) {
    const area = document.getElementById('gameArea');
    area.innerHTML = '';
    state.currentSection = id;

    const html = sections[id];
    if (!html) {
        area.innerHTML = '<p>Sezione non trovata.</p>';
        return;
    }
    // Crea un elemento DOM per il contenuto
    const container = document.createElement('div');
    container.innerHTML = html;
    area.appendChild(container);

    // Aggiunge event listener per le scelte (<a> all’interno di .choice)
    area.querySelectorAll('.choice a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = e.target.getAttribute('href');
            if (href.startsWith('#sect')) {
                const nextId = href.replace('#sect', '');
                navigateTo(nextId);
            }
        });
    });

    // Gestisce condizioni speciali nel testo corrente
    area.querySelectorAll('.choice').forEach(p => {
        const text = p.textContent;
        const link = p.querySelector('a');
        // Se una scelta richiede una disciplina Kai
        if (text.includes('Kai Discipline')) {
            const parts = text.split('Discipline of ');
            if (parts.length > 1) {
                const disc = parts[1].split(',')[0].trim();
                if (!state.disciplines.includes(disc)) {
                    p.style.display = 'none'; // Nasconde opzione inaccessibile
                }
            }
        }
        // Gestione pasti: quando il testo dice "must eat a Meal"
        if (text.match(/eat a Meal/i) || text.match(/must stop to eat/i)) {
            if (!state.disciplines.includes('Hunting')) {
                if (state.meals > 0) {
                    state.meals--;
                    alert('Consumi un pasto. Pasti rimasti: ' + state.meals);
                } else {
                    state.endurance -= 3;
                    alert('Non hai cibo! Perdi 3 punti di Endurance.');
                }
            }
        }
    });

    // Controlla se ci sono paragrafi di combattimento
    const combatParas = container.querySelectorAll('.combat');
    if (combatParas.length > 0) {
        showCombat(combatParas);
    }
}

// Naviga a una nuova sezione
function navigateTo(id) {
    showSection(id);
}

// Mostra il combattimento a turni per i paragrafi dati
function showCombat(combatParas) {
    const modal = document.getElementById('combatModal');
    const log = document.getElementById('combatLog');
    const startBtn = document.getElementById('startFightBtn');
    modal.classList.remove('hidden');
    log.innerHTML = '';
    
    // Costruisce la lista dei nemici dal testo
    const enemies = [];
    combatParas.forEach(p => {
        const parts = p.textContent.split('COMBAT SKILL');
        const name = parts[0].replace(':', '').trim();
        const stats = parts[1].split('ENDURANCE');
        const cs = parseInt(stats[0]);
        const end = parseInt(stats[1]);
        enemies.push({name: name, cs: cs, end: end});
    });

    let enemyIndex = 0;
    let enemy = enemies[0];

    startBtn.onclick = () => {
        startBtn.disabled = true;
        fightRound(enemy, () => {
            if (state.endurance <= 0) {
                log.innerHTML += `<p>Sei stato sconfitto... FINE DEL GIOCO.</p>`;
                modal.classList.add('hidden');
                return;
            }
            // Se il nemico corrente è morto
            log.innerHTML += `<p>Hai sconfitto ${enemy.name}!</p>`;
            enemyIndex++;
            if (enemyIndex < enemies.length) {
                enemy = enemies[enemyIndex];
                setTimeout(() => {
                    log.innerHTML += `<p>Un nuovo nemico appare: ${enemy.name}!</p>`;
                    startBtn.disabled = false;
                }, 1000);
            } else {
                // Tutti i nemici sconfitti
                modal.classList.add('hidden');
            }
        });
    };
}

// Risolve un round di combattimento (con semplificazione delle regole originali)
function fightRound(enemy, onComplete) {
    const log = document.getElementById('combatLog');
    const heroCS = state.combatSkill;
    const enemyCS = enemy.cs;
    const interval = setInterval(() => {
        if (state.endurance <= 0 || enemy.end <= 0) {
            clearInterval(interval);
            onComplete();
            return;
        }
        const heroRoll = Math.floor(Math.random() * 10);
        const enemyRoll = Math.floor(Math.random() * 10);
        const heroTotal = heroCS + heroRoll;
        const enemyTotal = enemyCS + enemyRoll;
        if (heroTotal > enemyTotal) {
            const dmg = (heroRoll <= 1) ? 4 : 2;
            enemy.end -= dmg;
            log.innerHTML += `<p>Lupo colpisce ${enemy.name} per ${dmg} punti danno. (${enemy.name} Endurance: ${enemy.end})</p>`;
        } else if (enemyTotal > heroTotal) {
            const dmg = (enemyRoll <= 1) ? 4 : 2;
            state.endurance -= dmg;
            log.innerHTML += `<p>${enemy.name} colpisce il Lupo per ${dmg} punti danno. (Lupo Endurance: ${state.endurance})</p>`;
        } else {
            state.endurance -= 1;
            enemy.end -= 1;
            log.innerHTML += `<p>Pareggio! Entrambi subiscono 1 danno (Lupo: ${state.endurance}, ${enemy.name}: ${enemy.end})</p>`;
        }
    }, 1000);
}

// Pulsanti Salva/Carica dal localStorage
document.getElementById('saveBtn').addEventListener('click', () => {
    localStorage.setItem('loneWolfSave', JSON.stringify(state));
    alert('Progresso salvato.');
});
document.getElementById('loadBtn').addEventListener('click', () => {
    const data = localStorage.getItem('loneWolfSave');
    if (data) {
        state = JSON.parse(data);
        alert('Progresso caricato.');
        if (state.currentSection) {
            showSection(state.currentSection);
        }
    } else {
        alert('Nessun salvataggio trovato.');
    }
});

// Toggle tema chiaro/scuro
document.getElementById('themeToggle').addEventListener('change', (e) => {
    document.body.classList.toggle('dark-mode');
});

// *** Logica del wizard iniziale ***

// Tiro automatico dei valori
document.getElementById('autoRollBtn').addEventListener('click', () => {
    state.combatSkill = Math.floor(Math.random() * 10) + 10;
    state.endurance = Math.floor(Math.random() * 10) + 20;
    state.maxEndurance = state.endurance;
    state.meals = 1;
    state.crowns = Math.floor(Math.random() * 10);
    document.getElementById('csVal').textContent = state.combatSkill;
    document.getElementById('endVal').textContent = state.endurance;
    document.getElementById('statResult').classList.remove('hidden');
    document.getElementById('autoRollBtn').disabled = true;
    document.getElementById('manualRollBtn').disabled = true;
});
// Scelta manuale valori
document.getElementById('manualRollBtn').addEventListener('click', () => {
    document.getElementById('manualRollSection').classList.remove('hidden');
    document.getElementById('autoRollBtn').disabled = true;
    document.getElementById('manualRollBtn').disabled = true;
});
document.getElementById('confirmCSBtn').addEventListener('click', () => {
    const val = parseInt(document.getElementById('csInput').value);
    if (val >= 0 && val <= 9) {
        state.combatSkill = val + 10;
        document.getElementById('csVal').textContent = state.combatSkill;
        document.getElementById('confirmCSBtn').disabled = true;
        document.getElementById('csInput').disabled = true;
    }
});
document.getElementById('confirmEndBtn').addEventListener('click', () => {
    const val = parseInt(document.getElementById('endInput').value);
    if (val >= 0 && val <= 9) {
        state.endurance = val + 20;
        state.maxEndurance = state.endurance;
        state.meals = 1;
        state.crowns = Math.floor(Math.random() * 10);
        document.getElementById('endVal').textContent = state.endurance;
        document.getElementById('confirmEndBtn').disabled = true;
        document.getElementById('endInput').disabled = true;
        document.getElementById('statResult').classList.remove('hidden');
    }
});
document.getElementById('chooseDisciplinesBtn').addEventListener('click', () => {
    document.getElementById('disciplinesSection').classList.remove('hidden');
});
document.getElementById('finishWizardBtn').addEventListener('click', () => {
    const checked = document.querySelectorAll('#disciplinesSection input[type=checkbox]:checked');
    if (checked.length !== 5) {
        alert('Seleziona esattamente 5 discipline.');
        return;
    }
    checked.forEach(ch => state.disciplines.push(ch.value));
    // Riepilogo eroe
    let summary = `Combat Skill: ${state.combatSkill}\n`;
    summary += `Endurance: ${state.endurance}\n`;
    summary += `Discipline: ${state.disciplines.join(', ')}\n`;
    summary += `Pasti: ${state.meals}, Corone: ${state.crowns}\n`;
    document.getElementById('summaryText').textContent = summary;
    document.getElementById('wizard').classList.add('hidden');
    document.getElementById('heroSummary').classList.remove('hidden');
});
document.getElementById('startGameBtn').addEventListener('click', () => {
    document.getElementById('heroSummary').classList.add('hidden');
    showSection('1'); // Inizia dalla sezione 1
});

// Avvia caricamento del libro quando la pagina è pronta
window.addEventListener('load', () => {
    loadBook();
    // Mostra il wizard iniziale
    document.getElementById('wizard').classList.remove('hidden');
});