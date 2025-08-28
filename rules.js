export const ALL_DISCIPLINES =;

export const WEAPON_SKILL_MAP = {
    0: 'Pugnale', 1: 'Lancia', 2: 'Mazza', 3: 'Daga', 4: 'Martello',
    5: 'Spada', 6: 'Ascia', 7: 'Spada', 8: 'Asta', 9: 'Spadone'
};

export const BONUS_ITEMS = {
    0: { name: 'Spadone', type: 'Weapon' },
    1: { name: 'Spada', type: 'Weapon' },
    2: { name: 'Elmo', type: 'SpecialItem', effect: { type: 'ENDURANCE_BOOST', value: 2 } },
    3: { name: 'Pasto', type: 'Meal', quantity: 2 },
    4: { name: 'Cotta di Maglia', type: 'SpecialItem', effect: { type: 'ENDURANCE_BOOST', value: 4 } },
    5: { name: 'Mazza', type: 'Weapon' },
    6: { name: 'Pozione Magica', type: 'BackpackItem' }, // Logic for use needs implementation
    7: { name: 'Asta', type: 'Weapon' },
    8: { name: 'Lancia', type: 'Weapon' },
    9: { type: 'Gold', quantity: 12 }
};

export const RANDOM_TABLE = , , ,
    , , ,
    , , ,
    ;

// Combat Results Table: e = enemy damage, p = player damage, 'k' = kill
const k = 'k';
export const COMBAT_RESULTS_TABLE = [
    //-11  -10/-9 -8/-7 -6/-5 -4/-3 -2/-1   0    +1/+2  +3/+4  +5/+6  +7/+8 +9/+10 +11
    [ {e:6,p:k},{e:7,p:k},{e:8,p:k},{e:9,p:k},{e:10,p:k},{e:11,p:k},{e:12,p:k},{e:14,p:k},{e:16,p:k},{e:18,p:k},{e:k,p:0},{e:k,p:0},{e:k,p:0} ], // Roll 0
    [ {e:0,p:k},{e:0,p:k},{e:0,p:8},{e:0,p:6},{e:1,p:6},{e:2,p:5},{e:3,p:5},{e:4,p:5},{e:5,p:4},{e:6,p:4},{e:7,p:4},{e:8,p:3},{e:9,p:3} ], // Roll 1
    [ {e:0,p:k},{e:0,p:8},{e:0,p:7},{e:1,p:6},{e:2,p:5},{e:3,p:5},{e:4,p:4},{e:5,p:4},{e:6,p:3},{e:7,p:3},{e:8,p:3},{e:9,p:2},{e:10,p:2} ], // Roll 2
    [ {e:0,p:8},{e:0,p:7},{e:1,p:6},{e:2,p:5},{e:3,p:5},{e:4,p:4},{e:5,p:4},{e:6,p:3},{e:7,p:3},{e:8,p:2},{e:9,p:2},{e:10,p:2},{e:11,p:2} ], // Roll 3
    [ {e:0,p:8},{e:1,p:7},{e:2,p:6},{e:3,p:5},{e:4,p:4},{e:5,p:4},{e:6,p:3},{e:7,p:3},{e:8,p:2},{e:9,p:2},{e:10,p:2},{e:11,p:2},{e:12,p:2} ], // Roll 4
    [ {e:1,p:7},{e:2,p:6},{e:3,p:5},{e:4,p:4},{e:5,p:4},{e:6,p:3},{e:7,p:2},{e:8,p:2},{e:9,p:2},{e:10,p:1},{e:11,p:1},{e:12,p:1},{e:14,p:1} ], // Roll 5
    [ {e:2,p:6},{e:3,p:6},{e:4,p:5},{e:5,p:4},{e:6,p:3},{e:7,p:2},{e:8,p:2},{e:9,p:1},{e:10,p:1},{e:11,p:1},{e:12,p:0},{e:14,p:0},{e:16,p:0} ], // Roll 6
    [ {e:3,p:5},{e:4,p:5},{e:5,p:4},{e:6,p:3},{e:7,p:2},{e:8,p:1},{e:9,p:1},{e:10,p:0},{e:11,p:0},{e:12,p:0},{e:14,p:0},{e:16,p:0},{e:18,p:0} ], // Roll 7
    [ {e:4,p:4},{e:5,p:4},{e:6,p:3},{e:7,p:2},{e:8,p:1},{e:9,p:0},{e:10,p:0},{e:11,p:0},{e:12,p:0},{e:14,p:0},{e:16,p:0},{e:18,p:0},{e:k,p:0} ], // Roll 8
    [ {e:5,p:3},{e:6,p:3},{e:7,p:2},{e:8,p:2},{e:9,p:0},{e:10,p:0},{e:11,p:0},{e:12,p:0},{e:14,p:0},{e:16,p:0},{e:18,p:0},{e:k,p:0},{e:k,p:0} ]  // Roll 9
];
