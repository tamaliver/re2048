document.addEventListener('DOMContentLoaded', () => {
    // Game state
    let board = [];
    let score = 0;
    let bestScore = localStorage.getItem('multi2048-best-score') || 0;
    let n = 3;
    let baseHue = 200; // Will be determined based on n
    
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

    // Debug logger
    const debug = (msg) => {
        console.log(msg);
        // Optional: show on screen for mobile debugging
        let debugEl = document.getElementById('debug-log');
        if (!debugEl) {
            debugEl = document.createElement('div');
            debugEl.id = 'debug-log';
            debugEl.style.position = 'fixed';
            debugEl.style.bottom = '5px';
            debugEl.style.left = '5px';
            debugEl.style.fontSize = '10px';
            debugEl.style.color = '#776e65';
            debugEl.style.opacity = '0.5';
            debugEl.style.pointerEvents = 'none';
            document.body.appendChild(debugEl);
        }
        debugEl.textContent = msg;
    };

    // Sound Manager using Web Audio API
    const SoundManager = {
        ctx: null,
        isUnlocked: false,
        
        init() {
            if (this.ctx) return;
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) {
                    debug('AudioContext not supported');
                    return;
                }
                this.ctx = new AudioContextClass();
                debug(`AudioContext created: ${this.ctx.state}`);
            } catch (e) {
                debug(`Audio Init Error: ${e.message}`);
            }
        },

        // Dedicated method to unlock audio on mobile
        unlock() {
            this.init();
            if (!this.ctx) return;
            
            debug(`Unlocking... state: ${this.ctx.state}`);
            
            // On iOS, resume() must be called in the same stack as the user event
            const resumePromise = this.ctx.resume();
            if (resumePromise) {
                resumePromise.then(() => {
                    this.isUnlocked = true;
                    debug(`Audio unlocked! State: ${this.ctx.state}`);
                    this.playTest();
                }).catch(err => {
                    debug(`Resume Error: ${err.message}`);
                });
            } else {
                // Older browsers might not return a promise
                this.isUnlocked = true;
                debug('Audio unlocked (no promise)');
            }
        },

        playTest() {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.setValueAtTime(880, this.ctx.currentTime); 
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
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
            
            gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
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
            
            gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.3);
        }
    };

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
        
        // Spawn 2 initial tiles
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
        if (!value) return { bg: 'transparent', textColor: 'transparent', boxShadow: 'none' };
        
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
        // IDs that should be on the board at the end of this render
        let currentIds = new Set();
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c]) currentIds.add(board[r][c].id);
            }
        }
        
        // Remove tiles that are not even in the "to be removed" list and not on board
        for (let [id, element] of tileElements.entries()) {
            if (!currentIds.has(id) && !element.dataset.toRemove) {
                element.remove();
                tileElements.delete(id);
            }
        }
        
        // Update or create tiles
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
                    
                    // Position
                    tile.style.left = `calc(${c * 25}% + ${c === 0 ? '0px' : c === 1 ? '2.5px' : c === 2 ? '5px' : '7.5px'})`;
                    tile.style.top = `calc(${r * 25}% + ${r === 0 ? '0px' : r === 1 ? '2.5px' : r === 2 ? '5px' : '7.5px'})`;
                    
                    // Value and Style
                    tile.textContent = tileData.value;
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
                        // Delay the pop animation slightly to let the slide finish
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
        if (gameMessage.style.display === 'flex') return;

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
                    
                    // The tile at tiles[j+1] is merging into tiles[j]
                    // We want to move tiles[j+1] to the final position of this merged tile
                    let destinationIdx = newLine.length;
                    
                    // Move the "ghost" tile
                    let ghostId = tiles[j+1].data.id;
                    let ghostElement = tileElements.get(ghostId);
                    if (ghostElement) {
                        ghostElement.dataset.toRemove = "true";
                        // Calculate final position in the line
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

            // Delay adding random tile slightly for better feel
            setTimeout(() => {
                addRandomTile();
                renderBoard();
                checkGameOver();
            }, 100);
            renderBoard();
        }
    }
    
    function checkGameOver() {
        // Empty cells?
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) if (board[r][c] === null) return false;
        }
        // Adjacent equals?
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
        if (gameMessage.style.display === 'flex') return;
        
        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                move(0);
                break;
            case 'ArrowRight':
                e.preventDefault();
                move(1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                move(2);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                move(3);
                break;
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
        // Don't preventDefault here, let the browser handle clicks/taps normally if it's not a swipe
    }, {passive: false});
    
    gameContainer.addEventListener('touchmove', e => {
        e.preventDefault(); // Prevent scrolling during swipe
    }, {passive: false});
    
    gameContainer.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, {passive: false});
    
    function handleSwipe() {
        if (gameMessage.style.display === 'flex') return;
        
        let dx = touchEndX - touchStartX;
        let dy = touchEndY - touchStartY;
        
        let absDx = Math.abs(dx);
        let absDy = Math.abs(dy);
        
        // Minimum swipe distance
        if (Math.max(absDx, absDy) > 30) {
            if (absDx > absDy) {
                // Horizontal
                if (dx > 0) move(1); // Right
                else move(3); // Left
            } else {
                // Vertical
                if (dy > 0) move(2); // Down
                else move(0); // Up
            }
        }
    }
    
    // Buttons
    restartBtn.addEventListener('click', initGame);
    retryBtn.addEventListener('click', initGame);
    
    // Start game
    initGame();

    // Unlock audio on first interaction (Crucial for mobile)
    ['touchstart', 'mousedown', 'keydown', 'click'].forEach(event => {
        document.addEventListener(event, () => {
            SoundManager.unlock();
        }, { once: true });
    });
});
