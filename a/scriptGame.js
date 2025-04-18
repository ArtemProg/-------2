let ysdk;

const PlayerStatsManager = {
    pendingStats: {},
    saveTimeout: null,
    lastSaveTime: 0,
    SAVE_DELAY: 5000, // минимальная задержка между запросами в мс
    lastSubmitTime: 0,
    SUBMIT_DELAY: 1000, // 1 секунда
  
    init() {
        // Подписка на событие "вкладка скрыта"
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.forceSave(); // Принудительно сохраняем, без задержки
                musicOnPause(true);
            } else {
              musicOnPause(false);
            }
        });
        window.addEventListener('beforeunload', () => {
            this.forceSave(); // Повторная попытка
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
            lastClaimDate: game.lastClaimDate,
            lastDailyReward: game.lastDailyReward,
            currentGame: {
                ...getSnapshotBoard(),
                history: game.historyStack.map(entry => ({
                score: entry.score,
                highestLevelReached: entry.highestLevelReached,
                grid: entry.grid.map(row => row.map(cell => (cell ? { value: cell.value } : null)))
              }))
            },
        };

        this.update(newStats);
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
    },

    trySubmitScore(score) {
      ysdk.getPlayer().then(player => {
        // Проверяем, авторизован ли игрок
        if (player.getMode() === 'lite') {
          // console.log('Игрок не авторизован. Запрашиваем авторизацию...');
          // ysdk.auth.openAuthDialog().then(() => {
          //   console.log('Игрок авторизован после диалога');
          //   submitScore(score); // Отправляем очки
          // }).catch(() => {
          //   console.warn('Игрок отказался от авторизации. Очки не будут отправлены.');
          // });
        } else {
          console.log('Игрок уже авторизован');
          this.submitScore(score);
        }
      }).catch(err => {
        console.error('Ошибка получения игрока:', err);
      });
    },

    submitScore(score) {
      const now = Date.now();
    
      if (now - this.lastSubmitTime < this.SUBMIT_DELAY) {
        console.warn("⚠️ Слишком частая отправка очков. Подожди немного.");
        return;
      }
    
      this.lastSubmitTime = now;
    
      ysdk.getLeaderboards().then(lb => {
        lb.setLeaderboardScore('lbBestScore', score).then(() => {
          console.log('✅ Очки отправлены в лидерборд');
        }).catch(err => {
          console.error('❌ Ошибка при отправке очков:', err);
        });
      }).catch(err => {
        console.error('❌ Ошибка при получении лидерборда:', err);
      });
    },

};

