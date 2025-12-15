function canAccessLevel(levelNum) {
    console.log("canAccessLevel");
    const playerName = localStorage.getItem('playerName') || 'Игрок';
    if (playerName.toLowerCase() === 'admin') {
        return true;
    }
    if (levelNum === 1) return true;
    const playerStats = JSON.parse(localStorage.getItem(`playerStats_${playerName}`) || '{}');
    for (let i = 1; i < levelNum; i++) {
        const prevLevelStats = playerStats[`level${i}`];
        if (!prevLevelStats || prevLevelStats.result !== 'win') {
            return false;
        }
    }
    return true;
}


document.addEventListener('DOMContentLoaded', function () {
    const playerDisplay = document.createElement('div');
    playerDisplay.className = 'hud-item';
    playerDisplay.innerHTML = `
        <div class="label">Игрок</div>
        <div class="value">${playerName}</div>
    `;

    const hud = document.querySelector('.hud');
    if (hud) {
        hud.insertBefore(playerDisplay, hud.firstChild);
    }

    // Блокировка уровней
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

let assembledDollsHistory = [];
let waitingDolls = [];
const playerName = localStorage.getItem('playerName') || 'Игрок';
let gameStartTime = null;
let collectedMatryoshkas = 0;
const tray = document.getElementById('partsTray');
const wrappingTray = document.getElementById('wrappingParts');
const wrappingDoll = document.getElementById('wrappingDoll');
let currentWrappingDoll = null;
const shelf = document.getElementById('shelf');
const generateBtn = document.getElementById('generateParts');
const clearBtn = document.getElementById('clearParts');
const livesEl = document.getElementById('lives');
const sizeLabel = document.getElementById('sizeLabel');
const progressEl = document.getElementById('progress');
const levelNameEl = document.getElementById('levelName');
const timerEl = document.getElementById('timer');
const timerProgressEl = document.getElementById('timerProgress');
let wrappingGroups = new Map(); // Map<setId, {innerMatryoshka, head, body, base}>

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
function getLevelConfig() {
    console.log("getLevelConfig");
    const url = window.location.pathname;
    const pageName = url.split('/').pop();
    const levelMatch = pageName.match(/level(\d)/) || ['', '1'];
    const levelNum = parseInt(levelMatch[1]) || 1;
    const levels = {
        1: {
            name: 'Уровень 1',
            goal: 3,
            setsPerGeneration: 3,
            lives: 3,
            speed: 1,
            time: 180,
            next: 'level2.html',
            allowWrapping: false
        },
        2: {
            name: 'Уровень 2',
            goal: 3,
            setsPerGeneration: 3,
            lives: 3,
            speed: 1.2,
            time: 120,
            next: 'level3.html',
            allowWrapping: true
        },
        3: {
            name: 'Уровень 3',
            goal: 3,
            setsPerGeneration: 3,
            lives: 3,
            speed: 1.5,
            time: 90,
            next: '',
            allowWrapping: true
        }
    };
    return levels[levelNum];
}
const CONFIG = getLevelConfig();
const IMAGE_SETS = {
    1: {
        head: 'img/matr11.png',
        body: 'img/matr12.png',
        base: 'img/matr13.png'
    },
    2: {
        head: 'img/matr21.png',
        body: 'img/matr22.png',
        base: 'img/matr23.png'
    },
    3: {
        head: 'img/matr31.png',
        body: 'img/matr32.png',
        base: 'img/matr33.png'
    }
};
const SIZES = [
    { label: 'Малая', scale: 0.8 },
    { label: 'Средняя', scale: 1 },
    { label: 'Большая', scale: 1.25 },
];
const ATTACH_RULES = {
    head: ['body'],
    body: ['head', 'base'],
    base: ['body'],
};
let dollIndex = 1;
let dragging = null;
let lives = 3;
let built = 0;
let setIdCounter = 1;
let movers = [];
let animationId = null;
let assembledGroups = new Map();
let timerInterval = null;
let lastHighlight = 0;
function randomFrom(list) {
    console.log("randomFrom");
    return list[Math.floor(Math.random() * list.length)];
}

function makeWrappingPart({ type, setId, size }) {
    console.log("makeWrappingPart");
    const part = document.createElement('div');
    part.className = `part part-${type}`;
    part.dataset.type = type;
    part.dataset.setId = setId;
    const imageSetId = (setId % 3) + 1;
    const imageUrl = IMAGE_SETS[imageSetId][type];
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.userSelect = 'none';
    img.style.pointerEvents = 'none';
    const label = document.createElement('span');
    label.textContent = `${size.label}`;
    part.appendChild(img);
    part.appendChild(label);
    part.dataset.imageSetId = imageSetId;
    part.style.setProperty('--scale', size.scale);
    enableDrag(part);
    wrappingTray.appendChild(part);
    placeInWrappingTray(part);
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
    glueLabel.textContent = 'Склеено!';
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

function makePart({ type, setId, size, dirty = false, isGlued = false }) {
    const part = document.createElement('div');
    part.className = `part part-${type}`;
    if (dirty) part.classList.add('dirty');
    if (isGlued) part.classList.add('glued');

    console.log("makePart");

    part.dataset.type = type;
    part.dataset.setId = setId;
    const imageSetId = (setId % 3) + 1;
    const imageUrl = IMAGE_SETS[imageSetId][type];
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.userSelect = 'none';
    img.style.pointerEvents = 'none';
    const label = document.createElement('span');
    label.textContent = `${size.label}`;
    part.appendChild(img);
    part.appendChild(label);
    part.dataset.imageSetId = imageSetId;
    part.style.setProperty('--scale', size.scale);



    enableDrag(part);

    tray.appendChild(part);
    placeInTray(part);

    return part;
}

function canAttach(type1, type2) {
    const rules = ATTACH_RULES[type1] || [];
    return rules.includes(type2);
}

function enableToolDrag(tool) {
    tool.style.pointerEvents = 'auto';
    tool.style.cursor = 'grab';

    function getToolEventCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
        }
        return { clientX: e.clientX, clientY: e.clientY };
    }

    function startToolDrag(e) {
        e.preventDefault();
        e.stopPropagation();

        const coords = getToolEventCoords(e);

        const clone = tool.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.zIndex = '1000';
        clone.style.pointerEvents = 'none';
        document.body.appendChild(clone);

        const offsetX = coords.clientX - tool.getBoundingClientRect().left;
        const offsetY = coords.clientY - tool.getBoundingClientRect().top;

        let isRemoved = false;

        const move = (e) => {
            const moveCoords = getToolEventCoords(e);
            clone.style.left = `${moveCoords.clientX - offsetX}px`;
            clone.style.top = `${moveCoords.clientY - offsetY}px`;
        };

        const up = (e) => {
            if (!isRemoved && clone.parentNode) {
                document.body.removeChild(clone);
                isRemoved = true;
            }

            const upCoords = getToolEventCoords(e);
            const target = findPartUnderCursor(upCoords.clientX, upCoords.clientY);

            if (target) {
                if (tool.dataset.tool === 'sponge') {

                    if (target.classList.contains('dirty')) {
                        target.classList.remove('dirty');
                        console.log('Очищено губкой!');
                    } else {
                        console.log('Губкой можно очищать только грязные детали!');
                    }

                } else if (tool.dataset.tool === 'hammer') {
                    let targetToBreak = target.closest('.glued-pair');
                    if (targetToBreak && targetToBreak.dataset.isGluedPair === 'true') {
                        breakGluedPair(targetToBreak);
                        console.log('Разбита слипшаяся пара молотком!');
                        return;
                    }
                    console.log('Молотком можно разбивать только склеенные пары!');
                }
            } else {
                console.log('Не удалось найти цель для инструмента');
            }

            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', up);
        };

        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up, { once: true });
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', up, { once: true });
    }

    tool.addEventListener('pointerdown', startToolDrag);
    tool.addEventListener('touchstart', startToolDrag, { passive: false });
}

