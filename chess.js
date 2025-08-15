// --- Board generation --------------------------------------------------------
const FILES = ["a","b","c","d","e","f","g","h"];   // left → right
const RANKS = [8,7,6,5,4,3,2,1];                   // top → bottom (white at bottom)

const boardEl = document.getElementById("board");
const filesEl = document.querySelector(".coords-files");
const ranksEl = document.querySelector(".coords-ranks");

function createBoard() {
  boardEl.innerHTML = "";

  for (const r of RANKS) {
    for (let fIdx = 0; fIdx < FILES.length; fIdx++) {
      const file = FILES[fIdx];
      const id = `${file}${r}`;

      const sq = document.createElement("div");
      // a1 should be dark, h1 light (bottom-right light)
      const dark = (fIdx + (r - 1)) % 2 === 0;
      sq.className = `square ${dark ? "dark" : "light"}`;
      sq.id = id;
      sq.dataset.file = file;
      sq.dataset.rank = String(r);
      sq.setAttribute("role", "gridcell");
      sq.setAttribute("aria-label", id);

      boardEl.appendChild(sq);
    }
  }
}

function drawCoords() {
  filesEl.innerHTML = "";
  ranksEl.innerHTML = "";
  for (const f of FILES) {
    const d = document.createElement("div");
    d.textContent = f;
    filesEl.appendChild(d);
  }
  for (const r of RANKS) {
    const d = document.createElement("div");
    d.textContent = r;
    ranksEl.appendChild(d);
  }
}

// --- Piece model, FEN, rendering --------------------------------------------
const COLORS = { WHITE: "w", BLACK: "b" };
const TYPES  = { K:"K", Q:"Q", R:"R", B:"B", N:"N", P:"P" };