const SoundManager = {
  sounds: {},
  musicEnabled: true,
  effectsEnabled: true,

  load(name, sources, loop = false) {
    const audio = document.createElement("audio");

    for (const src of sources) {
      const type = this.getMimeType(src);
      if (audio.canPlayType(type)) {
        audio.src = src;
        audio.preload = "auto";
        audio.loop = loop;
        this.sounds[name] = audio;
        return;
      }
    }

    console.warn(`⛔ Ни один формат не поддерживается для: ${name}`);
  },

  getMimeType(filename) {
    if (filename.endsWith(".mp3")) return "audio/mpeg";
    if (filename.endsWith(".m4a")) return "audio/mp4";
    if (filename.endsWith(".ogg")) return "audio/ogg";
    return "";
  },

  play(name) {
    if (!this.effectsEnabled) return;
    const sound = this.sounds[name];
    if (sound && !sound.loop) {
      sound.volume = 0.1;
      sound.currentTime = 0;
      sound.play().catch(err => {
        console.warn(`⛔ Не удалось воспроизвести звук "${name}"`, err);
      });
    }
  },

  playMusic(name) {
    if (!this.musicEnabled) return;
    const sound = this.sounds[name];
    if (sound && sound.loop) {
      sound.volume = 0.01;
      sound.play().catch(err => {
        console.warn(`⛔ Не удалось воспроизвести музыку "${name}"`, err);
      });
    }
  },

  stop(name) {
    const sound = this.sounds[name];
    if (sound) {
      sound.pause();
      sound.currentTime = 0;
    }
  },

  pause(name) {
    const sound = this.sounds[name];
    if (sound) sound.pause();
  },

  toggleMusic(enable) {
    this.musicEnabled = enable;
    if (!enable) this.pause("bg");
  },

  toggle(enable) {
    this.enabled = enable;
    if (!enable) {
      for (const s of Object.values(this.sounds)) {
        s.pause();
        s.currentTime = 0;
      }
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

    highestLevelReached: 2,

    gridElement: document.getElementById("grid"),
    settingsOverlay: document.getElementById("settings-overlay"),
    elBestScore: document.getElementById("best"),
    elCurrency: document.getElementById("currency"),
    elScore: document.getElementById("score"),
    destroyPanel: document.getElementById("destroy-mode-panel"),
    swapPanel: document.getElementById("swap-mode-panel"),

    selectedTiles: [],

    historyStack: [],
    HISTORY_LIMIT: 10,

    isMusicOn: false,
    musicReady: false,
    musicStarted: false,

    swapMode: false,
    destroyMode: false,

    isPlaying: false,
    isPaused: false,
    isMove: false,

    hasEnteredBefore: false,
    currency: 0,
    bestScore: 0,
    score: 0,
    lastClaimDate: null,
    lastDailyReward: null,

    player: {},

    log2Cache: {},
    colorCache: {},
    predefinedTileColors: {},
    randomLevelUpPhrases: [],
    randomNoCurrencyPhrases: [],

    lastAdTimestamp: 0,
    lastInteractionTime: null,

    lang: null,
    langs: ["ru", "en"],
    currentLang: "ru",
    translations: {},

    dailyReward: 395,
    videoReward: 250,
    undoPrice: 110,
    destroyPrice: 100,
    swapPrice: 120,
    currencyStart: 100,

    intervalSmartAd: 3000,

};

window.addEventListener("load", () => {
    YaGames.init().then(sdk => {
      ysdk = sdk;
  
      game.lang = ysdk.environment.i18n.lang;
      game.currentLang = game.lang && game.langs.includes(game.lang) 
        ? game.lang
        : game.langs.includes[0];

      document.documentElement.lang = game.currentLang;

      loadingResources(() => {
        updateLangTexts();
        initGame(() => {

          checkDailyReward();
          PlayerStatsManager.prepareChanges();
          tryShowSmartAd("startup");

          setInterval(() => {
            tryShowSmartAd("auto");
          }, game.intervalSmartAd);

        });
      });
      
    });
})




function initGame(callback) {

    createGrid();
    
    initTilePool();

    syncTileSizeWithCell();

    initDefaultSettings();

    game.isMusicOn = localStorage.getItem("music") !== "false";
    game.lastAdTimestamp = Number(localStorage.getItem("lastAdTimestamp") || 0);

    updateLabelMusic();
    
    return ysdk.getPlayer().then(_player => {
        game.player = _player;
        return loadCloudSave();
    }).catch(err => {
        // Ошибка при инициализации объекта Player.
        game.player = {};
    }).then(() => {
        
        let isEmpty = true;
        for (let r = 0; r < game.gridSize; r++) {
            for (let c = 0; c < game.gridSize; c++) {
                if (game.grid[r][c]) {
                    isEmpty = false;
                    break;
                };
            }
            if (!isEmpty) break;
        }

        if (isEmpty) {
            setTimeout(() => {
                spawnTile();
                spawnTile();
            }, 200);
            if (!game.hasEnteredBefore) {
                game.currency = game.currencyStart;
                game.hasEnteredBefore = true;
            }
        }

        SoundManager.load("bg", ["sound/music.m4a", "sound/music.mp3"], true);
        // SoundManager.load("merge", ["sound/merge.m4a", "sound/merge.mp3"]);
        // SoundManager.load("swap", ["sound/swap.m4a", "sound/swap.mp3"]);
        // SoundManager.load("destroy", ["sound/destroy.m4a", "sound/destroy.mp3"]);
        SoundManager.load("destroy", ["sound/destroy.mp3"]);
        SoundManager.load("swap", ["sound/swap.mp3"]);
        SoundManager.load("undo", ["sound/undo.mp3"]);
        SoundManager.load("levelUp", ["sound/levelUp.mp3"]);
        
        SoundManager.sounds["bg"].addEventListener("canplaythrough", () => {
          game.musicReady = true;
        });
        
        startGame();
        setupInput();
        
        window.addEventListener('resize', () => {
          syncTileSizeWithCell();
          // updateTileFontSizes();
        });


        PlayerStatsManager.init();

        document.getElementById("undo-button").addEventListener("click", undoMove);
        document.getElementById("destroy-button").addEventListener("click", enterDestroyMode);
        document.getElementById("swap-button").addEventListener("click", enterSwapMode);
        document.getElementById("ad-button").addEventListener("click", () => showAdsVideo("game") );
        document.getElementById("settings-button").addEventListener("click", openSettings);

        document.getElementById("new-game-btn").addEventListener("click", restartGame);
        document.getElementById("watch-ad-btn").addEventListener("click", () => showAdsVideo("settings"));
        document.getElementById("toggle-music-btn").addEventListener("click", toggleMusic);
        document.getElementById("close-settings-btn").addEventListener("click", closeSettingsOverlay);

        // Навешиваем на первое взаимодействие
        document.addEventListener("click", tryStartMusic);
        window.addEventListener("touchstart", tryStartMusic);
        window.addEventListener("keydown", tryStartMusic);
        document.body.addEventListener('click', tryStartMusic, { once: true });

        game.lastClaimDate = new Date();

        if (callback) callback();

    });
}

function closeSettingsOverlay() {
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
}

function loadCloudSave() {

    return game.player.getData().then(data => {
        const state = data;
        if (state) {
          
            if (state.currency) game.currency = state.currency;
            if (state.bestScore) game.bestScore = state.bestScore;
            if (state.hasEnteredBefore) game.hasEnteredBefore = state.hasEnteredBefore;

            if (state.lastClaimDate) game.lastClaimDate = new Date(state.lastClaimDate);
            if (state.lastDailyReward) game.lastDailyReward = new Date(state.lastDailyReward);

            if (state.currentGame) {
                const currentGame = state.currentGame;
                game.score = currentGame.score;
                game.highestLevelReached = currentGame.highestLevelReached;

                for (let r = 0; r < game.gridSize; r++) {
                    for (let c = 0; c < game.gridSize; c++) {
                        const cell = currentGame.grid[r][c];
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
                            // game.gridElement.appendChild(tile);
                        }
                    }
                }

                const tempHistory = (currentGame.history || []).map(entry => ({
                    score: entry.score,
                    highestLevelReached: entry.highestLevelReached,
                    grid: entry.grid.map(row => row.map(cell => (cell ? { value: cell.value } : null)))
                }));
                game.historyStack.length = 0;
                game.historyStack.push(...tempHistory);
            }
          
        } else {
          
        }
    });

}

function initDefaultSettings() {
    
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

    game.bestScore = 0;
    game.score = 0;
    game.currency = 0;
    game.hasEnteredBefore = false;
    game.historyStack = [];
    game.isPlaying = false;
    game.isPaused = false;
    game.isMusicOn = false;
    game.musicReady = false;
    game.musicStarted = false;
    game.lastClaimDate = new Date();
    game.lastAdTimestamp = 0;
    game.lastInteractionTime = null;
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
                }, 700);
            }
        }
    );
}