function breakGluedPair(gluedGroup) {
    console.log("Разбиваем склеенную пару", gluedGroup);

    const parts = gluedGroup.querySelectorAll('.part');
    if (parts.length !== 2) {
        console.error('Некорректная склеенная группа:', parts);
        return;
    }

    const part1 = parts[0];
    const part2 = parts[1];

    const type1 = part1.dataset.type;
    const type2 = part2.dataset.type;
    const setId1 = part1.dataset.setId;
    const setId2 = part2.dataset.setId;
    const dirty1 = part1.classList.contains('dirty');
    const dirty2 = part2.classList.contains('dirty');

    console.log('Детали в паре:', type1, 'и', type2, 'Set IDs:', setId1, setId2);

    const originalScale1 = parseFloat(part1.style.getPropertyValue('--scale') || '1');
    const originalSize1 = SIZES.find(s => Math.abs(s.scale - originalScale1) < 0.01) || SIZES[1];

    const originalScale2 = parseFloat(part2.style.getPropertyValue('--scale') || '1');
    const originalSize2 = SIZES.find(s => Math.abs(s.scale - originalScale2) < 0.01) || SIZES[1];

    gluedGroup.remove();
    movers = movers.filter(m => m.part !== gluedGroup);

    const newPart1 = makePart({
        type: type1,
        setId: setId1,
        size: originalSize1,
        dirty: dirty1,
        isGlued: false
    });
    const newPart2 = makePart({
        type: type2,
        setId: setId2,
        size: originalSize2,
        dirty: dirty2,
        isGlued: false
    });
    console.log('Созданы новые детали:', type1, 'и', type2);

    const trayRect = tray.getBoundingClientRect();
    const spacing = 20;
    const p1Width = newPart1.offsetWidth;
    const p2Width = newPart2.offsetHeight;
    const totalWidth = p1Width + spacing + p2Width;
    const margin = 10;
    const maxStartX = trayRect.width - totalWidth - 2 * margin;
    let posX1, posX2, posY1;
    if (maxStartX > 0) {
        posX1 = Math.random() * maxStartX + margin;
        posX2 = posX1 + p1Width + spacing;
    } else {
        posX1 = margin;
        posX2 = trayRect.width - p2Width - margin;
    }
    const maxHeight = Math.max(newPart1.offsetHeight, newPart2.offsetHeight);
    posY1 = Math.random() * (trayRect.height - maxHeight - 2 * margin) + margin;
    const posY2 = posY1;

    newPart1.style.left = `${posX1}px`;
    newPart1.style.top = `${posY1}px`;
    newPart2.style.left = `${posX2}px`;
    newPart2.style.top = `${posY2}px`;

    const updateMover = (part, x, y) => {
        const mover = movers.find(m => m.part === part);
        if (mover) {
            mover.x = x;
            mover.y = y;
        }
    };
    updateMover(newPart1, posX1, posY1);
    updateMover(newPart2, posX2, posY2);
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
function enableDrag(part) {
    console.log("enableDrag");

    function getEventCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
        }
        return { clientX: e.clientX, clientY: e.clientY };
    }

    function startDrag(e) {
        if (lives <= 0) {
            return;
        }
        if (part.classList.contains('dirty')) {
            return;
        }

        e.preventDefault();
        const coords = getEventCoords(e);

        if (e.pointerId !== undefined) {
            part.setPointerCapture(e.pointerId);
        }

        const rect = part.getBoundingClientRect();
        const originParent = part.parentElement;
        let allowedContainer;

        if (originParent === tray || originParent.closest('#partsTray')) {
            allowedContainer = tray;
        } else if (originParent === wrappingTray || originParent.closest('#wrappingParts')) {

            const wrappingArea = document.querySelector('.wrapping-area');
            if (wrappingArea) {
                allowedContainer = wrappingArea;
            } else if (wrappingTray) {
                allowedContainer = wrappingTray;
            } else {
                allowedContainer = tray;
            }
        } else {
            allowedContainer = originParent;
        }

        if (!allowedContainer) {
            console.error('allowedContainer is null!');
            allowedContainer = tray;
        }

        dragging = {
            part,
            offsetX: coords.clientX - rect.left,
            offsetY: coords.clientY - rect.top,
            originParent: originParent,
            allowedContainer: allowedContainer,
            setId: part.dataset.setId,
            type: part.dataset.type,
        };
        part.classList.add('dragging');
        part.style.position = 'fixed';
        part.style.zIndex = '1000';
        removeMover(part);
        detachFromGroup(part);
        stopAnimation();
        moveAt(coords.clientX, coords.clientY);
        highlightTargets(part);
    }

    function moveDrag(e) {
        if (!dragging || dragging.part !== part) return;
        const coords = getEventCoords(e);
        moveAt(coords.clientX, coords.clientY);
        const now = Date.now();
        if (now - lastHighlight > 200) {
            highlightTargets(part);
            lastHighlight = now;
        }

        if (wrappingDoll) {
            const hoveredElement = findPartUnderCursor(coords.clientX, coords.clientY);
            if (hoveredElement &&
                hoveredElement.classList.contains('completed-doll') &&
                (hoveredElement.parentElement === wrappingDoll ||
                    hoveredElement.parentElement.parentElement === wrappingDoll)) {
                const draggedScale = parseFloat(part.style.getPropertyValue('--scale') || '1');
                const innerScale = parseFloat(hoveredElement.dataset.innerScale || '1');
                if (draggedScale > innerScale) {
                    hoveredElement.classList.add('can-attach');
                }
            }
        }
    }

    function endDrag(e) {
        if (!dragging || dragging.part !== part) return;
        const coords = getEventCoords(e);

        if (e.pointerId !== undefined) {
            part.releasePointerCapture(e.pointerId);
        }

        finishDrag({ clientX: coords.clientX, clientY: coords.clientY });
        startAnimation();
        dragging = null;
    }

    part.addEventListener('pointerdown', startDrag);
    part.addEventListener('pointermove', moveDrag);
    part.addEventListener('pointerup', endDrag);

    part.addEventListener('touchstart', startDrag, { passive: false });
    part.addEventListener('touchmove', moveDrag, { passive: false });
    part.addEventListener('touchend', endDrag, { passive: false });
}
function moveAt(x, y) {
    if (!dragging) return;
    const { part, offsetX, offsetY, allowedContainer } = dragging;

    if (!allowedContainer) {
        console.error('moveAt: allowedContainer is null!');
        return;
    }

    if (!allowedContainer.getBoundingClientRect) {
        console.error('moveAt: allowedContainer is not a DOM element!', allowedContainer);
        return;
    }

    const containerRect = allowedContainer.getBoundingClientRect();
    const partWidth = part.offsetWidth;
    const partHeight = part.offsetHeight;


    const minX = containerRect.left;
    const maxX = containerRect.right - partWidth;
    const minY = containerRect.top;
    const maxY = containerRect.bottom - partHeight;

    x = Math.max(minX, Math.min(x, maxX));
    y = Math.max(minY, Math.min(y, maxY));

    part.style.left = `${x - offsetX}px`;
    part.style.top = `${y - offsetY}px`;
}

