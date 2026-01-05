let assembledDollsHistory = [];
let gameStartTime = null;
let collectedMatryoshkas = 0;
let built = 0;
let lives = 3;
let dollIndex = 1;
let timerInterval = null;

const tray = document.getElementById('partsTray');
const wrappingTray = document.getElementById('wrappingParts');
const wrappingDoll = document.getElementById('wrappingDoll');
const generateBtn = document.getElementById('generateParts');
const clearBtn = document.getElementById('clearParts');
const livesEl = document.getElementById('lives');
const sizeLabel = document.getElementById('sizeLabel');
const progressEl = document.getElementById('progress');
const levelNameEl = document.getElementById('levelName');
const timerEl = document.getElementById('timer');
const timerProgressEl = document.getElementById('timerProgress');
const shelf = document.getElementById('shelf');

function showWinModal() {
    console.log("showWinModal");
    stopTimer();
    stopAnimation();
    const timeSpent = calculateTimeSpent();
    const livesLeft = lives;
    const totalScore = calculateScore(collectedMatryoshkas, timeSpent, livesLeft);
    document.getElementById('scoreMatryoshkas').textContent = collectedMatryoshkas;
    document.getElementById('scoreTime').textContent = formatTime(timeSpent);
    document.getElementById('scoreLives').textContent = livesLeft;
    document.getElementById('scoreTotal').textContent = totalScore;
    document.getElementById('winModal').style.display = 'flex';
    startConfetti();
    saveGameStats('win', collectedMatryoshkas, timeSpent, livesLeft, totalScore);
    const playerName = localStorage.getItem('playerName') || 'Игрок';
    const levelNum = parseInt(CONFIG.name.split(' ')[1]);
    const playerStats = JSON.parse(localStorage.getItem(`playerStats_${playerName}`) || '{}');
    let summaryScore = 0;
    let summaryLabel = '';
    if (levelNum >= 2) {
        for (let i = 1; i <= levelNum; i++) {
            if (playerStats[`level${i}`]) {
                summaryScore += playerStats[`level${i}`].score;
            }
        }
        summaryLabel = levelNum === 2 ? 'Итоговый счет (уровни 1-2):' : 'Итоговый счет (уровни 1-3):';
        document.getElementById('summaryItem').style.display = 'block';
        document.getElementById('summaryLabel').textContent = summaryLabel;
        document.getElementById('scoreSummary').textContent = summaryScore;
    } else {
        document.getElementById('summaryItem').style.display = 'none';
    }
}

function showLoseModal(reason) {
    console.log("showLoseModal");
    stopTimer();
    stopAnimation();
    const timeLeft = getCurrentTime();
    const timeSpent = calculateTimeSpent();
    document.getElementById('loseMatryoshkas').textContent = collectedMatryoshkas;
    document.getElementById('loseTime').textContent = formatTime(timeLeft);
    document.getElementById('loseReason').textContent = reason;
    document.getElementById('loseModal').style.display = 'flex';
    saveGameStats('lose', collectedMatryoshkas, timeSpent, lives, 0);
}

function generateSet() {
    console.log("generateSet");
    resetLives();
    clearAll();

    if (CONFIG.name === 'Уровень 3') {
        document.querySelectorAll('#toolsPanel .tool').forEach(enableToolDrag);
    }

    const sizes = [];
    const createdParts = [];

    for (let i = 0; i < CONFIG.setsPerGeneration; i++) {
        const size = randomFrom(SIZES);
        const setId = setIdCounter++;
        sizes.push(size.label);

        ['head', 'body', 'base'].forEach((type) => {
            const dirty = CONFIG.name === 'Уровень 3' && Math.random() < 0.4;
            const isGlued = CONFIG.name === 'Уровень 3' && Math.random() < 0.3;

            const part = makePart({
                type,
                setId,
                size,
                dirty,
                isGlued: isGlued
            });

            createdParts.push(part);
        });
    }

    if (CONFIG.name === 'Уровень 3') {
        const numPairs = Math.min(2, Math.floor(createdParts.length / 2));

        for (let i = 0; i < numPairs; i++) {
            const idx1 = i * 2;
            const idx2 = i * 2 + 1;

            if (idx1 < createdParts.length && idx2 < createdParts.length) {
                const part1 = createdParts[idx1];
                const part2 = createdParts[idx2];

                if (part1.dataset.type !== 'head' || part2.dataset.type !== 'head') {
                    createGluedPairs(part1, part2);
                }
            }
        }
    }

    updateSizeUI(sizes);
    startAnimation();
}