//-------------------------------------

function move_1(direction) {
    
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
    let currency = 0;
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

          // 1. Отобразить клон
          // 2. скрыть оригинал
          // 3. подготовить к показу конечную ячейку

          const toCellDOM = document.querySelector(`.cell[data-row="${nr}"][data-col="${nc}"]`);
          const toCell = game.grid[nr][nc];

          if (toCell) {
            const toTile = toCell.el;
            const newValue = toCell.value * 2;
            currency += Math.round(getLevel(toCell.value)/4);
            game.grid[r][c] = null;
            setTimeout(() => {
              toCell.value = newValue;
              toTile.innerHTML = `
                  <div class="tile-inner pop">
                    <div class="tile-sprite"></div>
                    <div class="tile-level"><span>${getLevel(newValue)}</span></div>
                  </div>`;
              styleTile(toTile, newValue);
              setTileSprite(toTile.querySelector('.tile-sprite'), newValue);
              addScore(newValue);
              }, 150);
          } else {
            setTilePosition(fromTile, nr, nc);
            game.grid[nr][nc] = cell;
            game.grid[r][c] = null;
          }
          
          animateTileMovement(fromTile, game.grid[r][c], toCellDOM, () => {
            // После анимации: обновляем DOM
            const oldCell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
            const newCell = toCellDOM;
            if (oldCell.contains(fromTile)) oldCell.removeChild(fromTile);
            newCell.appendChild(fromTile);
          });

          
          
        }
      }
    }
    if (moved) {
        setTimeout(() => {
            game.currency += currency;
            updateCurrencyDisplay();
            spawnTile();
            pushToHistory(snapshotBoard);
            PlayerStatsManager.prepareChanges();
            checkGameOver();
        }, 250);
    } else {
      checkGameOver();
    }
}

// функция формирования действий без изменения DOM
function computeActions(direction) {
  const actions = [];
  let moved = false;
  let currency = 0;

  const cloneGrid = grid => grid.map(row => row.map(cell => cell ? { ...cell } : null));
  const tempGrid = cloneGrid(game.grid);

  const get = (r, c) => tempGrid[r]?.[c];

  const directions = {
    ArrowLeft: { vertical: false, reverse: false },
    ArrowRight: { vertical: false, reverse: true },
    ArrowUp: { vertical: true, reverse: false },
    ArrowDown: { vertical: true, reverse: true },
  };

  const dir = directions[direction];
  if (!dir) return { actions, moved, currency };

  for (let line = 0; line < game.gridSize; line++) {
    let tiles = [];

    for (let i = 0; i < game.gridSize; i++) {
      const r = dir.vertical ? i : line;
      const c = dir.vertical ? line : i;
      const cell = get(r, c);
      if (cell) tiles.push({ ...cell, r, c });
    }

    if (dir.reverse) tiles.reverse();

    const newLine = [];
    let i = 0;

    while (i < tiles.length) {
      const current = tiles[i];
      const next = tiles[i + 1];
      const targetIndex = newLine.length;
      const toIndex = dir.reverse ? game.gridSize - 1 - targetIndex : targetIndex;
      const r = dir.vertical ? toIndex : line;
      const c = dir.vertical ? line : toIndex;

      if (next && current.value === next.value) {
        if (current.r != r || current.c != c) actions.push({ from: current, from2: undefined, to: { r, c }, value: current.value});
        actions.push({ from: next, from2: current, to: { r, c }, value: current.value * 2 });

        newLine.push({ value: current.value * 2 });
        currency += Math.round(getLevel(current.value * 2) / 4);
        i += 2;
        moved = true;
      } else {
        if (current.r !== r || current.c !== c) {
          actions.push({ from: current, from2: undefined, to: { r, c }, value: current.value });
          moved = true;
        }
        newLine.push({ value: current.value });
        i++;
      }
    }
  }

  return { actions, moved, currency };
}