function highlightTargets(draggedPart) {
    console.log("highlightTargets");
    const draggedType = draggedPart.dataset.type;
    const allowedTargets = ATTACH_RULES[draggedType] || [];
    const draggedSetId = draggedPart.dataset.setId;
    const draggedScale = parseFloat(draggedPart.style.getPropertyValue('--scale') || '1');
    const { allowedContainer } = dragging;
    Array.from(document.querySelectorAll('.part, .assembled-group')).forEach((p) => {
        p.classList.remove('can-attach');
    });
    const candidates = Array.from(document.querySelectorAll('.part, .assembled-group, .completed-doll, .wrapping-group'));
    candidates.forEach((target) => {
        if (target === draggedPart) return;
        if (target.classList.contains('dragging')) return;
        if (!allowedContainer.contains(target)) return;
        const targetType = target.dataset.type;
        const targetSetId = target.dataset.setId;
        if (targetSetId === draggedSetId && !isPartInCompleteGroup(target)) {
            if (allowedTargets.includes(targetType) || targetType === 'group' || assembledGroups.has(draggedSetId)) {
                target.classList.add('can-attach');
            }
        }
        if (CONFIG.allowWrapping && target.classList.contains('completed-doll')) {
            const innerScale = parseFloat(target.dataset.innerScale || '1');
            if (draggedScale > innerScale) {
                target.classList.add('can-attach');
            }
        }
    });
}





function placeInWrappingTray() {
    console.log("placeInWrappingTray");
    const parts = wrappingTray.querySelectorAll('.part');
    parts.forEach(part => {
        part.style.position = '';
        part.style.left = '';
        part.style.top = '';
        part.style.transform = '';
    });
}

function returnToWrappingTray(part) {
    console.log("returnToWrappingTray");
    wrappingTray.appendChild(part);
    placeInWrappingTray(part);
}


function finishDrag(e) {
    if (!dragging) return;

    const { part, setId, type, allowedContainer, originParent } = dragging;

    if (!allowedContainer) {
        console.error('finishDrag: allowedContainer is null!');
        returnToTray(part);
        dragging = null;
        return;
    }

    if (!allowedContainer.getBoundingClientRect) {
        console.error('finishDrag: allowedContainer is not a DOM element!');
        returnToTray(part);
        dragging = null;
        return;
    }

    if (wrappingTray) {
        Array.from(wrappingTray.querySelectorAll('.part, .completed-doll')).forEach((p) => {
            p.classList.remove('can-attach');
        });
    }

    let hoveredElement = findPartUnderCursor(e.clientX, e.clientY);

    const isInWrappingArea = allowedContainer.classList.contains('wrapping-area') ||
        allowedContainer.id === 'wrappingParts' ||
        allowedContainer.closest('.wrapping-area');

    if (isInWrappingArea && hoveredElement && hoveredElement.classList.contains('part')) {
        if (originParent === wrappingTray) {
            returnToWrappingTray(part);
        }
        dragging = null;
        return;
    }

    part.classList.remove('dragging');
    part.style.position = 'absolute';
    part.style.zIndex = '';

    Array.from(tray.querySelectorAll('.part, .assembled-group')).forEach((p) => {
        p.classList.remove('can-attach');
    });

    const dropX = e.clientX;
    const dropY = e.clientY;
    const containerRect = allowedContainer.getBoundingClientRect();
    const isWithinAllowedArea = dropX >= containerRect.left && dropX <= containerRect.right &&
        dropY >= containerRect.top && dropY <= containerRect.bottom;

    if (CONFIG.allowWrapping && hoveredElement && hoveredElement.classList.contains('completed-doll') &&
        hoveredElement.parentElement === wrappingDoll) {
        const draggedScale = parseFloat(part.style.getPropertyValue('--scale') || '1');
        const innerScale = parseFloat(hoveredElement.dataset.innerScale || '1');
        if (draggedScale > innerScale) {
            wrapAroundDoll(part, hoveredElement);
            dragging = null;
            return;
        }
    }

    if (!isWithinAllowedArea) {
        if (originParent === tray) {
            returnToTray(part);
        } else if (originParent === wrappingTray) {
            returnToWrappingTray(part);
        }
        dragging = null;
        return;
    }

    if (hoveredElement && hoveredElement !== part) {
        if (hoveredElement.classList.contains('completed-doll') &&
            (hoveredElement.parentElement === wrappingDoll ||
                hoveredElement.parentElement.parentElement === wrappingDoll)) {
            if (CONFIG.allowWrapping) {
                const draggedScale = parseFloat(part.style.getPropertyValue('--scale') || '1');
                const innerScale = parseFloat(hoveredElement.dataset.innerScale || '1');
                if (draggedScale > innerScale) {
                    wrapAroundDoll(part, hoveredElement);
                } else {
                    if (originParent === tray) {
                        returnToTray(part);
                    } else if (originParent === wrappingTray) {
                        returnToWrappingTray(part);
                    }
                    loseLife('Деталь должна быть больше матрешки');
                }
                dragging = null;
                return;
            }
        }

        if (hoveredElement.dataset.type === 'wrapping') {
            const innerDoll = hoveredElement.querySelector('.completed-doll');
            if (innerDoll) {
                hoveredElement = innerDoll;
                if (CONFIG.allowWrapping && hoveredElement.parentElement.parentElement === wrappingDoll) {
                    wrapAroundDoll(part, hoveredElement);
                    dragging = null;
                    return;
                }
            }
        }

        let hoveredType = hoveredElement.dataset.type;
        let hoveredSetId = hoveredElement.dataset.setId;
        const allowedTargets = ATTACH_RULES[type] || [];

        if (hoveredElement.classList.contains('completed-doll') && !hoveredElement.dataset.type === 'wrapping') {
            if (originParent === tray) {
                returnToTray(part);
            } else if (originParent === wrappingTray) {
                returnToWrappingTray(part);
            }
            loseLife('В этой области можно только собирать матрешки из деталей');
            dragging = null;
            return;
        }

        const isSameSet = hoveredSetId === setId;
        const isStrictMatch = allowedTargets.includes(hoveredType);
        const groupExists = assembledGroups.has(setId);
        const canAttach =
            isSameSet &&
            !isPartInCompleteGroup(hoveredElement) &&
            (isStrictMatch || groupExists || hoveredType === 'group');

        if (canAttach) {
            let targetPart = hoveredElement;
            if (hoveredType === 'group') {
                const group = assembledGroups.get(setId);
                targetPart = group.head || group.body || group.base;
            }
            if (targetPart) {
                attachParts(part, targetPart);
            }
        } else {
            if (originParent === tray) {
                returnToTray(part);
            } else if (originParent === wrappingTray) {
                returnToWrappingTray(part);
            }
            if (!isSameSet) {
                loseLife('Неверный размер');
            } else if (isPartInCompleteGroup(hoveredElement)) {
                loseLife('Матрешка уже собрана');
            } else {
                loseLife('Неверная комбинация');
            }
        }
    } else {
        if (allowedContainer === tray) {
            placeInTray(part);
        } else if (allowedContainer === wrappingTray) {
            placeInWrappingTray(part);
        }
    }
    dragging = null;
}


