const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROUND_DELAY = 10;
const BONUS_TILES = 25;

/* ================= HTTP ================= */
const server = http.createServer((req, res) => {
  if (req.url === "/tv") {
    return fs.createReadStream(
      path.join(__dirname, "../client-tv/index.html")
    ).pipe(res);
  }

  if (req.url === "/phone") {
    return fs.createReadStream(
      path.join(__dirname, "../client-phone/index.html")
    ).pipe(res);
  }

  if (req.url.startsWith("/assets/")) {
    const file = path.join(__dirname, "../client-phone", req.url);
    if (fs.existsSync(file)) {
      return fs.createReadStream(file).pipe(res);
    }
  }

  res.end("Party Board Server Running");
});

/* ================= WS ================= */
const wss = new WebSocket.Server({ server });

let players = {};
let scores = {};
let turnOrder = [];
let currentTurn = 0;
let gameState = "WAITING";
let bonusTiles = new Set();
let winPoints = 50;

/* ================= HELPERS ================= */
function rollBonus() {
  const pool = [
    -2,
    -1,
    1,1,1,1,1,
    2,2,2,
    3,3,
    4,4,
    5,
    6,
    7,
    8,
    9,
    10
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateBonusTiles() {
  bonusTiles.clear();
  while (bonusTiles.size < BONUS_TILES) {
    bonusTiles.add(Math.floor(Math.random() * 98) + 2);
  }
}

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

/* 🔥 ΝΕΟ: σειρά γύρου με βάση πόντους */
function calculateTurnOrderByScore() {
  return Object.keys(players)
    .map(id => ({ id, score: scores[id] || 0 }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Math.random() - 0.5; // ισοβαθμία
    })
    .map(p => p.id);
}

function resetRound() {
  Object.values(players).forEach(p => (p.pos = 0));
  generateBonusTiles();
  turnOrder = calculateTurnOrderByScore();
  currentTurn = 0;
}

function resetAll() {
  players = {};
  scores = {};
  turnOrder = [];
  currentTurn = 0;
  gameState = "WAITING";
  winPoints = 50;
  bonusTiles.clear();
}

/* ================= CONNECTION ================= */
wss.on("connection", ws => {
  ws.id = Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type: "INIT",
    data: { players, scores, gameState, turn: null, winPoints, id: ws.id }
  }));

  ws.on("message", msg => {
    const { type, data } = JSON.parse(msg);

    if (type === "SET_TARGET" && gameState === "WAITING") {
      winPoints = data.points;
      broadcast("TARGET_UPDATED", { winPoints });
    }

    if (type === "JOIN" && gameState === "WAITING") {
      players[ws.id] = { pawn: data.pawn, pos: 0 };
      scores[ws.id] ??= 0;
      broadcast("UPDATE", { players, scores, gameState, turn: null, winPoints });
    }

    if (type === "START" && gameState === "WAITING") {
      turnOrder = calculateTurnOrderByScore();
      currentTurn = 0;
      gameState = "PLAYING";
      generateBonusTiles();

      broadcast("UPDATE", {
        players,
        scores,
        gameState,
        turn: turnOrder[currentTurn],
        winPoints
      });
    }

    if (type === "ROLL" && gameState === "PLAYING") {
      if (ws.id !== turnOrder[currentTurn]) return;

      const dice = Math.floor(Math.random() * 6) + 1;
      const p = players[ws.id];
      p.pos = p.pos === 0 ? 1 : Math.min(100, p.pos + dice);

      broadcast("DICE", { id: ws.id, dice });

      if (bonusTiles.has(p.pos)) {
        const bonus = rollBonus();
        scores[ws.id] += bonus;
        bonusTiles.delete(p.pos);
        broadcast("BONUS", { id: ws.id, bonus, scores });
      }

      if (p.pos >= 100) {
        const winner = Object.entries(scores)
          .find(([_, s]) => s >= winPoints);

        if (winner) {
          gameState = "TOURNAMENT_END";
          broadcast("TOURNAMENT_WINNER", {
            id: winner[0],
            scores,
            winPoints
          });
          return;
        }

        gameState = "ROUND_END";
        let t = ROUND_DELAY;
        broadcast("ROUND_COUNTDOWN", { seconds: t });

        const timer = setInterval(() => {
          t--;
          broadcast("ROUND_COUNTDOWN", { seconds: t });

          if (t <= 0) {
            clearInterval(timer);
            resetRound();
            gameState = "WAITING";

            broadcast("UPDATE", {
              players,
              scores,
              gameState,
              turn: turnOrder[currentTurn],
              winPoints
            });
          }
        }, 1000);

        return;
      }

      currentTurn = (currentTurn + 1) % turnOrder.length;
      broadcast("UPDATE", {
        players,
        scores,
        gameState,
        turn: turnOrder[currentTurn],
        winPoints
      });
    }

    if (type === "RESET") {
      resetAll();
      broadcast("UPDATE", {
        players,
        scores,
        gameState,
        turn: null,
        winPoints
      });
    }
  });
});

server.listen(PORT, () =>
  console.log("🟢 Party Board Server running")
);
