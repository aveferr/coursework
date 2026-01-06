
let dragging = null;
let movers = [];
let animationId = null;
let lastHighlight = 0;
let setIdCounter = 1;
let assembledGroups = new Map();
let wrappingGroups = new Map(); // Map<setId, {innerMatryoshka, head, body, base}>
let currentWrappingDoll = null;
let waitingDolls = [];
let completedDollMovers = [];

function makeWrappingPart({ type, setId, size }) {
    const part = document.createElement('div');
    part.className = `part part-${type} wrapping-part`;
    part.dataset.type = type;
    part.dataset.setId = setId;
    const imageSetId = (setId % 3) + 1;
    const imageUrl = IMAGE_SETS[imageSetId][type];
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = `Деталь матрёшки ${type}`;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';
    const label = document.createElement('span');
    label.textContent = `${size.label}`;
    part.appendChild(img);
    part.appendChild(label);
    part.dataset.imageSetId = imageSetId;
    part.style.setProperty('--scale', size.scale);
    part.style.width = `${72 * size.scale}px`;
    part.style.height = `${72 * size.scale}px`;
    enableDrag(part);
    wrappingTray.appendChild(part);
    placeInWrappingTray(part);
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
    img.alt = `Деталь матрёшки ${type}`;
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
            if (tool.dataset.tool === 'sponge') {
                const candidates = Array.from(document.querySelectorAll('.part, .assembled-group, .completed-doll, .wrapping-group, .glued-pair'));
                candidates.forEach(element => {
                    if (element.classList.contains('dragging')) return;
                    const rect = element.getBoundingClientRect();
                    const padding = 10;
                    if (
                        upCoords.clientX >= rect.left - padding &&
                        upCoords.clientX <= rect.right + padding &&
                        upCoords.clientY >= rect.top - padding &&
                        upCoords.clientY <= rect.bottom + padding
                    ) {
                        if (element.classList.contains('dirty')) {
                            element.classList.remove('dirty');
                        }
                    }
                });
            } else if (tool.dataset.tool === 'hammer') {
                const elementUnderCursor = document.elementFromPoint(upCoords.clientX, upCoords.clientY);
                const targetToBreak = elementUnderCursor ? elementUnderCursor.closest('.glued-pair') : null;
                if (targetToBreak && targetToBreak.dataset.isGluedPair === 'true') {
                    breakGluedPair(targetToBreak);
                    return;
                }
            }

            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
        };

        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up, { once: true });
    }

    tool.addEventListener('pointerdown', startToolDrag);
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
    const p2Width = newPart2.offsetWidth;
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