function createGluedPairs(part1, part2) {
    console.log("createGluedPairs");

    const type1 = part1.dataset.type;
    const type2 = part2.dataset.type;
    const setId1 = part1.dataset.setId;
    const setId2 = part2.dataset.setId;

    part1.remove();
    part2.remove();

    movers = movers.filter(m => m.part !== part1 && m.part !== part2);

    const gluedGroup = document.createElement('div');
    gluedGroup.className = 'glued-pair';
    gluedGroup.dataset.isGluedPair = 'true';
    gluedGroup.dataset.type1 = type1;
    gluedGroup.dataset.type2 = type2;
    gluedGroup.dataset.setId1 = setId1;
    gluedGroup.dataset.setId2 = setId2;

    gluedGroup.appendChild(part1);
    gluedGroup.appendChild(part2);

    part1.style.position = 'relative';
    part1.style.left = '0';
    part1.style.top = '0';
    part1.style.margin = '0';

    part2.style.position = 'relative';
    part2.style.left = '0';
    part2.style.top = '0';
    part2.style.margin = '0';

    part1.style.pointerEvents = 'none';
    part2.style.pointerEvents = 'none';

    const glueLabel = document.createElement('div');
    glueLabel.className = 'glue-label';
    glueLabel.textContent = 'Прибито!';
    gluedGroup.appendChild(glueLabel);

    tray.appendChild(gluedGroup);

    const trayRect = tray.getBoundingClientRect();
    const groupWidth = gluedGroup.offsetWidth;
    const groupHeight = gluedGroup.offsetHeight;

    gluedGroup.style.left = Math.random() * (trayRect.width - groupWidth - 20) + 10 + 'px';
    gluedGroup.style.top = Math.random() * (trayRect.height - groupHeight - 20) + 10 + 'px';

    const speed = (CONFIG.speed || 1) * 0.8;
    const mover = {
        part: gluedGroup,
        x: parseFloat(gluedGroup.style.left),
        y: parseFloat(gluedGroup.style.top),
        vx: (Math.random() * 1.6 - 0.8) * speed,
        vy: (Math.random() * 1.6 - 0.8) * speed,
    };
    movers.push(mover);

    console.log('Создана склеенная пара:', type1, 'и', type2);
}

function clearAll() {
    console.log("clearAll");
    stopAnimation();
    tray.innerHTML = '';
    if (wrappingTray) wrappingTray.innerHTML = '';
    if (wrappingDoll) wrappingDoll.innerHTML = '';
    shelf.innerHTML = '';
    assembledGroups.clear();
    wrappingGroups.clear();
    currentWrappingDoll = null;
    movers = [];
}

function loseLife(reason) {
    if (lives <= 0) return;
    lives -= 1;
    updateLivesUI();
    if (lives <= 0) {
        CONFIG.time = 0;
        setTimeout(() => {
            showLoseModal(reason);
        }, 500);
    }
}

function resetLives() {
    lives = CONFIG.lives || 3;
    updateLivesUI();
}

function updateLivesUI() {
    if (livesEl) livesEl.textContent = '❤'.repeat(lives);
}

function updateSizeUI(list = []) {
    if (!list.length) {
        if (sizeLabel) sizeLabel.textContent = 'Разные';
        return;
    }
    if (sizeLabel) sizeLabel.textContent = list.join(', ');
}

