"use strict";

const assert = require("assert");
const Go = require("./rules.js");

const { N, EMPTY, BLACK, WHITE, emptyBoard, playOn, legalMoves, territory, isKo, pointName, parsePoint, commentForMove, commentForPass, jobForMove, groupAt } = Go;

function place(board, pts, color) {
  for (const [x, y] of pts) board[y][x] = color;
}

function play(board, name, color, ko) {
  const [x, y] = parsePoint(name);
  const r = playOn(board, x, y, color);
  assert(r, "expected legal play at " + name);
  assert(!isKo(ko, x, y, r.taken), "ko at " + name);
  return r;
}

function namesOn(n) {
  const out = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) out.push(pointName(x, y));
  }
  return out;
}

assert.strictEqual(N, 6);
assert.strictEqual(pointName(0, 5), "A1");
assert.strictEqual(pointName(5, 0), "F6");
assert.strictEqual(pointName(0, 0), "A6");
assert.strictEqual(pointName(5, 5), "F1");
assert.deepStrictEqual(parsePoint("A1"), [0, 5]);
assert.deepStrictEqual(parsePoint("F6"), [5, 0]);
assert.strictEqual(namesOn().length, 36);

{
  const b = emptyBoard();
  const r = play(b, "C4", BLACK);
  assert.strictEqual(r.taken.length, 0);
  assert.strictEqual(r.board[2][2], BLACK);
}

{
  const b = emptyBoard();
  place(b, [parsePoint("B4"), parsePoint("C5"), parsePoint("C3")], BLACK);
  place(b, [parsePoint("C4")], WHITE);
  const r = play(b, "D4", BLACK);
  assert.strictEqual(r.taken.length, 1);
  assert.strictEqual(jobForMove(b, ...parsePoint("D4"), BLACK, r.taken), "taking 1 stone");
  assert.ok(commentForMove(b, ...parsePoint("D4"), BLACK, r.taken).startsWith("D4 taking 1 stone"));
}

{
  const b = emptyBoard();
  place(b, [parsePoint("B4"), parsePoint("C5")], BLACK);
  place(b, [parsePoint("C4")], WHITE);
  assert.strictEqual(jobForMove(b, ...parsePoint("C3"), BLACK, []), "filling a last liberty");
}

{
  const b = emptyBoard();
  place(b, [parsePoint("C4")], BLACK);
  place(b, [parsePoint("B4"), parsePoint("C5"), parsePoint("D4")], WHITE);
  assert.strictEqual(jobForMove(b, ...parsePoint("C3"), BLACK, []), "saving a one-liberty group");
}

{
  const b = emptyBoard();
  place(b, [parsePoint("B4"), parsePoint("D4")], BLACK);
  assert.strictEqual(jobForMove(b, ...parsePoint("C4"), BLACK, []), "connecting");
}

{
  const b = emptyBoard();
  assert.strictEqual(jobForMove(b, ...parsePoint("A4"), BLACK, []), "taking a side");
  assert.strictEqual(jobForMove(b, ...parsePoint("C4"), BLACK, []), "taking space");
  assert.strictEqual(commentForPass(), "Pass because no legal gain.");
}

{
  const b = emptyBoard();
  place(b, [parsePoint("C4")], BLACK);
  const [x, y] = parsePoint("C4");
  const r = playOn(b, x, y, WHITE);
  assert.strictEqual(r, null);
}

{
  const suicide = emptyBoard();
  place(suicide, [parsePoint("B5"), parsePoint("A4"), parsePoint("A6")], WHITE);
  const [x, y] = parsePoint("A5");
  assert.strictEqual(playOn(suicide, x, y, BLACK), null);
}

{
  const b = emptyBoard();
  place(b, [parsePoint("B5"), parsePoint("A4"), parsePoint("A6")], WHITE);
  place(b, [parsePoint("B6")], BLACK);
  const [x, y] = parsePoint("A5");
  const r = playOn(b, x, y, BLACK);
  assert(r, "capture-suicide must be legal");
  assert.strictEqual(r.taken.length, 1);
}

{
  let b = emptyBoard();
  place(b, [parsePoint("C4"), parsePoint("D5"), parsePoint("D3")], BLACK);
  place(b, [parsePoint("D4"), parsePoint("E5"), parsePoint("E3"), parsePoint("F4")], WHITE);
  const r = play(b, "E4", BLACK);
  b = r.board;
  assert.strictEqual(r.taken.length, 1);
  const ko = r.taken[0];
  assert.deepStrictEqual(ko, parsePoint("D4"));
  const recap = playOn(b, ko[0], ko[1], WHITE);
  assert(recap);
  assert.strictEqual(isKo(ko, ko[0], ko[1], recap.taken), true);
  const legal = legalMoves(b, WHITE, ko);
  assert.ok(!legal.some((m) => m.x === ko[0] && m.y === ko[1]));
}

{
  const b = emptyBoard();
  place(b, [
    parsePoint("B6"), parsePoint("C6"), parsePoint("D6"), parsePoint("E6"),
    parsePoint("B5"), parsePoint("E5"),
    parsePoint("B4"), parsePoint("E4"),
    parsePoint("B3"), parsePoint("C3"), parsePoint("D3"), parsePoint("E3"),
  ], BLACK);
  const t = territory(b);
  assert.strictEqual(t.stones[BLACK], 12);
  assert.ok(t.black >= 16, "surrounded empties count for Black");
  assert.strictEqual(t.white, 0);
}

{
  const b = emptyBoard();
  const moves = legalMoves(b, BLACK, null);
  assert.strictEqual(moves.length, 36);
  const weights = Array(36).fill(0);
  const pick = moves[0];
  assert.ok(pick);
  assert.strictEqual(playOn(b, pick.x, pick.y, BLACK).board[pick.y][pick.x], BLACK);
}

{
  const b = emptyBoard();
  place(b, [parsePoint("C3"), parsePoint("C4"), parsePoint("D3"), parsePoint("D4")], BLACK);
  const t = territory(b);
  assert.strictEqual(t.black, 36);
  assert.strictEqual(t.white, 0);
}

{
  const b = emptyBoard();
  for (let y = 0; y < N; y++) {
    b[y][2] = BLACK;
    b[y][3] = WHITE;
  }
  const t = territory(b);
  assert.strictEqual(t.black, 18);
  assert.strictEqual(t.white, 18);
}

{
  let b = emptyBoard();
  let color = BLACK;
  let ko = null;
  let passed = false;
  let ply = 0;
  let over = false;
  while (!over && ply < 80) {
    const moves = legalMoves(b, color, ko);
    const take = moves.find((m) => m.taken.length);
    const pick = take || (ply < 16 && moves.length ? moves[ply % moves.length] : null);
    if (!pick) {
      if (passed) over = true;
      else {
        passed = true;
        ko = null;
        color = color === BLACK ? WHITE : BLACK;
      }
      ply++;
      continue;
    }
    b = pick.board;
    ko = pick.taken.length === 1 ? pick.taken[0] : null;
    passed = false;
    color = color === BLACK ? WHITE : BLACK;
    ply++;
  }
  assert.ok(over, "two passes should end a finite game");
  const t = territory(b);
  assert.strictEqual(t.black + t.white + t.terr[EMPTY], 36);
}

console.log("ok");
