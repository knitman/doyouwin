const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const WIN_POINTS = 25;
const ROUND_DELAY = 10;
const BONUS_TILES = 25;

/* ================= HTTP ================= */
const server = http.createServer((req,res)=>{
  if(req.url==="/tv") return fs.createReadStream(path.join(__dirname,"../client-tv/index.html")).pipe(res);
  if(req.url==="/phone") return fs.createReadStream(path.join(__dirname,"../client-phone/index.html")).pipe(res);
  if(req.url.startsWith("/assets/")){
    const f=path.join(__dirname,"../client-phone",req.url);
    if(fs.existsSync(f)) return fs.createReadStream(f).pipe(res);
  }
  res.end("Party Board Server Running");
});

/* ================= WS ================= */
const wss=new WebSocket.Server({server});

let players={}, scores={}, turnOrder=[], currentTurn=0;
let gameState="WAITING";
let bonusTiles=new Set();
let roundHistory=[];

/* ===== BONUS ROLL ===== */
function rollBonus(){
  const pool=[
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
  return pool[Math.floor(Math.random()*pool.length)];
}

function genBonusTiles(){
  bonusTiles.clear();
  while(bonusTiles.size<BONUS_TILES){
    bonusTiles.add(Math.floor(Math.random()*98)+2);
  }
}

function broadcast(type,data){
  const msg=JSON.stringify({type,data});
  wss.clients.forEach(c=>c.readyState===1&&c.send(msg));
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
}

function resetRound(){
  Object.values(players).forEach(p=>p.pos=0);
  genBonusTiles();
  roundHistory=[];
}

function resetAll(){
  players={}; scores={}; turnOrder=[];
  currentTurn=0; gameState="WAITING";
  bonusTiles.clear(); roundHistory=[];
}

/* ================= CONNECTION ================= */
wss.on("connection",ws=>{
  ws.id=Math.random().toString(36).slice(2);

  ws.send(JSON.stringify({
    type:"INIT",
    data:{players,scores,gameState,turn:null,id:ws.id}
  }));

  ws.on("message",msg=>{
    const {type,data}=JSON.parse(msg);

    if(type==="JOIN" && gameState==="WAITING"){
      players[ws.id]={pawn:data.pawn,pos:0};
      scores[ws.id]??=0;
      broadcast("UPDATE",{players,scores,gameState,turn:null});
    }

    if(type==="START" && gameState==="WAITING"){
      turnOrder=Object.keys(players);
      shuffle(turnOrder);
      currentTurn=0;
      gameState="PLAYING";
      genBonusTiles();
      broadcast("ORDER",{order:turnOrder});
      broadcast("UPDATE",{players,scores,gameState,turn:turnOrder[0]});
    }

    if(type==="ROLL" && gameState==="PLAYING"){
      if(ws.id!==turnOrder[currentTurn]) return;

      const dice=Math.floor(Math.random()*6)+1;
      const p=players[ws.id];
      p.pos=p.pos===0?1:Math.min(100,p.pos+dice);

      broadcast("DICE",{id:ws.id,dice});

      if(bonusTiles.has(p.pos)){
        const bonus=rollBonus();
        scores[ws.id]+=bonus;
        bonusTiles.delete(p.pos);
        roundHistory.push({id:ws.id,bonus});
        broadcast("BONUS",{id:ws.id,bonus,scores});
      }

      if(p.pos>=100){
        gameState="ROUND_END";
        broadcast("ROUND_HISTORY",{history:roundHistory});

        const winner=Object.entries(scores).find(([_,s])=>s>=WIN_POINTS);
        if(winner){
          gameState="TOURNAMENT_END";
          broadcast("TOURNAMENT_WINNER",{id:winner[0],scores});
          return;
        }

        let t=ROUND_DELAY;
        broadcast("ROUND_COUNTDOWN",{seconds:t});
        const timer=setInterval(()=>{
          t--;
          broadcast("ROUND_COUNTDOWN",{seconds:t});
          if(t<=0){
            clearInterval(timer);
            resetRound();
            gameState="WAITING";
            broadcast("UPDATE",{players,scores,gameState,turn:null});
          }
        },1000);
        return;
      }

      currentTurn=(currentTurn+1)%turnOrder.length;
      broadcast("UPDATE",{players,scores,gameState,turn:turnOrder[currentTurn]});
    }

    if(type==="RESET"){
      resetAll();
      broadcast("UPDATE",{players,scores,gameState,turn:null});
    }
  });
});

server.listen(PORT,()=>console.log("🟢 Party Board Server running"));