function updateProgressUI() {
    if (progressEl) progressEl.textContent = `${built} / ${CONFIG.goal}`;
    if (built >= CONFIG.goal && CONFIG.next) {
        stopTimer();
    }
}

function initializeLevel() {
    const originalConfig = getLevelConfig();
    CONFIG.time = originalConfig.time;
    CONFIG.lives = originalConfig.lives;
    CONFIG.goal = originalConfig.goal;
    CONFIG.setsPerGeneration = originalConfig.setsPerGeneration;
    CONFIG.speed = originalConfig.speed;
    CONFIG.allowWrapping = originalConfig.allowWrapping;
    CONFIG.next = originalConfig.next;
    levelNameEl.textContent = CONFIG.name;

    built = 0;
    collectedMatryoshkas = 0;
    assembledDollsHistory = [];
    dollIndex = 1;

    updateProgressUI();
    gameStartTime = Date.now();
    lives = CONFIG.lives;
    setupModalHandlers();
    generateSet();
    startAnimation();
    startTimer();
}

function startTimer() {
    stopTimer();
    let totalTime = CONFIG.time;
    let timeLeft = totalTime;
    updateTimerUI(timeLeft, totalTime);
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerUI(timeLeft, totalTime);
        if (timeLeft <= 0) {
            stopTimer();
            setTimeout(() => {
                showLoseModal('Время вышло');
            }, 500);
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerUI(sec, totalTime) {
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    if (timerEl) timerEl.textContent = `${min}:${s < 10 ? '0' : ''}${s}`;
    if (timerProgressEl) timerProgressEl.value = (sec / totalTime) * 100;
}

function calculateTimeSpent() {
    if (!gameStartTime) return 0;
    return Math.floor((Date.now() - gameStartTime) / 1000);
}

function getCurrentTime() {
    const timerText = timerEl.textContent;
    const [min, sec] = timerText.split(':').map(Number);
    return min * 60 + sec;
}

function saveGameStats(result, matryoshkas, time, lives, score) {
    const playerName = localStorage.getItem('playerName') || 'Игрок';
    const levelNum = parseInt(CONFIG.name.split(' ')[1]);
    let playerStats = JSON.parse(localStorage.getItem(`playerStats_${playerName}`) || '{}');
    playerStats[`level${levelNum}`] = {
        result,
        matryoshkas,
        time,
        lives,
        score,
        date: new Date().toISOString()
    };
    localStorage.setItem(`playerStats_${playerName}`, JSON.stringify(playerStats));
    const stats = {
        result,
        level: CONFIG.name,
        matryoshkas,
        time,
        lives,
        score,
        date: new Date().toISOString(),
        player: playerName
    };
    localStorage.setItem('lastGameStats', JSON.stringify(stats));

    if (result === 'win') {
        updateLeaderboard(playerName, score);
    }
}

function updateLeaderboard(playerName, score) {
    const playerStats = JSON.parse(localStorage.getItem(`playerStats_${playerName}`) || '{}');
    let totalScore = 0;
    for (const level in playerStats) {
        if (playerStats[level].result === 'win') {
            totalScore += playerStats[level].score;
        }
    }

    let leaderboard = JSON.parse(localStorage.getItem('leaderboard') || '[]');
    const existing = leaderboard.find(entry => entry.name === playerName);
    if (existing) {
        existing.score = totalScore;
        existing.date = new Date().toISOString();
    } else {
        leaderboard.push({ name: playerName, score: totalScore, date: new Date().toISOString() });
    }
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 10); 
    localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
}

function loadLeaderboard() {
    const leaderboard = JSON.parse(localStorage.getItem('leaderboard') || '[]');
    const container = document.getElementById('leaderboard');
    if (!container) return;
    container.innerHTML = '';
    if (leaderboard.length === 0) {
        container.innerHTML = '<p>Пока нет результатов</p>';
        return;
    }
    leaderboard.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <span class="leaderboard-name">${index + 1}. ${entry.name}</span>
            <span class="leaderboard-score">${entry.score}</span>
        `;
        container.appendChild(item);
    });
}

function startConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) {
        console.error('Confetti container not found');
        return;
    }
    container.style.display = 'block';
    container.innerHTML = '';
    const colors = ['#ff9aa2', '#8ec5ff', '#6adf9b', '#f6a93b', '#8b5cf6', '#ffd58a'];
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        const color = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.backgroundColor = color;
        const size = Math.random() * 8 + 4;
        confetti.style.width = `${size}px`;
        confetti.style.height = `${size}px`;
        confetti.style.left = `${Math.random() * 100}%`;
        confetti.style.top = `-10px`;
        const duration = Math.random() * 2 + 3;
        const delay = Math.random() * 1;
        confetti.style.animation = `fall ${duration}s ease-out ${delay}s forwards`;
        container.appendChild(confetti);
        setTimeout(() => {
            if (confetti.parentNode) {
                confetti.remove();
            }
        }, (duration + delay) * 1000 + 100);
    }
}

function setupModalHandlers() {
    document.getElementById('nextLevelBtn').addEventListener('click', () => {
        if (CONFIG.next) {
            window.location.href = CONFIG.next;
        } else {
            window.location.href = 'index.html';
        }
    });
    document.getElementById('restartLevelBtn').addEventListener('click', () => {
        hideModals();
        initializeLevel();
    });
    document.getElementById('mainMenuBtn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    document.getElementById('restartAfterLoseBtn').addEventListener('click', () => {
        hideModals();
        initializeLevel();
    });
    document.getElementById('mainMenuLoseBtn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideModals();
            }
        });
    });
}

function hideModals() {
    document.getElementById('winModal').style.display = 'none';
    document.getElementById('loseModal').style.display = 'none';
}

function resetGame() {
    stopTimer();
    const originalConfig = getLevelConfig();
    CONFIG.time = originalConfig.time;
    updateTimerUI(CONFIG.time, CONFIG.time);
    stopAnimation();
    clearAll();
    lives = CONFIG.lives;
    built = 0;
    collectedMatryoshkas = 0;
    dollIndex = 1;
    completedDollMovers = [];
    updateLivesUI();
    updateProgressUI();
    gameStartTime = Date.now();
}

function startGame() {
    generateSet();
    startAnimation();
    startTimer();
}

if (generateBtn) generateBtn.addEventListener('click', generateSet);
if (clearBtn) clearBtn.addEventListener('click', clearAll);

const startGameBtn = document.getElementById('startGame');
if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
        const inputPlayerName = document.getElementById('playerName').value.trim() || 'Игрок';

        if (inputPlayerName.length < 2) {
            alert('Пожалуйста, введите имя (минимум 2 символа)');
            return;
        }

        localStorage.setItem('playerName', inputPlayerName);

        window.location.href = 'levels/level1.html';
    });
}

const playerNameInput = document.getElementById('playerName');
if (playerNameInput) {
    playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('startGame').click();
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const playerDisplay = document.createElement('div');
    playerDisplay.className = 'hud-item';
    playerDisplay.innerHTML = `
        <div class="label">Игрок</div>
        <div class="value">${localStorage.getItem('playerName') || 'Игрок'}</div>
    `;

    const hud = document.querySelector('.hud');
    if (hud) {
        hud.insertBefore(playerDisplay, hud.firstChild);
    }

    const levelLinks = document.querySelectorAll('a[href*="level"]');
    levelLinks.forEach(link => {
        const href = link.getAttribute('href');
        const levelMatch = href.match(/level(\d)/);
        if (levelMatch) {
            const levelNum = parseInt(levelMatch[1]);
            if (!canAccessLevel(levelNum)) {
                link.classList.add('locked');
                link.title = `Сначала пройдите предыдущие уровни`;
            }
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'и' || e.key === 'И' || e.key === 'b' || e.key === 'B') {
        const note = document.getElementById('levelNote');
        if (note) {
            note.style.display = 'block';
        }
    }
});

if (tray && shelf) {
    initializeLevel();
}
