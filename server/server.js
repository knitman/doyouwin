const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const WIN_POINTS = 25;

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
    const filePath = path.join(__dirname, "../client-phone", req.url);
    if (fs.existsSync(filePath)) {
      return fs.createReadStream(filePath).pipe(res);
    }
  }
  res.end("Party Board Server Running");
});

/* ================= WS ================= */
const wss = new WebSocket.Server({ server });

let players = {};   // {id:{pawn,pos}}
let scores = {};    // {id:points}
let turnOrder = [];
let currentTurn = 0;
let gameState = "WAITING"; // WAITING | PLAYING | ROUND_END | TOURNAMENT_END

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

function resetRoundPositions() {
  Object.values(players).forEach(p => p.pos = 0);
}

/* ================= CONNECTION ================= */
wss.on("connection", ws => {
  ws.id = Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type: "INIT",
    data: { players, scores, gameState, turn: null, id: ws.id }
  }));

  ws.on("message", msg => {
    const { type, data } = JSON.parse(msg);

    /* JOIN */
    if (type === "JOIN" && gameState === "WAITING") {
      players[ws.id] = { pawn: data.pawn, pos: 0 };
      scores[ws.id] ??= 0;
      broadcast("UPDATE", { players, scores, gameState, turn: null });
    }

    /* START ROUND */
    if (type === "START" && gameState === "WAITING") {
      turnOrder = Object.keys(players);
      shuffle(turnOrder);
      currentTurn = 0;
      gameState = "PLAYING";
      broadcast("ORDER", { order: turnOrder });
      broadcast("UPDATE", {
        players,
        scores,
        gameState,
        turn: turnOrder[currentTurn]
      });
    }

    /* ROLL */
    if (type === "ROLL" && gameState === "PLAYING") {
      if (ws.id !== turnOrder[currentTurn]) return;

      const dice = Math.floor(Math.random() * 6) + 1;
      const p = players[ws.id];

      if (p.pos === 0) p.pos = 1;
      else p.pos = Math.min(100, p.pos + dice);

      broadcast("DICE", { id: ws.id, dice });

      if (p.pos >= 100) {
        gameState = "ROUND_END";

        // ===== CALCULATE RANKS =====
        const finished = [...turnOrder].sort(
          (a, b) => players[b].pos - players[a].pos
        );

        const count = finished.length;
        finished.forEach((id, index) => {
          const points = Math.max(0, count - index - 1);
          scores[id] += points;
        });

        broadcast("ROUND_RESULT", {
          order: finished,
          scores
        });

        const winner = Object.entries(scores)
          .find(([_, pts]) => pts >= WIN_POINTS);

        if (winner) {
          gameState = "TOURNAMENT_END";
          broadcast("TOURNAMENT_WINNER", {
            id: winner[0],
            scores
          });
        } else {
          setTimeout(() => {
            resetRoundPositions();
            gameState = "WAITING";
            broadcast("UPDATE", {
              players,
              scores,
              gameState,
              turn: null
            });
          }, 5000);
        }
        return;
      }

      currentTurn = (currentTurn + 1) % turnOrder.length;
      broadcast("UPDATE", {
        players,
        scores,
        gameState,
        turn: turnOrder[currentTurn]
      });
    }

    /* RESET ALL */
    if (type === "RESET") {
      players = {};
      scores = {};
      turnOrder = [];
      currentTurn = 0;
      gameState = "WAITING";
      broadcast("UPDATE", {
        players,
        scores,
        gameState,
        turn: null
      });
    }
  });
});

server.listen(PORT, () =>
  console.log("🟢 Party Board Server with Tournament running")
);