// move с учётом цепных перемещений и точной таблицей изменений
function move(direction) {
  if (!game.isPlaying) return;

  if (game.isMove) return;
  game.isMove = true;
  setTimeout(() => {
    game.isMove = false;
  }, 250);

  const snapshotBoard = getSnapshotBoard();
  const { actions, moved, currency } = computeActions(direction);

  // const allCells = document.querySelectorAll(".cell");
  // allCells.forEach(cell => cell.innerHTML = "");

  // Применяем действия
  actions.forEach(action => {
    const toCell = getCellElement(action.to.r, action.to.c);

    if (action.from2) {

      const fromTile = action.from.el;
      const fromCell = getCellElement(action.from.r, action.from.c);

      game.grid[action.to.r][action.to.c] = { el: fromTile, value: action.value };
      game.grid[action.from.r][action.from.c] = null;

      animateTileMovement(fromTile, toCell, () => {
        // После анимации: обновляем DOM
        if (fromCell.contains(fromTile)) fromCell.removeChild(fromTile);
        if (toCell.contains(action.from2.el)) toCell.removeChild(action.from2.el);
        action.from2.el.remove();

        fromTile.className = "tile";
        fromTile.innerHTML = `
        <div class="tile-inner pop">
          <div class="tile-sprite"></div>
          <div class="tile-level"><span>${getLevel(action.value)}</span></div>
        </div>`;

        setTimeout(() => {
          fromTile.querySelector(".tile-inner.pop").classList.remove("pop");
        }, 150);

        styleTile(fromTile, action.value);
        setTileSprite(fromTile.querySelector('.tile-sprite'), action.value);
        toCell.appendChild(fromTile);

      })?.then(() => {
        checkWin(game.grid[action.to.r][action.to.c]);
      });

    } else {
      const fromTile = action.from.el;
      const fromCell = getCellElement(action.from.r, action.from.c);

      game.grid[action.to.r][action.to.c] = { el: fromTile, value: action.value };
      game.grid[action.from.r][action.from.c] = null;


      animateTileMovement(fromTile, toCell, () => {
        // После анимации: обновляем DOM
        if (fromCell.contains(fromTile)) fromCell.removeChild(fromTile);
        toCell.appendChild(fromTile);
      });
      
    }
  });

  if (moved) {
    setTimeout(() => {
      game.currency += currency;
      updateCurrencyDisplay();
      spawnTile();
      pushToHistory(snapshotBoard);
      PlayerStatsManager.prepareChanges();
      checkGameOver();
    }, 150);
  } else {
    checkGameOver();
  }
}

function cloneGrid(grid) {
  return grid.map(row =>
    row.map(cell => cell ? { el: cell.el, value: cell.value } : null)
  );
}

function getCellElement(r, c) {
  return document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
}

function checkGameOver() {
  for (let r = 0; r < game.gridSize; r++) {
    for (let c = 0; c < game.gridSize; c++) {
      if (!game.grid[r][c]) return false;
      const val = game.grid[r][c].value;
      if (
        (r > 0 && game.grid[r - 1][c]?.value === val) ||
        (r < game.gridSize - 1 && game.grid[r + 1][c]?.value === val) ||
        (c > 0 && game.grid[r][c - 1]?.value === val) ||
        (c < game.gridSize - 1 && game.grid[r][c + 1]?.value === val)
      ) {
        return false;
      }
    }
  }
  showGameOverOverlay();
  return true;
}

function showGameOverOverlay() {
  const overlay = document.getElementById("game-over-overlay");
  overlay.classList.remove("hidden");
  game.isPaused = true;

  document.getElementById("go-destroy").onclick = () => {
    overlay.classList.add("hidden");
    game.isPaused = false;
    enterDestroyMode();
  };

  document.getElementById("go-swap").onclick = () => {
    overlay.classList.add("hidden");
    game.isPaused = false;
    enterSwapMode();
  };

  document.getElementById("go-watch-ad").onclick = () => {
    overlay.classList.add("hidden");
    game.isPaused = false;
    showAdsVideo("game");
  };

  document.getElementById("go-restart").onclick = () => {
    overlay.classList.add("hidden");
    game.isPaused = false;
    restartGame();
  };
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

    setTimeout(() => {
      const t = tile.querySelector(".tile-inner.pop").classList.remove("pop");
    }, 150);
    //game.gridElement.appendChild(tile);
}

function checkWin(cell) {
    const level = getLevel(cell.value);
    if (level > game.highestLevelReached) {
        game.highestLevelReached = level;
        
        if (level > 3) SoundManager.play("levelUp");
        if (level > 6) showLevelUpPopup(level);

        const tile = cell.el;
        tile.classList.add("selected");
        setTimeout(() => {
          cell.el.classList.remove("selected");
        }, 500);
        
        // позиционируем в центре плитки;
        const tileRect = tile.getBoundingClientRect();
        const centerX = tileRect.left + tileRect.width / 2;
        const centerY = tileRect.top + tileRect.height / 2;

        playVictoryParticles(centerX, centerY);

    }
}

