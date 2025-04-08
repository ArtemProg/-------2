let ysdk;

const PlayerStatsManager = {
    pendingStats: {},
    saveTimeout: null,
    lastSaveTime: 0,
    SAVE_DELAY: 2000, // минимальная задержка между запросами в мс
  
    init() {
        // Подписка на событие "вкладка скрыта"
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.forceSave(); // Принудительно сохраняем, без задержки
            }
        });
        window.addEventListener('beforeunload', () => {
            PlayerStatsManager.forceSave(); // Повторная попытка
        });
    },

    /**
     * Обновляет данные, которые нужно сохранить, и запускает сохранение
     * @param {Object} newStats - Объект с ключами и значениями для сохранения
     */
    update(newStats) {
      this.pendingStats = { ...this.pendingStats, ...newStats };
  
      const now = Date.now();
      const timeSinceLastSave = now - this.lastSaveTime;
  
      if (timeSinceLastSave >= this.SAVE_DELAY) {
        this.save();
      } else {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.save(), this.SAVE_DELAY - timeSinceLastSave);
      }
    },
  
    prepareChanges() {

        const newStats = {
            currency: game.currency,
            bestScore: game.bestScore,
            hasEnteredBefore: true,
            historyStack: game.historyStack,
            currentDate: new Date(),
            currentGame: getSnapshotBoard(),
        };

        this.pendingStats = { ...this.pendingStats, ...newStats };
    },

    /**
     * Выполняет сохранение данных в Yandex SDK
     */
    save() {
      if (!ysdk || !ysdk.getPlayer) return;
  
      ysdk.getPlayer().then(player => {
        return player.setData(this.pendingStats);
      }).then(() => {
        console.log("✅ Данные игрока сохранены:", this.pendingStats);
        this.pendingStats = {};
        this.lastSaveTime = Date.now();
      }).catch(err => {
        console.error("❌ Ошибка при сохранении данных:", err);
      });
    },

    forceSave() {
        if (Object.keys(this.pendingStats).length > 0) {
          this.save();
        }
    }
};


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
    destroyPanel: document.getElementById("destroy-mode-panel"),
    swapPanel: document.getElementById("swap-mode-panel"),
    bgMusic: document.getElementById('bg-music'),

    selectedTiles: [],

    historyStack: [],
    HISTORY_LIMIT: 10,

    isSoundOn: false,
    musicReady: false,
    musicStarted: false,

    swapMode: false,
    destroyMode: false,

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

    return ysdk.getPlayer().then(_player => {
        game.player = _player;
        return loadCloudSave();
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
        setupInput();

        PlayerStatsManager.init();

        document.getElementById("undo-button").addEventListener("click", undoMove);
        document.getElementById("destroy-button").addEventListener("click", enterDestroyMode);
        document.getElementById("swap-button").addEventListener("click", enterSwapMode);
        document.getElementById("ad-button").addEventListener("click", showAdsVideo);
        document.getElementById("settings-button").addEventListener("click", openSettings);

        document.getElementById("new-game-btn").addEventListener("click", restartGame);
        document.getElementById("watch-ad-btn").addEventListener("click", showAdsVideo);
        document.getElementById("toggle-sound-btn").addEventListener("click", toggleSound);
        document.getElementById("close-settings-btn").addEventListener("click", () => {
            const content = game.settingsOverlay.querySelector(".settings-content");
            gsap.to(content, {
                scale: 0.5,
                opacity: 0,
                duration: 0.3,
                ease: "back.in(1.7)",
                onComplete: () => {
                    game.settingsOverlay.classList.add("hidden");
                    game.isPaused = false;
                }
            });
        });
    });
}

