let ysdk;

const game = {
    preloaderImages: [],
    grid: [],
    gap: 2,
    tileSize: 0,
    cellSize: 0,
    gridSize: 4,

    highestLevelReached: 4,

    gridElement: document.getElementById("grid"),
    settingsOverlay: document.getElementById("settings-overlay"),
    elBestScore: document.getElementById("best"),
    elCurrency: document.getElementById("currency"),
    elScore: document.getElementById("score"),

    historyStack: [],
    HISTORY_LIMIT: 10,

    isSoundOn: false,
    musicReady: false,
    musicStarted: false,

    isPlaying: false,
    isPaused: false,

    hasEnteredBefore: false,
    currency: 0,
    bestScore: 0,
    score: 0,

    player: {},

    log2Cache: {},
    colorCache: {},
    predefinedTileColors: {},
    randomLevelUpPhrases: [],

};

window.addEventListener("load", () => {
    YaGames.init().then(sdk => {
      ysdk = sdk;
  

      loadingResources(() => {
        initGame(() => {

        });
      });
      
    });
})




function initGame(callback) {

    createGrid();
    initDefoltSettings();

    ysdk.getPlayer().then(_player => {
        game.player = _player;
        loadCloudSave();
    }).catch(err => {
        // Ошибка при инициализации объекта Player.
        game.player = {};
    }).then(() => {
        
        if (game.historyStack.length === 0) {
            spawnTile();
            spawnTile();
        }

        if (!game.hasEnteredBefore) {
            game.currency = 400;
            game.hasEnteredBefore = true;
        }

        startGame();

    });
}

function loadCloudSave() {

}

function initDefoltSettings() {
    
    game.predefinedTileColors = {
        1: ['#eee4da', '#776e65'],     // 2
        2: ['#ede0c8', '#776e65'],     // 4
        3: ['#f2b179', '#f9f6f2'],     // 8
        4: ['#f59563', '#f9f6f2'],     // 16
        5: ['#f67c5f', '#f9f6f2'],     // 32
        6: ['#f65e3b', '#f9f6f2'],     // 64
        7: ['#edcf72', '#f9f6f2'],     // 128
        8: ['#edcc61', '#f9f6f2'],     // 256
        9: ['#edc850', '#f9f6f2'],     // 512
        10: ['#edc53f', '#f9f6f2'],     // 1024
        11: ['#edc22e', '#f9f6f2'],     // 2048
        12: ['#d4af37', '#f9f6f2'],     // 4096
        13: ['#b8860b', '#f9f6f2'],     // 8192
        14: ['#a97142', '#f9f6f2'],     // 16384
        15: ['#8b4513', '#f9f6f2'],     // 32768
    };

    game.randomLevelUpPhrases = [
        "Кот доволен твоим прогрессом!",
        "Ты приближаешься к хвостатой легенде!",
        "Мяу! Ты просто чудо!",
        "Кажется, у этого кота девять жизней — и все в прокачке!",
        "Котик лайкнул твой уровень!",
        "Ты кото-богат!",
        "Шаг за шагом — к усатой вершине!",
        "Вот это кот-комбо!",
        "У тебя лапы растут откуда надо!",
        "Ты точно знаешь, как обращаться с пушистыми цифрами!",
    ];
    
    game.bestScore = 0;
    game.score = 0;
    game.currency = 0;
    game.hasEnteredBefore = false;
    game.historyStack = [];
    game.isPlaying = false;
    game.isPaused = false;
    game.isSoundOn = false;
    game.musicReady = false;
    game.musicStarted = false;
}

function startGame() {
    updateBestScoreDisplay();
    updateCurrencyDisplay();
    updateScoreDisplay();
    game.isPlaying = true;
}


//
function updateBestScoreDisplay() {
    if (game.elBestScore) game.elBestScore.textContent = game.bestScore;
}
function updateCurrencyDisplay() {
    if (game.elCurrency) game.elCurrency.textContent = game.currency;
}
function updateScoreDisplay() {
    if (game.elScore) game.elScore.textContent = game.score;
}



//

function showLevelUpPopup(level) {
    const popup = document.getElementById("level-up-popup");
    const img = document.getElementById("level-up-img");
    const text = document.getElementById("level-up-text");
  
    const helperNumber = Math.floor(Math.random() * 8) + 1;
  
    const path = `images/helper_${helperNumber}.png`;
    const cachedImage = game.preloaderImages[path];
    if (cachedImage && img) {
        img.src = cachedImage.src;
    }
  
    text.textContent = getRandomLevelUpPhrase();
  
    popup.classList.remove("hidden");
    game.isPlaying = false;
  
    gsap.fromTo(popup,
        { scale: 0.5, opacity: 0 },
        {
            scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.7)",
            onComplete: () => {
                setTimeout(() => {
                    gsap.to(popup, {
                        scale: 0.5,
                        opacity: 0,
                        duration: 0.3,
                        ease: "back.in(1.7)",
                        onComplete: () => {
                            popup.classList.add("hidden");
                            game.isPlaying = true;
                        }
                    });
                }, 2000);
            }
        }
    );
}

//

