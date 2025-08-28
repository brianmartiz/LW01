import { Player } from './character.js';
import { UIController } from './ui.js';
import { CombatManager } from './combat.js';

export class GameEngine {
    constructor(gameData) {
        this.gameData = gameData;
        this.player = null;
        this.ui = new UIController(this);
        this.combatManager = null;
    }

    startNewGame(bookId) {
        this.ui.showCharacterCreation(bookId);
    }

    finalizeCharacterCreation(bookId, stats, disciplines) {
        this.player = new Player(stats, disciplines, bookId);
        this.ui.showScreen('game-screen');
        this.ui.hideScreen('character-creation-screen');
        this.goToSection(1);
    }

    saveGame() {
        if (this.player) {
            localStorage.setItem('loneWolfSaveData', JSON.stringify(this.player));
            alert('Partita salvata!');
        }
    }

    loadGame() {
        const savedData = localStorage.getItem('loneWolfSaveData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            this.player = new Player({},, 1); // Create a dummy player
            Object.assign(this.player, parsedData); // Assign saved properties
            
            this.ui.showScreen('game-screen');
            this.ui.hideScreen('start-screen');
            this.goToSection(this.player.currentSection);
            alert('Partita caricata!');
        } else {
            alert('Nessuna partita salvata trovata.');
        }
    }

    goToSection(sectionId) {
        if (this.combatManager && this.combatManager.isActive) return;

        const currentBookData = this.gameData[this.player.bookId];
        const section = currentBookData.sections.find(s => s.id === sectionId);
        
        if (!section) {
            console.error(`Sezione ${sectionId} non trovata!`);
            return;
        }

        this.player.currentSection = sectionId;

        // Passive healing check
        if (this.player.hasDiscipline('Guarigione') && this.player.currentEndurance < this.player.maxEndurance) {
            this.player.updateEndurance(1);
        }

        this.ui.renderSection(section);
        this.handleSectionEvent(section.event);

        if (section.combat) {
            this.startCombat(section.combat);
        } else {
            this.ui.updateAll(this.player);
            this.saveGame();
        }
    }

    handleSectionEvent(event) {
        if (!event) return;

        switch (event.type) {
            case 'MANDATORY_MEAL':
                if (this.player.hasDiscipline('Caccia')) {
                    this.ui.logMessage("Grazie alla tua Arte della Caccia, non hai bisogno di mangiare.");
                } else if (this.player.meals > 0) {
                    this.player.meals--;
                    this.ui.logMessage("Hai consumato un Pasto.");
                } else {
                    this.player.updateEndurance(-3);
                    this.ui.logMessage("Non hai cibo! Perdi 3 punti di Resistenza.");
                }
                break;
            case 'GAIN_ITEM':
                this.player.addItem(event.item);
                this.ui.logMessage(`Hai ottenuto: ${event.item.name}.`);
                break;
            case 'MULTI_GAIN':
                event.items.forEach(item => {
                    this.player.addItem(item);
                    this.ui.logMessage(`Hai ottenuto: ${item.name}.`);
                });
                break;
            case 'LOSE_ENDURANCE':
                this.player.updateEndurance(-event.amount);
                this.ui.logMessage(`Perdi ${event.amount} punti di Resistenza.`);
                break;
            // Add other event types here
        }
    }

    startCombat(combatData) {
        this.combatManager = new CombatManager(this.player, combatData, this.ui, (outcome) => this.endCombat(outcome, combatData.escape));
        this.combatManager.start();
    }

    endCombat(outcome, escapeOptions) {
        this.combatManager = null;
        if (outcome === 'win') {
            this.ui.logMessage("Hai vinto il combattimento!");
            if (escapeOptions) {
                // This is a special case for post-combat choices like in section 17
                this.ui.renderPostCombatChoices(escapeOptions);
            } else {
                // Default behavior: continue to the next part of the current section's logic
                // This assumes the section text after combat is handled by the choices presented.
                // If there's a default next section after combat, it should be in the data.
            }
        } else if (outcome === 'loss') {
            this.ui.logMessage("Sei stato sconfitto. La tua avventura finisce qui.");
            // Game over logic
        } else if (outcome === 'evade') {
            this.ui.logMessage("Sei fuggito dal combattimento.");
            this.goToSection(escapeOptions.target);
        }
        this.ui.updateAll(this.player);
        this.saveGame();
    }
}
