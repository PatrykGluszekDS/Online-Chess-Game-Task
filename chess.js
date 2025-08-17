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
  gameOver: false,
  result: null,
  reason: null,
  epTarget: null,       // en passant target square like "e3" | null
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
  State.gameOver = false;
  State.result = null;
  State.reason = null;
  State.epTarget = null;

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

  if (State.gameOver) {
    if (State.reason === "checkmate") {
      el.innerHTML = `Game over: ${State.result} <span class="mate-badge">CHECKMATE</span>`;
    } else if (State.reason === "stalemate") {
      el.innerHTML = `Game over: ${State.result} <span class="stale-badge">STALEMATE</span>`;
    } else {
      el.textContent = `Game over: ${State.result}`;
    }
    return;
  }

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
function colorName(c){ return c === "w" ? "White" : "Black"; }

// --- Selection & move hints --------------------------------------------------
const UI = {
  selected: null, // piece id
  hints: [],      // cached (LEGAL) move objects for selected piece
};

function clearHints() {
  boardEl.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
  boardEl.querySelectorAll(".hint-move").forEach(el => el.classList.remove("hint-move"));
  boardEl.querySelectorAll(".hint-capture").forEach(el => el.classList.remove("hint-capture"));
}

function selectSquare(square) {
  clearHints();
  if (State.gameOver) return;

  const piece = State.board.get(square);
  if (!piece) { UI.selected = null; UI.hints = []; return; }
  if (piece.color !== State.turn) { UI.selected = null; UI.hints = []; return; }

  UI.selected = piece.id;

  const sqEl = document.getElementById(square);
  sqEl.classList.add("selected");

  // Generate pseudo moves (incl. special), then filter by king safety.
  const pseudo = pseudoLegalMoves(piece);
  const legal = [];
  for (const mv of pseudo) {
    if (isMoveLegal(mv)) legal.push(mv);
  }
  UI.hints = legal;

  for (const mv of legal) {
    const destEl = document.getElementById(mv.to);
    if (!destEl) continue;
    destEl.classList.add(mv.capture ? "hint-capture" : "hint-move");
  }
}

// --- Pseudo move generation (now includes CASTLING & EN PASSANT flags) -------

