// ===== ХРАНИЛИЩЕ ДАННЫХ =====
const Storage = {
  save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  load(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  async saveRemote(key, value) {
    // TODO: API-провайдер (например, YaGames.data.set)
  },
  async loadRemote(key, fallback = null) {
    return fallback;
  }
};

const bgMusic = document.getElementById('bg-music');
let isSoundOn = localStorage.getItem("sound") !== "false";
let musicReady = false;
let musicStarted = false;

{
  const soundText = document.getElementById("sound-text");
  soundText.textContent = isSoundOn ? "Звук: Вкл" : "Звук: Выкл";
}


const colorCache = {};
const log2Cache = {};

const predefinedTileColors = {
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


const randomLevelUpPhrases = [
  "Кот доволен твоим прогрессом!",
  "Ты приближаешься к хвостатой легенде!",
  "Мяу! Ты просто чудо!",
  "Кажется, у этого кота девять жизней — и все в прокачке!",
  "Котик лайкнул твой уровень!",
  "Ты кото-богат!",
  "Шаг за шагом — к усатой вершине!",
  "Вот это кот-комбо!",
  "У тебя лапы растут откуда надо!",
  "Ты точно знаешь, как обращаться с пушистыми цифрами!"
];
let highestLevelReached = 4; // уровень до 4 не показываем

const historyStack = [];
const HISTORY_LIMIT = 10;

let bestScore = Storage.load("bestScore", 0);
let currency = Storage.load("currency", 0);

let isPlaying = false;
let isPaused = false;
const settingsOverlay = document.getElementById("settings-overlay");


const pxToVmin = (px) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vmin = Math.min(vw, vh);
  return (px / vmin) * 100;
};

const gridSize = 4;
// const tileSize = window.matchMedia("(orientation: portrait)").matches ? 21 : 18;
const gap = 2;
let tileSize;
let cellSize;


const gridElement = document.getElementById("grid");
let grid = [];
let score = 0;

function getSnapshot() {
  return {
    score,
    // bestScore,
    // currency,
    grid: grid.map(row => row.map(cell => (cell ? { value: cell.value } : null)))
  };
}

function pushToHistory(snapshot = null || getSnapshot()) {
  historyStack.push(snapshot);
  if (historyStack.length > HISTORY_LIMIT) {
    historyStack.shift();
  }
}

function undoMove() {
  if (destroyMode || swapMode) return;

  if (currency < 110) {
    alert("Недостаточно монет!");
    return;
  }

  const prev = historyStack.pop();
  if (!prev) return;

  currency -= 110;
  Storage.save("currency", currency);
  updateCurrencyDisplay();

  score = prev.score;
  // bestScore = prev.bestScore;
  // currency = prev.currency;

  updateScoreDisplay();
  // updateBestScoreDisplay();
  // updateCurrencyDisplay();

  gridElement.innerHTML = "";
  grid = [];
  createGrid();

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = prev.grid[r][c];
      if (cell) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.innerHTML = `
          <div class="tile-inner">
            <div class="tile-sprite"></div>
            <div class="tile-level"><span>${getLevel(cell.value)}</span></div>
          </div>`;
        grid[r][c] = { el: tile, value: cell.value };
        setTilePosition(tile, r, c);
        styleTile(tile, cell.value);
        setTileSprite(tile.querySelector('.tile-sprite'), cell.value);
        gridElement.appendChild(tile);
      }
    }
  }
}

function createGrid() {
  for (let r = 0; r < gridSize; r++) {
    grid[r] = [];
    for (let c = 0; c < gridSize; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      gridElement.appendChild(cell);
      grid[r][c] = null;
    }
  }
  syncTileSizeWithCell();
}

function spawnTile() {
  const empty = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (!grid[r][c]) empty.push({ r, c });
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
  grid[r][c] = { el: tile, value };
  setTilePosition(tile, r, c);
  styleTile(tile, value);
  setTileSprite(tile.querySelector('.tile-sprite'), value);
  gridElement.appendChild(tile);
  checkWin(value);
}

