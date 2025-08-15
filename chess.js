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
  el.textContent = State.turn === "w" ? "White to move" : "Black to move";
}

// --- Step 4: Select & highlight pseudo-legal moves ---------------------------

const UI = {
  selected: null, // piece id
};

function clearHints() {
  boardEl.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
  boardEl.querySelectorAll(".hint-move").forEach(el => el.classList.remove("hint-move"));
  boardEl.querySelectorAll(".hint-capture").forEach(el => el.classList.remove("hint-capture"));
}

function selectSquare(square) {
  clearHints();

  const piece = State.board.get(square);
  if (!piece) { UI.selected = null; return; }
  if (piece.color !== State.turn) {
    // Only allow selecting the side to move (helps UX).
    UI.selected = null; return;
  }

  UI.selected = piece.id;

  const sqEl = document.getElementById(square);
  sqEl.classList.add("selected");

  const moves = pseudoLegalMoves(piece);
  for (const mv of moves) {
    const destEl = document.getElementById(mv.to);
    if (!destEl) continue;
    destEl.classList.add(mv.capture ? "hint-capture" : "hint-move");
  }
}

// Compute moves ignoring checks/pins & special moves (no castling/en passant)
// Includes: pawn (single/double, diagonal captures), knight, bishop, rook, queen, king(1-square).
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
    // forward two from start rank
    const startRank = piece.color === "w" ? 2 : 7;
    if (rank === startRank) {
      const oneAhead = `${FILES[fileIdx]}${rank + dir}`;
      const twoAhead = `${FILES[fileIdx]}${rank + 2*dir}`;
      if (!State.board.get(oneAhead) && !State.board.get(twoAhead)) {
        res.push({ from: piece.square, to: twoAhead, capture: false });
      }
    }
    // captures
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

function parseSquare(square) {
  const fileIdx = FILES.indexOf(square[0]);
  const rank = Number(square.slice(1));
  return { fileIdx, rank };
}

// --- Lifecycle ----------------------------------------------------------------

function loadPosition(fen = START_FEN) {
  parseFEN(fen);
  renderPieces();
  clearHints();
}

function init() {
  createBoard();
  drawCoords();
  loadPosition(START_FEN);

  // Restart
  document.getElementById("btn-restart").addEventListener("click", () => {
    loadPosition(START_FEN);
    document.getElementById("move-list").innerHTML = "";
    document.getElementById("captured-white").innerHTML = "";
    document.getElementById("captured-black").innerHTML = "";
  });

  // Delegate clicks: select a square to see moves
  boardEl.addEventListener("click", (e) => {
    const sqEl = e.target.closest(".square");
    if (!sqEl) return;
    selectSquare(sqEl.id);
  });
}

document.addEventListener("DOMContentLoaded", init);