// createGrid

function createGrid() {
  
    for (let r = 0; r < game.gridSize; r++) {
        game.grid[r] = [];
      for (let c = 0; c < game.gridSize; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.row = r;
        cell.dataset.col = c;
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

    for (let r = 0; r < game.gridSize; r++) {
      for (let c = 0; c < game.gridSize; c++) {
          const valueCell = game.grid[r][c];
          if (valueCell) {
              setTilePosition(valueCell.el, r, c);
          }
      }
  }
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

// В setTilePosition мы теперь НЕ используем transform, а вставляем в cell:
function setTilePosition(tile, r, c) {
  const cell = game.gridElement.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  if (cell) cell.appendChild(tile);
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
    
    let path;
    if (level >= 34) {
        const helperIndex = ((level - 34) % 8) + 1;
        path = `images/helper_${helperIndex}.png`;
    } else {
        const clamped = Math.min(level, 34);
        path = `images/set2/img_${clamped}.png`;
    }
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
    for(let i = 1; i <= 34; i++) {
        imagePaths.push(`images/set2/img_${i}.png`)
    }
    for(let i = 1; i < 9; i++) {
        imagePaths.push(`images/helper_${i}.png`)
    }

    preloadImages(imagePaths, () => {
       
      fetch(`lang/${game.currentLang}.json`)
      .then(response => response.json())
      .then(translations => {
        game.translations = translations;
        callback();
      });
      
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
        PlayerStatsManager.trySubmitScore(game.bestScore);
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

    ["click", "keydown", "touchstart"].forEach(event => {
      document.addEventListener(event, () => {
        game.lastInteractionTime = Date.now();
      });
    });

}

function tryStartMusic() {
  if (game.musicStarted || !game.isMusicOn) return;

  const music = SoundManager.sounds["bg"];

  if (!music) return;

  // если не инициализировано — загрузим (один раз)
  if (!music.dataset?.initialized) {
    music.dataset = music.dataset || {};
    music.dataset.initialized = true;
    music.load();
    return;
  }

  // попытка воспроизведения
  music.volume = 0.01;
  music.loop = true;

  music.play().then(() => {
    console.log("🎵 Музыка играет!");
    game.musicStarted = true;
  }).catch(err => {
    console.warn("⚠️ Ошибка запуска музыки:", err);
  });

  // Удалим слушатели после первой попытки
  document.removeEventListener("click", tryStartMusic);
  window.removeEventListener("touchstart", tryStartMusic);
  window.removeEventListener("keydown", tryStartMusic);
}

//------------------------------------------

function getSnapshotBoard() {
    return {
      score: game.score,
      highestLevelReached: game.highestLevelReached,
      grid: game.grid.map(row => row.map(cell => (cell ? { value: cell.value } : null))),
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
  
    const cost = game.undoPrice;

    if (game.currency < cost) {
      showNoCurrencyOverlay();
      return;
    }
  
    const prev = game.historyStack.pop();
    if (!prev) return;
  
    SoundManager.play("undo");

    game.currency -= cost;
  
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
          // game.gridElement.appendChild(tile);
        }
      }
    }

    PlayerStatsManager.prepareChanges();
}

function enterDestroyMode() {

  if (game.destroyMode) {
    exitDestroyMode();
    return;
  } else if (game.swapMode) {
    exitSwapMode();
    return;
  }

  const cost = game.destroyPrice;

  if (game.currency < cost) {
    showNoCurrencyOverlay();
    return;
  }
  
  game.destroyMode = true;
  updateHelperPanel("destroy-mode-panel");
  game.destroyPanel.classList.remove("hidden");

  setTimeout(() => {
    document.addEventListener("click", handleDestroyClick);
  }, 50);
}

function getTilePosition(tileEl) {
  const cellEl = tileEl.closest('.cell');
  if (!cellEl) return null;

  const row = parseInt(cellEl.dataset.row, 10);
  const col = parseInt(cellEl.dataset.col, 10);

  return { row, col, cellEl };
}

function handleDestroyClick(e) {
  
    let isDestroyMode = game.destroyMode;
    exitDestroyMode();
  
    if (!isDestroyMode) return;
  
    const tile = e.target.closest(".tile");
  
    if (!tile) return;
  
    // Поиск координат плитки
    const tilePossition = getTilePosition(tile);
    if (!tilePossition) return;
  
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
  
    game.grid[tilePossition.row][tilePossition.col] = null;
    PlayerStatsManager.prepareChanges();

    //-----------------------------------

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
  
    SoundManager.play("destroy");

    // Частицы
    for (let i = 0; i < 15; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      //p.style.background = ['gold', 'aqua', 'white', 'hotpink'][Math.floor(Math.random() * 4)];
      p.style.boxShadow = `0 0 10px ${p.style.background}`;
      document.body.appendChild(p);
      
      p.style.top = centerX + 'px';
      p.style.left = centerY + 'px';
  
      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 40;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
  
      gsap.to(p, {
        x: dx,
        y: dy,
        opacity: 0,
        //scale: 0.5 + Math.random(),
        scale: 1 + Math.random() * 1.5,
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
              tile.style.display = "none";
              tilePossition.cellEl.removeChild(tile);
              tile.remove();

            }
          });
        }
      }
    );
  
    // Тряска
    gsap.fromTo(tile, 
      { x: 0 - 30 }, 
      { x: 0 + 30, yoyo: true, repeat: 5, duration: 0.04, ease: "power1.inOut", onComplete: () => {
        gsap.to(tile, { x: 0, duration: 0.05 });
      }}
    );
  
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
  
  if (game.destroyMode) {
    exitDestroyMode();
    return;
  } else if (game.swapMode) {
    exitSwapMode();
    return;
  }

  const cost = game.swapPrice;
  
  if (game.currency < cost) {
    showNoCurrencyOverlay();
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
        const el = game.grid[tile.row][tile.col].el;
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
  
    const tilePosition = getTilePosition(tile);
    if (!tilePosition) return;    
  
    // Проверка: уже выбрана эта же плитка?
    if (game.selectedTiles.some(t => t.row === tilePosition.row && t.col === tilePosition.col)) return;
  
    game.selectedTiles.push(tilePosition);
    tile.classList.add("selected");
  
    if (game.selectedTiles.length === 2) {
  
        const cost = 120;
        game.currency -= cost;
        updateCurrencyDisplay();

        pushToHistory(getSnapshotBoard());

        const [first, second] = game.selectedTiles;
        const tileA = game.grid[first.row][first.col];
        const tileB = game.grid[second.row][second.col];

        if (!tileA || !tileB) return;

        const elA = tileA.el;
        const elB = tileB.el;

        animateTileMovement(elA, second.cellEl, () => {
          // После анимации: обновляем DOM
          if (first.cellEl.contains(elA)) first.cellEl.removeChild(elA);
          second.cellEl.appendChild(elA);
        });

        animateTileMovement(elB, first.cellEl, () => {
          // После анимации: обновляем DOM
          if (second.cellEl.contains(elB)) second.cellEl.removeChild(elB);
          first.cellEl.appendChild(elB);
          
        });

        // const posA = { x: first.c * game.cellSize + game.gap, y: first.r * game.cellSize + game.gap };
        // const posB = { x: second.c * game.cellSize + game.gap, y: second.r * game.cellSize + game.gap };

        SoundManager.play("swap");


        // gsap.to(elA, {
        //     x: posB.x + 'vmin',
        //     y: posB.y + 'vmin',
        //     duration: 0.3,
        //     onComplete: () => setTilePosition(elA, second.r, second.c)
        // });

        // gsap.to(elB, {
        //     x: posA.x + 'vmin',
        //     y: posA.y + 'vmin',
        //     duration: 0.3,
        //     onComplete: () => setTilePosition(elB, first.r, first.c)
        // });

        // Обновляем grid
        [game.grid[first.row][first.col], game.grid[second.row][second.col]] = [tileB, tileA];

        elA.classList.remove("selected");
        elB.classList.remove("selected");

        game.selectedTiles = [];
        exitSwapMode();
        PlayerStatsManager.prepareChanges();
    }
}

function showAdsVideo(source = "game") {

  const rewardAmount = 415;

  if (source === "settings") {
    closeSettingsOverlay();
  }

  ysdk.adv.showRewardedVideo({
    callbacks: {
        onOpen: () => {
          console.log('Video ad open.');
          musicOnPause(true);
        },
        onRewarded: () => {

          game.currency += rewardAmount;

          showRewardPopup(
            `🎉 Вы получили <span class="reward-amount">+${rewardAmount}</span> самоцветов!`,
            () => {
              updateCurrencyDisplay();
              PlayerStatsManager.prepareChanges();
          });

          console.log('Rewarded!');
        },
        onClose: () => {
          console.log('Video ad closed.');
          musicOnPause(false);
          setTimeout(() => {
            // syncTileSizeWithCell();
          }, 150);
        },
        onError: (e) => {
          console.log('Error while open video ad:', e);
        }
    }
  })

}

function t(key, params = {}) {
  let text = game.translations[key] || key;
  for (const param in params) {
    text = text.replaceAll(`{${param}}`, params[param]);
  }
  return text;
}

function updateLangTexts() {

  document.getElementById("ad-button").title = t("getGems");
  document.getElementById("undo-button").title = t("undo");
  document.getElementById("destroy-button").title = t("destroy");
  document.getElementById("swap-button").title = t("swap");
  document.getElementById("settings-button").title = t("settings");

  
  document.getElementById("new-game-btn").querySelector('span').textContent = t("newGame");
  document.getElementById("watch-ad-btn").querySelector('span').textContent = t("getGems");
  document.getElementById("toggle-music-btn").querySelector('span').textContent = t("music");
  document.getElementById("close-settings-btn").querySelector('span').textContent = t("continue");
  
  document.getElementById("go-destroy").querySelector('span').textContent = t("destroy");
  document.getElementById("go-swap").querySelector('span').textContent = t("swap");
  document.getElementById("go-watch-ad").querySelector('span').textContent = t("getGems");
  document.getElementById("go-restart").querySelector('span').textContent = t("newGame");

  document.getElementById("title-game-over-1").textContent = t("title-game-over-1");
  document.getElementById("title-game-over-2").textContent = t("title-game-over-2");

  game.randomNoCurrencyPhrases = t("randomNoCurrencyPhrases");
  game.randomLevelUpPhrases = t("randomLevelUpPhrases");

  document.getElementById("no-currency-watch-ad").querySelector('span').textContent = t("getGems");
  document.getElementById("no-currency-close").querySelector('span').textContent = t("continue");

  game.destroyPanel.querySelector('p').textContent = t("destroyInstruction");
  game.swapPanel.querySelector('p').textContent = t("swapInstruction");
  
  document.getElementById("ad-button").querySelector('span').textContent = `+${game.videoReward}`;
  document.getElementById("undo-button").querySelector('span').textContent = game.undoPrice;
  document.getElementById("destroy-button").querySelector('span').textContent = game.destroyPrice;
  document.getElementById("swap-button").querySelector('span').textContent = game.swapPrice;

}

function restartGame() {
    
    game.score = 0;
    game.historyStack.length = 0;
    game.highestLevelReached = 2;
    
    game.gridElement.innerHTML = "";
    game.grid = [];

    createGrid();
    
    setTimeout(() => {
        spawnTile();
        spawnTile();
        PlayerStatsManager.prepareChanges();
        game.lastClaimDate = new Date();
        game.isPaused = false;
        game.isPlaying = true;
    }, 500);

    updateBestScoreDisplay();
    updateCurrencyDisplay();
    updateScoreDisplay();

    
    closeSettingsOverlay();
    tryShowSmartAd("newgame");
}

function toggleMusic() {
    
    game.isMusicOn = !game.isMusicOn;

    localStorage.setItem("music", game.isMusicOn); // сохраним настройку
    
    updateLabelMusic();
  
    SoundManager.toggleMusic(game.isMusicOn);
    if (game.isMusicOn) {
      tryStartMusic();
    } else {
      SoundManager.pause("bg");
      game.musicStarted = false;
    }
}

function updateLabelMusic() {
    const musicText = document.getElementById("music-text");
    musicText.textContent = game.isMusicOn ? t("musicOn") : t("musicOff");

    const musicIcon = document.getElementById("music-icon");
    musicIcon.src = game.isMusicOn ? "images/icon_sound_on.png" : "images/icon_sound_off.png";
}

function checkDailyReward() {
  
  const today = new Date().toDateString(); // "Mon Apr 08 2025"

  if (!game.lastDailyReward || game.lastDailyReward.toDateString() !== today) {
    
    setTimeout(() => {
      const rewardAmount = game.dailyReward;
      const text = t("dailyReward", { amount: rewardAmount });
      
      // Показываем всплывающее окно
      showRewardPopup(
        text,
        () => {
          // Даем награду
          game.currency += rewardAmount;
          game.lastDailyReward = new Date();
          updateCurrencyDisplay();
      });
      }, 1000);
  }
}

function showRewardPopup(message, callback) {
  const popup = document.createElement("div");
  popup.className = "level-up-popup";
  popup.innerHTML = `
        <img src="images/diamond.png" />
        <p>${message}</p>
  `;
  document.body.appendChild(popup);

  gsap.fromTo(popup, { scale: 0.5, opacity: 0 }, {
      scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.7)",
      onComplete: () => {
          setTimeout(() => {
              gsap.to(popup, {
                  scale: 0.5, opacity: 0, duration: 0.4, ease: "back.in(1.7)",
                  onComplete: () => {
                    popup.remove();
                    if (callback) callback();
                  }
              });
          }, 2500);
      }
  });
}