function setTilePosition(tile, r, c) {
  const x = c * cellSize + gap;
  const y = r * cellSize + gap;
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

function getColorForLevel(level) {
  if (colorCache[level]) return colorCache[level];

  let colors;

  if (predefinedTileColors[level]) {
    colors = predefinedTileColors[level];
  } else {
    const hue = (level * 35) % 360; // циклично по кругу
    colors = [`hsl(${hue}, 70%, 60%)`, '#f9f6f2'];
  }

  colorCache[level] = colors;

  return colors;
}

function getLevel(value) {
  if (log2Cache[value]) return log2Cache[value];
  const level = Math.log2(value);
  log2Cache[value] = level;
  return level;
}

function setTileSprite(spriteElement, value) {
  const level = getLevel(value);
  const maxLevel = 15;
  const clamped = Math.min(level, maxLevel);
  spriteElement.style.backgroundImage = `url('./images/img_${clamped}.png')`;
}

function move(direction) {
  if (!isPlaying) return;

  let snapshot = getSnapshot();

  let moved = false;
  const dir = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  }[direction];
  if (!dir) return;
  const range = [...Array(gridSize).keys()];
  const iterate = (dir.x > 0 || dir.y > 0) ? range.reverse() : range;
  const merged = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  for (let r of iterate) {
    for (let c of iterate) {
      const cell = grid[r][c];
      if (!cell) continue;
      let nr = r, nc = c;
      while (true) {
        const tr = nr + dir.y, tc = nc + dir.x;
        if (tr < 0 || tr >= gridSize || tc < 0 || tc >= gridSize) break;
        if (!grid[tr][tc]) {
          nr = tr;
          nc = tc;
        } else if (grid[tr][tc].value === cell.value && !merged[tr][tc]) {
          nr = tr;
          nc = tc;
          merged[nr][nc] = true;
          break;
        } else break;
      }
      if (nr !== r || nc !== c) {
        moved = true;
        const fromTile = cell.el;
        const toCell = grid[nr][nc];
        setTilePosition(fromTile, nr, nc);
        if (toCell) {
          const toTile = toCell.el;
          const newValue = toCell.value * 2;
          grid[r][c] = null;
          setTimeout(() => {
            gridElement.removeChild(fromTile);
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
          grid[nr][nc] = cell;
          grid[r][c] = null;
        }
      }
    }
  }
  if (moved) {
    setTimeout(() => {
      spawnTile();
      checkGameOver();
      saveGameState();
      pushToHistory(snapshot);
    }, 150);
  }
}

function updateBestScoreDisplay() {
  const el = document.getElementById("best");
  if (el) el.textContent = bestScore;
}

function updateCurrencyDisplay() {
  const el = document.getElementById("currency");
  if (el) el.textContent = currency;
}

function updateScoreDisplay() {
  const el = document.getElementById("score");
  if (el) el.textContent = score;
}

function addScore(points) {
  score += points;
  updateScoreDisplay();
  if (score > bestScore) {
    bestScore = score;
    Storage.save("bestScore", bestScore);
    updateBestScoreDisplay();
  }
}

function addCurrency(amount) {
  currency += amount;
  Storage.save("currency", currency);
  updateCurrencyDisplay();
}

function checkWin(value) {
  // if (getLevel(value) === 9) {
  //   showOverlay("Ты победил!", "Ты достиг уровня 4!");
  // }
  const level = getLevel(value);
  if (level >= 4 && level > highestLevelReached) {
    highestLevelReached = level;
    showLevelUpPopup(level);
  }
}

function checkGameOver() {
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (!grid[r][c]) return false;
      const val = grid[r][c].value;
      if (
        (r > 0 && grid[r - 1][c]?.value === val) ||
        (r < gridSize - 1 && grid[r + 1][c]?.value === val) ||
        (c > 0 && grid[r][c - 1]?.value === val) ||
        (c < gridSize - 1 && grid[r][c + 1]?.value === val)
      ) {
        return false;
      }
    }
  }
  showOverlay("Игра окончена", "Нет доступных ходов");
  return true;
}

function showOverlay(title, subtitle) {
  isPlaying = false;
  const overlay = document.getElementById("overlay");
  document.getElementById("overlay-title").textContent = title;
  document.getElementById("overlay-subtitle").textContent = subtitle;
  overlay.classList.remove("hidden");
}