function loadCloudSave() {

    return game.player.getData().then(data => {
        const state = data;
        if (state) {
          
            if (state.currency) game.currency = state.currency;
            if (state.bestScore) game.bestScore = state.bestScore;
            
            if (state.currentGame) {
                game.score = state.currentGame.score;
                game.highestLevelReached = state.currentGame.highestLevelReached;

                for (let r = 0; r < game.gridSize; r++) {
                    for (let c = 0; c < game.gridSize; c++) {
                        const cell = state.currentGame.grid[r][c];
                        if (cell) {
                            const tile = document.createElement("div");
                            tile.className = "tile";
                            tile.innerHTML = `
                            <div class="tile-inner">
                                <div class="tile-sprite"></div>
                                <div class="tile-level"><span>${getLevel(cell.value)}</span></div>
                            </div>`;
                            game.grid[r][c] = { el: tile, value: cell.value };
                            setTilePosition(tile, r, c);
                            styleTile(tile, cell.value);
                            setTileSprite(tile.querySelector('.tile-sprite'), cell.value);
                            game.gridElement.appendChild(tile);
                        }
                    }
                }
            }
          
        } else {
          
        }
    });

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


//-------------------------------------

function updateBestScoreDisplay() {
    if (game.elBestScore) game.elBestScore.textContent = game.bestScore;
}
function updateCurrencyDisplay() {
    if (game.elCurrency) game.elCurrency.textContent = game.currency;
}
function updateScoreDisplay() {
    if (game.elScore) game.elScore.textContent = game.score;
}



//-------------------------------------

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

//-------------------------------------

function move(direction) {
    
    if (!game.isPlaying) return;
  
    const snapshotBoard = getSnapshotBoard();
  
    let moved = false;
    const dir = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    }[direction];
    if (!dir) return;
    const range = [...Array(game.gridSize).keys()];
    const iterate = (dir.x > 0 || dir.y > 0) ? range.reverse() : range;
    const merged = Array.from({ length: game.gridSize }, () => Array(game.gridSize).fill(false));
    for (let r of iterate) {
      for (let c of iterate) {
        const cell = game.grid[r][c];
        if (!cell) continue;
        let nr = r, nc = c;
        while (true) {
          const tr = nr + dir.y, tc = nc + dir.x;
          if (tr < 0 || tr >= game.gridSize || tc < 0 || tc >= game.gridSize) break;
          if (!game.grid[tr][tc]) {
            nr = tr;
            nc = tc;
          } else if (game.grid[tr][tc].value === cell.value && !merged[tr][tc]) {
            nr = tr;
            nc = tc;
            merged[nr][nc] = true;
            break;
          } else break;
        }
        if (nr !== r || nc !== c) {
          moved = true;
          const fromTile = cell.el;
          const toCell = game.grid[nr][nc];
          setTilePosition(fromTile, nr, nc);
          if (toCell) {
            const toTile = toCell.el;
            const newValue = toCell.value * 2;
            game.grid[r][c] = null;
            setTimeout(() => {
            game.gridElement.removeChild(fromTile);
            toCell.value = newValue;
            toTile.innerHTML = `
                <div class="tile-inner pop">
                <div class="tile-sprite"></div>
                <div class="tile-level"><span>${getLevel(newValue)}</span></div>
                </div>`;
            styleTile(toTile, newValue);
            setTileSprite(toTile.querySelector('.tile-sprite'), newValue);
            addScore(newValue);
            checkWin(newValue);
            }, 150);
          } else {
            game.grid[nr][nc] = cell;
            game.grid[r][c] = null;
          }
        }
      }
    }
    if (moved) {
        setTimeout(() => {
            spawnTile();
            // checkGameOver();
            // saveGameState();
            pushToHistory(snapshotBoard);

            PlayerStatsManager.prepareChanges();
        }, 150);
    }
}

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

//-------------------------------------

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
    return game.randomLevelUpPhrases[Math.floor(Math.random() * game.randomLevelUpPhrases.length)];
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

//-------------------------------------

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

//-------------------------------------

function addScore(points) {
    game.score += points;
    updateScoreDisplay();
    if (game.score > game.bestScore) {
        game.bestScore = game.score;
        //Storage.save("bestScore", bestScore);
        updateBestScoreDisplay();
    }
}

//-------------------------------------

function setupInput() {
    window.addEventListener("keydown", (e) => {
      if (!(game.isPaused || game.destroyMode || game.swapMode) && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        move(e.key);
      }
    });
  
    let touchStartX, touchStartY;
    const minSwipeDistance = 30;
    window.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    });
  
    window.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      if (!(game.isPaused || game.destroyMode || game.swapMode)) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > minSwipeDistance) {
          move(dx > 0 ? "ArrowRight" : "ArrowLeft");
        } else if (Math.abs(dy) > minSwipeDistance) {
          move(dy > 0 ? "ArrowDown" : "ArrowUp");
        }
      }
    }, { passive: false });
}

//------------------------------------------

function getSnapshotBoard() {
    return {
      score: game.score,
      highestLevelReached: game.highestLevelReached,
      grid: game.grid.map(row => row.map(cell => (cell ? { value: cell.value } : null)))
    };
}

function pushToHistory(snapshot) {
    game.historyStack.push(snapshot);
    if (game.historyStack.length > game.HISTORY_LIMIT) {
        game.historyStack.shift();
    }
}

//----------------------------------------

