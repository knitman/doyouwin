const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/tv")) {
    fs.createReadStream(path.join(__dirname, "../client-tv/index.html")).pipe(res);
    return;
  }
  if (req.url.startsWith("/phone")) {
    fs.createReadStream(path.join(__dirname, "../client-phone/index.html")).pipe(res);
    return;
  }
  res.end("Party Board Server Running");
});

const wss = new WebSocket.Server({ server });

const EMOJIS = ["😎","🤡","🤖","👑","🐱","🐶","🦊","🐸","👻","💀"];

let players = {}; // id -> { emoji, pos, started }
let turnOrder = [];
let currentTurn = 0;
let gameState = "WAITING";

function broadcast(type, data){
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

function resetGame(){
  players = {};
  turnOrder = [];
  currentTurn = 0;
  gameState = "WAITING";
}

wss.on("connection", ws => {
  ws.id = Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type:"INIT",
    data:{ players, turn:null, gameState, emojis:EMOJIS }
  }));

  ws.on("message", msg => {
    const { type, data } = JSON.parse(msg);

    if(type==="JOIN" && gameState==="WAITING"){
      if(Object.values(players).some(p=>p.emoji===data.emoji)) return;
      players[ws.id] = { emoji:data.emoji, pos:1, started:false };
      turnOrder.push(ws.id);
      broadcast("UPDATE",{ players, turn:turnOrder[currentTurn], gameState });
    }

    if(type==="START" && gameState==="WAITING"){
      if(turnOrder.length===0) return;
      gameState="PLAYING";
      broadcast("UPDATE",{ players, turn:turnOrder[currentTurn], gameState });
    }

    if(type==="ROLL" && gameState==="PLAYING"){
      if(ws.id!==turnOrder[currentTurn]) return;
      const dice = Math.floor(Math.random()*6)+1;
      broadcast("DICE",{ id:ws.id, dice });
    }

    if(type==="MOVE_DONE"){
      players[data.id].pos = data.pos;
      players[data.id].started = true;
      if(data.pos>=100){
        gameState="FINISHED";
        broadcast("WIN",{ emoji:players[data.id].emoji });
      }else{
        currentTurn=(currentTurn+1)%turnOrder.length;
        broadcast("UPDATE",{ players, turn:turnOrder[currentTurn], gameState });
      }
    }

    if(type==="RESTART"){
      resetGame();
      broadcast("UPDATE",{ players, turn:null, gameState });
    }
  });
});

server.listen(PORT,()=>console.log("🟢 Party Board live"));