function findPartUnderCursor(x, y) {
    console.log("findPartUnderCursor");
    const candidates = Array.from(document.querySelectorAll('.part, .assembled-group, .completed-doll, .wrapping-group, .glued-pair'));
    for (const element of candidates) {
        if (element.classList.contains('dragging')) continue;
        const rect = element.getBoundingClientRect();
        const padding = 20;
        if (
            x >= rect.left - padding &&
            x <= rect.right + padding &&
            y >= rect.top - padding &&
            y <= rect.bottom + padding
        ) {
            return element;
        }
    }
    return null;
}
function wrapAroundDoll(newPart, completedDoll) {
    const newSetId = newPart.dataset.setId;
    const newType = newPart.dataset.type;
    let wrapGroup = wrappingGroups.get(completedDoll.dataset.wrappingId);

    if (!wrapGroup) {
        const wrappingId = `wrap_${setIdCounter++}`;
        completedDoll.dataset.wrappingId = wrappingId;

        const existingParts = completedDoll.dataset.containsParts || completedDoll.dataset.imageSetId;

        wrapGroup = {
            wrappingId: wrappingId,
            innerDoll: completedDoll,
            head: null,
            body: null,
            base: null,
            container: null,
            outerSetId: newSetId,
            innerParts: existingParts
        };
        wrappingGroups.set(wrappingId, wrapGroup);

        completedDollMovers = completedDollMovers.filter(m => m.element !== completedDoll);

        const container = document.createElement('div');
        container.className = 'wrapping-group';
        container.style.position = 'absolute';
        container.dataset.wrappingId = wrappingId;
        container.dataset.type = 'wrapping';

        completedDoll.style.position = 'absolute';
        completedDoll.style.left = '50%';
        completedDoll.style.top = '50%';
        completedDoll.style.transform = 'translate(-50%, -50%)';

        container.appendChild(completedDoll);
        wrappingDoll.innerHTML = '';
        wrappingDoll.appendChild(container);

        container.style.left = '50%';
        container.style.top = '50%';
        container.style.transform = 'translate(-50%, -50%)';

        wrapGroup.container = container;
        wrapGroup.x = 0;
        wrapGroup.y = 0;
        wrapGroup.isInWrappingDoll = true;
    }

    if (newSetId !== wrapGroup.outerSetId) {
        if (originParent === tray) {
            returnToTray(newPart);
        } else if (originParent === wrappingTray) {
            returnToWrappingTray(newPart);
        }
        loseLife('Используйте детали одного набора для оборачивания');
        return;
    }

    if (newType === 'head') wrapGroup.head = newPart;
    else if (newType === 'body') wrapGroup.body = newPart;
    else if (newType === 'base') wrapGroup.base = newPart;

    newPart.style.position = 'absolute';
    newPart.style.pointerEvents = 'auto';
    wrapGroup.container.appendChild(newPart);
    removeMover(newPart);
    positionWrappingGroup(wrapGroup);
    checkWrappingComplete(wrapGroup);
}
function positionWrappingGroup(wrapGroup) {
    console.log("positionWrappingGroup");
    if (!wrapGroup.container || !wrapGroup.innerDoll) return;
    const parts = [wrapGroup.head, wrapGroup.body, wrapGroup.base].filter(Boolean);

    if (parts.length === 0) return;

    const innerWidth = wrapGroup.innerDoll.offsetWidth || 100;
    const innerHeight = wrapGroup.innerDoll.offsetHeight || 200;
    const OVERLAP_RATIO = 0.5;

    let totalHeight = innerHeight;
    let maxWidth = innerWidth;
    let headHeight = 0, bodyHeight = 0, baseHeight = 0;
    let headWidth = 0, bodyWidth = 0, baseWidth = 0;

    if (parts.length > 0) {
        const scale = parseFloat(parts[0].style.getPropertyValue('--scale') || '1');

        if (wrapGroup.head) {
            headHeight = (wrapGroup.head.offsetHeight || 96) * scale;
            headWidth = (wrapGroup.head.offsetWidth || 96) * scale;
        }
        if (wrapGroup.body) {
            bodyHeight = (wrapGroup.body.offsetHeight || 120) * scale;
            bodyWidth = (wrapGroup.body.offsetWidth || 104) * scale;
        }
        if (wrapGroup.base) {
            baseHeight = (wrapGroup.base.offsetHeight || 72) * scale;
            baseWidth = (wrapGroup.base.offsetWidth || 112) * scale;
        }

        maxWidth = Math.max(headWidth, bodyWidth, baseWidth, innerWidth);
    }

    const innerHeadHeight = innerHeight * 0.3;
    const innerBodyHeight = innerHeight * 0.4;
    const innerBaseHeight = innerHeight * 0.3;

    totalHeight = 0;
    if (wrapGroup.head) {
        totalHeight += headHeight - (innerHeadHeight * OVERLAP_RATIO);
    }
    if (wrapGroup.head) {
        totalHeight += innerHeadHeight * OVERLAP_RATIO;
    } else {
        totalHeight += innerHeadHeight;
    }
    if (wrapGroup.body) {
        totalHeight += bodyHeight - (innerBodyHeight * OVERLAP_RATIO);
    }
    if (wrapGroup.body) {
        totalHeight += innerBodyHeight * OVERLAP_RATIO;
    } else {
        totalHeight += innerBodyHeight;
    }
    if (wrapGroup.base) {
        totalHeight += baseHeight - (innerBaseHeight * OVERLAP_RATIO);
    }
    if (wrapGroup.base) {
        totalHeight += innerBaseHeight * OVERLAP_RATIO;
    } else {
        totalHeight += innerBaseHeight;
    }

    wrapGroup.container.style.width = `${maxWidth}px`;
    wrapGroup.container.style.height = `${totalHeight}px`;

    const centerY = totalHeight / 2;
    const innerY = centerY - innerHeight / 2;

    wrapGroup.innerDoll.style.position = 'absolute';
    wrapGroup.innerDoll.style.left = `${(maxWidth - innerWidth) / 2}px`;
    wrapGroup.innerDoll.style.top = `${innerY}px`;
    wrapGroup.innerDoll.style.zIndex = '5';
    wrapGroup.innerDoll.style.transform = 'none';

    if (wrapGroup.head) {
        const headY = innerY - headHeight + (innerHeadHeight * OVERLAP_RATIO);
        wrapGroup.head.style.position = 'absolute';
        wrapGroup.head.style.left = `${(maxWidth - headWidth) / 2}px`;
        wrapGroup.head.style.top = `${headY}px`;
        wrapGroup.head.style.zIndex = '10';
        wrapGroup.head.style.pointerEvents = 'auto';
    }

    if (wrapGroup.body) {
        const bodyY = innerY + (innerBodyHeight * 0.3);
        wrapGroup.body.style.position = 'absolute';
        wrapGroup.body.style.left = `${(maxWidth - bodyWidth) / 2}px`;
        wrapGroup.body.style.top = `${bodyY}px`;
        wrapGroup.body.style.zIndex = '8';
        wrapGroup.body.style.pointerEvents = 'auto';
    }

    if (wrapGroup.base) {
        const baseY = innerY + innerHeight - (innerBaseHeight * OVERLAP_RATIO);
        wrapGroup.base.style.position = 'absolute';
        wrapGroup.base.style.left = `${(maxWidth - baseWidth) / 2}px`;
        wrapGroup.base.style.top = `${baseY}px`;
        wrapGroup.base.style.zIndex = '6';
        wrapGroup.base.style.pointerEvents = 'auto';
    }

    if (wrapGroup.isInWrappingDoll) {
        wrapGroup.container.style.left = '50%';
        wrapGroup.container.style.top = '50%';
        wrapGroup.container.style.transform = 'translate(-50%, -50%)';
    } else {
        const wrappingTrayRect = wrappingTray.getBoundingClientRect();
        const maxX = Math.max(0, wrappingTrayRect.width - maxWidth);
        const maxY = Math.max(0, wrappingTrayRect.height - totalHeight);

        if (wrapGroup.vx === undefined || wrapGroup.vy === undefined) {
            wrapGroup.vx = (Math.random() * 1.6 - 0.8) * (CONFIG.speed || 1) * 0.8;
            wrapGroup.vy = (Math.random() * 1.6 - 0.8) * (CONFIG.speed || 1) * 0.8;
        }

        if (wrapGroup.x === undefined) wrapGroup.x = Math.random() * maxX;
        if (wrapGroup.y === undefined) wrapGroup.y = Math.random() * maxY;

        wrapGroup.x = Math.max(0, Math.min(wrapGroup.x, maxX));
        wrapGroup.y = Math.max(0, Math.min(wrapGroup.y, maxY));

        wrapGroup.container.style.left = `${wrapGroup.x}px`;
        wrapGroup.container.style.top = `${wrapGroup.y}px`;
        wrapGroup.container.style.transform = 'none';
    }
}
function tryMoveNextFromQueue() {
    if (currentWrappingDoll || waitingDolls.length === 0) return;
    const next = waitingDolls.shift();
    if (next && next.doll && next.doll.parentElement) {
        completedDollMovers = completedDollMovers.filter(m => m.element !== next.doll);
        next.doll.remove();
        placeInWrappingDoll(next.doll, next.scale);
    }
}
function checkWrappingComplete(wrapGroup) {
    if (wrapGroup.head && wrapGroup.body && wrapGroup.base) {
        const outerScale = parseFloat(wrapGroup.head.style.getPropertyValue('--scale') || '1');
        const imageSetId = (wrapGroup.outerSetId % 3) + 1;

        let allParts = [];

        if (wrapGroup.innerParts) {
            allParts = wrapGroup.innerParts.split(',');
        } else {
            allParts = [wrapGroup.innerDoll.dataset.imageSetId || '1'];
        }

        allParts.push(imageSetId);

        const newCompletedDoll = createCompletedDollFromWrap(wrapGroup, outerScale, imageSetId);

        newCompletedDoll.dataset.containsParts = allParts.join(',');

        updateProgressUI();

        if (outerScale >= 1.25) {
            collectFinalDoll(newCompletedDoll);
            wrapGroup.container.remove();
            wrappingGroups.delete(wrapGroup.wrappingId);
            currentWrappingDoll = null;
            setTimeout(tryMoveNextFromQueue, 300);
        } else {
            wrapGroup.container.remove();
            wrappingGroups.delete(wrapGroup.wrappingId);
            placeInWrappingDoll(newCompletedDoll, outerScale);
        }
    }
}
function createCompletedDollFromWrap(wrapGroup, scale, imageSetId) {
    const doll = document.createElement('div');
    doll.className = 'assembled-group completed-doll';
    doll.style.position = 'absolute';
    doll.dataset.type = 'completed';
    doll.dataset.innerScale = scale;
    doll.dataset.imageSetId = imageSetId;

    if (wrapGroup && wrapGroup.wrappingId) {
        doll.dataset.wrappingId = wrapGroup.wrappingId;
    }

    const img = document.createElement('img');
    img.src = `img/matr${imageSetId}.png`;
    img.style.width = '100px';
    img.style.height = 'auto';
    img.style.objectFit = 'contain';
    img.style.transform = `scale(${scale})`;
    img.style.transformOrigin = 'center';
    img.style.pointerEvents = 'none';
    doll.appendChild(img);

    if (CONFIG.name === 'Уровень 3' && Math.random() < 0.4) {
        doll.classList.add('dirty');
    }

    return doll;
}