function undoMove() {
    if (game.destroyMode || game.swapMode) return;
  
    const cost = 110;
    if (game.currency < cost) {
      alert("Недостаточно монет!");
      return;
    }
  
    const prev = game.historyStack.pop();
    if (!prev) return;
  
    game.currency -= cost;
    
    updateCurrencyDisplay();
  
    game.score = prev.score;
    game.highestLevelReached = prev.highestLevelReached;
  
    updateScoreDisplay();
    updateBestScoreDisplay();
    updateCurrencyDisplay();
  
    game.gridElement.innerHTML = "";
    game.grid = [];
    createGrid();
  
    for (let r = 0; r < game.gridSize; r++) {
      for (let c = 0; c < game.gridSize; c++) {
        const cell = prev.grid[r][c];
        if (cell) {
          const tile = document.createElement("div");
          tile.className = "tile";
          tile.innerHTML = `
            <div class="tile-inner">
              <div class="tile-sprite"></div>
              <div class="tile-level"><span>${getLevel(cell.value)}</span></div>
            </div>`;
          game.grid[r][c] = { el: tile, value: cell.value };
          setTilePosition(tile, r, c);
          styleTile(tile, cell.value);
          setTileSprite(tile.querySelector('.tile-sprite'), cell.value);
          game.gridElement.appendChild(tile);
        }
      }
    }
}

function enterDestroyMode() {

    const cost = 100;
    if (game.currency < cost) {
      alert("Недостаточно монет!");
      return;
    }
  
    game.destroyMode = true;
    updateHelperPanel("destroy-mode-panel");
    game.destroyPanel.classList.remove("hidden");
  
    setTimeout(() => {
      document.addEventListener("click", handleDestroyClick);
    }, 50);
}

function handleDestroyClick(e) {
  
    let isDestroyMode = game.destroyMode;
    exitDestroyMode();
  
    if (!isDestroyMode) return;
  
    const tile = e.target.closest(".tile");
  
    if (!tile) return;
  
    // Поиск координат плитки
    let r = -1, c = -1;
    for (let row = 0; row < game.gridSize; row++) {
      for (let col = 0; col < game.gridSize; col++) {
        if (game.grid[row][col]?.el === tile) {
          r = row;
          c = col;
          break;
        }
      }
      if (r !== -1) break;
    }
  
    if (r === -1 || c === -1) return;
  
    // Подсчёт количества плиток на поле
    let tileCount = 0;
    for (let row = 0; row < game.gridSize; row++) {
      for (let col = 0; col < game.gridSize; col++) {
        if (game.grid[row][col]) tileCount++;
      }
    }
  
    // Если осталась только одна плитка — запретить уничтожение
    if (tileCount <= 1) {
      // alert("Нельзя уничтожить последнюю плитку!");
      return;
    }
  
    const cost = 100;
    game.currency -= cost;
    // Storage.save("currency", currency);
    updateCurrencyDisplay();
  
    pushToHistory(getSnapshotBoard());
  
    // Получаем координаты с учётом transform
    const originalTransform = tile.style.transform;
    tile.style.transform = "none";
    const rect = tile.getBoundingClientRect();
    tile.style.transform = originalTransform;
  
    const parentRect = game.gridElement.getBoundingClientRect();
    const x = rect.left - parentRect.left;
    const y = rect.top - parentRect.top;
  
    // позиционируем в центре плитки
    const tileRect = tile.getBoundingClientRect();
    const centerX = tileRect.top + tileRect.width / 2;
    const centerY = tileRect.left + tileRect.height / 2;
  
    // Частицы
    for (let i = 0; i < 15; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      document.body.appendChild(p);
      
      p.style.top = centerX + 'px';
      p.style.left = centerY + 'px';
  
      const angle = Math.random() * Math.PI * 2;
      const distance = 40 + Math.random() * 40;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
  
      gsap.to(p, {
        x: dx,
        y: dy,
        opacity: 0,
        scale: 0.5 + Math.random(),
        duration: 0.8,
        ease: "power2.out",
        onComplete: () => p.remove()
      });
    }
    
    // Вспышка
    gsap.fromTo(tile,
      { opacity: 0, scale: 0.5 },
      { opacity: 1, scale: 1.2, duration: 0.1, ease: "power2.out",
        onComplete: () => {
          gsap.to(tile, {
            opacity: 0,
            scale: 1.1,
            duration: 0.7,
            ease: "power3.in",
            onComplete: () => {
              destroyTile(tile, r, c);
            }
          });
        }
      }
    );
  
    // Тряска
    gsap.fromTo(tile, 
      { x: x - 30 }, 
      { x: x + 30, yoyo: true, repeat: 5, duration: 0.04, ease: "power1.inOut", onComplete: () => {
        gsap.to(tile, { x: x, duration: 0.05 });
      }}
    );
  
}

function destroyTile(tileElement, r, c) {
    game.gridElement.removeChild(tileElement);
    game.grid[r][c] = null;
    PlayerStatsManager.prepareChanges();
}

function exitDestroyMode() {
    game.destroyMode = false;
    game.destroyPanel.classList.add("hidden");
    document.removeEventListener("click", handleDestroyClick);
}

