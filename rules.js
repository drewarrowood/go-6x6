(function (root) {
  const N = 6;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  function emptyBoard() {
    return Array.from({ length: N }, () => Array(N).fill(EMPTY));
  }

  function opp(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  function inb(x, y) {
    return x >= 0 && y >= 0 && x < N && y < N;
  }

  function neighbors(x, y) {
    return [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].filter(([a, b]) => inb(a, b));
  }

  function idx(x, y) {
    return y * N + x;
  }

  function xy(i) {
    return [i % N, Math.floor(i / N)];
  }

  /** A1 is bottom-left, F6 is top-right. Canvas y=0 is the top rank. */
  function pointName(x, y) {
    return String.fromCharCode(65 + x) + String(N - y);
  }

  function parsePoint(name) {
    if (!name || name.length < 2) return null;
    const x = name.charCodeAt(0) - 65;
    const rank = Number(name.slice(1));
    const y = N - rank;
    if (!inb(x, y)) return null;
    return [x, y];
  }

  function groupAt(x, y, board) {
    const color = board[y][x];
    if (!color) return { stones: [], libs: [] };
    const seen = new Set();
    const stones = [];
    const libs = new Set();
    const stack = [[x, y]];
    seen.add(x + "," + y);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      stones.push([cx, cy]);
      for (const [nx, ny] of neighbors(cx, cy)) {
        const k = nx + "," + ny;
        if (seen.has(k)) continue;
        const v = board[ny][nx];
        if (v === EMPTY) libs.add(k);
        else if (v === color) {
          seen.add(k);
          stack.push([nx, ny]);
        }
      }
    }
    return { stones, libs: [...libs] };
  }

  function groupKey(x, y, board) {
    const g = groupAt(x, y, board);
    if (!g.stones.length) return "";
    let min = "99,99";
    for (const [sx, sy] of g.stones) {
      const k = sx + "," + sy;
      if (k < min) min = k;
    }
    return min;
  }

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function playOn(board, x, y, color) {
    if (!inb(x, y) || board[y][x] !== EMPTY) return null;
    const next = cloneBoard(board);
    next[y][x] = color;
    const taken = [];
    const seen = new Set();
    for (const [nx, ny] of neighbors(x, y)) {
      if (next[ny][nx] !== opp(color)) continue;
      const k = groupKey(nx, ny, next);
      if (seen.has(k)) continue;
      seen.add(k);
      const g = groupAt(nx, ny, next);
      if (g.libs.length === 0) {
        for (const [sx, sy] of g.stones) {
          next[sy][sx] = EMPTY;
          taken.push([sx, sy]);
        }
      }
    }
    const self = groupAt(x, y, next);
    if (self.libs.length === 0) return null;
    return { board: next, taken };
  }

  function isKo(koPoint, x, y, taken) {
    return !!(
      koPoint &&
      taken.length === 1 &&
      koPoint[0] === x &&
      koPoint[1] === y
    );
  }

  function legalMoves(board, color, koPoint) {
    const moves = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const r = playOn(board, x, y, color);
        if (!r) continue;
        if (isKo(koPoint, x, y, r.taken)) continue;
        moves.push({ x, y, board: r.board, taken: r.taken });
      }
    }
    return moves;
  }

  function territory(board) {
    const seen = new Set();
    const terr = { [BLACK]: 0, [WHITE]: 0, [EMPTY]: 0 };
    const stones = { [BLACK]: 0, [WHITE]: 0 };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (board[y][x]) {
          stones[board[y][x]]++;
          continue;
        }
        const k0 = x + "," + y;
        if (seen.has(k0)) continue;
        const q = [[x, y]];
        const pts = [];
        const colors = new Set();
        seen.add(k0);
        while (q.length) {
          const [cx, cy] = q.pop();
          pts.push([cx, cy]);
          for (const [nx, ny] of neighbors(cx, cy)) {
            const v = board[ny][nx];
            if (v === EMPTY) {
              const k = nx + "," + ny;
              if (!seen.has(k)) {
                seen.add(k);
                q.push([nx, ny]);
              }
            } else colors.add(v);
          }
        }
        if (colors.size === 1) terr[[...colors][0]] += pts.length;
        else terr[EMPTY] += pts.length;
      }
    }
    return {
      black: stones[BLACK] + terr[BLACK],
      white: stones[WHITE] + terr[WHITE],
      stones,
      terr,
    };
  }

  function isSide(x, y) {
    return x === 0 || y === 0 || x === N - 1 || y === N - 1;
  }

  function adjacentGroups(board, x, y, color) {
    const keys = new Set();
    for (const [nx, ny] of neighbors(x, y)) {
      if (board[ny][nx] === color) keys.add(groupKey(nx, ny, board));
    }
    return keys.size;
  }

  function fillsLastLiberty(board, x, y, color) {
    const o = opp(color);
    const seen = new Set();
    for (const [nx, ny] of neighbors(x, y)) {
      if (board[ny][nx] !== o) continue;
      const k = groupKey(nx, ny, board);
      if (seen.has(k)) continue;
      seen.add(k);
      const g = groupAt(nx, ny, board);
      if (g.libs.length === 2 && g.libs.includes(x + "," + y)) return true;
    }
    return false;
  }

  function savesOneLiberty(board, x, y, color) {
    const seen = new Set();
    for (const [nx, ny] of neighbors(x, y)) {
      if (board[ny][nx] !== color) continue;
      const k = groupKey(nx, ny, board);
      if (seen.has(k)) continue;
      seen.add(k);
      const g = groupAt(nx, ny, board);
      if (g.libs.length === 1 && g.libs[0] === x + "," + y) return true;
    }
    return false;
  }

  /**
   * Strongest job only: capture > atari > save > connect > side > space.
   */
  function jobForMove(board, x, y, color, taken) {
    if (taken.length === 1) return "taking 1 stone";
    if (taken.length > 1) return "taking " + taken.length + " stones";
    if (fillsLastLiberty(board, x, y, color)) return "filling a last liberty";
    if (savesOneLiberty(board, x, y, color)) return "saving a one-liberty group";
    if (adjacentGroups(board, x, y, color) >= 2) return "connecting";
    if (isSide(x, y)) return "taking a side";
    return "taking space";
  }

  function commentForMove(board, x, y, color, taken) {
    return pointName(x, y) + " " + jobForMove(board, x, y, color, taken) + ".";
  }

  function commentForPass() {
    return "Pass because no legal gain.";
  }

  function colorName(color) {
    return color === BLACK ? "Black" : "White";
  }

  const Go = {
    N,
    EMPTY,
    BLACK,
    WHITE,
    emptyBoard,
    opp,
    inb,
    neighbors,
    idx,
    xy,
    pointName,
    parsePoint,
    groupAt,
    groupKey,
    cloneBoard,
    playOn,
    isKo,
    legalMoves,
    territory,
    isSide,
    adjacentGroups,
    fillsLastLiberty,
    savesOneLiberty,
    jobForMove,
    commentForMove,
    commentForPass,
    colorName,
  };

  root.Go = Go;
  if (typeof module !== "undefined" && module.exports) module.exports = Go;
})(typeof globalThis !== "undefined" ? globalThis : this);