function tryShowSmartAd(trigger = "auto") {
  const now = Date.now();
  const minutes5 = 5 * 60 * 1000;

  const enoughTimePassed = now - game.lastAdTimestamp >= minutes5;

  if (!enoughTimePassed) return;

  //const playerIdle = now - game.lastInteractionTime >= 5000;

  const isAuto = trigger === "auto";
  const isStartup = trigger === "startup";
  const isNewGame = trigger === "newgame";

  if (isStartup || isNewGame || isAuto) {
    showFullscreenAd();
    game.lastAdTimestamp = now;
    localStorage.setItem("lastAdTimestamp", now.toString());
  }
}

function showFullscreenAd(callbackAfterAd = null) {
  if (!ysdk?.adv) return;

  ysdk.adv.showFullscreenAdv({
    callbacks: {
      onOpen: () => {
        console.log("📺 Реклама открыта");
      },
      onClose: (wasShown) => {
        console.log("📺 Закрыта. Показана:", wasShown);
        if (wasShown) {
          game.lastAdTimestamp = Date.now();
          setTimeout(() => {
            // syncTileSizeWithCell();
          }, 150);
        }
        if (callbackAfterAd) callbackAfterAd?.();
      },
      onError: (e) => {
        console.error("❌ Ошибка рекламы:", e);
        if (callbackAfterAd) callbackAfterAd?.();
      }
    }
  });
}