function enableDrag(part) {
    console.log("enableDrag");
    function getEventCoords(e) {
        return { clientX: e.clientX, clientY: e.clientY };
    }
    function startDrag(e) {
        if (dragging) return;
        if (lives <= 0) {
            return;
        }
        if (part.classList.contains('dirty')) {
            return;
        }
        if (part.closest('#wrappingDoll')) {
            return;
        }
        if (e.cancelable) {
            e.preventDefault();
        }
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

        document.querySelectorAll('.part, .assembled-group, .completed-doll, .wrapping-group, .glued-pair').forEach(el => {
            if (el !== part && !el.classList.contains('dragging')) {
                el.style.pointerEvents = 'none';
            }
        });
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

        document.querySelectorAll('.part, .assembled-group, .completed-doll, .wrapping-group, .glued-pair').forEach(el => {
            el.style.pointerEvents = '';
        });

        dragging = null;
    }

    part.addEventListener('pointerdown', startDrag);
    part.addEventListener('pointermove', moveDrag);
    part.addEventListener('pointerup', endDrag);
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

    const minX = containerRect.left + offsetX;
    const maxX = containerRect.right - partWidth + offsetX;
    const minY = containerRect.top + offsetY;
    const maxY = containerRect.bottom - partHeight + offsetY;

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

    const dropX = e.clientX;
    const dropY = e.clientY;
    const containerRect = allowedContainer.getBoundingClientRect();
    const isWithinAllowedArea = dropX >= containerRect.left && dropX <= containerRect.right &&
        dropY >= containerRect.top && dropY <= containerRect.bottom;

    if (!isWithinAllowedArea) {
        if (originParent === tray) {
            returnToTray(part);
        } else if (originParent === wrappingTray) {
            returnToWrappingTray(part);
        }
        dragging = null;
        return;
    }

    part.classList.remove('dragging');
    part.style.position = 'absolute';
    part.style.zIndex = '';

    const currentLeft = parseFloat(part.style.left || '0');
    const currentTop = parseFloat(part.style.top || '0');
    part.style.left = `${currentLeft - containerRect.left}px`;
    part.style.top = `${currentTop - containerRect.top}px`;

    Array.from(tray.querySelectorAll('.part, .assembled-group')).forEach((p) => {
        p.classList.remove('can-attach');
    });

    let attached = false;

    const candidates = Array.from(document.querySelectorAll('.part, .assembled-group, .completed-doll, .wrapping-group, .glued-pair'));
    const hoveredElements = [];
    for (const element of candidates) {
        if (element.classList.contains('dragging') || element === part) continue;
        const rect = element.getBoundingClientRect();
        const padding = 50;
        if (
            dropX >= rect.left - padding &&
            dropX <= rect.right + padding &&
            dropY >= rect.top - padding &&
            dropY <= rect.bottom + padding
        ) {
            hoveredElements.push(element);
        }
    }

    console.log('finish drag');
    for (const hoveredElement of hoveredElements) {
        if (CONFIG.allowWrapping && hoveredElement.classList.contains('completed-doll') &&
            hoveredElement.parentElement === wrappingDoll) {
            console.log('wrapping');
            const draggedScale = parseFloat(part.style.getPropertyValue('--scale') || '1');
            const innerScale = parseFloat(hoveredElement.dataset.innerScale || '1');
            if (draggedScale > innerScale) {
                wrapAroundDoll(part, hoveredElement);
                dragging = null;
                return;
            }
        }
        else {
            if (hoveredElement === part) break;
            if (hoveredElement.classList.contains('completed-doll') &&
                (hoveredElement.parentElement === wrappingDoll ||
                    hoveredElement.parentElement.parentElement === wrappingDoll)) {
                if (CONFIG.allowWrapping) {
                    const draggedScale = parseFloat(part.style.getPropertyValue('--scale') || '1');
                    const innerScale = parseFloat(hoveredElement.dataset.innerScale || '1');
                    if (draggedScale > innerScale) {
                        wrapAroundDoll(part, hoveredElement);
                        attached = true;
                        break;
                    }
                }
            }
        }

        if (hoveredElement.dataset.type === 'wrapping') {
            const innerDoll = hoveredElement.querySelector('.completed-doll');
            if (innerDoll && CONFIG.allowWrapping && innerDoll.parentElement.parentElement === wrappingDoll) {
                wrapAroundDoll(part, innerDoll);
                attached = true;
                break;
            }
        }

        if (hoveredElement.classList.contains('dirty')) {
            loseLife('Нельзя прикреплять к грязной части');
            returnToTray(part);
            return;
        }

        let hoveredType = hoveredElement.dataset.type;
        let hoveredSetId = hoveredElement.dataset.setId;
        const allowedTargets = ATTACH_RULES[type] || [];

        const isSameSet = hoveredSetId === setId;
        const isStrictMatch = allowedTargets.includes(hoveredType);
        const groupExists = assembledGroups.has(setId);
        const canAttach =
            isSameSet &&
            !isPartInCompleteGroup(hoveredElement) &&
            (isStrictMatch || groupExists || hoveredType === 'group') &&
            !allowedContainer.classList.contains('wrapping-area');

        if (canAttach) {
            let targetPart = hoveredElement;
            if (hoveredType === 'group') {
                const group = assembledGroups.get(setId);
                targetPart = group.head || group.body || group.base;
            }
            if (targetPart) {
                attachParts(part, targetPart);
                attached = true;
                break;
            }
        }
    }

    if (!attached) {
        if (hoveredElements.length > 0) {
            loseLife('Неверная комбинация');
        }
        if (originParent === tray) {
            returnToTray(part);
        } else if (originParent === wrappingTray) {
            returnToWrappingTray(part);
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
            x >= rect.left + padding &&
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
    const scale = parseFloat(newPart.style.getPropertyValue('--scale') || '1');
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

    if (newType === 'head') {
        wrapGroup.head = newPart;
        newPart.style.height = `${72 * scale * 0.42}%`;
        newPart.style.width = `auto`;
    } else if (newType === 'body') {
        wrapGroup.body = newPart;
        newPart.style.height = `${72 * scale * 0.33}%`;
        newPart.style.width = `auto`;
    } else if (newType === 'base') {
        wrapGroup.base = newPart;
        newPart.style.height = `${72 * scale * 0.25}%`;
        newPart.style.width = `auto`;
    }
    newPart.style.position = 'absolute';
    newPart.style.pointerEvents = 'auto';

    wrapGroup.container.appendChild(newPart);
    removeMover(newPart);

    const parts = [wrapGroup.head, wrapGroup.body, wrapGroup.base].filter(Boolean);
    if (parts.length === 2) {
        const part1 = parts[0];
        const part2 = parts[1];
        const type1 = part1.dataset.type === 'head' ? '1' : part1.dataset.type === 'body' ? '2' : '3';
        const type2 = part2.dataset.type === 'head' ? '1' : part2.dataset.type === 'body' ? '2' : '3';
        const imageName = `../img/matr${wrapGroup.outerSetId % 3 + 1}${type1}${type2}.png`;
        const combinedImg = document.createElement('img');
        combinedImg.src = imageName;
        combinedImg.alt = 'Комбинированная матрёшка';
        combinedImg.className = 'combined-image completed-doll-img';
        if (type1 === '1' && type2 === '2') {
            combinedImg.style.height = `${72 * 0.76 * scale}%`;
            combinedImg.style.top = '0%';
            console.log(72 * 0.76 * scale);
        }
        else if (type1 === '2' && type2 === '3') {
            combinedImg.style.height = `${72 * 0.58 * scale}%`;
            combinedImg.style.bottom = '0%';
        }
        else {
            combinedImg.style.height = `${72 * scale}%`;
            combinedImg.style.top = '50%';
            combinedImg.style.transform = 'translate(-50%, -50%)';

        }

        wrapGroup.container.innerHTML = '';
        wrapGroup.container.appendChild(wrapGroup.innerDoll);
        wrapGroup.container.appendChild(combinedImg);

        wrapGroup.combined = true;
        wrapGroup.combinedImage = imageName;
        wrapGroup.parts = [part1, part2];
    } else {
        positionWrappingGroup(wrapGroup);
        checkWrappingComplete(wrapGroup);
    }
}

function positionWrappingGroup(wrapGroup) {
    if (!wrapGroup.container || !wrapGroup.innerDoll) return;
    const parts = [wrapGroup.head, wrapGroup.body, wrapGroup.base].filter(Boolean);

    if (parts.length === 0) return;

    wrapGroup.container.className = 'wrapping-group';
    wrapGroup.innerDoll.className = 'completed-doll inner-doll';

    wrapGroup.container.innerHTML = '';

    if (wrapGroup.base) {
        wrapGroup.base.className = 'part part-base wrapping-part';
        wrapGroup.base.style.position = 'absolute';
        wrapGroup.base.style.left = '';
        wrapGroup.base.style.top = '';
        wrapGroup.container.appendChild(wrapGroup.base);
    }

    if (wrapGroup.body) {
        wrapGroup.body.className = 'part part-body wrapping-part';
        wrapGroup.body.style.position = 'absolute';
        wrapGroup.body.style.left = '';
        wrapGroup.body.style.top = '';
        wrapGroup.container.appendChild(wrapGroup.body);
    }

    if (wrapGroup.head) {
        wrapGroup.head.className = 'part part-head wrapping-part';
        wrapGroup.head.style.position = 'absolute';
        wrapGroup.head.style.left = '';
        wrapGroup.head.style.top = '';
        wrapGroup.container.appendChild(wrapGroup.head);
    }

    wrapGroup.innerDoll.style.position = 'absolute';
    wrapGroup.innerDoll.style.left = '';
    wrapGroup.innerDoll.style.top = '';
    wrapGroup.container.appendChild(wrapGroup.innerDoll);

    wrapGroup.container.dataset.hasHead = !!wrapGroup.head;
    wrapGroup.container.dataset.hasBody = !!wrapGroup.body;
    wrapGroup.container.dataset.hasBase = !!wrapGroup.base;
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
        console.log(outerScale);
        let allParts = [];

        if (wrapGroup.innerParts) {
            allParts = wrapGroup.innerParts.split(',');
        } else {
            allParts = [wrapGroup.innerDoll.dataset.imageSetId || '1'];
        }

        allParts.push(imageSetId);
        console.log(outerScale);
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
    doll.style.width = '100%';
    doll.style.height = '100%';

    doll.dataset.innerScale = scale;
    console.log(doll.dataset.innerScale);
    doll.dataset.imageSetId = imageSetId;

    if (wrapGroup && wrapGroup.wrappingId) {
        doll.dataset.wrappingId = wrapGroup.wrappingId;
    }

    const img = document.createElement('img');
    img.src = `../img/matr${imageSetId}.png`;
    img.alt = `Собранная матрёшка`;
    img.style.width = `${72 * scale}%`;
    img.style.height = `${72 * scale}%`;
    console.log(img.style.width);
    img.style.objectFit = 'contain';
    img.style.transformOrigin = 'center';
    img.style.pointerEvents = 'none';
    doll.appendChild(img);

    if (CONFIG.name === 'Уровень 3' && Math.random() < 0.4) {
        doll.classList.add('dirty');
    }

    return doll;
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
    const OVERLAP_RATIO = 0;
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

        if (!currentWrappingDoll) {
            matryoshkaImg.style.width = `${72 * scale}%`;
            matryoshkaImg.style.height = `${72 * scale}%`;
            completedDoll.style.width = `100%`;
            completedDoll.style.height = `100%`;
        } else {
            matryoshkaImg.style.width = '100px';
            matryoshkaImg.style.height = '150px';
        }
        matryoshkaImg.src = `../img/matr${imageSetId}.png`;
        matryoshkaImg.alt = `Собранная матрёшка`;
        matryoshkaImg.style.objectFit = 'contain';
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
            waitingDolls.push({ doll: completedDoll, scale, imageSetId });
            placeInMainTrayFloating(completedDoll, scale);
        }

        if (built >= CONFIG.goal) {
            setTimeout(() => showWinModal(), 500);
        }
        console.log(scale);
    }
}

