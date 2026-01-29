const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

/* ================= MIME TYPES ================= */
const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

/* ================= HTTP SERVER ================= */
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
    const ext = path.extname(filePath);
    const mime = mimeTypes[ext] || "application/octet-stream";

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end("Not found");
    }

    res.writeHead(200, { "Content-Type": mime });
    return fs.createReadStream(filePath).pipe(res);
  }

  res.end("Party Board Server Running");
});

/* ================= WEBSOCKET ================= */
const wss = new WebSocket.Server({ server });

let players = {};
let turnOrder = [];
let currentTurn = 0;
let gameState = "WAITING";

function broadcast(type, data){
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

function currentPlayerId(){
  return turnOrder[currentTurn];
}

wss.on("connection", ws => {
  ws.id = Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type: "INIT",
    data: {
      players,
      turn: currentPlayerId(),
      gameState
    }
  }));

  ws.on("message", msg => {
    const { type, data } = JSON.parse(msg);

    /* ===== JOIN ===== */
    if (type === "JOIN" && gameState === "WAITING") {
      players[ws.id] = {
        pawn: data.pawn,
        pos: 1
      };
      turnOrder.push(ws.id);

      broadcast("UPDATE", {
        players,
        turn: currentPlayerId(),
        gameState
      });
    }

    /* ===== START ===== */
    if (type === "START" && gameState === "WAITING") {
      gameState = "PLAYING";
      currentTurn = 0;

      broadcast("UPDATE", {
        players,
        turn: currentPlayerId(),
        gameState
      });
    }

    /* ===== ROLL & MOVE ===== */
    if (type === "ROLL" && gameState === "PLAYING") {

      if (ws.id !== currentPlayerId()) return;

      const dice = Math.floor(Math.random() * 6) + 1;

      // ενημέρωση ζαριού
      broadcast("DICE", { id: ws.id, dice });

      // κίνηση
      let newPos = players[ws.id].pos + dice;
      if (newPos > 100) newPos = 100;

      players[ws.id].pos = newPos;

      // επόμενος παίκτης
      currentTurn = (currentTurn + 1) % turnOrder.length;

      broadcast("UPDATE", {
        players,
        turn: currentPlayerId(),
        gameState
      });
    }
  });
});

/* ================= START ================= */
server.listen(PORT, () => {
  console.log("🟢 Party Board Server running on port", PORT);
});
