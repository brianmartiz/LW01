export class Player {
    constructor(stats, disciplines, bookId) {
        this.bookId = bookId;
        this.combatSkill = stats.combatSkill;
        this.initialEndurance = stats.endurance;
        this.maxEndurance = stats.endurance;
        this.currentEndurance = stats.endurance;
        this.disciplines = disciplines;
        this.gold = 0;
        this.weapons =;
        this.backpack =;
        this.specialItems =;
        this.meals = 0;
        this.currentSection = 0;
    }

    hasDiscipline(disciplineName) {
        return this.disciplines.includes(disciplineName);
    }

    updateEndurance(amount) {
        this.currentEndurance += amount;
        if (this.currentEndurance > this.maxEndurance) {
            this.currentEndurance = this.maxEndurance;
        }
        if (this.currentEndurance < 0) {
            this.currentEndurance = 0;
        }
    }
    
    addItem(item) {
        switch(item.type) {
            case 'Weapon':
                if (this.weapons.length < 2) {
                    this.weapons.push(item.name);
                } else {
                    // Simple logic: for now, we just alert. A better UI would let the player choose.
                    alert(`Non puoi portare più di 2 armi. Non hai raccolto ${item.name}.`);
                }
                break;
            case 'BackpackItem':
                 if (this.backpack.length < 8) {
                    this.backpack.push(item.name);
                } else {
                    alert(`Zaino pieno. Non hai raccolto ${item.name}.`);
                }
                break;
            case 'SpecialItem':
                this.specialItems.push(item.name);
                if (item.effect && item.effect.type === 'ENDURANCE_BOOST') {
                    this.maxEndurance += item.effect.value;
                    this.currentEndurance += item.effect.value;
                }
                break;
            case 'Gold':
                this.gold = Math.min(50, this.gold + item.quantity);
                break;
            case 'Meal':
                this.meals += item.quantity;
                break;
        }
    }
    
    isWeaponMaster(weaponName) {
        const masterWeapon = this.disciplines.find(d => d.startsWith('Scherma'));
        if (!masterWeapon) return false;
        
        const weaponType = masterWeapon.split(' in ');
        // This is a simplified check. A more robust system would map names to types.
        return weaponName.toLowerCase().includes(weaponType.toLowerCase());
    }
}
