const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

let players = {}; // socketId -> { emoji }
let emojis = ["😎","🤡","🤖","👑","🐱","🐶","🦊","🐸","👻","💀"];

function broadcast(type, data){
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(c=>{
    if(c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

wss.on("connection", ws => {
  ws.id = Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type:"INIT",
    data:{ emojis, players }
  }));

  ws.on("message", msg => {
    const { type, data } = JSON.parse(msg);

    if(type === "JOIN"){
      if(Object.values(players).some(p=>p.emoji===data.emoji)) return;
      players[ws.id] = { emoji:data.emoji };
      broadcast("UPDATE", players);
    }

    if(type === "LEAVE"){
      delete players[ws.id];
      broadcast("UPDATE", players);
    }
  });

  ws.on("close", ()=>{
    delete players[ws.id];
    broadcast("UPDATE", players);
  });
});

console.log("Server running on ws://localhost:8080");
