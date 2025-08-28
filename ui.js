import { ALL_DISCIPLINES, WEAPON_SKILL_MAP, BONUS_ITEMS, RANDOM_TABLE } from '../data/rules.js';

export class UIController {
    constructor(engine) {
        this.engine = engine;
        this.dom = {
            startScreen: document.getElementById('start-screen'),
            charCreationScreen: document.getElementById('character-creation-screen'),
            gameScreen: document.getElementById('game-screen'),
            combatScreen: document.getElementById('combat-screen'),
            sectionText: document.getElementById('section-text'),
            sectionImage: document.getElementById('section-image-container'),
            choices: document.getElementById('choices'),
            // Sidebar elements
            playerCS: document.getElementById('player-cs'),
            playerEnd: document.getElementById('player-end'),
            playerMaxEnd: document.getElementById('player-max-end'),
            enduranceBar: document.getElementById('endurance-bar'),
            playerDisciplines: document.getElementById('player-disciplines'),
            playerGold: document.getElementById('player-gold'),
            playerWeapons: document.getElementById('player-weapons'),
            playerBackpack: document.getElementById('player-backpack'),
            backpackCount: document.getElementById('backpack-count'),
            playerSpecialItems: document.getElementById('player-special-items'),
            playerMeals: document.getElementById('player-meals'),
            // Combat elements
            combatTitle: document.getElementById('combat-title'),
            combatPlayerCS: document.getElementById('combat-player-cs'),
            combatPlayerEnd: document.getElementById('combat-player-end'),
            combatEnemyName: document.getElementById('combat-enemy-name'),
            combatEnemyCS: document.getElementById('combat-enemy-cs'),
            combatEnemyEnd: document.getElementById('combat-enemy-end'),
            combatLog: document.getElementById('combat-log'),
            fightButton: document.getElementById('fight-button'),
            evadeButton: document.getElementById('evade-button'),
            // Random table
            randomNumberTable: document.getElementById('random-number-table'),
            randomGrid: document.getElementById('random-grid'),
        };
        this.creationSteps =;
        this.creationState = {};
    }

    showScreen(screenId) {
        ['start-screen', 'character-creation-screen', 'game-screen', 'combat-screen'].forEach(id => {
            this.dom.classList.add('hidden');
        });
        document.getElementById(screenId).classList.remove('hidden');
    }

    hideScreen(screenId) {
        document.getElementById(screenId).classList.add('hidden');
    }
    
    // Character Creation Flow
    showCharacterCreation(bookId) {
        this.creationState = { bookId, step: 0, stats: {}, disciplines: };
        this.showScreen('character-creation-screen');
        this.hideScreen('start-screen');
        this.renderCreationStep();
    }

    renderCreationStep() {
        if (this.creationState.step < this.creationSteps.length) {
            this.creationSteps();
        } else {
            this.engine.finalizeCharacterCreation(this.creationState.bookId, this.creationState.stats, this.creationState.disciplines);
        }
    }
    
    nextCreationStep() {
        this.creationState.step++;
        this.renderCreationStep();
    }
    
    async pickRandomNumber() {
        return new Promise(resolve => {
            this.dom.randomNumberTable.classList.remove('hidden');
            this.dom.randomGrid.innerHTML = '';
            RANDOM_TABLE.flat().forEach(num => {
                const cell = document.createElement('div');
                cell.className = 'random-cell';
                cell.textContent = num;
                cell.onclick = () => {
                    this.dom.randomNumberTable.classList.add('hidden');
                    resolve(num);
                };
                this.dom.randomGrid.appendChild(cell);
            });
        });
    }

    async createCSStep() {
        this.dom.charCreationScreen.innerHTML = `
            <div class="creation-step">
                <h2>Passo 1: Determina la tua Combattività</h2>
                <p>Usa la Tabella del Destino per determinare la tua abilità in combattimento. Aggiungeremo 10 al numero che sceglierai.</p>
                <button id="roll-cs-btn" class="menu-button">Scegli dalla Tabella del Destino</button>
            </div>`;
        document.getElementById('roll-cs-btn').onclick = async () => {
            const roll = await this.pickRandomNumber();
            this.creationState.stats.combatSkill = 10 + roll;
            this.nextCreationStep();
        };
    }

    async createEnduranceStep() {
        this.dom.charCreationScreen.innerHTML = `
            <div class="creation-step">
                <h2>Passo 2: Determina la tua Resistenza</h2>
                <p>La tua Combattività è: ${this.creationState.stats.combatSkill}.</p>
                <p>Ora usa di nuovo la Tabella del Destino per la tua Resistenza. Aggiungeremo 20 al numero scelto.</p>
                <button id="roll-end-btn" class="menu-button">Scegli dalla Tabella del Destino</button>
            </div>`;
        document.getElementById('roll-end-btn').onclick = async () => {
            const roll = await this.pickRandomNumber();
            this.creationState.stats.endurance = 20 + roll;
            this.nextCreationStep();
        };
    }

