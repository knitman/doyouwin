const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

/* ================= HTTP ================= */
const server = http.createServer((req,res)=>{
  if(req.url==="/tv"){
    return fs.createReadStream(
      path.join(__dirname,"../client-tv/index.html")
    ).pipe(res);
  }
  if(req.url==="/phone"){
    return fs.createReadStream(
      path.join(__dirname,"../client-phone/index.html")
    ).pipe(res);
  }
  if(req.url.startsWith("/assets/")){
    const filePath = path.join(__dirname,"../client-phone",req.url);
    if(fs.existsSync(filePath)){
      return fs.createReadStream(filePath).pipe(res);
    }
  }
  res.end("Party Board Server Running");
});

/* ================= WS ================= */
const wss = new WebSocket.Server({ server });

let players = {};
let turnOrder = [];
let currentTurn = 0;
let gameState = "WAITING";

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

function broadcast(type,data){
  const msg=JSON.stringify({type,data});
  wss.clients.forEach(c=>{
    if(c.readyState===WebSocket.OPEN) c.send(msg);
  });
}

wss.on("connection",ws=>{
  ws.id=Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type:"INIT",
    data:{ players, gameState, turn:null, id:ws.id }
  }));

  ws.on("message",msg=>{
    const {type,data}=JSON.parse(msg);

    if(type==="JOIN" && gameState==="WAITING"){
      players[ws.id]={ pawn:data.pawn, pos:0 }; // ⬅️ ΕΚΤΟΣ ΤΑΜΠΛΟ
      broadcast("UPDATE",{ players, gameState, turn:null });
    }

    if(type==="START" && gameState==="WAITING"){
      turnOrder = Object.keys(players);
      shuffle(turnOrder);          // 🎲 ΤΥΧΑΙΑ ΣΕΙΡΑ
      currentTurn = 0;
      gameState = "PLAYING";

      broadcast("ORDER", { order: turnOrder });
      broadcast("UPDATE",{
        players,
        gameState,
        turn: turnOrder[currentTurn]
      });
    }

    if(type==="ROLL" && gameState==="PLAYING"){
      if(ws.id !== turnOrder[currentTurn]) return;

      const dice = Math.floor(Math.random()*6)+1;

      let p = players[ws.id];
      if(p.pos===0) p.pos=1; // ⬅️ ΜΠΑΙΝΕΙ ΣΤΟ ΤΑΜΠΛΟ
      else p.pos = Math.min(100, p.pos + dice);

      broadcast("DICE",{ id:ws.id, dice });

      currentTurn = (currentTurn+1)%turnOrder.length;

      broadcast("UPDATE",{
        players,
        gameState,
        turn: turnOrder[currentTurn]
      });
    }

    if(type==="RESET"){
      players={};
      turnOrder=[];
      currentTurn=0;
      gameState="WAITING";
      broadcast("UPDATE",{ players, gameState, turn:null });
    }
  });
});

server.listen(PORT,()=>{
  console.log("🟢 Party Board Server running");
});