function pseudoLegalMoves(piece) {
  const res = [];
  const { fileIdx, rank } = parseSquare(piece.square);

  const add = (f, r, captureOnly=false, stopOnHit=true) => {
    if (f < 0 || f > 7 || r < 1 || r > 8) return "stop";
    const to = `${FILES[f]}${r}`;
    const occ = getPieceAt(to);
    if (occ) {
      if (occ.color !== piece.color) {
        res.push({ pid: piece.id, from: piece.square, to, capture: true });
      }
      return "stop";
    } else {
      if (!captureOnly) res.push({ pid: piece.id, from: piece.square, to, capture: false });
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
      if (!getPieceAt(oneAhead) && !getPieceAt(twoAhead)) {
        res.push({ pid: piece.id, from: piece.square, to: twoAhead, capture: false, twoStep: true });
      }
    }
    // diagonal captures
    const left = fileIdx - 1, right = fileIdx + 1;
    for (const f of [left, right]) {
      if (f < 0 || f > 7) continue;
      const to = `${FILES[f]}${rank + dir}`;
      const occ = getPieceAt(to);
      if (occ && occ.color !== piece.color) {
        res.push({ pid: piece.id, from: piece.square, to, capture: true });
      }
    }
    // EN PASSANT
    if (State.epTarget) {
      const { fileIdx: ef, rank: er } = parseSquare(State.epTarget);
      if (Math.abs(ef - fileIdx) === 1 && er === rank + dir) {
        res.push({
          pid: piece.id, from: piece.square, to: State.epTarget,
          capture: true, enPassant: true
        });
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

    // CASTLING (generate only when path squares are empty & not attacked)
    if (!piece.hasMoved) {
      const rankHome = piece.color === "w" ? 1 : 8;
      const kingSq = `e${rankHome}`;
      if (piece.square === kingSq && !isKingInCheck(piece.color)) {
        const enemy = piece.color === "w" ? "b" : "w";
        // King-side (O-O): rook at h-file; empty f, g; none of e,f,g attacked
        const rookK = getPieceAt(`h${rankHome}`);
        if (rookK && rookK.type === "R" && rookK.color === piece.color && !rookK.hasMoved) {
          const empty = !getPieceAt(`f${rankHome}`) && !getPieceAt(`g${rankHome}`);
          const safe = !isSquareAttacked(`e${rankHome}`, enemy) &&
                       !isSquareAttacked(`f${rankHome}`, enemy) &&
                       !isSquareAttacked(`g${rankHome}`, enemy);
          if (empty && safe) {
            res.push({ pid: piece.id, from: kingSq, to: `g${rankHome}`, capture: false, castle: "K" });
          }
        }
        // Queen-side (O-O-O): rook at a-file; empty d,c,b; none of e,d,c attacked
        const rookQ = getPieceAt(`a${rankHome}`);
        if (rookQ && rookQ.type === "R" && rookQ.color === piece.color && !rookQ.hasMoved) {
          const empty = !getPieceAt(`d${rankHome}`) && !getPieceAt(`c${rankHome}`) && !getPieceAt(`b${rankHome}`);
          const safe = !isSquareAttacked(`e${rankHome}`, enemy) &&
                       !isSquareAttacked(`d${rankHome}`, enemy) &&
                       !isSquareAttacked(`c${rankHome}`, enemy);
          if (empty && safe) {
            res.push({ pid: piece.id, from: kingSq, to: `c${rankHome}`, capture: false, castle: "Q" });
          }
        }
      }
    }
  }
  return res;
}

// --- Attack map & check info -------------------------------------------------

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

// --- Legality via simulation (supports castle + en passant) ------------------

function simulateApply(mv) {
  const piece = State.pieces.get(mv.pid);
  const from = piece.square;
  const to = mv.to;

  const undo = {
    pid: mv.pid,
    from,
    to,
    prevHasMoved: piece.hasMoved,
    captured: null,
    capturedSquare: null,
    rookMove: null,        // {rook, from, to, prevHasMoved}
    prevEp: State.epTarget,
    prevType: piece.type,
  };

  // Remove captured for EP or normal
  if (mv.enPassant) {
    // captured pawn is behind 'to' by 1 rank in mover's direction
    const { fileIdx: tf, rank: tr } = parseSquare(to);
    const capRank = piece.color === "w" ? tr - 1 : tr + 1;
    const capSq = `${FILES[tf]}${capRank}`;
    undo.capturedSquare = capSq;
    undo.captured = getPieceAt(capSq);
    if (undo.captured) setPieceAt(capSq, null);
  } else {
    const target = getPieceAt(to);
    if (target) {
      undo.captured = target;
      undo.capturedSquare = to;
      setPieceAt(to, null);
    }
  }

  // Move rook for castling
  if (mv.castle) {
    const homeRank = piece.color === "w" ? 1 : 8;
    if (mv.castle === "K") {
      const rookFrom = `h${homeRank}`, rookTo = `f${homeRank}`;
      const rook = getPieceAt(rookFrom);
      if (rook) {
        undo.rookMove = { rook, from: rookFrom, to: rookTo, prevHasMoved: rook.hasMoved };
        setPieceAt(rookFrom, null);
        rook.square = rookTo;
        rook.hasMoved = true;
        setPieceAt(rookTo, rook);
      }
    } else if (mv.castle === "Q") {
      const rookFrom = `a${homeRank}`, rookTo = `d${homeRank}`;
      const rook = getPieceAt(rookFrom);
      if (rook) {
        undo.rookMove = { rook, from: rookFrom, to: rookTo, prevHasMoved: rook.hasMoved };
        setPieceAt(rookFrom, null);
        rook.square = rookTo;
        rook.hasMoved = true;
        setPieceAt(rookTo, rook);
      }
    }
  }

  // Move the piece
  setPieceAt(from, null);
  piece.square = to;
  piece.hasMoved = true;
  setPieceAt(to, piece);

  // For simulation, we don't care about epTarget/promotion updates beyond saving previous
  return undo;
}

function simulateUndo(undo) {
  const piece = State.pieces.get(undo.pid);

  // revert piece
  setPieceAt(undo.to, null);
  piece.square = undo.from;
  piece.hasMoved = undo.prevHasMoved;
  piece.type = undo.prevType;
  setPieceAt(undo.from, piece);

  // revert rook (if any)
  if (undo.rookMove) {
    setPieceAt(undo.rookMove.to, null);
    undo.rookMove.rook.square = undo.rookMove.from;
    undo.rookMove.rook.hasMoved = undo.rookMove.prevHasMoved;
    setPieceAt(undo.rookMove.from, undo.rookMove.rook);
  }

  // restore captured
  if (undo.captured && undo.capturedSquare) {
    setPieceAt(undo.capturedSquare, undo.captured);
  }

  // restore ep target
  State.epTarget = undo.prevEp;
}

function isMoveLegal(mv) {
  const piece = State.pieces.get(mv.pid);
  const undo = simulateApply(mv);
  const inCheck = isKingInCheck(piece.color);
  simulateUndo(undo);
  return !inCheck;
}

function hasAnyLegalMove(color) {
  for (const p of State.pieces.values()) {
    // skip pieces not on board (captured)
    const occ = getPieceAt(p.square);
    if (!occ || occ.id !== p.id) continue;
    if (p.color !== color) continue;
    const pseudo = pseudoLegalMoves(p);
    for (const mv of pseudo) {
      if (isMoveLegal(mv)) return true;
    }
  }
  return false;
}

// --- Make move (handles castle, en passant, promotion, end states) -----------

function makeMove(mv) {
  const piece = State.pieces.get(mv.pid);
  const from = piece.square;
  const to = mv.to;
  const enemy = piece.color === "w" ? "b" : "w";
  let captured = null;

  // en passant capture
  if (mv.enPassant) {
    const { fileIdx: tf, rank: tr } = parseSquare(to);
    const capRank = piece.color === "w" ? tr - 1 : tr + 1;
    const capSq = `${FILES[tf]}${capRank}`;
    captured = getPieceAt(capSq);
    if (captured) {
      setPieceAt(capSq, null);
      State.pieces.delete(captured.id);
    }
  }

  // normal capture on 'to'
  const target = getPieceAt(to);
  if (!captured && target && target.color !== piece.color) {
    captured = target;
    State.pieces.delete(target.id);
    setPieceAt(to, null);
  }

  // rook move for castling
  if (mv.castle) {
    const homeRank = piece.color === "w" ? 1 : 8;
    if (mv.castle === "K") {
      const rookFrom = `h${homeRank}`, rookTo = `f${homeRank}`;
      const rook = getPieceAt(rookFrom);
      if (rook) {
        setPieceAt(rookFrom, null);
        rook.square = rookTo;
        rook.hasMoved = true;
        setPieceAt(rookTo, rook);
      }
    } else if (mv.castle === "Q") {
      const rookFrom = `a${homeRank}`, rookTo = `d${homeRank}`;
      const rook = getPieceAt(rookFrom);
      if (rook) {
        setPieceAt(rookFrom, null);
        rook.square = rookTo;
        rook.hasMoved = true;
        setPieceAt(rookTo, rook);
      }
    }
  }

  // move the piece
  setPieceAt(from, null);
  piece.square = to;
  piece.hasMoved = true;

  // PROMOTION
  if (piece.type === "P") {
    const lastRank = piece.color === "w" ? 8 : 1;
    const { rank: toRank } = parseSquare(to);
    if (toRank === lastRank) {
      let choice = (prompt("Promote to (q, r, b, n)?", "q") || "q").toLowerCase();
      const map = { q: "Q", r: "R", b: "B", n: "N" };
      piece.type = map[choice] || "Q";
    }
  }

  setPieceAt(to, piece);

  // remember last move
  State.lastMove = { from, to };

  // update EP target (only valid right after a pawn two-step)
  if (piece.type === "P" && mv.twoStep) {
    const { fileIdx: ff, rank: fr } = parseSquare(from);
    const dir = piece.color === "w" ? 1 : -1;
    State.epTarget = `${FILES[ff]}${fr + dir}`;
  } else {
    State.epTarget = null;
  }

  // captured panel
  if (captured) addCapturedPiece(captured);

  // opponent check state + mate/stale detection
  const oppInCheck = isKingInCheck(enemy);
  const oppHasMove = hasAnyLegalMove(enemy);

  // notation
  let notation;
  if (mv.castle === "K") notation = "O-O";
  else if (mv.castle === "Q") notation = "O-O-O";
  else {
    const p = piece.type === "P" ? "" : piece.type;
    notation = `${p}${from}${(captured || mv.enPassant) ? "x" : "–"}${to}`;
    if ((piece.type !== "P") && (piece.type === "Q" || piece.type === "R" || piece.type === "B" || piece.type === "N") && (from[0] !== to[0])) {
      // (lightweight; we don't disambiguate fully)
    }
    if (mv.enPassant) notation += " e.p.";
    if ((piece.type !== "P") && (from === to)) {} // placeholder
    // promotion marker
    // If we promoted, piece.type is now new type; add "=X" when from pawn reaching last rank
    const fromRank = Number(from.slice(1)), toRank = Number(to.slice(1));
    const wasPawnMove = /[1-8]/.test(from[1]) && /[1-8]/.test(to[1]); // cheap check
    if (wasPawnMove && (fromRank === 7 && toRank === 8 && colorName(State.turn)==="White" || fromRank === 2 && toRank === 1 && colorName(State.turn)==="Black")) {
      // handled differently; but below is better generic check:
    }
    // Better: if a pawn reached last rank, we already changed type; encode "=Type"
    // We can't easily know it was pawn before, so check mv.promo flag (not set). Instead infer:
    // If destination rank is 1 or 8 and the moving piece just became non-P due to promotion:
    // (simple approach) append "=Q" if destination rank at edge and original move was a pawn:
    // We can approximate by: if notation begins with from square (no piece letter) and (to rank is 1 or 8)
    const toEdge = to.endsWith("1") || to.endsWith("8");
    if (toEdge && mv.maybePromotion) {
      notation += `=${piece.type}`;
    }
  }

  let suffix = "";
  if (!oppHasMove && oppInCheck) suffix = "#";
  else if (oppInCheck) suffix = "+";
  pushHistory((notation || `${from}–${to}`) + suffix);

  // switch turn or finish
  if (!oppHasMove) {
    State.gameOver = true;
    if (oppInCheck) {
      State.reason = "checkmate";
      State.result = piece.color === "w" ? "1-0" : "0-1";
    } else {
      State.reason = "stalemate";
      State.result = "1/2-1/2";
    }
  } else {
    State.turn = enemy;
  }

  // UI
  renderPieces();
  clearHints();
  UI.selected = null;
  UI.hints = [];
}

function addCapturedPiece(piece) {
  const containerId = piece.color === "w" ? "captured-white" : "captured-black";
  const row = document.getElementById(containerId);
  const span = document.createElement("span");
  span.className = "piece";
  span.textContent = GLYPH[piece.color][piece.type];
  row.appendChild(span);
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
    if (!sqEl || State.gameOver) return;
    const squareId = sqEl.id;

    if (UI.selected) {
      const mv = UI.hints.find(m => m.to === squareId);
      if (mv) { makeMove(mv); return; }
      const piece = State.pieces.get(UI.selected);
      if (piece && squareId === piece.square) { clearHints(); UI.selected = null; UI.hints = []; return; }
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
