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
        head: '../img/matr11.png',
        body: '../img/matr12.png',
        base: '../img/matr13.png'
    },
    2: {
        head: '../img/matr21.png',
        body: '../img/matr22.png',
        base: '../img/matr23.png'
    },
    3: {
        head: '../img/matr31.png',
        body: '../img/matr32.png',
        base: '../img/matr33.png'
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

function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
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