function showNoCurrencyOverlay() {

  const phrases = game.randomNoCurrencyPhrases;
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  document.getElementById("no-currency-text").textContent = phrase;

  const overlay = document.getElementById("no-currency-overlay");
  const cat = document.getElementById("no-currency-cat");

  const helperNumber = Math.floor(Math.random() * 8) + 1;
  const path = `images/helper_${helperNumber}.png`;
  const cachedImage = game.preloaderImages[path];
  if (cachedImage && cat) cat.src = cachedImage.src;

  const content = overlay.querySelector(".settings-content");
  gsap.fromTo(content, 
    { scale: 0.5, opacity: 0 }, 
    { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.7)" }
  );

  overlay.classList.remove("hidden");
  game.isPaused = true;

  document.getElementById("no-currency-close").onclick = () => {
    overlay.classList.add("hidden");
    game.isPaused = false;
  };

  document.getElementById("no-currency-watch-ad").onclick = () => {
    overlay.classList.add("hidden");
    showAdsVideo("settings"); // или "settings", если нужно
  };
}

function musicOnPause(isActive = true) {
  if (!game.isMusicOn || !game.musicReady) return;
  if (isActive) {
    SoundManager.pause("bg");
    game.musicStarted = false;
  } else {
    tryStartMusic();
  }
  
}