    createDisciplineStep() {
        let disciplineHTML = ALL_DISCIPLINES.map(d => `
            <li>
                <label>
                    <input type="checkbox" name="discipline" value="${d.name}">
                    <strong>${d.name}:</strong> ${d.description}
                </label>
            </li>`).join('');

        this.dom.charCreationScreen.innerHTML = `
            <div class="creation-step">
                <h2>Passo 3: Scegli le tue Arti Ramas</h2>
                <p>Hai imparato 5 delle 10 Arti. Sceglile con cura.</p>
                <ul class="discipline-list">${disciplineHTML}</ul>
                <button id="confirm-disciplines-btn" class="menu-button">Conferma Arti</button>
            </div>`;

        document.getElementById('confirm-disciplines-btn').onclick = async () => {
            const checked = document.querySelectorAll('input[name="discipline"]:checked');
            if (checked.length!== 5) {
                alert('Devi scegliere esattamente 5 Arti Ramas.');
                return;
            }
            this.creationState.disciplines = Array.from(checked).map(cb => cb.value);
            
            if (this.creationState.disciplines.includes('Scherma')) {
                const roll = await this.pickRandomNumber();
                const weapon = WEAPON_SKILL_MAP[roll];
                const index = this.creationState.disciplines.indexOf('Scherma');
                this.creationState.disciplines[index] = `Scherma in ${weapon}`;
                alert(`La tua Arte della Scherma è con: ${weapon}`);
            }
            this.nextCreationStep();
        };
    }
    
    async createEquipmentStep() {
        const player = new Player(this.creationState.stats, this.creationState.disciplines, this.creationState.bookId);
        player.addItem({name: 'Ascia', type: 'Weapon'});
        player.addItem({name: 'Mappa di Sommerlund', type: 'SpecialItem'});
        player.addItem({name: 'Pasto', type: 'Meal', quantity: 1});
        
        const goldRoll = await this.pickRandomNumber();
        player.addItem({type: 'Gold', quantity: goldRoll});

        const itemRoll = await this.pickRandomNumber();
        const bonusItem = BONUS_ITEMS;
        player.addItem(bonusItem);
        
        this.creationState.player = player;
        this.nextCreationStep();
    }
    
    createSummaryStep() {
        const p = this.creationState.player;
        this.dom.charCreationScreen.innerHTML = `
            <div class="creation-step">
                <h2>Riepilogo del Personaggio</h2>
                <p><strong>Combattività:</strong> ${p.combatSkill}</p>
                <p><strong>Resistenza:</strong> ${p.currentEndurance}</p>
                <p><strong>Arti Ramas:</strong> ${p.disciplines.join(', ')}</p>
                <p><strong>Equipaggiamento:</strong> ${p.weapons.join(', ')}, ${p.backpack.join(', ')}, ${p.specialItems.join(', ')}</p>
                <p><strong>Corone:</strong> ${p.gold}</p>
                <p><strong>Pasti:</strong> ${p.meals}</p>
                <button id="start-adventure-btn" class="menu-button">Inizia l'Avventura!</button>
            </div>`;
        document.getElementById('start-adventure-btn').onclick = () => {
            this.engine.player = this.creationState.player;
            this.engine.finalizeCharacterCreation(this.creationState.bookId, this.creationState.stats, this.creationState.disciplines);
        };
    }
    
    // Game Screen Rendering
    renderSection(section) {
        this.showScreen('game-screen');
        this.hideScreen('combat-screen');
        this.dom.sectionText.innerHTML = section.text;
        
        if (section.image) {
            this.dom.sectionImage.innerHTML = `<img src="img/${section.image}" alt="Illustrazione per la sezione ${section.id}">`;
        } else {
            this.dom.sectionImage.innerHTML = '';
        }

        this.dom.choices.innerHTML = '';
        
        if (section.skillCheck && this.engine.player.hasDiscipline(section.skillCheck.discipline)) {
            this.addChoice(section.skillCheck.choice);
        }

        if (section.choices) {
            section.choices.forEach(choice => this.addChoice(choice));
        }
        
        if (section.randomCheck) {
            this.addRandomChoice(section.randomCheck);
        }
    }

    addChoice(choice) {
        const button = document.createElement('button');
        button.className = 'choice-button';
        button.innerHTML = choice.text;
        button.onclick = () => this.engine.goToSection(choice.target);
        this.dom.choices.appendChild(button);
    }
    
    addRandomChoice(randomCheck) {
        const button = document.createElement('button');
        button.className = 'choice-button';
        button.innerHTML = randomCheck.text |

| "Tenta la sorte...";
        button.onclick = async () => {
            const roll = await this.pickRandomNumber();
            for (const option of randomCheck.choices) {
                if (roll >= option.range && roll <= option.range) {
                    this.engine.goToSection(option.target);
                    return;
                }
            }
        };
        this.dom.choices.appendChild(button);
    }
    
    renderPostCombatChoices(escapeOptions) {
        this.dom.choices.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = "Hai sconfitto il nemico. Ora devi decidere come procedere.";
        this.dom.choices.appendChild(p);
        
        if (escapeOptions.type === "RANDOM") {
            this.addRandomChoice({text: "Scendi dall'altro lato della collina.", choices: escapeOptions.choices});
        }
    }

    updateAll(player) {
        this.dom.playerCS.textContent = player.combatSkill;
        this.dom.playerEnd.textContent = player.currentEndurance;
        this.dom.playerMaxEnd.textContent = player.maxEndurance;
        const endurancePercentage = (player.currentEndurance / player.maxEndurance) * 100;
        this.dom.enduranceBar.style.width = `${endurancePercentage}%`;
        
        this.dom.playerDisciplines.innerHTML = player.disciplines.map(d => `<li>${d}</li>`).join('');
        this.dom.playerGold.textContent = player.gold;
        this.dom.playerWeapons.innerHTML = player.weapons.map(w => `<li>${w}</li>`).join('');
        this.dom.playerBackpack.innerHTML = player.backpack.map(i => `<li>${i}</li>`).join('');
        this.dom.backpackCount.textContent = player.backpack.length;
        this.dom.playerSpecialItems.innerHTML = player.specialItems.map(i => `<li>${i}</li>`).join('');
        this.dom.playerMeals.textContent = player.meals;
    }

    logMessage(message) {
        // For now, just an alert. A better UI would have a message area.
        alert(message);
    }
}
