import { GameEngine } from './engine.js';
import { book1Data } from '../data/book1.js';
import { book2Data } from '../data/book2.js';

document.addEventListener('DOMContentLoaded', () => {
    const gameData = {
        1: book1Data,
        2: book2Data
    };
    const engine = new GameEngine(gameData);

    document.getElementById('new-game-book1').addEventListener('click', () => engine.startNewGame(1));
    document.getElementById('new-game-book2').addEventListener('click', () => engine.startNewGame(2));
    document.getElementById('load-game').addEventListener('click', () => engine.loadGame());
    document.getElementById('save-game').addEventListener('click', () => engine.saveGame());
    document.getElementById('restart-game').addEventListener('click', () => {
        if (confirm('Sei sicuro di voler ricominciare? Tutti i progressi non salvati andranno persi.')) {
            engine.startNewGame(engine.player.bookId);
        }
    });

    const sidebar = document.getElementById('sidebar');
    const toggleButton = document.getElementById('toggle-sidebar');
    toggleButton.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
});
