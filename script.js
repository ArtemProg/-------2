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

let bestScore = Storage.load("bestScore", 0);
let currency = Storage.load("currency", 0);

let isPlaying = false;
const gridSize = 4;
const tileSize = window.matchMedia("(orientation: portrait)").matches ? 21 : 18;
const gap = 2;
const cellSize = tileSize + gap;

const gridElement = document.getElementById("grid");
let grid = [];
let score = 0;

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
      <div class="tile-level"><span>${Math.log2(value)}</span></div>
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
  const colors = {
    2: ['#eee4da', '#776e65'],
    4: ['#ede0c8', '#776e65'],
    8: ['#f2b179', '#f9f6f2'],
    16: ['#f59563', '#f9f6f2'],
    32: ['#f67c5f', '#f9f6f2'],
    64: ['#f65e3b', '#f9f6f2'],
    128: ['#edcf72', '#f9f6f2'],
    256: ['#edcc61', '#f9f6f2'],
    512: ['#edc850', '#f9f6f2'],
    1024: ['#edc53f', '#f9f6f2'],
    2048: ['#edc22e', '#f9f6f2'],
    4096: ['#d4af37', '#f9f6f2'],
    8192: ['#b8860b', '#f9f6f2'],
    16384: ['#a97142', '#f9f6f2'],
    32768: ['#8b4513', '#f9f6f2'],
  };
  const [bg, color] = colors[value] || ['#3c3a32', '#f9f6f2'];
  tile.style.background = bg;
  tile.style.color = color;
  const level = Math.log2(value);
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
  const level = Math.log2(value);
  const maxLevel = 15;
  const clamped = Math.min(level, maxLevel);
  spriteElement.style.backgroundImage = `url('./images/img_${clamped}.png')`;
}

function move(direction) {
  if (!isPlaying) return;
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
                <div class="tile-level"><span>${Math.log2(newValue)}</span></div>
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
  if (Math.log2(value) === 4) {
    showOverlay("Ты победил!", "Ты достиг уровня 4!");
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
            <div class="tile-level"><span>\${Math.log2(cell.value)}</span></div>
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

  if (!isNewGame && loadGameState()) {
    isPlaying = true;
    return;
  }

  score = 0;
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
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
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
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > minSwipeDistance) {
      move(dx > 0 ? "ArrowRight" : "ArrowLeft");
    } else if (Math.abs(dy) > minSwipeDistance) {
      move(dy > 0 ? "ArrowDown" : "ArrowUp");
    }
  }, { passive: false });
}

startGame(false);
setupInput();