function playVictoryParticles(x, y) {
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    document.body.appendChild(p);

    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = `hsl(${Math.random() * 360}, 90%, 60%)`;

    // const dx = (Math.random() - 0.5) * 400;
    // const dy = (Math.random() - 0.5) * 400;
      
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 40;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    gsap.to(p, {
      x: dx,
      y: dy,
      opacity: 0,
      scale: 0.5 + Math.random(),
      duration: 0.5 + Math.random(),
      ease: 'power2.out',
      onComplete: () => p.remove()
    });
  }
}


function initTilePool() {
  game.tilePool = [];
  const container = document.getElementById("tile-animation-layer");
  for (let i = 0; i < 16; i++) {
    const tile = document.createElement("div");
    tile.className = "animation-tile";
    tile.style.position = "absolute";
    tile.style.display = "none";
    container.appendChild(tile);
    game.tilePool.push(tile);
  }
}

function getFreeAnimationTile() {
  return game.tilePool.find(tile => tile.style.display === "none");
}

function cleanAnimationTile(tile) {
  tile.innerHTML = "";
  tile.style.background = "";
  tile.style.color = "";
  tile.style.fontSize = "";
  tile.style.zIndex = "0";
  tile.style.top = "0";
  tile.style.left = "0";
  tile.style.display = "none";
}

function animateTileMovement(fromTile, toCell, onComplete) {
  const animTile = getFreeAnimationTile();
  if (!animTile) return onComplete?.();

  cleanAnimationTile(animTile);

  const rectFrom = fromTile.getBoundingClientRect();
  const rectTo = toCell.getBoundingClientRect();
  const layerRect = document.getElementById("tile-animation-layer").getBoundingClientRect();

  const startX = rectFrom.left - layerRect.left;
  const startY = rectFrom.top - layerRect.top;
  const endX = rectTo.left - layerRect.left;
  const endY = rectTo.top - layerRect.top;

  animTile.innerHTML = fromTile.innerHTML;
  animTile.style.background = fromTile.style.background;
  animTile.style.color = fromTile.style.color;
  animTile.style.fontSize = fromTile.style.fontSize;

  animTile.style.transform = "none";

  gsap.set(animTile, {
    x: 0,
    y: 0,
    position: 'absolute',
    zIndex: 100,
    // width: fromRect.width + 'px',
    // height: fromRect.height + 'px',
    top: `${startY}px`,
    left: `${startX}px`,
    display: "block",
    onComplete: () => {
      fromTile.style.display = "none";
    }
  });

  // animTile.style.left = `${startX}px`;
  // animTile.style.top = `${startY}px`;
  // animTile.style.display = "block";
  

  // fromTile.style.display = "none";
  
  return gsap.to(animTile, {
    x: endX - startX,
    y: endY - startY,
    duration: 0.25,
    ease: "power1.inOut",
    onComplete: () => {
      onComplete?.();
      animTile.style.display = "none";
      animTile.style.transform = "none";
      fromTile.style.display = "";
    }
  });
}


function updateTileFontSizes() {
  document.querySelectorAll('.tile').forEach(tile => {
    const span = tile.querySelector('.tile-level span');
    if (!span) return;

    const tileSize = tile.offsetWidth;
    const fontSize = tileSize * 0.35; // можешь варьировать от 0.3 до 0.5
    span.style.fontSize = fontSize + 'px';
  });
}