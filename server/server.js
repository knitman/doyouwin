const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  /* ===== TV ===== */
  if (req.url === "/tv") {
    return fs.createReadStream(
      path.join(__dirname, "../client-tv/index.html")
    ).pipe(res);
  }

  /* ===== PHONE ===== */
  if (req.url === "/phone") {
    return fs.createReadStream(
      path.join(__dirname, "../client-phone/index.html")
    ).pipe(res);
  }

  /* ===== STATIC ASSETS ===== */
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

/* ===== WEBSOCKET ===== */
const wss = new WebSocket.Server({ server });

const EMOJIS = ["😎","🤡","🤖","👑","🐱","🐶","🦊","🐸","👻","💀"];

let players = {};
let turnOrder = [];
let currentTurn = 0;
let gameState = "WAITING";

function broadcast(type, data){
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

wss.on("connection", ws => {
  ws.id = Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type: "INIT",
    data: { players, turn: null, gameState, emojis: EMOJIS }
  }));

  ws.on("message", msg => {
    const { type, data } = JSON.parse(msg);

    if(type === "JOIN" && gameState === "WAITING"){
      players[ws.id] = { pawn: data.pawn, pos: 1 };
      turnOrder.push(ws.id);
      broadcast("UPDATE", { players, turn: turnOrder[currentTurn], gameState });
    }

    if(type === "START"){
      gameState = "PLAYING";
      broadcast("UPDATE", { players, turn: turnOrder[currentTurn], gameState });
    }

    if(type === "ROLL"){
      const dice = Math.floor(Math.random() * 6) + 1;
      broadcast("DICE", { id: ws.id, dice });
    }

    if(type === "MOVE_DONE"){
      players[data.id].pos = data.pos;
      currentTurn = (currentTurn + 1) % turnOrder.length;
      broadcast("UPDATE", { players, turn: turnOrder[currentTurn], gameState });
    }
  });
});

server.listen(PORT, () =>
  console.log("🟢 Party Board Server running on port", PORT)
);
