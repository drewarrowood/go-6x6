(function () {
  const {
    N,
    EMPTY,
    BLACK,
    WHITE,
    emptyBoard,
    opp,
    inb,
    playOn,
    isKo,
    legalMoves,
    territory,
    pointName,
    idx,
    commentForMove,
    commentForPass,
    colorName,
    isSide,
    fillsLastLiberty,
    savesOneLiberty,
    adjacentGroups,
  } = window.Go;

  const STORAGE_KEY = "go6x6.stats.v1";
  const EARLY_MOVES = 8;
  const WEIGHT_CLAMP = 3;

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const heat = document.getElementById("heat");
  const hctx = heat.getContext("2d");

  let board, toPlay, caps, lastMove, koPoint, passed, over, hover;
  let history;
  let firstMove;
  let earlyPlays;
  let logN;
  let thinkToken = 0;
  let running = false;
  let timer = null;

  function players() {
    return {
      [BLACK]: document.getElementById("black-player").value,
      [WHITE]: document.getElementById("white-player").value,
    };
  }

  function bothMachine() {
    const p = players();
    return p[BLACK] === "machine" && p[WHITE] === "machine";
  }

  function currentIsMachine() {
    return players()[toPlay] === "machine";
  }

  function speedMs() {
    const el = document.getElementById("speed");
    return Number(el.value);
  }

  function defaultStats() {
    return {
      v: 1,
      games: 0,
      wins: { black: 0, white: 0, even: 0 },
      capturedSum: 0,
      early: Array(N * N).fill(0),
      first: Array.from({ length: N * N }, () => ({
        games: 0,
        black: 0,
        white: 0,
        even: 0,
      })),
      weights: Array(N * N).fill(0),
    };
  }

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStats();
      const data = JSON.parse(raw);
      if (!data || data.v !== 1 || !Array.isArray(data.weights) || data.weights.length !== N * N) {
        return defaultStats();
      }
      return data;
    } catch {
      return defaultStats();
    }
  }

  function saveStats(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  let stats = loadStats();

  function resetGame() {
    thinkToken++;
    board = emptyBoard();
    toPlay = BLACK;
    caps = { [BLACK]: 0, [WHITE]: 0 };
    lastMove = null;
    koPoint = null;
    passed = false;
    over = false;
    hover = null;
    history = [];
    firstMove = null;
    earlyPlays = [];
    logN = 0;
    document.getElementById("score").classList.add("hidden");
    document.getElementById("log").innerHTML = "";
    document.getElementById("last-comment").textContent =
      "Click an empty point to play. A1 is bottom-left, F6 is top-right.";
    draw();
    status();
    if (shouldMachineAct()) queueMachine();
  }

  function shouldMachineAct() {
    if (over) return false;
    if (!currentIsMachine()) return false;
    if (bothMachine() && !running) return false;
    return true;
  }

  function applyResult(x, y, result, isPass) {
    const color = toPlay;
    const job = isPass
      ? commentForPass()
      : commentForMove(board, x, y, color, result.taken);
    if (isPass) {
      if (passed) {
        lastMove = "pass";
        koPoint = null;
        logLine(color, job, true);
        endGame();
        return;
      }
      passed = true;
      lastMove = "pass";
      koPoint = null;
    } else {
      board = result.board;
      caps[color] += result.taken.length;
      lastMove = [x, y];
      koPoint = result.taken.length === 1 ? result.taken[0] : null;
      passed = false;
      if (!firstMove) firstMove = [x, y];
      if (earlyPlays.length < EARLY_MOVES) earlyPlays.push(idx(x, y));
      history.push({ color, x, y });
    }
    toPlay = opp(color);
    logLine(color, job, isPass);
    draw();
    status();
    if (over) return;
    if (shouldMachineAct()) queueMachine();
  }

  function tryPlay(x, y) {
    if (over) return false;
    const result = playOn(board, x, y, toPlay);
    if (!result) return false;
    if (isKo(koPoint, x, y, result.taken)) return false;
    applyResult(x, y, result, false);
    return true;
  }

  function doPass() {
    if (over) return;
    applyResult(null, null, null, true);
  }

  function logLine(color, job, isPass) {
    logN += 1;
    const text = colorName(color) + " " + job;
    const li = document.createElement("li");
    li.textContent = logN + ". " + text;
    document.getElementById("log").appendChild(li);
    document.getElementById("log").scrollTop = document.getElementById("log").scrollHeight;
    document.getElementById("last-comment").textContent = text;
  }

  function scoreMove(move, color, weights) {
    let s = move.taken.length * 14;
    if (fillsLastLiberty(board, move.x, move.y, color)) s += 5.5;
    if (savesOneLiberty(board, move.x, move.y, color)) s += 9;
    if (adjacentGroups(board, move.x, move.y, color) >= 2) s += 3.2;
    const libs = libertyCount(move.board, move.x, move.y);
    s += Math.min(libs, 4) * 0.35;
    const cx = (N - 1) / 2;
    const cy = (N - 1) / 2;
    const dist = Math.abs(move.x - cx) + Math.abs(move.y - cy);
    s += Math.max(0, 2.1 - 0.45 * dist);
    if (isSide(move.x, move.y) && history.length < 6) s -= 0.35;
    if ((move.x === 0 || move.x === N - 1) && (move.y === 0 || move.y === N - 1)) {
      s -= history.length < 10 ? 1.4 : 0.2;
    }
    s += (weights[idx(move.x, move.y)] || 0) * 1.15;
    s += Math.random() * 0.55;
    return s;
  }

  function libertyCount(b, x, y) {
    const g = window.Go.groupAt(x, y, b);
    return g.libs.length;
  }

  function machinePick(color) {
    const moves = legalMoves(board, color, koPoint);
    if (!moves.length) return { pass: true };
    const weights = stats.weights;
    let best = moves[0];
    let bestS = -Infinity;
    for (const m of moves) {
      const s = scoreMove(m, color, weights);
      if (s > bestS) {
        bestS = s;
        best = m;
      }
    }
    const job = window.Go.jobForMove(board, best.x, best.y, color, best.taken);
    const useful = job.startsWith("taking") && job.includes("stone") ||
      job === "filling a last liberty" ||
      job === "saving a one-liberty group" ||
      job === "connecting";
    if (!useful && history.length >= 20) return { pass: true };
    if (!useful && history.length >= 14 && bestS < 1.8) return { pass: true };
    return { pass: false, move: best };
  }

  function queueMachine() {
    const token = ++thinkToken;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (token !== thinkToken) return;
      if (!shouldMachineAct()) return;
      const pick = machinePick(toPlay);
      if (pick.pass) doPass();
      else tryPlay(pick.move.x, pick.move.y);
    }, bothMachine() ? speedMs() : Math.min(speedMs(), 420));
  }

  function winnerOf(t) {
    if (t.black === t.white) return "even";
    return t.black > t.white ? "black" : "white";
  }

  function recordSelfPlay(t) {
    if (!bothMachine()) return;
    stats.games += 1;
    const w = winnerOf(t);
    stats.wins[w] += 1;
    stats.capturedSum += caps[BLACK] + caps[WHITE];
    for (const i of earlyPlays) stats.early[i] += 1;
    if (firstMove) {
      const i = idx(firstMove[0], firstMove[1]);
      stats.first[i].games += 1;
      stats.first[i][w] += 1;
    }
    const winnerColor = w === "black" ? BLACK : w === "white" ? WHITE : 0;
    const lr = 0.14;
    if (winnerColor) {
      const seen = new Set();
      for (const mv of history) {
        const i = idx(mv.x, mv.y);
        if (seen.has(i + ":" + mv.color)) continue;
        seen.add(i + ":" + mv.color);
        if (mv.color === winnerColor) stats.weights[i] += lr;
        else stats.weights[i] -= lr * 0.55;
      }
      if (firstMove) {
        const i = idx(firstMove[0], firstMove[1]);
        stats.weights[i] += winnerColor === BLACK ? 0.08 : -0.08;
      }
    }
    for (let i = 0; i < stats.weights.length; i++) {
      stats.weights[i] = Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, stats.weights[i]));
    }
    saveStats(stats);
    renderStats();
  }

  function endGame() {
    over = true;
    runningKeep = running;
    const t = territory(board);
    const el = document.getElementById("score");
    el.classList.remove("hidden");
    const w = winnerOf(t);
    const label = w === "even" ? "Even." : w === "black" ? "Black wins." : "White wins.";
    el.textContent = "Black " + t.black + " · White " + t.white + ". " + label + " No komi.";
    document.getElementById("turn").textContent = "Game over";
    recordSelfPlay(t);
    if (runningKeep && bothMachine()) {
      timer = setTimeout(() => {
        if (!running) return;
        resetGame();
      }, Math.max(2800, speedMs() * 2));
    }
  }

  let runningKeep = false;

  function status() {
    const name = colorName(toPlay);
    document.getElementById("turn").textContent = over ? "Game over" : name + " to play";
    document.getElementById("cap-b").textContent = String(caps[BLACK]);
    document.getElementById("cap-w").textContent = String(caps[WHITE]);
    document.getElementById("btn-run").textContent = running ? "Pause" : "Start";
    document.getElementById("speed-val").textContent = (speedMs() / 1000).toFixed(1) + "s";
  }

  function pad() {
    const w = canvas.width;
    return { m: w * 0.13, step: (w * 0.74) / (N - 1) };
  }

  function xyToPix(x, y) {
    const { m, step } = pad();
    return [m + x * step, m + y * step];
  }

  function canvasLocal(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if (typeof e.offsetX === "number" && e.target === canvas) {
      return [e.offsetX * sx, e.offsetY * sy];
    }
    return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  }

  function pixToXy(px, py) {
    const { m, step } = pad();
    const gx = Math.round((px - m) / step);
    const gy = Math.round((py - m) / step);
    if (!inb(gx, gy)) return null;
    const [ax, ay] = xyToPix(gx, gy);
    if (Math.hypot(ax - px, ay - py) > step * 0.42) return null;
    return [gx, gy];
  }

  function buildHits() {
    const el = document.getElementById("hits");
    el.innerHTML = "";
    const m = 13;
    const step = 74 / (N - 1);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "hit";
        btn.setAttribute("aria-label", pointName(x, y));
        btn.style.left = m + x * step + "%";
        btn.style.top = m + y * step + "%";
        btn.addEventListener("pointerenter", () => {
          hover = [x, y];
          draw();
        });
        btn.addEventListener("pointerleave", () => {
          hover = null;
          draw();
        });
        btn.addEventListener("click", () => {
          if (!humanMayAct()) return;
          tryPlay(x, y);
        });
        el.appendChild(btn);
      }
    }
  }

  function drawStone(x, y, color, alpha) {
    const [px, py] = xyToPix(x, y);
    const r = pad().step * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
    if (color === BLACK) {
      g.addColorStop(0, "#5a5a5a");
      g.addColorStop(1, "#111");
    } else {
      g.addColorStop(0, "#fff");
      g.addColorStop(1, "#c8c4bc");
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const w = canvas.width;
    ctx.fillStyle = "#d4a574";
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = "#3b2a18";
    ctx.lineWidth = 2;
    const { m, step } = pad();
    for (let i = 0; i < N; i++) {
      ctx.beginPath();
      ctx.moveTo(m, m + i * step);
      ctx.lineTo(m + (N - 1) * step, m + i * step);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m + i * step, m);
      ctx.lineTo(m + i * step, m + (N - 1) * step);
      ctx.stroke();
    }
    ctx.fillStyle = "#3b2a18";
    for (const [hx, hy] of [
      [1, 1],
      [1, 4],
      [4, 1],
      [4, 4],
    ]) {
      const [px, py] = xyToPix(hx, hy);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = "20px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#4a3422";
    for (let i = 0; i < N; i++) {
      const [px] = xyToPix(i, 0);
      ctx.fillText(String.fromCharCode(65 + i), px, w - m * 0.38);
      const [, py] = xyToPix(0, i);
      ctx.fillText(String(N - i), m * 0.38, py);
    }
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (board[y][x]) drawStone(x, y, board[y][x]);
      }
    }
    if (lastMove && lastMove !== "pass") {
      const [lx, ly] = lastMove;
      const [px, py] = xyToPix(lx, ly);
      ctx.strokeStyle = board[ly][lx] === BLACK ? "#eee" : "#222";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, pad().step * 0.16, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!over && hover && board[hover[1]][hover[0]] === EMPTY && !currentIsMachine()) {
      const r = playOn(board, hover[0], hover[1], toPlay);
      const ok = r && !isKo(koPoint, hover[0], hover[1], r.taken);
      if (ok) drawStone(hover[0], hover[1], toPlay, 0.32);
    }
  }

  function heatColor(t) {
    const u = Math.max(-1, Math.min(1, t));
    if (u >= 0) {
      const r = Math.round(42 + u * 180);
      const g = Math.round(34 + u * 40);
      const b = Math.round(26 + u * 8);
      return "rgb(" + r + "," + g + "," + b + ")";
    }
    const k = -u;
    const r = Math.round(42 - k * 10);
    const g = Math.round(34 + k * 30);
    const b = Math.round(26 + k * 120);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function renderStats() {
    const games = stats.games;
    const avg = games ? (stats.capturedSum / games).toFixed(1) : "—";
    document.getElementById("stat-games").textContent = String(games);
    document.getElementById("stat-split").textContent =
      "Black " + stats.wins.black + " · White " + stats.wins.white + " · Even " + stats.wins.even;
    document.getElementById("stat-caps").textContent = avg;

    let firstLine = "No finished self-play games yet.";
    if (games) {
      let best = -1;
      let bestRate = -1;
      for (let i = 0; i < stats.first.length; i++) {
        const f = stats.first[i];
        if (!f.games) continue;
        const rate = f.black / f.games;
        if (rate > bestRate || (rate === bestRate && f.games > (stats.first[best] || { games: 0 }).games)) {
          bestRate = rate;
          best = i;
        }
      }
      if (best >= 0) {
        const [x, y] = window.Go.xy(best);
        firstLine =
          "First-move Black win rate highest at " +
          pointName(x, y) +
          " (" +
          Math.round(bestRate * 100) +
          "% of " +
          stats.first[best].games +
          ").";
      }
    }
    document.getElementById("stat-first").textContent = firstLine;

    const w = heat.width;
    const cell = w / N;
    const maxAbs = Math.max(0.2, ...stats.weights.map((v) => Math.abs(v)));
    hctx.fillStyle = "#1c1712";
    hctx.fillRect(0, 0, w, w);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = stats.weights[idx(x, y)] / maxAbs;
        hctx.fillStyle = heatColor(v);
        hctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        hctx.fillStyle = "rgba(243,234,216,0.75)";
        hctx.font = "11px Georgia, serif";
        hctx.textAlign = "center";
        hctx.textBaseline = "middle";
        hctx.fillText(pointName(x, y), x * cell + cell / 2, y * cell + cell / 2);
      }
    }
  }

  function humanMayAct() {
    return !over && !currentIsMachine();
  }

  canvas.addEventListener("pointermove", (e) => {
    const [lx, ly] = canvasLocal(e);
    hover = pixToXy(lx, ly);
    draw();
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
    draw();
  });
  canvas.addEventListener("click", (e) => {
    if (!humanMayAct()) return;
    const [lx, ly] = canvasLocal(e);
    const pt = pixToXy(lx, ly);
    if (!pt) return;
    tryPlay(pt[0], pt[1]);
  });

  document.getElementById("btn-pass").addEventListener("click", () => {
    if (!humanMayAct()) return;
    doPass();
  });
  document.getElementById("btn-new").addEventListener("click", () => {
    running = false;
    resetGame();
  });
  document.getElementById("btn-run").addEventListener("click", () => {
    if (running) {
      running = false;
      thinkToken++;
      status();
      return;
    }
    const p = players();
    if (p[BLACK] !== "machine" && p[WHITE] !== "machine") return;
    running = true;
    if (over) resetGame();
    else {
      status();
      if (shouldMachineAct()) queueMachine();
    }
  });
  document.getElementById("black-player").addEventListener("change", () => {
    if (!bothMachine()) running = false;
    status();
  });
  document.getElementById("white-player").addEventListener("change", () => {
    if (!bothMachine()) running = false;
    status();
  });
  document.getElementById("speed").addEventListener("input", status);
  document.getElementById("btn-reset-stats").addEventListener("click", () => {
    if (!confirm("Clear all learning stats stored in this browser?")) return;
    stats = defaultStats();
    saveStats(stats);
    renderStats();
  });

  window.GoApp = {
    STORAGE_KEY,
    resetGame,
    tryPlay,
    doPass,
    getState() {
      return { board, toPlay, over, caps, stats, history, running };
    },
    loadStats,
  };

  buildHits();
  resetGame();
  renderStats();
})();