let completedDollMovers = [];
function createWrappingParts(innerScale) {
    if (!wrappingTray) return;
    const dolls = wrappingTray.querySelectorAll('.completed-doll');
    wrappingTray.innerHTML = '';
    dolls.forEach(doll => wrappingTray.appendChild(doll));
    const largerSizes = SIZES.filter(s => s.scale > innerScale);
    if (largerSizes.length === 0) return;
    const wrappingSize = largerSizes[0];
    const wrappingSetId = setIdCounter++;
    ['head', 'body', 'base'].forEach((type) => {
        const part = document.createElement('div');
        part.className = `part part-${type} wrapping-part`;
        part.dataset.type = type;
        part.dataset.setId = wrappingSetId;
        part.style.position = 'relative';
        part.style.cursor = 'grab';
        const imageSetId = (wrappingSetId % 3) + 1;
        const imageUrl = IMAGE_SETS[imageSetId][type];
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.userSelect = 'none';
        img.style.pointerEvents = 'none';
        const label = document.createElement('span');
        label.textContent = `${wrappingSize.label}`;
        part.appendChild(img);
        part.appendChild(label);
        part.dataset.imageSetId = imageSetId;
        part.style.setProperty('--scale', wrappingSize.scale);
        enableDrag(part);
        wrappingTray.appendChild(part);
    });
}
function attachParts(part1, part2) {
    const type1 = part1.dataset.type;
    const type2 = part2.dataset.type;
    const setId = part1.dataset.setId;
    let group = assembledGroups.get(setId);
    const isNewGroup = !group;
    if (!group) {
        group = { head: null, body: null, base: null, container: null };
        assembledGroups.set(setId, group);
    }
    if (type1 === 'head') group.head = part1;
    else if (type1 === 'body') group.body = part1;
    else if (type1 === 'base') group.base = part1;
    if (type2 === 'head') group.head = part2;
    else if (type2 === 'body') group.body = part2;
    else if (type2 === 'base') group.base = part2;
    if (!group.container) {
        group.container = document.createElement('div');
        group.container.className = 'assembled-group';
        group.container.style.position = 'absolute';
        group.container.style.pointerEvents = 'none';
        group.container.dataset.setId = setId;
        group.container.dataset.type = 'group';
        tray.appendChild(group.container);
    }
    const partsToMove = [];
    if (group.head && !group.container.contains(group.head)) partsToMove.push(group.head);
    if (group.body && !group.container.contains(group.body)) partsToMove.push(group.body);
    if (group.base && !group.container.contains(group.base)) partsToMove.push(group.base);
    if (isNewGroup || group.x === undefined) {
        const trayRect = tray.getBoundingClientRect();
        const partToUse = partsToMove[0] || group.head || group.body;
        if (partToUse) {
            const partRect = partToUse.getBoundingClientRect();
            group.x = partRect.left - trayRect.left;
            group.y = partRect.top - trayRect.top;
        }
    }
    partsToMove.forEach(part => {
        const currentLeft = parseFloat(part.style.left || '0');
        const currentTop = parseFloat(part.style.top || '0');
        part.style.left = `${currentLeft - group.x}px`;
        part.style.top = `${currentTop - group.y}px`;
        part.style.position = 'absolute';
        part.style.transform = '';
        part.style.margin = '0';
        part.style.pointerEvents = 'auto';
        group.container.appendChild(part);
    });
    positionGroup(group);
    checkGroupComplete(group, setId);
}
function positionGroup(group) {
    if (!group.container) return;
    const parts = [group.head, group.body, group.base].filter(Boolean);
    if (parts.length === 0) return;
    const firstPart = parts[0];
    const scale = parseFloat(firstPart.style.getPropertyValue('--scale') || '1');
    const headHeight = group.head ? (group.head.offsetHeight || 96) * scale : 0;
    const bodyHeight = group.body ? (group.body.offsetHeight || 120) * scale : 0;
    const baseHeight = group.base ? (group.base.offsetHeight || 72) * scale : 0;
    const headWidth = group.head ? (group.head.offsetWidth || 96) * scale : 0;
    const bodyWidth = group.body ? (group.body.offsetWidth || 104) * scale : 0;
    const baseWidth = group.base ? (group.base.offsetWidth || 112) * scale : 0;
    const OVERLAP_RATIO = 0.05;
    let totalHeight = 0;
    if (group.head) totalHeight += headHeight;
    if (group.body) {
        totalHeight += group.head ? bodyHeight * (1 - OVERLAP_RATIO) : bodyHeight;
    }
    if (group.base) {
        totalHeight += group.body ? baseHeight * (1 - OVERLAP_RATIO) : baseHeight;
    }
    const maxWidth = Math.max(headWidth, bodyWidth, baseWidth);
    group.container.style.width = `${maxWidth}px`;
    group.container.style.height = `${totalHeight}px`;
    let currentY = 0;
    if (group.head) {
        group.head.style.position = 'absolute';
        group.head.style.left = `${(maxWidth - headWidth) / 2}px`;
        group.head.style.top = `${currentY}px`;
        group.head.style.transform = '';
        group.head.style.margin = '0';
        group.head.style.zIndex = '3';
        currentY += headHeight * (1 - OVERLAP_RATIO);
    }
    if (group.body) {
        group.body.style.position = 'absolute';
        group.body.style.left = `${(maxWidth - bodyWidth) / 2}px`;
        group.body.style.top = `${currentY}px`;
        group.body.style.transform = '';
        group.body.style.margin = '0';
        group.body.style.zIndex = '2';
        currentY += bodyHeight * (1 - OVERLAP_RATIO);
    }
    if (group.base) {
        group.base.style.position = 'absolute';
        group.base.style.left = `${(maxWidth - baseWidth) / 2}px`;
        group.base.style.top = `${currentY}px`;
        group.base.style.transform = '';
        group.base.style.margin = '0';
        group.base.style.zIndex = '1';
    }
    if (group.vx === undefined || group.vy === undefined) {
        group.vx = (Math.random() * 1.6 - 0.8) * (CONFIG.speed || 1) * 0.8;
        group.vy = (Math.random() * 1.6 - 0.8) * (CONFIG.speed || 1) * 0.8;
    }
    const trayRect = tray.getBoundingClientRect();
    const maxX = Math.max(0, trayRect.width - maxWidth);
    const maxY = Math.max(0, trayRect.height - totalHeight);
    if (group.x === undefined) group.x = Math.random() * maxX;
    if (group.y === undefined) group.y = Math.random() * maxY;
    group.x = Math.max(0, Math.min(group.x, maxX));
    group.y = Math.max(0, Math.min(group.y, maxY));
    group.container.style.left = `${group.x}px`;
    group.container.style.top = `${group.y}px`;
    parts.forEach((part) => removeMover(part));
}
function detachFromGroup(part) {
    const setId = part.dataset.setId;
    const group = assembledGroups.get(setId);
    if (!group) return;
    if (group.head === part) group.head = null;
    if (group.body === part) group.body = null;
    if (group.base === part) group.base = null;
    if (!group.head && !group.body && !group.base) {
        if (group.container) {
            group.container.remove();
        }
        assembledGroups.delete(setId);
    } else {
        const currentX = group.x;
        const currentY = group.y;
        positionGroup(group);
        group.x = currentX;
        group.y = currentY;
        if (group.container) {
            group.container.style.left = `${group.x}px`;
            group.container.style.top = `${group.y}px`;
        }
    }
    tray.appendChild(part);
    placeInTray(part);
}
function isPartInCompleteGroup(part) {
    const setId = part.dataset.setId;
    const group = assembledGroups.get(setId);
    return group && group.head && group.body && group.base;
}
function checkGroupComplete(group, setId) {
    if (group.head && group.body && group.base) {
        const scale = parseFloat(group.head.style.getPropertyValue('--scale') || '1');
        const imageSetId = group.head.dataset.imageSetId;

        const completedDoll = document.createElement('div');
        completedDoll.className = 'assembled-group completed-doll';
        completedDoll.style.position = 'absolute';
        completedDoll.dataset.type = 'completed';
        completedDoll.dataset.innerScale = scale;
        completedDoll.dataset.setId = setId;
        completedDoll.dataset.imageSetId = imageSetId;

        let partsInfo = [imageSetId];

        const parts = [group.head, group.body, group.base];
        parts.forEach(part => {
            if (part.dataset.containsParts) {
                const innerParts = part.dataset.containsParts.split(',');
                partsInfo.unshift(...innerParts);
            }
        });

        completedDoll.dataset.containsParts = partsInfo.join(',');

        const matryoshkaImg = document.createElement('img');
        matryoshkaImg.src = `img/matr${imageSetId}.png`;
        matryoshkaImg.style.width = '100px';
        matryoshkaImg.style.height = 'auto';
        matryoshkaImg.style.objectFit = 'contain';
        matryoshkaImg.style.transform = `scale(${scale})`;
        matryoshkaImg.style.transformOrigin = 'center';
        matryoshkaImg.style.pointerEvents = 'none';
        completedDoll.appendChild(matryoshkaImg);

        updateProgressUI();

        if (group.container) group.container.remove();
        assembledGroups.delete(setId);

        if (!CONFIG.allowWrapping || scale >= 1.25) {
            collectFinalDoll(completedDoll);
            return;
        }

        if (!currentWrappingDoll) {
            placeInWrappingDoll(completedDoll, scale);
        } else {
            placeInMainTrayFloating(completedDoll, scale);
            waitingDolls.push({ doll: completedDoll, scale, imageSetId });
        }

        if (built >= CONFIG.goal) {
            setTimeout(() => showWinModal(), 500);
        }
    }
}