function saveGameState() {
  const state = {
    score,
    bestScore,
    currency,
    history: historyStack.map(entry => ({
      score: entry.score,
      currency: entry.currency,
      bestScore: entry.bestScore,
      grid: entry.grid.map(row => row.map(cell => (cell ? { value: cell.value } : null)))
    })),
    grid: grid.map(row =>
      row.map(cell => (cell ? { value: cell.value } : null))
    )
  };
  Storage.save("gameState", state);
}

function loadBestScore() {
  const state = Storage.load("gameState", null);

  bestScore = state?.bestScore || 0;
  currency = state?.currency || 0;

  updateBestScoreDisplay();
  updateCurrencyDisplay();
}

function loadGameState() {
  const state = Storage.load("gameState", null);
  if (!state || !state.grid) return false;

  score = state.score || 0;
  bestScore = state.bestScore || 0;
  currency = state.currency || 0;

  const tempHistory = (state.history || []).map(entry => ({
    score: entry.score,
    currency: entry.currency,
    bestScore: entry.bestScore,
    highestLevelReached: entry?.highestLevelReached || 4,
    grid: entry.grid.map(row => row.map(cell => (cell ? { value: cell.value } : null)))
  }));
  historyStack.length = 0;
  historyStack.push(...tempHistory);

  updateScoreDisplay();
  updateBestScoreDisplay();
  updateCurrencyDisplay();

  gridElement.innerHTML = "";
  grid = [];
  createGrid();

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = state.grid[r][c];
      if (cell) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.innerHTML = `
          <div class="tile-inner">
            <div class="tile-sprite"></div>
            <div class="tile-level"><span>${getLevel(cell.value)}</span></div>
          </div>`;
        grid[r][c] = { el: tile, value: cell.value };
        setTilePosition(tile, r, c);
        styleTile(tile, cell.value);
        setTileSprite(tile.querySelector('.tile-sprite'), cell.value);
        gridElement.appendChild(tile);
      }
    }
  }

  return true;
}

function startGame(isNewGame = true) {

  if (!Storage.load("hasEnteredBefore", false)) {
    currency += 400;
    Storage.save("currency", currency);
    Storage.save("hasEnteredBefore", true);
  }

  historyStack.length = 0;
  score = 0;

  if (!isNewGame && loadGameState()) {
    isPlaying = true;
    return;
  }

  updateScoreDisplay();

  loadBestScore();
  createGrid();
  spawnTile();
  spawnTile();
  isPlaying = true;
}

function restartGame() {
  const overlay = document.getElementById("overlay");
  overlay.classList.add("hidden");
  gridElement.innerHTML = "";
  grid = [];
  score = 0;
  updateScoreDisplay();
  startGame();
}

document.getElementById("restart-button").addEventListener("click", restartGame);

function setupInput() {
  window.addEventListener("keydown", (e) => {
    if (!destroyMode && !isPaused && !swapMode && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
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
    if (!destroyMode && !isPaused && !swapMode) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > minSwipeDistance) {
        move(dx > 0 ? "ArrowRight" : "ArrowLeft");
      } else if (Math.abs(dy) > minSwipeDistance) {
        move(dy > 0 ? "ArrowDown" : "ArrowUp");
      }
    }
  }, { passive: false });
}

document.getElementById("undo-button").addEventListener("click", undoMove);
document.getElementById("destroy-button").addEventListener("click", enterDestroyMode);
document.getElementById("swap-button").addEventListener("click", enterSwapMode);
document.getElementById("ad-button").addEventListener("click", showAdsVideo);

document.getElementById("settings-button").addEventListener("click", () => {
  isPaused = true;
  const randomHelper = Math.floor(Math.random() * 8) + 1;
  const catImg = settingsOverlay.querySelector(".settings-cat");
  catImg.src = `images/helper_${randomHelper}.png`;
  const content = settingsOverlay.querySelector(".settings-content");
  settingsOverlay.classList.remove("hidden");
  gsap.fromTo(content, 
    { scale: 0.5, opacity: 0 }, 
    { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.7)" }
  );
});