function updateHelperPanel(panelId) {
    const helperNumber = Math.floor(Math.random() * 8) + 1;
  
    const panel = document.getElementById(panelId);
    const img = panel.querySelector(".helper-img");
  
    const path = `images/helper_${helperNumber}.png`;
    const cachedImage = game.preloaderImages[path];
    if (game.cachedImage && img) {
        img.src = game.cachedImage.src;
    }
}

function enterSwapMode() {

    const cost = 120;

    if (game.swapMode) {
      // Если режим уже активен — сбрасываем всё
      exitSwapMode();
      return;
    }
    
    if (game.currency < cost) {
      alert("Недостаточно монет!");
      return;
    }
  
    game.swapMode = true;
    game.selectedTiles = [];
    game.swapPanel.classList.remove("hidden");
  
    setTimeout(() => {
      document.addEventListener("click", handleSwapClick);
    }, 50);
}

function openSettings() {
    game.isPaused = true;
    const randomHelper = Math.floor(Math.random() * 8) + 1;
    const img = game.settingsOverlay.querySelector(".settings-cat");
    const path = `images/helper_${randomHelper}.png`;
    const cachedImage = game.preloaderImages[path];
    if (cachedImage && img) {
        img.src = cachedImage.src;
    }
    const content = game.settingsOverlay.querySelector(".settings-content");
    game.settingsOverlay.classList.remove("hidden");
    gsap.fromTo(content, 
        { scale: 0.5, opacity: 0 }, 
        { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.7)" }
    );
}

function exitSwapMode() {
    game.swapMode = false;
    game.swapPanel.classList.add("hidden");
    document.removeEventListener("click", handleSwapClick);
  
    // Убираем подсветку
    game.selectedTiles.forEach(tile => {
        const el = game.grid[tile.r][tile.c].el;
        el.classList.remove("selected")
    });
    game.selectedTiles = [];
}

function handleSwapClick(e) {
    const tile = e.target.closest(".tile");
    if (!tile) {
        exitSwapMode();
        return;
    }
  
    // Определяем координаты плитки
    let r = -1, c = -1;
    for (let row = 0; row < game.gridSize; row++) {
      for (let col = 0; col < game.gridSize; col++) {
        if (game.grid[row][col]?.el === tile) {
          r = row;
          c = col;
          break;
        }
      }
      if (r !== -1) break;
    }
  
    if (r === -1 || c === -1) return;
  
    // Проверка: уже выбрана эта же плитка?
    if (game.selectedTiles.some(t => t.r === r && t.c === c)) return;
  
    game.selectedTiles.push({ r, c });
    tile.classList.add("selected");
  
    if (game.selectedTiles.length === 2) {
  
        const cost = 120;
        game.currency -= cost;
        updateCurrencyDisplay();

        pushToHistory(getSnapshotBoard());

        const [first, second] = game.selectedTiles;
        const tileA = game.grid[first.r][first.c];
        const tileB = game.grid[second.r][second.c];

        if (!tileA || !tileB) return;

        const elA = tileA.el;
        const elB = tileB.el;

        const posA = { x: first.c * game.cellSize + game.gap, y: first.r * game.cellSize + game.gap };
        const posB = { x: second.c * game.cellSize + game.gap, y: second.r * game.cellSize + game.gap };

        gsap.to(elA, {
            x: posB.x + 'vmin',
            y: posB.y + 'vmin',
            duration: 0.3,
            onComplete: () => setTilePosition(elA, second.r, second.c)
        });

        gsap.to(elB, {
            x: posA.x + 'vmin',
            y: posA.y + 'vmin',
            duration: 0.3,
            onComplete: () => setTilePosition(elB, first.r, first.c)
        });

        // Обновляем grid
        [game.grid[first.r][first.c], game.grid[second.r][second.c]] = [tileB, tileA];

        elA.classList.remove("selected");
        elB.classList.remove("selected");

        game.selectedTiles = [];
        exitSwapMode();
        PlayerStatsManager.prepareChanges();
    }
}

function showAdsVideo() {
    const cost = 115;
    game.currency += cost;
    updateCurrencyDisplay();
    PlayerStatsManager.prepareChanges();
}

function restartGame() {

}

function toggleSound() {
    
    game.isSoundOn = !game.isSoundOn;

    localStorage.setItem("sound", game.isSoundOn); // сохраним настройку
    
    const soundText = document.getElementById("sound-text");
    soundText.textContent = game.isSoundOn ? "Звук: Вкл" : "Звук: Выкл";
    const soundIcon = document.getElementById("sound-icon");
    soundIcon.src = game.isSoundOn ? "images/icon_sound_on.png" : "images/icon_sound_off.png";
  
    if (game.isSoundOn && game.musicReady) {
        game.bgMusic.play();
    } else {
        game.bgMusic.pause();
    }
}