function placeInWrappingDoll(doll, scale) {
    currentWrappingDoll = doll;
    wrappingDoll.innerHTML = '';
    wrappingDoll.appendChild(doll);
    doll.style.position = 'absolute';
    doll.style.left = '50%';
    doll.style.top = '50%';
    doll.style.transform = 'translate(-50%, -50%)';
    doll.style.pointerEvents = 'none';
    completedDollMovers = completedDollMovers.filter(m => m.element !== doll);
    generateNextWrappingParts(scale);
}
function placeInMainTrayFloating(doll, scale) {
    tray.appendChild(doll);
    const trayRect = tray.getBoundingClientRect();
    const width = 100 * scale;
    const height = 150 * scale;
    const x = Math.random() * Math.max(0, trayRect.width - width);
    const y = Math.random() * Math.max(0, trayRect.height - height);
    doll.style.left = `${x}px`;
    doll.style.top = `${y}px`;
    const speed = (CONFIG.speed || 1) * 0.8;
    completedDollMovers.push({
        element: doll,
        x, y,
        vx: (Math.random() * 1.6 - 0.8) * speed,
        vy: (Math.random() * 1.6 - 0.8) * speed,
        scale
    });
}
function generateNextWrappingParts(currentScale) {
    if (!wrappingTray) return;
    wrappingTray.querySelectorAll('.part').forEach(p => p.remove());
    const nextSize = SIZES.find(s => s.scale > currentScale);
    if (!nextSize) {
        console.log('Достигнута максимальная матрёшка (Большая)');
        return;
    }
    const setId = setIdCounter++;
    ['head', 'body', 'base'].forEach(type => {
        makeWrappingPart({ type, setId, size: nextSize });
    });
}

