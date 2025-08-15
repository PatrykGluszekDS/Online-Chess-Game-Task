// --- Board generation (from Step 2) -----------------------------------------
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


const COLORS = { WHITE: "w", BLACK: "b" };
const TYPES  = { K:"K", Q:"Q", R:"R", B:"B", N:"N", P:"P" };

// Unicode glyphs keep things asset-free
const GLYPH = {
  w: { K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘", P:"♙" },
  b: { K:"♚", Q:"♛", R:"♜", B:"♝", N:"♞", P:"♟" },
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Game state (minimal for now; will expand in next steps)
const State = {
  board: new Map(),     // square -> piece | null
  turn: COLORS.WHITE,   // 'w' or 'b'
  pieces: new Map(),    // id -> piece
  moveHistory: [],      // SAN later
};

// piece object: { id, type, color, square, hasMoved }
function makePiece(type, color, square, index) {
  return {
    id: `${color}${type}${index}`, // e.g., wP1, bN2
    type,
    color,
    square,
    hasMoved: false,
  };
}

function parseFEN(fen) {
  const [placement, active] = fen.trim().split(/\s+/);
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error("Invalid FEN: bad rank count");

  State.board.clear();
  State.pieces.clear();

  // counters for stable ids by piece type
  const counters = {
    w: {K:0,Q:0,R:0,B:0,N:0,P:0},
    b: {K:0,Q:0,R:0,B:0,N:0,P:0},
  };

  for (let rIdx = 0; rIdx < 8; rIdx++) {
    const rankStr = ranks[rIdx];
    let fileIdx = 0;

    for (const ch of rankStr) {
      if (/\d/.test(ch)) {
        fileIdx += Number(ch);
        continue;
      }
      const isUpper = ch === ch.toUpperCase();
      const color = isUpper ? COLORS.WHITE : COLORS.BLACK;
      const type = ch.toUpperCase();
      if (!TYPES[type]) throw new Error(`Invalid piece in FEN: ${ch}`);

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
  for (const sq of boardEl.children) {
    sq.innerHTML = ""; // keep square element, remove piece child
  }
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
  return (
    {K:"King", Q:"Queen", R:"Rook", B:"Bishop", N:"Knight", P:"Pawn"}[type] || type
  );
}

function updateTurnBanner() {
  const el = document.getElementById("turn-indicator");
  el.textContent = State.turn === "w" ? "White to move" : "Black to move";
}

// --- Lifecycle ----------------------------------------------------------------

function loadPosition(fen = START_FEN) {
  parseFEN(fen);
  renderPieces();
}

function init() {
  createBoard();
  drawCoords();
  loadPosition(START_FEN);

  // Restart to the initial setup (will also clear history later)
  document.getElementById("btn-restart").addEventListener("click", () => {
    loadPosition(START_FEN);
    document.getElementById("move-list").innerHTML = "";
    document.getElementById("captured-white").innerHTML = "";
    document.getElementById("captured-black").innerHTML = "";
  });
}

document.addEventListener("DOMContentLoaded", init);
