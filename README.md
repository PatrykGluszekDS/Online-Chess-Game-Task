# Online chess game

## Description
This project consists of building an online chess game using HTML, CSS, and JavaScript. The goal is to create an interactive 2-player chess game that works in the browser, using only local technologies — no servers are required. Players should be able to move pieces according to chess rules, restart games, and track whose turn it is.

The chess board will be generated dynamically with JavaScript, and all the logic — including legal move detection, check/checkmate logic, turn switching, and move history — must be implemented in JavaScript. The game runs completely in the browser and does not require any backend.

## Getting Started
1. Clone this repository or download the files.
2. Install required packages if necessary.

Keep in mind that the code must be written in OOP.

## Tasks
- Set up the HTML/CSS structure for an 8x8 chess board.
- Dynamically generate the board using JavaScript.
- Define chess piece classes (e.g. King, Queen, Rook, etc.).
- Implement logic for:
	Valid moves per piece
	Turn switching
	Check and checkmate detection
	Illegal move prevention
- Allow restart/reset of the game.
- Show captured pieces.
- Implement a move history panel.
- Display which player's turn it is.
- Style the board and pieces using CSS or image assets.
- Highlight legal moves when a piece is selected.
- Allow dragging and dropping pieces (drag & drop API).
- Final testing. Create README with instructions and screenshots. Submit as Git repo.

# Online Chess (Vanilla JS)

A clean, dependency‑free chess app built with **HTML/CSS/JavaScript** only. It renders an interactive 8×8 board, enforces full move legality (incl. checks, pins, mate/stalemate), and supports key special rules: **castling, en passant, and pawn promotion**.

---

## Features

* ✅ 8×8 board with alternating colors, file/rank coordinates.
* ✅ Unicode piece rendering (no image assets required).
* ✅ Click‑to‑select with **move hints** (dots for quiet moves, rings for captures).
* ✅ **Turn management**, **capture handling**, **move history** list.
* ✅ **Last move** highlight (from & to).
* ✅ **Check**, **checkmate**, and **stalemate** detection.
* ✅ **Legal‑move enforcement** (no moving into/through check; pins respected).
* ✅ **Special moves**: castling (O‑O / O‑O‑O), en passant, and promotion (q/r/b/n prompt).
* ✅ **Restart** button to reset to initial position.

> Notation style: simple coordinate style (e.g., `e2–e4`, `Bf1–c4`, `Qd1xh5`, `O‑O`, `O‑O‑O`, `exd6 e.p.`) with `+` for check and `#` for mate.

---

## Project Structure

```
/ (repo root)
├─ index.html      # App markup (board container, side panels)
├─ styles.css      # Theme, board grid, panels, highlights
└─ chess.js        # Game logic and UI interactions
```

No build tools are required.

---

## Quick Start

1. **Clone or download** this repository.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari).

   * Optional: use VS Code **Live Server** for auto‑reload.

### How to Play

* Click your piece → legal moves appear.
* Click a highlighted square to move.
* **Esc** or right‑click to deselect.
* Use **Restart** to reset the game.

---

## Rules Implemented

### Core movement

* Pawns: 1‑step forward; 2‑step from the starting rank (path must be clear); diagonal captures.
* Knights: L‑moves that can jump over pieces.
* Bishops, rooks, queens: sliding moves (blocked by pieces).
* King: 1‑square moves in any direction.

### Legality & end states

* You cannot make a move that leaves your king in check (pins handled).
* **Check** is indicated for the side to move.
* **Checkmate** and **Stalemate** are detected and end the game.

### Special moves

* **Castling**: Allowed only if king/rook haven’t moved, path squares are empty, and `e` plus transit/target squares aren’t under attack.
* **En passant**: Available **only on the immediately following move** after an adjacent enemy pawn advances two squares.
* **Promotion**: On reaching last rank, a prompt lets you choose `q`, `r`, `b`, or `n` (defaults to queen).

---

##  Architecture Overview

* **State**: Single `State` object holds board occupancy (`Map(square → piece)`), piece registry, turn, move history, en‑passant target, last move, and game end flags.
* **Rendering**: DOM grid of 64 `.square` nodes. Pieces are Unicode `span.piece` children.
* **Move gen**: `pseudoLegalMoves(piece)` computes piece‑type moves; rays for sliders.
* **Attack map**: `isSquareAttacked(square, byColor)` for checks and castling safety.
* **True legality**: Each candidate move is **simulated** and kept only if own king is safe.
* **UX**: Selection/hover classes; hints for quiet/capture moves; Esc/right‑click to clear.

---

## Manual Test Checklist

* **Opening**: `e2–e4` then `e7–e5`; bishops/knights move and capture as expected.
* **Pins**: Try moving a pinned piece—illegal options disappear.
* **Castling**: Clear path and try `O‑O` / `O‑O‑O`. Ensure squares the king passes through aren’t attacked.
* **En passant**: Play a pawn two‑step beside an enemy pawn. On the next move, capture diagonally onto the empty square; the moved‑through pawn is removed.
* **Promotion**: Push a pawn to the last rank, choose a piece, and verify legal‑move rules still apply.
* **End states**: Create a checkmate or stalemate and confirm the banner + input lock.

---

## Customization

* Colors: tweak CSS variables at the top of `styles.css`.
* Piece style: currently Unicode; swap for images/SVGs if desired by placing `<img>` in `renderPieces()`.
* Coordinates: visible ribbons are in `.coords-files` / `.coords-ranks`.

---

## Known Limitations

* No **threefold repetition** or **50‑move rule** detection.
* No **insufficient material** draw detection.
* Notation is simplified (not fully SAN; no disambiguation like `Nbd2`).
* No PGN export/import UI (FEN parsing exists internally for the start position).
* No timers, sounds, drag‑and‑drop (click‑to‑move only in this version).

> These are all good next‑tasks.