function collectFinalDoll(completedDoll) {
    const scale = parseFloat(completedDoll.dataset.innerScale || '1');
    const imageSetId = completedDoll.dataset.imageSetId || '1';
    const partsInfo = completedDoll.dataset.containsParts || imageSetId;

    const dollInfo = {
        id: `doll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        scale: scale,
        imageSetId: imageSetId,
        parts: partsInfo.split(','),
        timestamp: Date.now()
    };

    assembledDollsHistory.push(dollInfo);

    buildDoll(dollInfo);

    built += 1;
    collectedMatryoshkas += 1;
    updateProgressUI();
    completedDoll.remove();

    if (completedDoll === currentWrappingDoll) {
        currentWrappingDoll = null;
        setTimeout(tryMoveNextFromQueue, 300);
    }

    if (built >= CONFIG.goal) {
        setTimeout(() => showWinModal(), 500);
    }
}

function returnToTray(part) {
    part.style.position = 'absolute';
    tray.appendChild(part);
    placeInTray(part);
}

function buildDoll(dollInfo) {
    const doll = document.createElement('div');
    doll.className = 'doll';
    doll.dataset.dollId = dollInfo.id;
    doll.dataset.parts = dollInfo.parts.join(',');

    const imageSetId = dollInfo.imageSetId;
    const scale = dollInfo.scale;

    const matryoshkaImg = document.createElement('img');
    matryoshkaImg.src = `img/matr${imageSetId}.png`;
    matryoshkaImg.alt = 'Матрёшка';
    matryoshkaImg.style.width = '130px';
    matryoshkaImg.style.height = 'auto';
    matryoshkaImg.style.objectFit = 'contain';
    matryoshkaImg.style.transformOrigin = 'center bottom';
    matryoshkaImg.style.cursor = 'pointer';

    const label = document.createElement('div');
    label.className = 'd-label';
    label.textContent = `Матрёшка ${dollIndex++}`;
    label.style.position = 'absolute';
    label.style.bottom = '-10px';
    label.style.left = '50%';
    label.style.transform = 'translateX(-50%)';

    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    container.appendChild(matryoshkaImg);
    container.appendChild(label);
    doll.appendChild(container);

    shelf.appendChild(doll);

    doll.addEventListener('click', () => showDollLayers(dollInfo));
}

function showDollLayers(dollInfo) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'layersModal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.zIndex = '2000';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.backgroundColor = '#fff';
    modalContent.style.padding = '30px';
    modalContent.style.borderRadius = '15px';
    modalContent.style.maxWidth = '800px';
    modalContent.style.width = '90%';
    modalContent.style.maxHeight = '80%';
    modalContent.style.overflowY = 'auto';
    modalContent.style.position = 'relative';

    const title = document.createElement('h2');
    title.textContent = 'Вложенные матрёшки';
    title.style.textAlign = 'center';
    title.style.marginBottom = '20px';
    title.style.color = '#333';

    const layersContainer = document.createElement('div');
    layersContainer.style.display = 'flex';
    layersContainer.style.flexWrap = 'wrap';
    layersContainer.style.gap = '20px';
    layersContainer.style.justifyContent = 'center';
    layersContainer.style.alignItems = 'center';

    const uniqueParts = [...new Set(dollInfo.parts)];

    uniqueParts.sort((a, b) => a - b);

    uniqueParts.forEach((imageSetId, index) => {
        const layerItem = document.createElement('div');
        layerItem.style.display = 'flex';
        layerItem.style.flexDirection = 'column';
        layerItem.style.alignItems = 'center';
        layerItem.style.gap = '10px';

        const img = document.createElement('img');
        img.src = `img/matr${imageSetId}.png`;
        img.style.width = '150px';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';

        const label = document.createElement('span');
        label.textContent = index === 0 ? 'Внутренняя' : `Слой ${index}`;
        label.style.fontSize = '16px';
        label.style.color = '#666';

        layerItem.appendChild(img);
        layerItem.appendChild(label);
        layersContainer.appendChild(layerItem);
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Закрыть';
    closeBtn.style.marginTop = '30px';
    closeBtn.style.padding = '10px 30px';
    closeBtn.style.backgroundColor = '#8b4513';
    closeBtn.style.color = 'white';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '5px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.display = 'block';
    closeBtn.style.margin = '20px auto 0';

    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    modalContent.appendChild(title);
    modalContent.appendChild(layersContainer);
    modalContent.appendChild(closeBtn);
    modal.appendChild(modalContent);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    document.body.appendChild(modal);
}


if (generateBtn) generateBtn.addEventListener('click', generateSet);
if (clearBtn) clearBtn.addEventListener('click', clearAll);


if (tray && shelf) {
    initializeLevel();
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
function placeInTray(part) {
    const trayRect = tray.getBoundingClientRect();
    const maxX = trayRect.width - part.offsetWidth;
    const maxY = trayRect.height - part.offsetHeight;
    const x = Math.random() * Math.max(0, maxX);
    const y = Math.random() * Math.max(0, maxY);
    part.style.left = `${x}px`;
    part.style.top = `${y}px`;
    const speed = (CONFIG.speed || 1) * 0.8;
    const mover = {
        part,
        x,
        y,
        vx: (Math.random() * 1.6 - 0.8) * speed,
        vy: (Math.random() * 1.6 - 0.8) * speed,
    };
    movers.push(mover);
}
function removeMover(part) {
    movers = movers.filter((m) => m.part !== part);
}
function moveParts() {
    const rect = tray.getBoundingClientRect();

    // 1. Движение отдельных деталей в основной панели (partsTray)
    movers.forEach((m) => {
        if (isPartInGroup(m.part)) {
            removeMover(m.part);
            return;
        }

        m.x += m.vx;
        m.y += m.vy;

        const maxX = rect.width - m.part.offsetWidth;
        const maxY = rect.height - m.part.offsetHeight;

        if (m.x <= 0 || m.x >= maxX) m.vx *= -1;
        if (m.y <= 0 || m.y >= maxY) m.vy *= -1;

        m.x = Math.min(Math.max(0, m.x), Math.max(0, maxX));
        m.y = Math.min(Math.max(0, m.y), Math.max(0, maxY));

        m.part.style.left = `${m.x}px`;
        m.part.style.top = `${m.y}px`;
    });

    // 2. Движение частично собранных групп в основной панели
    assembledGroups.forEach((group, setId) => {
        if (!group.container || isPartInCompleteGroup(group.head || group.body || group.base)) return;

        const containerWidth = group.container.offsetWidth || 120;
        const containerHeight = group.container.offsetHeight || 200;

        group.x += group.vx;
        group.y += group.vy;

        const maxX = rect.width - containerWidth;
        const maxY = rect.height - containerHeight;

        if (group.x <= 0 || group.x >= maxX) group.vx *= -1;
        if (group.y <= 0 || group.y >= maxY) group.vy *= -1;
        group.x = Math.min(Math.max(0, group.x), Math.max(0, maxX));
        group.y = Math.min(Math.max(0, group.y), Math.max(0, maxY));

        group.container.style.left = `${group.x}px`;
        group.container.style.top = `${group.y}px`;
    });

    // 3. Движение готовых матрешек в ОСНОВНОЙ панели (тех, что в очереди ожидания)
    completedDollMovers.forEach((m, index) => {
        if (m.element.parentElement === wrappingDoll) {
            completedDollMovers.splice(index, 1);
            return;
        }

        if (!m.element.parentElement) {
            completedDollMovers.splice(index, 1);
            return;
        }

        const baseWidth = 100;
        const baseHeight = 150;
        const scale = m.scale || 1;
        const width = baseWidth * scale;
        const height = baseHeight * scale;

        m.x += m.vx;
        m.y += m.vy;

        const maxX = rect.width - width;
        const maxY = rect.height - height;

        if (m.x <= 0 || m.x >= maxX) m.vx *= -1;
        if (m.y <= 0 || m.y >= maxY) m.vy *= -1;

        m.x = Math.min(Math.max(0, m.x), Math.max(0, maxX));
        m.y = Math.min(Math.max(0, m.y), Math.max(0, maxY));

        m.element.style.left = `${m.x}px`;
        m.element.style.top = `${m.y}px`;
    });

    // 4. Рекурсивный вызов для следующего кадра анимации
    animationId = requestAnimationFrame(moveParts);
}
function isPartInGroup(part) {
    if (!part) return false;
    const setId = part.dataset.setId;
    const group = assembledGroups.get(setId);
    return group && (group.head === part || group.body === part || group.base === part);
}
function startAnimation() {
    stopAnimation();
    animationId = requestAnimationFrame(moveParts);
}
function stopAnimation() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
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
    console.log(totalTime);
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
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}
function calculateScore(matryoshkas, timeSpent, livesLeft) {
    const baseScore = matryoshkas * 100;
    const timeBonus = Math.max(0, CONFIG.time - timeSpent) * 10;
    const livesBonus = livesLeft * 50;
    return baseScore + timeBonus + livesBonus;
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



const startGameBtn = document.getElementById('startGame');
if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
        const inputPlayerName = document.getElementById('playerName').value.trim() || 'Игрок';


        if (inputPlayerName.length < 2) {
            alert('Пожалуйста, введите имя (минимум 2 символа)');
            return;
        }

        localStorage.setItem('playerName', inputPlayerName);


        window.location.href = 'level1.html';
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'и' || e.key === 'И' || e.key === 'b' || e.key === 'B') {
        const note = document.getElementById('levelNote');
        if (note) {
            note.style.display = 'block';
        }
    }
});
