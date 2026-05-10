document.addEventListener('DOMContentLoaded', () => {
    // Game state
    let board = [];
    let score = 0;
    let bestScore = localStorage.getItem('multi2048-best-score') || 0;
    let n = 3;
    let baseHue = 200; 
    let gameStarted = false;
    
    // DOM Elements
    const gridContainer = document.querySelector('.grid-container');
    const tileContainer = document.getElementById('tile-container');
    const scoreElement = document.getElementById('score');
    const bestScoreElement = document.getElementById('best-score');
    const currentNElement = document.getElementById('current-n');
    const gameMessage = document.getElementById('game-message');
    const restartBtn = document.getElementById('restart-btn');
    const retryBtn = document.getElementById('retry-btn');
    
    // Initialize
    bestScoreElement.textContent = bestScore;
    
    // Map to keep track of tile elements
    let tileElements = new Map();
    let nextTileId = 0;

    // Sound Manager using Web Audio API
    const SoundManager = {
        ctx: null,
        isUnlocked: false,
        
        init() {
            if (this.ctx) return;
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                this.ctx = new AudioContextClass();
            } catch (e) {}
        },

        unlock() {
            this.init();
            if (!this.ctx) return;
            if (this.ctx.state === 'running') {
                this.isUnlocked = true;
                return;
            }
            this.ctx.resume().then(() => {
                if (this.ctx.state === 'running') {
                    this.isUnlocked = true;
                }
            });
        },

        playStart() {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            
            const playNote = (freq, start, duration) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0.1, start);
                gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(start);
                osc.stop(start + duration);
            };

            // Simple 8-bit arpeggio
            playNote(523.25, now, 0.1); // C5
            playNote(659.25, now + 0.1, 0.1); // E5
            playNote(783.99, now + 0.2, 0.1); // G5
            playNote(1046.50, now + 0.3, 0.2); // C6
        },

        playMove() {
            this.init();
            if (!this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(300, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        },

        playMerge() {
            this.init();
            if (!this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();
            
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1000, this.ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.3);
        },

        playWin() {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            
            const notes = [
                { f: 523.25, d: 0.1 }, // C5
                { f: 659.25, d: 0.1 }, // E5
                { f: 783.99, d: 0.1 }, // G5
                { f: 1046.50, d: 0.3 } // C6
            ];

            let time = now;
            notes.forEach(note => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(note.f, time);
                gain.gain.setValueAtTime(0.1, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + note.d);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(time);
                osc.stop(time + note.d);
                time += note.d;
            });
        }
    };

    let hasWon = false;

    function initGame() {
        // Random n between 3 and 9
        n = Math.floor(Math.random() * 7) + 3;
        currentNElement.textContent = n;
        
        baseHue = ((n - 3) * 45) % 360;
        document.documentElement.style.setProperty('--base-hue', baseHue);
        
        // Reset board
        board = Array(4).fill(null).map(() => Array(4).fill(null));
        score = 0;
        updateScore();
        gameMessage.style.display = 'none';
        tileContainer.innerHTML = '';
        tileElements.clear();
        nextTileId = 0;
        gameStarted = false;
        hasWon = false;
        restartBtn.textContent = 'Start Game';
        
        // Don't add initial tiles yet, just show empty board or hidden tiles
        renderBoard();
    }

    function startGame() {
        if (gameMessage.style.display === 'flex' && hasWon) {
            gameMessage.style.display = 'none';
            return;
        }

        if (gameStarted) {
            initGame();
            return;
        }
        
        SoundManager.unlock();
        SoundManager.playStart();
        
        gameStarted = true;
        restartBtn.textContent = 'New Game';
        
        addRandomTile();
        addRandomTile();
        renderBoard();
    }
    
    function addRandomTile() {
        let emptyCells = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c] === null) {
                    emptyCells.push({r, c});
                }
            }
        }
        
        if (emptyCells.length > 0) {
            let randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            let value = Math.random() < 0.9 ? n : n * 2;
            let id = nextTileId++;
            board[randomCell.r][randomCell.c] = { value, id, isNew: true, isMerged: false };
            return { r: randomCell.r, c: randomCell.c };
        }
        return null;
    }
    
    function getTileColor(value) {
        if (!value || !gameStarted) return { bg: '#cdc1b4', textColor: 'transparent', boxShadow: 'none' };
        
        let level = Math.log2(value / n);
        if (level < 0) level = 0;
        
        let hue = baseHue;
        let saturation = Math.min(100, 50 + level * 5);
        let lightness = Math.max(30, 85 - level * 7);
        
        let textColor = lightness > 60 ? '#776e65' : '#f9f6f2';
        let bg = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        
        if (level >= 9) {
            bg = '#edcc61';
            textColor = '#f9f6f2';
            let boxShadow = `0 0 30px 10px rgba(243, 215, 116, ${0.2 + (level-9)*0.1}), inset 0 0 0 1px rgba(255, 255, 255, 0.33)`;
            return { bg, textColor, boxShadow };
        }
        
        return { bg, textColor, boxShadow: 'none' };
    }
    
    function renderBoard() {
        let currentIds = new Set();
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c]) currentIds.add(board[r][c].id);
            }
        }
        
        for (let [id, element] of tileElements.entries()) {
            if (!currentIds.has(id) && !element.dataset.toRemove) {
                element.remove();
                tileElements.delete(id);
            }
        }
        
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                let tileData = board[r][c];
                if (tileData) {
                    let tile;
                    if (tileElements.has(tileData.id)) {
                        tile = tileElements.get(tileData.id);
                    } else {
                        tile = document.createElement('div');
                        tile.classList.add('tile');
                        tileContainer.appendChild(tile);
                        tileElements.set(tileData.id, tile);
                        if (tileData.isNew) {
                            tile.classList.add('tile-new');
                            setTimeout(() => tile.classList.remove('tile-new'), 200);
                        }
                    }
                    
                    tile.style.left = `calc(${c * 25}% + ${c === 0 ? '0px' : c === 1 ? '2.5px' : c === 2 ? '5px' : '7.5px'})`;
                    tile.style.top = `calc(${r * 25}% + ${r === 0 ? '0px' : r === 1 ? '2.5px' : r === 2 ? '5px' : '7.5px'})`;
                    
                    tile.textContent = gameStarted ? tileData.value : "";
                    let colors = getTileColor(tileData.value);
                    tile.style.backgroundColor = colors.bg;
                    tile.style.color = colors.textColor;
                    tile.style.boxShadow = colors.boxShadow;
                    
                    if (tileData.value.toString().length >= 4) {
                        tile.style.fontSize = '25px';
                    } else {
                        tile.style.fontSize = '35px';
                    }
                    
                    if (tileData.isMerged) {
                        setTimeout(() => {
                            tile.classList.add('tile-merged');
                            setTimeout(() => tile.classList.remove('tile-merged'), 200);
                        }, 100);
                        tileData.isMerged = false;
                    }
                    tileData.isNew = false;
                }
            }
        }
    }
    
    function updateScore() {
        scoreElement.textContent = score;
        if (score > bestScore) {
            bestScore = score;
            bestScoreElement.textContent = bestScore;
            localStorage.setItem('multi2048-best-score', bestScore);
        }
    }
    
    function move(direction) {
        if (!gameStarted || gameMessage.style.display === 'flex') return;

        let moved = false;
        let scoreGained = 0;
        
        for (let i = 0; i < 4; i++) {
            let line = [];
            for (let j = 0; j < 4; j++) {
                let r, c;
                if (direction === 0) { r = j; c = i; }
                else if (direction === 1) { r = i; c = 3-j; }
                else if (direction === 2) { r = 3-j; c = i; }
                else if (direction === 3) { r = i; c = j; }
                line.push({r, c, data: board[r][c]});
            }
            
            let tiles = line.filter(item => item.data !== null);
            let newLine = [];
            
            for (let j = 0; j < tiles.length; j++) {
                if (j < tiles.length - 1 && tiles[j].data.value === tiles[j+1].data.value) {
                    let newValue = tiles[j].data.value * 2;
                    scoreGained += newValue;
                    
                    let destinationIdx = newLine.length;
                    let ghostId = tiles[j+1].data.id;
                    let ghostElement = tileElements.get(ghostId);
                    if (ghostElement) {
                        ghostElement.dataset.toRemove = "true";
                        let destR, destC;
                        if (direction === 0) { destR = destinationIdx; destC = i; }
                        else if (direction === 1) { destR = i; destC = 3-destinationIdx; }
                        else if (direction === 2) { destR = 3-destinationIdx; destC = i; }
                        else if (direction === 3) { destR = i; destC = destinationIdx; }
                        
                        ghostElement.style.left = `calc(${destC * 25}% + ${destC === 0 ? '0px' : destC === 1 ? '2.5px' : destC === 2 ? '5px' : '7.5px'})`;
                        ghostElement.style.top = `calc(${destR * 25}% + ${destR === 0 ? '0px' : destR === 1 ? '2.5px' : destR === 2 ? '5px' : '7.5px'})`;
                        ghostElement.style.opacity = "0.5";
                        
                        setTimeout(() => {
                            ghostElement.remove();
                            tileElements.delete(ghostId);
                        }, 150);
                    }

                    newLine.push({
                        value: newValue,
                        id: tiles[j].data.id,
                        isNew: false,
                        isMerged: true
                    });
                    j++; 
                    moved = true;
                } else {
                    newLine.push({
                        value: tiles[j].data.value,
                        id: tiles[j].data.id,
                        isNew: false,
                        isMerged: false
                    });
                }
            }
            
            while (newLine.length < 4) newLine.push(null);
            
            for (let j = 0; j < 4; j++) {
                let r, c;
                if (direction === 0) { r = j; c = i; }
                else if (direction === 1) { r = i; c = 3-j; }
                else if (direction === 2) { r = 3-j; c = i; }
                else if (direction === 3) { r = i; c = j; }
                
                if (board[r][c] !== newLine[j]) {
                    if (board[r][c] === null || newLine[j] === null || board[r][c].id !== newLine[j].id) {
                        moved = true;
                    }
                }
                board[r][c] = newLine[j];
            }
        }
        
        if (moved) {
            score += scoreGained;
            updateScore();
            
            if (scoreGained > 0) {
                SoundManager.playMerge();
            } else {
                SoundManager.playMove();
            }

            setTimeout(() => {
                addRandomTile();
                renderBoard();
                
                // Check Win
                if (!hasWon) {
                    for (let r = 0; r < 4; r++) {
                        for (let c = 0; c < 4; c++) {
                            if (board[r][c] && board[r][c].value >= n * 1024) {
                                hasWon = true;
                                showWinMessage();
                                return;
                            }
                        }
                    }
                }
                
                checkGameOver();
            }, 100);
            renderBoard();
        }
    }
    
    function showWinMessage() {
        SoundManager.playWin();
        gameMessage.querySelector('p').textContent = 'YOU WIN!';
        retryBtn.textContent = 'Keep Playing';
        gameMessage.style.display = 'flex';
    }

    function checkGameOver() {
        gameMessage.querySelector('p').textContent = 'Game Over!';
        retryBtn.textContent = 'Try Again';
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) if (board[r][c] === null) return false;
        }
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (c < 3 && board[r][c].value === board[r][c+1].value) return false;
                if (r < 3 && board[r][c].value === board[r+1][c].value) return false;
            }
        }
        gameMessage.style.display = 'flex';
        return true;
    }
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (!gameStarted || gameMessage.style.display === 'flex') return;
        
        switch(e.key) {
            case 'ArrowUp': e.preventDefault(); move(0); break;
            case 'ArrowRight': e.preventDefault(); move(1); break;
            case 'ArrowDown': e.preventDefault(); move(2); break;
            case 'ArrowLeft': e.preventDefault(); move(3); break;
        }
    });
    
    // Touch controls (Swipe)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    
    const gameContainer = document.querySelector('.game-container');
    
    gameContainer.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, {passive: false});
    
    gameContainer.addEventListener('touchmove', e => {
        if (gameStarted) e.preventDefault();
    }, {passive: false});
    
    gameContainer.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, {passive: false});
    
    function handleSwipe() {
        if (!gameStarted || gameMessage.style.display === 'flex') return;
        let dx = touchEndX - touchStartX;
        let dy = touchEndY - touchStartY;
        let absDx = Math.abs(dx);
        let absDy = Math.abs(dy);
        if (Math.max(absDx, absDy) > 30) {
            if (absDx > absDy) {
                if (dx > 0) move(1); else move(3);
            } else {
                if (dy > 0) move(2); else move(0);
            }
        }
    }
    
    // Buttons
    restartBtn.addEventListener('click', startGame);
    retryBtn.addEventListener('click', startGame);
    
    // Help Modal
    const helpModal = document.getElementById('help-modal');
    const helpOpenBtn = document.getElementById('help-open-btn');
    const helpCloseBtn = document.getElementById('help-close-btn');

    helpOpenBtn.addEventListener('click', () => {
        helpModal.style.display = 'block';
    });

    helpCloseBtn.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === helpModal) {
            helpModal.style.display = 'none';
        }
    });

    // Start initial state
    initGame();

    // Secondary unlock on any interaction
    const unlockHandler = () => {
        SoundManager.unlock();
        if (SoundManager.ctx && SoundManager.ctx.state === 'running') {
            ['touchstart', 'mousedown', 'keydown', 'click'].forEach(event => {
                document.removeEventListener(event, unlockHandler);
            });
        }
    };
    ['touchstart', 'mousedown', 'keydown', 'click'].forEach(event => {
        document.addEventListener(event, unlockHandler);
    });
});