function placeInWrappingDoll(doll, scale) {
    currentWrappingDoll = doll;
    wrappingDoll.innerHTML = '';
    wrappingDoll.appendChild(doll);
    doll.style.position = 'absolute';
    doll.style.left = '50%';
    doll.style.top = '50%';
    doll.style.transform = 'translate(-50%, -50%) ';
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
    matryoshkaImg.src = `../img/matr${imageSetId}.png`;
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

    doll.addEventListener('dblclick', () => showDollLayers(dollInfo));
}

function showDollLayers(dollInfo) {
    const modal = document.createElement('div');
    modal.className = 'layers-modal-overlay';

    const modalContent = document.createElement('div');
    modalContent.className = 'layers-modal-content';

    const title = document.createElement('h2');
    title.className = 'layers-modal-title';
    title.textContent = 'Вложенные матрёшки';

    const layersContainer = document.createElement('div');
    layersContainer.className = 'layers-container';

    const allParts = dollInfo.parts.slice();

    allParts.sort((a, b) => a - b);

    allParts.forEach((imageSetId, index) => {
        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item';

        const img = document.createElement('img');
        img.src = `../img/matr${imageSetId}.png`;
        img.alt = `Матрёшка слой ${allParts.length - index}`;

        img.addEventListener('mouseenter', () => {
            img.classList.add('img-rocking');
        });

        img.addEventListener('mouseleave', () => {
            img.classList.remove('img-rocking');
            img.style.transform = 'rotate(0deg)';
        });

        const label = document.createElement('span');
        label.className = 'layer-label';
        label.textContent = `Слой ${allParts.length - index}`;

        layerItem.appendChild(img);
        layerItem.appendChild(label);
        layersContainer.appendChild(layerItem);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'layers-close-btn';
    closeBtn.textContent = 'Закрыть';

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
    const contentWidth = tray.clientWidth;
    const contentHeight = tray.clientHeight;

    movers.forEach((m) => {
        if (isPartInGroup(m.part)) {
            removeMover(m.part);
            return;
        }

        m.x += m.vx;
        m.y += m.vy;

        const maxX = contentWidth - m.part.offsetWidth;
        const maxY = contentHeight - m.part.offsetHeight;

        if (m.x <= 0 || m.x >= maxX) m.vx *= -1;
        if (m.y <= 0 || m.y >= maxY) m.vy *= -1;

        m.x = Math.min(Math.max(0, m.x), Math.max(0, maxX));
        m.y = Math.min(Math.max(0, m.y), Math.max(0, maxY));

        m.part.style.left = `${m.x}px`;
        m.part.style.top = `${m.y}px`;
    });

    assembledGroups.forEach((group, setId) => {
        if (!group.container || isPartInCompleteGroup(group.head || group.body || group.base)) return;

        const containerWidth = group.container.offsetWidth || 120;
        const containerHeight = group.container.offsetHeight || 200;

        group.x += group.vx;
        group.y += group.vy;

        const maxX = contentWidth - containerWidth;
        const maxY = contentHeight - containerHeight;

        if (group.x <= 0 || group.x >= maxX) group.vx *= -1;
        if (group.y <= 0 || group.y >= maxY) group.vy *= -1;
        group.x = Math.min(Math.max(0, group.x), Math.max(0, maxX));
        group.y = Math.min(Math.max(0, group.y), Math.max(0, maxY));

        group.container.style.left = `${group.x}px`;
        group.container.style.top = `${group.y}px`;
    });

    completedDollMovers.forEach((m, index) => {
        if (m.element.parentElement === wrappingDoll) {
            completedDollMovers.splice(index, 1);
            return;
        }

        if (!m.element.parentElement) {
            completedDollMovers.splice(index, 1);
            return;
        }

        const width = m.element.offsetWidth;
        const height = m.element.offsetHeight;

        m.x += m.vx;
        m.y += m.vy;

        const maxX = contentWidth - width;
        const maxY = contentHeight - height;

        if (m.x <= 0 || m.x >= maxX) m.vx *= -1;
        if (m.y <= 0 || m.y >= maxY) m.vy *= -1;

        m.x = Math.min(Math.max(0, m.x), Math.max(0, maxX));
        m.y = Math.min(Math.max(0, m.y), Math.max(0, maxY));

        m.element.style.left = `${m.x}px`;
        m.element.style.top = `${m.y}px`;
    });

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