document.getElementById("close-settings-btn").addEventListener("click", () => {
  const content = settingsOverlay.querySelector(".settings-content");
  gsap.to(content, {
    scale: 0.5,
    opacity: 0,
    duration: 0.3,
    ease: "back.in(1.7)",
    onComplete: () => {
      settingsOverlay.classList.add("hidden");
      isPaused = false;
    }
  });
});

document.getElementById("new-game-btn").addEventListener("click", () => {
  settingsOverlay.classList.add("hidden");
  isPaused = false;
  restartGame();
});

document.getElementById("watch-ad-btn").addEventListener("click", () => {
  alert("Реклама воспроизводится...");
  // TODO: Реальная интеграция рекламы
});


document.getElementById("toggle-sound-btn").addEventListener("click", () => {
  isSoundOn = !isSoundOn;

  localStorage.setItem("sound", isSoundOn); // сохраним настройку
  
  const soundText = document.getElementById("sound-text");
  soundText.textContent = isSoundOn ? "Звук: Вкл" : "Звук: Выкл";
  const soundIcon = document.getElementById("sound-icon");
  soundIcon.src = isSoundOn ? "images/icon_sound_on.png" : "images/icon_sound_off.png";

  if (isSoundOn && musicReady) {
    bgMusic.play();
  } else {
    bgMusic.pause();
  }

});

let destroyMode = false;
const destroyPanel = document.getElementById("destroy-mode-panel");

let swapMode = false;
let selectedTiles = [];
const swapPanel = document.getElementById("swap-mode-panel");

function enterSwapMode() {

  if (swapMode) {
    // Если режим уже активен — сбрасываем всё
    exitSwapMode();
    return;
  }
  
  if (currency < 120) {
    alert("Недостаточно монет!");
    return;
  }

  swapMode = true;
  selectedTiles = [];
  swapPanel.classList.remove("hidden");

  setTimeout(() => {
    document.addEventListener("click", handleSwapClick);
  }, 50);
}

function exitSwapMode() {
  swapMode = false;
  swapPanel.classList.add("hidden");
  document.removeEventListener("click", handleSwapClick);

  // Убираем подсветку
  selectedTiles.forEach(tile => {
    const el = grid[tile.r][tile.c].el;
    el.classList.remove("selected")
  });
  selectedTiles = [];
}

function handleSwapClick(e) {
  const tile = e.target.closest(".tile");
  if (!tile) {
    exitSwapMode();
    return;
  }

  // Определяем координаты плитки
  let r = -1, c = -1;
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (grid[row][col]?.el === tile) {
        r = row;
        c = col;
        break;
      }
    }
    if (r !== -1) break;
  }

  if (r === -1 || c === -1) return;

  // Проверка: уже выбрана эта же плитка?
  if (selectedTiles.some(t => t.r === r && t.c === c)) return;

  selectedTiles.push({ r, c });
  tile.classList.add("selected");

  if (selectedTiles.length === 2) {

    currency -= 120;
    Storage.save("currency", currency);
    updateCurrencyDisplay();

    pushToHistory();

    const [first, second] = selectedTiles;
    const tileA = grid[first.r][first.c];
    const tileB = grid[second.r][second.c];

    if (!tileA || !tileB) return;

    const elA = tileA.el;
    const elB = tileB.el;

    const posA = { x: first.c * cellSize + gap, y: first.r * cellSize + gap };
    const posB = { x: second.c * cellSize + gap, y: second.r * cellSize + gap };

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
    [grid[first.r][first.c], grid[second.r][second.c]] = [tileB, tileA];

    elA.classList.remove("selected");
    elB.classList.remove("selected");

    selectedTiles = [];
    exitSwapMode();
    saveGameState();
  }
}

function findTilePosition(tileEl) {
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c]?.el === tileEl) {
        return { r: r, c: c };
      }
    }
  }
  return null;
}

