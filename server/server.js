const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

let players = {};
let takenPawns = {}; // 🔒 pawn -> socketId

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

  if (req.url.startsWith("/assets")) {
    return fs.createReadStream(
      path.join(__dirname, "../client-phone", req.url)
    ).pipe(res);
  }
});

/* ================= WS ================= */
const wss = new WebSocket.Server({ server });

function broadcast(type, data) {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify({ type, data }));
    }
  });
}

wss.on("connection", (ws) => {
  ws.id = Math.random().toString(36).substring(2, 9);

  ws.send(JSON.stringify({ type: "INIT", data: { id: ws.id } }));
  ws.send(JSON.stringify({ type: "PAWN_STATE", data: Object.keys(takenPawns) }));

  ws.on("message", (msg) => {
    const { type, data } = JSON.parse(msg);

    /* ========= JOIN ========= */
    if (type === "JOIN") {
      const pawn = data.pawn;

      // ❌ Αν είναι παρμένο
      if (takenPawns[pawn]) {
        ws.send(JSON.stringify({ type: "PAWN_TAKEN" }));
        return;
      }

      // Ελευθέρωσε παλιό αν είχε
      for (let p in takenPawns) {
        if (takenPawns[p] === ws.id) delete takenPawns[p];
      }

      // Κλείδωσε νέο
      takenPawns[pawn] = ws.id;

      players[ws.id] = { pawn };

      // Ενημέρωση όλων
      broadcast("PAWN_STATE", Object.keys(takenPawns));
    }
  });

  ws.on("close", () => {
    for (let p in takenPawns) {
      if (takenPawns[p] === ws.id) delete takenPawns[p];
    }

    delete players[ws.id];
    broadcast("PAWN_STATE", Object.keys(takenPawns));
  });
});

server.listen(PORT, () =>
  console.log("🟢 Party Board Server running")
);
