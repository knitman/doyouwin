const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

const EMOJIS = ["😎","🤡","🤖","👑","🐱","🐶","🦊","🐸","👻","💀"];

let players = {};      // id -> { emoji, pos }
let turnOrder = [];    // [id]
let currentTurn = 0;

function broadcast(type, data){
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(c=>{
    if(c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

wss.on("connection", ws=>{
  ws.id = Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type:"INIT",
    data:{ players, turn: turnOrder[currentTurn] || null, emojis: EMOJIS }
  }));

  ws.on("message", msg=>{
    const { type, data } = JSON.parse(msg);

    if(type==="JOIN"){
      if(Object.values(players).some(p=>p.emoji===data.emoji)) return;
      players[ws.id] = { emoji:data.emoji, pos:1 };
      turnOrder.push(ws.id);
      broadcast("UPDATE",{ players, turn: turnOrder[currentTurn] });
    }

    if(type==="ROLL"){
      if(ws.id !== turnOrder[currentTurn]) return;
      const dice = Math.floor(Math.random()*6)+1;
      broadcast("DICE",{ id:ws.id, dice });
    }

    if(type==="MOVE_DONE"){
      players[data.id].pos = data.pos;
      if(data.pos >= 100){
        broadcast("WIN",{ emoji: players[data.id].emoji });
      }else{
        currentTurn = (currentTurn+1) % turnOrder.length;
        broadcast("UPDATE",{ players, turn: turnOrder[currentTurn] });
      }
    }
  });

  ws.on("close",()=>{
    delete players[ws.id];
    turnOrder = turnOrder.filter(id=>id!==ws.id);
    if(currentTurn>=turnOrder.length) currentTurn=0;
    broadcast("UPDATE",{ players, turn: turnOrder[currentTurn] || null });
  });
});

console.log("🟢 Server running on ws://localhost:8080");