function spawnTile() {
    const empty = [];
    for (let r = 0; r < game.gridSize; r++) {
      for (let c = 0; c < game.gridSize; c++) {
        if (!game.grid[r][c]) empty.push({ r, c });
      }
    }
    if (empty.length === 0) return;
    const { r, c } = empty[Math.floor(Math.random() * empty.length)];
    const tile = document.createElement("div");
    tile.className = "tile";
    const value = Math.random() < 0.9 ? 2 : 4;
    tile.innerHTML = `
      <div class="tile-inner pop">
        <div class="tile-sprite"></div>
        <div class="tile-level"><span>${getLevel(value)}</span></div>
      </div>`;
    game.grid[r][c] = { el: tile, value };
    setTilePosition(tile, r, c);
    styleTile(tile, value);
    setTileSprite(tile.querySelector('.tile-sprite'), value);
    game.gridElement.appendChild(tile);
    checkWin(value);
}

function checkWin(value) {
    const level = getLevel(value);
    if (level >= 4 && level > game.highestLevelReached) {
        game.highestLevelReached = level;
        showLevelUpPopup(level);
    }
}

// createGrid

function createGrid() {

    for (let r = 0; r < game.gridSize; r++) {
        game.grid[r] = [];
      for (let c = 0; c < game.gridSize; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        game.gridElement.appendChild(cell);
        game.grid[r][c] = null;
      }
    }
    syncTileSizeWithCell();
}
function syncTileSizeWithCell() {

    adjustGameContainerMargin();
  
    const cell = document.querySelector('.cell');
    if (!cell) return;
  
    const pxToVmin = (px) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const vmin = Math.min(vw, vh);
        return (px / vmin) * 100;
    };

    const rect = cell.getBoundingClientRect();
    game.tileSize = pxToVmin(rect.width);
    game.cellSize = game.tileSize + game.gap
  
    const style = document.documentElement.style;
    style.setProperty('--tile-size', `${game.tileSize.toFixed(2)}vmin`);
}
function adjustGameContainerMargin() {
    const wrapper = document.getElementById("game-wrapper");
    const topPanel = document.querySelector(".top-panel");
    const gameContainer = document.querySelector(".game-container");
    const bottomButtons = document.querySelector(".bottom-buttons");
  
    if (!wrapper || !topPanel || !gameContainer || !bottomButtons) return;
  
    const style = getComputedStyle(bottomButtons);
    const existingTopMargin = parseFloat(style.marginTop);
  
    // Получаем доступную высоту и суммируем высоты панелей
    const wrapperHeight = wrapper.clientHeight;
    const topPanelHeight = topPanel.offsetHeight;
    const gameContainerHeight = gameContainer.offsetHeight;
    const bottomButtonsHeight = bottomButtons.offsetHeight + existingTopMargin;
  
    const remainingSpace = wrapperHeight - topPanelHeight - gameContainerHeight - bottomButtonsHeight;
  
    // Устанавливаем отступ сверху, если есть хотя бы 2vmin свободного пространства
    if (remainingSpace > 0) {
        const marginVmin = Math.min(remainingSpace / window.innerHeight * 100, 15); // максимум 5vmin
        gameContainer.style.marginTop = `${marginVmin}vmin`;
    } else {
        gameContainer.style.marginTop = "0";
    }
}

//

function setTilePosition(tile, r, c) {
    const x = c * game.cellSize + game.gap;
    const y = r * game.cellSize + game.gap;
    tile.style.transform = `translate(${x}vmin, ${y}vmin)`;
}

function styleTile(tile, value) {
  
    const level = getLevel(value);
  
    const [bg, color] = getColorForLevel(level);
  
    tile.style.background = bg;
    tile.style.color = color;
  
    tile.style.background = bg;
    tile.style.color = color;
    
    const levelElem = tile.querySelector(".tile-level span");
    if (levelElem) levelElem.textContent = level;
  
    if (value < 100) {
        tile.style.fontSize = '7vmin';
    } else if (value < 1000) {
        tile.style.fontSize = '6vmin';
    } else {
        tile.style.fontSize = '5vmin';
    }
}

function setTileSprite(spriteElement, value) {
    const level = getLevel(value);
    const maxLevel = 15;
    const clamped = Math.min(level, maxLevel);
  
    const path = `images/img_${clamped}.png`;
    const cachedImage = game.preloaderImages[path];
    if (cachedImage && spriteElement) {
        spriteElement.style.backgroundImage = `url('${cachedImage.src}')`;
    }
}

function getRandomLevelUpPhrase() {
    return randomLevelUpPhrases[Math.floor(Math.random() * randomLevelUpPhrases.length)];
}

// loadingResources

function loadingResources(callback) {

    let imagePaths = [];
    for(let i = 1; i < 16; i++) {
        imagePaths.push(`images/img_${i}.png`)
    }
    for(let i = 1; i < 9; i++) {
        imagePaths.push(`images/helper_${i}.png`)
    }

    preloadImages(imagePaths, () => {
        callback();
    });

}
function preloadImages(paths, callback) {
    let loadedCount = 0;
    const totalImages = paths.length;

    paths.forEach((path) => {
        const img = new Image();
        img.onload = img.onerror = () => {
            loadedCount++;
            if (loadedCount === totalImages) {
                callback();
            }
        };
        img.src = path;
        game.preloaderImages[path] = img;
    });
}

//
function getLevel(value) {
    if (game.log2Cache[value]) return game.log2Cache[value];
    const level = Math.log2(value);
    game.log2Cache[value] = level;
    return level;
}

function getColorForLevel(level) {
    if (game.colorCache[level]) return game.colorCache[level];
  
    let colors;
  
    if (game.predefinedTileColors[level]) {
        colors = game.predefinedTileColors[level];
    } else {
      const hue = (level * 35) % 360; // циклично по кругу
        colors = [`hsl(${hue}, 70%, 60%)`, '#f9f6f2'];
    }
  
    game.colorCache[level] = colors;
  
    return colors;
}