const GLYPH = {
  w: { K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘", P:"♙" },
  b: { K:"♚", Q:"♛", R:"♜", B:"♝", N:"♞", P:"♟" },
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const State = {
  board: new Map(),     // square -> piece
  turn: COLORS.WHITE,   // 'w' or 'b'
  pieces: new Map(),    // id -> piece
  moveHistory: [],
  lastMove: null,       // {from,to}
};

function makePiece(type, color, square, index) {
  return { id: `${color}${type}${index}`, type, color, square, hasMoved: false };
}

function parseFEN(fen) {
  const [placement, active] = fen.trim().split(/\s+/);
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error("Invalid FEN: bad rank count");

  State.board.clear();
  State.pieces.clear();
  State.lastMove = null;

  const counters = { w:{K:0,Q:0,R:0,B:0,N:0,P:0}, b:{K:0,Q:0,R:0,B:0,N:0,P:0} };

  for (let rIdx = 0; rIdx < 8; rIdx++) {
    const rankStr = ranks[rIdx];
    let fileIdx = 0;

    for (const ch of rankStr) {
      if (/\d/.test(ch)) { fileIdx += Number(ch); continue; }
      const color = ch === ch.toUpperCase() ? COLORS.WHITE : COLORS.BLACK;
      const type = ch.toUpperCase();
      const file = FILES[fileIdx];
      const rank = RANKS[rIdx];
      const square = `${file}${rank}`;

      const idx = ++counters[color][type];
      const piece = makePiece(type, color, square, idx);

      State.pieces.set(piece.id, piece);
      State.board.set(square, piece);
      fileIdx += 1;
    }
    if (fileIdx !== 8) throw new Error("Invalid FEN: rank length mismatch");
  }
  State.turn = active === "b" ? COLORS.BLACK : COLORS.WHITE;
}

function clearPiecesFromDOM() {
  for (const sq of boardEl.children) sq.innerHTML = "";
}

function renderPieces() {
  clearPiecesFromDOM();

  // last move highlight
  boardEl.querySelectorAll(".last-move").forEach(el => el.classList.remove("last-move"));
  if (State.lastMove) {
    const fromEl = document.getElementById(State.lastMove.from);
    const toEl = document.getElementById(State.lastMove.to);
    fromEl?.classList.add("last-move");
    toEl?.classList.add("last-move");
  }

  for (const [square, piece] of State.board.entries()) {
    if (!piece) continue;
    const sqEl = document.getElementById(square);
    if (!sqEl) continue;

    const span = document.createElement("span");
    span.className = "piece";
    span.textContent = GLYPH[piece.color][piece.type];
    span.dataset.pid = piece.id;
    span.title = `${piece.color === "w" ? "White" : "Black"} ${nameOf(piece.type)} @ ${square}`;
    sqEl.appendChild(span);
  }
  updateTurnBanner();
}

function nameOf(type) {
  return ({K:"King", Q:"Queen", R:"Rook", B:"Bishop", N:"Knight", P:"Pawn"}[type] || type);
}

function updateTurnBanner() {
  const el = document.getElementById("turn-indicator");
  const side = State.turn === "w" ? "White" : "Black";
  const inCheck = isKingInCheck(State.turn);
  el.innerHTML = `${side} to move${inCheck ? ' <span class="check-badge">CHECK</span>' : ''}`;
}

// --- Utilities ---------------------------------------------------------------

function parseSquare(square) {
  const fileIdx = FILES.indexOf(square[0]);
  const rank = Number(square.slice(1));
  return { fileIdx, rank };
}

function getPieceAt(square) { return State.board.get(square) || null; }
function setPieceAt(square, pieceOrNull) {
  if (pieceOrNull) State.board.set(square, pieceOrNull);
  else State.board.delete(square);
}

// --- Step 4: selection & pseudo-legal moves ---------------------------------
const UI = {
  selected: null, // piece id
  hints: [],      // cached moves for selected piece
};

function clearHints() {
  boardEl.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
  boardEl.querySelectorAll(".hint-move").forEach(el => el.classList.remove("hint-move"));
  boardEl.querySelectorAll(".hint-capture").forEach(el => el.classList.remove("hint-capture"));
}

function selectSquare(square) {
  clearHints();

  const piece = State.board.get(square);
  if (!piece) { UI.selected = null; UI.hints = []; return; }
  if (piece.color !== State.turn) { UI.selected = null; UI.hints = []; return; }

  UI.selected = piece.id;

  const sqEl = document.getElementById(square);
  sqEl.classList.add("selected");

  const moves = pseudoLegalMoves(piece);
  UI.hints = moves;

  for (const mv of moves) {
    const destEl = document.getElementById(mv.to);
    if (!destEl) continue;
    destEl.classList.add(mv.capture ? "hint-capture" : "hint-move");
  }
}

// Compute moves ignoring checks/pins & special moves (no castling/en passant)
function pseudoLegalMoves(piece) {
  const res = [];
  const { fileIdx, rank } = parseSquare(piece.square);

  const add = (f, r, captureOnly=false, stopOnHit=true) => {
    if (f < 0 || f > 7 || r < 1 || r > 8) return "stop";
    const to = `${FILES[f]}${r}`;
    const occ = State.board.get(to);
    if (occ) {
      if (occ.color !== piece.color) {
        res.push({ from: piece.square, to, capture: true });
      }
      return "stop";
    } else {
      if (!captureOnly) res.push({ from: piece.square, to, capture: false });
      return stopOnHit ? undefined : "cont";
    }
  };

  // sliding helper
  const ray = (df, dr) => {
    let f = fileIdx + df, r = rank + dr;
    while (true) {
      const resFlag = add(f, r);
      if (resFlag === "stop") break;
      if (resFlag === undefined) break; // single step
      f += df; r += dr;
    }
  };

  if (piece.type === "P") {
    const dir = piece.color === "w" ? 1 : -1;
    // forward one
    add(fileIdx, rank + dir, false, true);
    // forward two from start rank (must be clear)
    const startRank = piece.color === "w" ? 2 : 7;
    if (rank === startRank) {
      const oneAhead = `${FILES[fileIdx]}${rank + dir}`;
      const twoAhead = `${FILES[fileIdx]}${rank + 2*dir}`;
      if (!State.board.get(oneAhead) && !State.board.get(twoAhead)) {
        res.push({ from: piece.square, to: twoAhead, capture: false });
      }
    }
    // diagonal captures
    const left = fileIdx - 1, right = fileIdx + 1;
    for (const f of [left, right]) {
      if (f < 0 || f > 7) continue;
      const to = `${FILES[f]}${rank + dir}`;
      const occ = State.board.get(to);
      if (occ && occ.color !== piece.color) {
        res.push({ from: piece.square, to, capture: true });
      }
    }
    return res;
  }

  if (piece.type === "N") {
    const deltas = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
    for (const [df, dr] of deltas) add(fileIdx + df, rank + dr, false, true);
    return res;
  }

  if (piece.type === "B" || piece.type === "Q") {
    ray(1,1); ray(1,-1); ray(-1,1); ray(-1,-1);
  }
  if (piece.type === "R" || piece.type === "Q") {
    ray(1,0); ray(-1,0); ray(0,1); ray(0,-1);
  }
  if (piece.type === "K") {
    const deltas = [[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]];
    for (const [df, dr] of deltas) add(fileIdx + df, rank + dr, false, true);
  }
  return res;
}

// --- Step 6: attack map & check info ----------------------------------------

function findKingSquare(color) {
  for (const piece of State.pieces.values()) {
    if (piece.type === "K" && piece.color === color) return piece.square;
  }
  return null;
}

// Return true if `square` is attacked by at least one piece of `byColor`
function isSquareAttacked(square, byColor) {
  const { fileIdx, rank } = parseSquare(square);

  // Pawn attacks
  const pawnDir = byColor === "w" ? 1 : -1;
  for (const df of [-1, 1]) {
    const f = fileIdx + df, r = rank + pawnDir;
    if (f >= 0 && f < 8 && r >= 1 && r <= 8) {
      const occ = getPieceAt(`${FILES[f]}${r}`);
      if (occ && occ.color === byColor && occ.type === "P") return true;
    }
  }

  // Knight attacks
  const knightSteps = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
  for (const [df, dr] of knightSteps) {
    const f = fileIdx + df, r = rank + dr;
    if (f < 0 || f > 7 || r < 1 || r > 8) continue;
    const occ = getPieceAt(`${FILES[f]}${r}`);
    if (occ && occ.color === byColor && occ.type === "N") return true;
  }

  // Sliding attacks
  const rays = {
    bishop: [[1,1],[1,-1],[-1,1],[-1,-1]],
    rook: [[1,0],[-1,0],[0,1],[0,-1]],
  };

  const rayHits = (dirs, types) => {
    for (const [df, dr] of dirs) {
      let f = fileIdx + df, r = rank + dr;
      while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
        const occ = getPieceAt(`${FILES[f]}${r}`);
        if (occ) {
          if (occ.color === byColor && types.includes(occ.type)) return true;
          break; // blocked
        }
        f += df; r += dr;
      }
    }
    return false;
  };

  if (rayHits(rays.bishop, ["B","Q"])) return true;
  if (rayHits(rays.rook, ["R","Q"])) return true;

  // King adjacency
  const kingSteps = [[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]];
  for (const [df, dr] of kingSteps) {
    const f = fileIdx + df, r = rank + dr;
    if (f < 0 || f > 7 || r < 1 || r > 8) continue;
    const occ = getPieceAt(`${FILES[f]}${r}`);
    if (occ && occ.color === byColor && occ.type === "K") return true;
  }

  return false;
}

function isKingInCheck(color) {
  const kingSq = findKingSquare(color);
  if (!kingSq) return false;
  const enemy = color === "w" ? "b" : "w";
  return isSquareAttacked(kingSq, enemy);
}

// --- Step 5: execute moves, turn switch, capture, history --------------------

function makeMove(piece, to) {
  const from = piece.square;
  const target = getPieceAt(to);
  let captured = null;

  if (target && target.color !== piece.color) {
    captured = target;
    State.pieces.delete(target.id);
  }

  // update board map
  setPieceAt(from, null);
  piece.square = to;
  piece.hasMoved = true;
  setPieceAt(to, piece);

  // remember last move for highlight
  State.lastMove = { from, to };

  // UI updates
  renderPieces();
  clearHints();
  UI.selected = null;
  UI.hints = [];

  // captured panel
  if (captured) addCapturedPiece(captured);

  // history
  pushHistory(notationOf(piece, from, to, Boolean(captured)));

  // switch turn
  State.turn = State.turn === "w" ? "b" : "w";
  updateTurnBanner();
}

function addCapturedPiece(piece) {
  const containerId = piece.color === "w" ? "captured-white" : "captured-black";
  const row = document.getElementById(containerId);
  const span = document.createElement("span");
  span.className = "piece";
  span.textContent = GLYPH[piece.color][piece.type];
  row.appendChild(span);
}

function notationOf(piece, from, to, isCapture) {
  const p = piece.type === "P" ? "" : piece.type;
  return `${p}${from}${isCapture ? "x" : "–"}${to}`;
}

function pushHistory(str) {
  State.moveHistory.push(str);
  const li = document.createElement("li");
  li.textContent = str;
  const list = document.getElementById("move-list");
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
}

// --- Lifecycle ----------------------------------------------------------------

function loadPosition(fen = START_FEN) {
  parseFEN(fen);
  renderPieces();
  clearHints();
  UI.selected = null;
  UI.hints = [];
  document.getElementById("move-list").innerHTML = "";
  document.getElementById("captured-white").innerHTML = "";
  document.getElementById("captured-black").innerHTML = "";
}

function init() {
  createBoard();
  drawCoords();
  loadPosition(START_FEN);

  // Restart
  document.getElementById("btn-restart").addEventListener("click", () => {
    loadPosition(START_FEN);
  });

  // Click handling: move if a hinted square is clicked; otherwise select
  boardEl.addEventListener("click", (e) => {
    const sqEl = e.target.closest(".square");
    if (!sqEl) return;
    const squareId = sqEl.id;

    if (UI.selected) {
      const piece = State.pieces.get(UI.selected);
      if (piece) {
        const mv = UI.hints.find(m => m.to === squareId);
        if (mv) { makeMove(piece, mv.to); return; }
        if (squareId === piece.square) { clearHints(); UI.selected = null; UI.hints = []; return; }
      }
    }
    selectSquare(squareId);
  });

  // UX: Esc or right-click to deselect
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { clearHints(); UI.selected = null; UI.hints = []; }
  });
  boardEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    clearHints(); UI.selected = null; UI.hints = [];
  });
}

document.addEventListener("DOMContentLoaded", init);
