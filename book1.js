export const book1Data = {
    title: "I Signori delle Tenebre",
    sections:
        },
        // Aggiungere qui le altre 349 sezioni...
        // Esempi di sezioni complesse per dimostrare la funzionalità del motore:
        {
            id: 2,
            text: `Mentre corri nel bosco sempre più fitto le grida dei Giak si sentono sempre meno. Ormai li hai quasi seminati, ma improvvisamente inciampi in un ramo basso e finisci dentro un cespuglio.`,
            randomCheck: {
                text: "Scegli un numero dalla Tabella del Destino.",
                choices: [
                    { range: , target: 343 },
                    { range: , target: 276 }
                ]
            }
        },
        {
            id: 17,
            text: `Alzi la tua Arma per colpire il mostro, mentre i suoi denti affilati scattano a pochi centimetri dalla tua testa. È difficile tenersi in piedi sotto i battiti delle sue ali. Togli un punto dalla tua Combattività e combatti contro il Kraan.`,
            combat: {
                enemyName: "Kraan",
                cs: 16,
                end: 24,
                modifiers: { playerCS: -1 },
                escape: { // Questa opzione si attiva solo dopo la vittoria
                    type: "RANDOM",
                    choices: [
                        { range: , target: 53 },
                        { range: , target: 274 },
                        { range: , target: 331 }
                    ]
                }
            }
        },
        {
            id: 20,
            text: `Chi abitava qui dev'essere andato via da poco, e in gran fretta. Sulla tavola ci sono i resti di un pasto non consumato, e una tazza di Jala scura ancora tiepida. Frugando in una cassa e in un piccolo armadio, trovi uno Zaino, cibo sufficiente per due Pasti, e un Pugnale.`,
            event: {
                type: 'MULTI_GAIN',
                items:
            },
            choices: [
                { text: "Il tuo viaggio continua.", target: 273 }
            ]
        },
        {
            id: 37,
            text: `Ti senti stanco e affamato, e devi fermarti per mangiare. Dopo il tuo Pasto, torni sui tuoi passi fino alla rocca e cominci a fare il giro delle mura, alte e inviolabili. Scopri un'altra entrata sul lato est, anche questa con due soldati di guardia.`,
            event: { type: 'MANDATORY_MEAL' },
            choices: [
                { text: "Avvicinarti a loro e raccontare la tua storia.", target: 289 },
                { text: "Impiegare la tua Arte del Mimetismo.", target: 282 }
            ]
        },
        { id: 53, text: "Un dolore lancinante attanaglia la tua gamba destra... La tua missione finisce qui.", choices: },
        { id: 85, text: "Il sentiero è largo, e conduce diritto in un folto sottobosco...", choices: [{ text: "Continua...", target: 229 }] }, // Esempio di sezione di transizione
        { id: 141, text: "Il tuo Sesto Senso ti avverte che alcuni degli esseri che hanno attaccato il monastero stanno rastrellando i due sentieri...", choices: [{ text: "Vai a sud nel sottobosco", target: 56 }] },
        { id: 275, text: "Dopo una ventina di minuti che cammini sul sentiero tortuoso, senti un battito di ali...", choices: },
        { id: 276, text: "A colpi d'Ascia ti apri la strada...", event: { type: 'LOSE_ENDURANCE', amount: 1 }, choices: [{ text: "Continua...", target: 213 }] },
        { id: 343, text: "Sei immobilizzato dal groviglio di rami e radici...", event: { type: 'LOSE_ENDURANCE', amount: 2 }, choices: [{ text: "Continua...", target: 213 }] },
        // Aggiungere altre sezioni per completare il libro
    ]
};