function handleDestroyClick(e) {
  
  let isDestroyMode = destroyMode;
  exitDestroyMode();

  if (!isDestroyMode) return;

  const tile = e.target.closest(".tile");

  if (!tile) return;

  // Поиск координат плитки
  let r = -1, c = -1;
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (grid[row][col]?.el === tile) {
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
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (grid[row][col]) tileCount++;
    }
  }

  // Если осталась только одна плитка — запретить уничтожение
  if (tileCount <= 1) {
    // alert("Нельзя уничтожить последнюю плитку!");
    return;
  }

  currency -= 100;
  Storage.save("currency", currency);
  updateCurrencyDisplay();

  pushToHistory();

  // Получаем координаты с учётом transform
  const originalTransform = tile.style.transform;
  tile.style.transform = "none";
  const rect = tile.getBoundingClientRect();
  tile.style.transform = originalTransform;

  const parentRect = gridElement.getBoundingClientRect();
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

function enterDestroyMode() {

  if (currency < 100) {
    alert("Недостаточно монет!");
    return;
  }

  destroyMode = true;
  updateHelperPanel("destroy-mode-panel");
  destroyPanel.classList.remove("hidden");

  setTimeout(() => {
    document.addEventListener("click", handleDestroyClick);
  }, 50);
}

function exitDestroyMode() {
  destroyMode = false;
  updateHelperPanel("swap-mode-panel");
  destroyPanel.classList.add("hidden");
  document.removeEventListener("click", handleDestroyClick);
}



function destroyTile(tileElement, r, c) {
  gridElement.removeChild(tileElement);
  grid[r][c] = null;
  saveGameState();
}


function getRandomLevelUpPhrase() {
  return randomLevelUpPhrases[Math.floor(Math.random() * randomLevelUpPhrases.length)];
}

function updateHelperPanel(panelId) {
  const helperNumber = Math.floor(Math.random() * 8) + 1;
  //const phrase = motivationalPhrases[Math.floor(Math.random() * motivationalPhrases.length)];

  const panel = document.getElementById(panelId);
  const img = panel.querySelector(".helper-img");
  //const text = panel.querySelector(".helper-text");

  img.src = `./images/helper_${helperNumber}.png`;
  //text.textContent = phrase;
}

function showLevelUpPopup(level) {
  const popup = document.getElementById("level-up-popup");
  const img = document.getElementById("level-up-img");
  const text = document.getElementById("level-up-text");

  const helperNumber = Math.floor(Math.random() * 8) + 1;
  img.src = `./images/helper_${helperNumber}.png`;

  text.textContent = getRandomLevelUpPhrase();

  popup.classList.remove("hidden");
  isPlaying = false;

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
              isPlaying = true;
            }
          });
        }, 2000);
      }
    }
  );
}



function syncTileSizeWithCell() {

  adjustGameContainerMargin();

  const cell = document.querySelector('.cell');
  if (!cell) return;

  const rect = cell.getBoundingClientRect();
  tileSize = pxToVmin(rect.width);
  cellSize = tileSize + gap

  const style = document.documentElement.style;
  style.setProperty('--tile-size', `${tileSize.toFixed(2)}vmin`);
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

window.addEventListener("load", adjustGameContainerMargin);
window.addEventListener('resize', syncTileSizeWithCell);

// ✅ Когда музыка загрузилась
bgMusic.addEventListener('canplaythrough', () => {
  musicReady = true;
});

function showAdsVideo() {
  currency += 115;
  Storage.save("currency", currency);
  updateCurrencyDisplay();
}

function tryStartMusic() {
  if (musicReady && !musicStarted && isSoundOn) {
    bgMusic.volume = 0.2;
    bgMusic.loop = true;

    bgMusic.play().then(() => {
      console.log("Музыка играет!");
      musicStarted = true;
    }).catch(err => {
      console.warn("Ошибка запуска музыки:", err);
    });

    document.removeEventListener("click", tryStartMusic);
    window.removeEventListener("touchstart", tryStartMusic);
    window.removeEventListener("keydown", tryStartMusic);
    
  }
}



startGame(false);
setupInput();

// Навешиваем на первое взаимодействие
document.addEventListener("click", tryStartMusic);
window.addEventListener("touchstart", tryStartMusic);
window.addEventListener("keydown", tryStartMusic);
document.body.addEventListener('click', tryStartMusic, { once: true });