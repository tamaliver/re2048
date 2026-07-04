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
    const autoBtn = document.getElementById('auto-btn');
    const retryBtn = document.getElementById('retry-btn');
    const autoUnlockModal = document.getElementById('auto-unlock-modal');
    const autoUnlockCloseBtn = document.getElementById('auto-unlock-close-btn');
    const autoUnlockInput = document.getElementById('auto-unlock-input');
    const autoUnlockSubmit = document.getElementById('auto-unlock-submit');
    const autoUnlockMessage = document.getElementById('auto-unlock-message');

    // Initialize
    bestScoreElement.textContent = bestScore;

    // Map to keep track of tile elements
    let tileElements = new Map();
    let nextTileId = 0;
    let autoMode = false;
    let autoTimer = null;
    let autoMoveLocked = false;
    let discoveredValues = new Set();
    let bestScoreEligible = true;
    const AUTO_MOVE_DELAY = 180;
    const AUTO_UNLOCK_STORAGE_KEY = 're2048-auto-mode-unlocked';
    const AUTO_UNLOCK_HASH = '2dbdeba73b39ab3ae5dddfe3f758167dceb9d7f8660ec2ceb13eab1cf335c955';

    function isAutoModeUnlocked() {
        return localStorage.getItem(AUTO_UNLOCK_STORAGE_KEY) === 'true';
    }

    function updateAutoButtonLockState() {
        if (!autoBtn) return;
        const unlocked = isAutoModeUnlocked();
        autoBtn.classList.toggle('auto-btn-locked', !unlocked);
        autoBtn.setAttribute('aria-label', unlocked ? 'Auto mode' : 'Unlock Auto mode');
        autoBtn.title = unlocked ? 'Auto mode' : 'Unlock Auto mode';
    }
    updateAutoButtonLockState();

    async function hashUnlockCode(code) {
        const normalizedCode = code.trim().toUpperCase();
        const data = new TextEncoder().encode(normalizedCode);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function openAutoUnlockModal() {
        autoUnlockMessage.textContent = '';
        autoUnlockInput.value = '';
        autoUnlockModal.style.display = 'block';
        setTimeout(() => autoUnlockInput.focus(), 0);
    }

    function closeAutoUnlockModal() {
        autoUnlockModal.style.display = 'none';
    }

    async function submitAutoUnlockCode() {
        const code = autoUnlockInput.value;
        if (!code.trim()) {
            autoUnlockMessage.textContent = 'Enter the unlock code from Ko-fi.';
            autoUnlockMessage.className = 'unlock-message unlock-message-error';
            return;
        }

        const hash = await hashUnlockCode(code);
        if (hash === AUTO_UNLOCK_HASH) {
            localStorage.setItem(AUTO_UNLOCK_STORAGE_KEY, 'true');
            autoUnlockMessage.textContent = 'Auto mode unlocked.';
            autoUnlockMessage.className = 'unlock-message unlock-message-success';
            updateAutoButtonLockState();
            setTimeout(closeAutoUnlockModal, 550);
            return;
        }

        autoUnlockMessage.textContent = 'Unlock code did not match.';
        autoUnlockMessage.className = 'unlock-message unlock-message-error';
    }

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
            } catch (e) { }
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

        playDiscovery() {
            this.init();
            if (!this.ctx) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();

            const now = this.ctx.currentTime;
            const notes = [880, 1174.66, 1567.98];
            notes.forEach((freq, index) => {
                const start = now + index * 0.055;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0.18, start);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(start);
                osc.stop(start + 0.18);
            });
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
        stopAutoMode();

        // Random n between 2 and 9
        n = Math.floor(Math.random() * 8) + 2;
        currentNElement.textContent = n;

        baseHue = ((n - 2) * 45) % 360;
        document.documentElement.style.setProperty('--base-hue', baseHue);

        // Reset board
        board = Array(4).fill(null).map(() => Array(4).fill(null));
        score = 0;
        updateScore();
        gameMessage.style.display = 'none';
        tileContainer.innerHTML = '';
        tileElements.clear();
        nextTileId = 0;
        discoveredValues = new Set();
        bestScoreEligible = true;
        gameStarted = false;
        hasWon = false;
        restartBtn.textContent = 'Start Game';

        // Don't add initial tiles yet, just show empty board or hidden tiles
        renderBoard();
    }

    function startGame() {
        if (gameMessage.style.display === 'flex' && hasWon) {
            gameMessage.style.display = 'none';
            if (autoMode) scheduleAutoMove();
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

    function startAutoMode() {
        if (gameMessage.style.display === 'flex') {
            initGame();
        }

        if (!gameStarted) {
            startGame();
        }

        autoMode = true;
        bestScoreEligible = false;
        autoBtn.classList.add('auto-btn-active');
        autoBtn.setAttribute('aria-pressed', 'true');
        autoBtn.setAttribute('aria-label', 'Stop auto mode');
        autoBtn.title = 'STOP';
        scheduleAutoMove();
    }

    function stopAutoMode() {
        autoMode = false;
        autoMoveLocked = false;
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
        }
        if (autoBtn) {
            autoBtn.classList.remove('auto-btn-active');
            autoBtn.setAttribute('aria-pressed', 'false');
            updateAutoButtonLockState();
        }
    }

    function toggleAutoMode() {
        if (!isAutoModeUnlocked()) {
            openAutoUnlockModal();
            return;
        }

        if (autoMode) {
            stopAutoMode();
            return;
        }
        SoundManager.unlock();
        startAutoMode();
    }

    function addRandomTile() {
        let emptyCells = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c] === null) {
                    emptyCells.push({ r, c });
                }
            }
        }

        if (emptyCells.length > 0) {
            let randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            let value = Math.random() < 0.9 ? n : n * 2;
            let id = nextTileId++;
            board[randomCell.r][randomCell.c] = { value, id, isNew: true, isMerged: false };
            discoveredValues.add(value);
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
            let boxShadow = `0 0 30px 10px rgba(243, 215, 116, ${0.2 + (level - 9) * 0.1}), inset 0 0 0 1px rgba(255, 255, 255, 0.33)`;
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
        if (bestScoreEligible && score > bestScore) {
            bestScore = score;
            bestScoreElement.textContent = bestScore;
            localStorage.setItem('multi2048-best-score', bestScore);
        }
    }

    function move(direction) {
        if (!gameStarted || gameMessage.style.display === 'flex') return;

        let moved = false;
        let scoreGained = 0;
        let foundNewValue = false;

        for (let i = 0; i < 4; i++) {
            let line = [];
            for (let j = 0; j < 4; j++) {
                let r, c;
                if (direction === 0) { r = j; c = i; }
                else if (direction === 1) { r = i; c = 3 - j; }
                else if (direction === 2) { r = 3 - j; c = i; }
                else if (direction === 3) { r = i; c = j; }
                line.push({ r, c, data: board[r][c] });
            }

            let tiles = line.filter(item => item.data !== null);
            let newLine = [];

            for (let j = 0; j < tiles.length; j++) {
                if (j < tiles.length - 1 && tiles[j].data.value === tiles[j + 1].data.value) {
                    let newValue = tiles[j].data.value * 2;
                    scoreGained += newValue;
                    if (!discoveredValues.has(newValue)) {
                        discoveredValues.add(newValue);
                        foundNewValue = true;
                    }

                    let destinationIdx = newLine.length;
                    let ghostId = tiles[j + 1].data.id;
                    let ghostElement = tileElements.get(ghostId);
                    if (ghostElement) {
                        ghostElement.dataset.toRemove = "true";
                        let destR, destC;
                        if (direction === 0) { destR = destinationIdx; destC = i; }
                        else if (direction === 1) { destR = i; destC = 3 - destinationIdx; }
                        else if (direction === 2) { destR = 3 - destinationIdx; destC = i; }
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
                else if (direction === 1) { r = i; c = 3 - j; }
                else if (direction === 2) { r = 3 - j; c = i; }
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

            if (foundNewValue) {
                SoundManager.playDiscovery();
            } else if (scoreGained > 0) {
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
                                stopAutoMode();
                                return;
                            }
                        }
                    }
                }

                if (checkGameOver()) {
                    stopAutoMode();
                    return;
                }
                autoMoveLocked = false;
                scheduleAutoMove();
            }, 100);
            renderBoard();
            return true;
        }
        return false;
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
                if (c < 3 && board[r][c].value === board[r][c + 1].value) return false;
                if (r < 3 && board[r][c].value === board[r + 1][c].value) return false;
            }
        }
        gameMessage.style.display = 'flex';
        return true;
    }

    function boardToValues(sourceBoard) {
        return sourceBoard.map(row => row.map(cell => cell ? cell.value : null));
    }

    function slideValues(values, direction) {
        const result = Array(4).fill(null).map(() => Array(4).fill(null));
        let moved = false;
        let gained = 0;

        for (let i = 0; i < 4; i++) {
            const line = [];
            for (let j = 0; j < 4; j++) {
                let r, c;
                if (direction === 0) { r = j; c = i; }
                else if (direction === 1) { r = i; c = 3 - j; }
                else if (direction === 2) { r = 3 - j; c = i; }
                else { r = i; c = j; }
                line.push(values[r][c]);
            }

            const compact = line.filter(value => value !== null);
            const merged = [];
            for (let j = 0; j < compact.length; j++) {
                if (j < compact.length - 1 && compact[j] === compact[j + 1]) {
                    const value = compact[j] * 2;
                    merged.push(value);
                    gained += value;
                    j++;
                } else {
                    merged.push(compact[j]);
                }
            }
            while (merged.length < 4) merged.push(null);

            for (let j = 0; j < 4; j++) {
                let r, c;
                if (direction === 0) { r = j; c = i; }
                else if (direction === 1) { r = i; c = 3 - j; }
                else if (direction === 2) { r = 3 - j; c = i; }
                else { r = i; c = j; }
                result[r][c] = merged[j];
                if (values[r][c] !== merged[j]) moved = true;
            }
        }

        return { values: result, moved, gained };
    }

    function evaluateValues(values) {
        let empty = 0;
        let maxValue = 0;
        let smoothness = 0;
        const cornerValues = [values[0][0], values[0][3], values[3][0], values[3][3]].filter(Boolean);

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const value = values[r][c];
                if (!value) {
                    empty++;
                    continue;
                }
                maxValue = Math.max(maxValue, value);
                if (c < 3 && values[r][c + 1]) smoothness -= Math.abs(Math.log2(value) - Math.log2(values[r][c + 1]));
                if (r < 3 && values[r + 1][c]) smoothness -= Math.abs(Math.log2(value) - Math.log2(values[r + 1][c]));
            }
        }

        const maxInCorner = cornerValues.includes(maxValue) ? 1 : 0;
        const snakeWeights = [
            [65536, 32768, 16384, 8192],
            [512, 1024, 2048, 4096],
            [256, 128, 64, 32],
            [2, 4, 8, 16]
        ];
        let snakeScore = 0;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                snakeScore += (values[r][c] || 0) * snakeWeights[r][c];
            }
        }

        return empty * 9000 + maxInCorner * 12000 + smoothness * 700 + Math.log2(maxValue || 1) * 1000 + snakeScore / 100;
    }

    function chooseAutoDirection() {
        const values = boardToValues(board);
        let bestDirection = null;
        let bestScore = -Infinity;

        for (let direction = 0; direction < 4; direction++) {
            const next = slideValues(values, direction);
            if (!next.moved) continue;

            let score = evaluateValues(next.values) + next.gained * 6;
            for (let lookahead = 0; lookahead < 4; lookahead++) {
                const future = slideValues(next.values, lookahead);
                if (future.moved) {
                    score += evaluateValues(future.values) * 0.2 + future.gained * 2;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestDirection = direction;
            }
        }

        return bestDirection;
    }

    function scheduleAutoMove() {
        if (!autoMode || autoTimer || autoMoveLocked || !gameStarted || gameMessage.style.display === 'flex') return;
        autoTimer = setTimeout(() => {
            autoTimer = null;
            if (!autoMode || !gameStarted || gameMessage.style.display === 'flex') return;

            const direction = chooseAutoDirection();
            if (direction === null) {
                stopAutoMode();
                checkGameOver();
                return;
            }

            autoMoveLocked = true;
            if (!move(direction)) {
                autoMoveLocked = false;
                scheduleAutoMove();
            }
        }, AUTO_MOVE_DELAY);
    }

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (!gameStarted || gameMessage.style.display === 'flex') return;

        switch (e.key) {
            case 'ArrowUp': e.preventDefault(); stopAutoMode(); move(0); break;
            case 'ArrowRight': e.preventDefault(); stopAutoMode(); move(1); break;
            case 'ArrowDown': e.preventDefault(); stopAutoMode(); move(2); break;
            case 'ArrowLeft': e.preventDefault(); stopAutoMode(); move(3); break;
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
    }, { passive: false });

    gameContainer.addEventListener('touchmove', e => {
        if (gameStarted) e.preventDefault();
    }, { passive: false });

    gameContainer.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: false });

    function handleSwipe() {
        if (!gameStarted || gameMessage.style.display === 'flex') return;
        let dx = touchEndX - touchStartX;
        let dy = touchEndY - touchStartY;
        let absDx = Math.abs(dx);
        let absDy = Math.abs(dy);
        if (Math.max(absDx, absDy) > 30) {
            stopAutoMode();
            if (absDx > absDy) {
                if (dx > 0) move(1); else move(3);
            } else {
                if (dy > 0) move(2); else move(0);
            }
        }
    }

    // Buttons
    restartBtn.addEventListener('click', startGame);
    autoBtn.addEventListener('click', toggleAutoMode);
    retryBtn.addEventListener('click', startGame);
    autoUnlockCloseBtn.addEventListener('click', closeAutoUnlockModal);
    autoUnlockSubmit.addEventListener('click', submitAutoUnlockCode);
    autoUnlockInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') submitAutoUnlockCode();
    });

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
        if (event.target === autoUnlockModal) {
            closeAutoUnlockModal();
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
