// server/server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url === "/tv")
    return fs.createReadStream(path.join(__dirname,"../client-tv/index.html")).pipe(res);

  if (req.url === "/phone")
    return fs.createReadStream(path.join(__dirname,"../client-phone/index.html")).pipe(res);

  if (req.url.startsWith("/assets/")) {
    const file = path.join(__dirname,"../client-phone",req.url);
    if (fs.existsSync(file)) return fs.createReadStream(file).pipe(res);
  }

  res.end("OK");
});

const wss = new WebSocket.Server({ server });

let players = {};
let scores = {};
let turnOrder = [];
let currentTurn = 0;

function broadcast(type,data){
  wss.clients.forEach(c=>{
    if(c.readyState===1)
      c.send(JSON.stringify({type,data}));
  });
}

wss.on("connection", ws=>{
  ws.id=Math.random().toString(36).slice(2);

  ws.on("message", msg=>{
    const {type,data}=JSON.parse(msg);

    if(type==="JOIN"){
      if(Object.values(players).some(p=>p.pawn===data.pawn)){
        ws.send(JSON.stringify({type:"PAWN_TAKEN"}));
        return;
      }

      players[ws.id]={pawn:data.pawn,pos:0};
      scores[ws.id]=scores[ws.id]||0;

      broadcast("UPDATE",{players,scores,turn:null});
    }

    if(type==="START"){
      turnOrder=Object.keys(players);
      currentTurn=0;
      broadcast("UPDATE",{players,scores,turn:turnOrder[0]});
    }

    if(type==="ROLL"){
      if(ws.id!==turnOrder[currentTurn]) return;

      const dice=Math.floor(Math.random()*6)+1;
      const p=players[ws.id];
      p.pos=p.pos===0?1:Math.min(100,p.pos+dice);

      broadcast("DICE",{dice});
      broadcast("UPDATE",{players,scores,turn:ws.id});

      currentTurn=(currentTurn+1)%turnOrder.length;

      setTimeout(()=>{
        broadcast("UPDATE",{players,scores,turn:turnOrder[currentTurn]});
      },1200);
    }

    if(type==="RESET"){
      players={};
      scores={};
      turnOrder=[];
      currentTurn=0;
      broadcast("UPDATE",{players,scores,turn:null});
    }
  });
});

server.listen(PORT,()=>console.log("Server OK"));
