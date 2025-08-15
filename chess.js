const FILES = ["a","b","c","d","e","f","g","h"]; // left → right
const RANKS = [8,7,6,5,4,3,2,1];                 // top → bottom (white at bottom)

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

function init() {
  createBoard();
  drawCoords();

  // Restart
  document.getElementById("btn-restart").addEventListener("click", () => {
    createBoard();
  });
}

document.addEventListener("DOMContentLoaded", init);
