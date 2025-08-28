import { COMBAT_RESULTS_TABLE } from '../data/rules.js';

export class CombatManager {
    constructor(player, combatData, ui, onCombatEnd) {
        this.player = player;
        this.enemy = {...combatData };
        this.ui = ui;
        this.onCombatEnd = onCombatEnd;
        this.isActive = false;
    }

    start() {
        this.isActive = true;
        this.ui.showScreen('combat-screen');
        this.updateCombatUI();
        this.ui.dom.fightButton.onclick = () => this.executeRound();
        if (this.enemy.escape) {
            this.ui.dom.evadeButton.classList.remove('hidden');
            this.ui.dom.evadeButton.onclick = () => this.evade();
        } else {
            this.ui.dom.evadeButton.classList.add('hidden');
        }
    }

    executeRound() {
        const playerCS = this.calculatePlayerCS();
        const combatRatio = playerCS - this.enemy.cs;
        
        this.ui.pickRandomNumber().then(roll => {
            const ratioIndex = this.getRatioIndex(combatRatio);
            const result = COMBAT_RESULTS_TABLE[roll][ratioIndex];
            
            let playerDamage = result.p === 'k'? this.player.currentEndurance : result.p;
            let enemyDamage = result.e === 'k'? this.enemy.end : result.e;

            this.player.updateEndurance(-playerDamage);
            this.enemy.end -= enemyDamage;

            this.logCombatAction(`Rapporto di Forza: ${combatRatio}. Tiro: ${roll}.`);
            this.logCombatAction(`Lupo Solitario perde ${playerDamage} Resistenza. ${this.enemy.enemyName} perde ${enemyDamage} Resistenza.`);

            this.updateCombatUI();
            this.checkCombatEnd();
        });
    }

    calculatePlayerCS() {
        let cs = this.player.combatSkill;
        if (this.player.hasDiscipline('Psicolaser') &&!this.enemy.immuneToMindblast) {
            cs += 2;
        }
        this.player.weapons.forEach(w => {
            if (this.player.isWeaponMaster(w)) {
                cs += 2;
            }
        });
        if (this.enemy.modifiers && this.enemy.modifiers.playerCS) {
            cs += this.enemy.modifiers.playerCS;
        }
        return cs;
    }

    getRatioIndex(ratio) {
        if (ratio <= -11) return 0;
        if (ratio >= 11) return 12;
        // Map ratio from -10 to +10 to index 1 to 11
        return Math.floor((ratio + 11) / 2) + 1;
    }
    
    evade() {
        // Per le regole, la fuga avviene dopo un round di combattimento, con danno solo al giocatore.
        const playerCS = this.calculatePlayerCS();
        const combatRatio = playerCS - this.enemy.cs;
        
        this.ui.pickRandomNumber().then(roll => {
            const ratioIndex = this.getRatioIndex(combatRatio);
            const result = COMBAT_RESULTS_TABLE[roll][ratioIndex];
            let playerDamage = result.p === 'k'? this.player.currentEndurance : result.p;
            
            this.player.updateEndurance(-playerDamage);
            this.logCombatAction(`Tenti di fuggire e perdi ${playerDamage} Resistenza.`);
            this.isActive = false;
            this.onCombatEnd('evade', this.enemy.escape);
        });
    }

    checkCombatEnd() {
        if (this.enemy.end <= 0) {
            this.isActive = false;
            this.onCombatEnd('win');
        } else if (this.player.currentEndurance <= 0) {
            this.isActive = false;
            this.onCombatEnd('loss');
        }
    }

    updateCombatUI() {
        this.ui.dom.combatPlayerCS.textContent = this.calculatePlayerCS();
        this.ui.dom.combatPlayerEnd.textContent = this.player.currentEndurance;
        this.ui.dom.combatEnemyName.textContent = this.enemy.enemyName;
        this.ui.dom.combatEnemyCS.textContent = this.enemy.cs;
        this.ui.dom.combatEnemyEnd.textContent = Math.max(0, this.enemy.end);
    }
    
    logCombatAction(text) {
        const p = document.createElement('p');
        p.textContent = text;
        this.ui.dom.combatLog.appendChild(p);
        this.ui.dom.combatLog.scrollTop = this.ui.dom.combatLog.scrollHeight;
    }
}
