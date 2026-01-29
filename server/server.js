<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<title>Party Player</title>

<style>
body{
  margin:0;
  background:#2F6364;
  color:white;
  font-family:Arial;
  height:100vh;
  display:flex;
  flex-direction:column;
  justify-content:center;
  align-items:center;
}

h2{ font-size:40px; margin-bottom:28px; }

.grid{
  display:grid;
  grid-template-columns:repeat(3,180px);
  gap:30px;
}

.pawn{
  background:#1f4041;
  border-radius:32px;
  padding:18px;
}

.pawn.selected{ background:#ff006e; }
.pawn.disabled{ opacity:0.3; pointer-events:none; }

.pawn img{
  width:140px;
  height:140px;
  object-fit:contain;
}

button{
  margin-top:36px;
  padding:26px 56px;
  font-size:32px;
  border:none;
  border-radius:26px;
  background:#ffbe0b;
  font-weight:bold;
}

#diceResult{
  margin-top:24px;
  font-size:48px;
}
</style>
</head>

<body>

<h2 id="title">Διάλεξε πιόνι</h2>
<div class="grid" id="grid"></div>
<div id="diceResult"></div>
<button id="action">ΕΤΟΙΜΟΣ</button>

<script>
const PAWNS = Array.from({length:10},(_,i)=>({
  id:`avatar_${i+1}`,
  img:`/assets/pawns/avatar_${i+1}.png`
}));

const ws = new WebSocket(
 (location.protocol==="https:"?"wss://":"ws://")+location.host
);

const grid=document.getElementById("grid");
const btn=document.getElementById("action");
const title=document.getElementById("title");
const dice=document.getElementById("diceResult");

let players={},selected=null,myTurn=false,gameState="WAITING";

ws.onmessage=e=>{
 const {type,data}=JSON.parse(e.data);
 if(type==="INIT"){ players=data.players; render(); }
 if(type==="UPDATE"){
   players=data.players;
   gameState=data.gameState;
   myTurn=data.turn && players[data.turn]?.pawn===selected;
 }
 if(type==="DICE"){
   if(players[data.id]?.pawn===selected)
     dice.textContent="🎲 "+data.dice;
 }
};

function render(){
 grid.innerHTML="";
 PAWNS.forEach(p=>{
   const used=Object.values(players).some(pl=>pl.pawn===p.id);
   const d=document.createElement("div");
   d.className="pawn"+(selected===p.id?" selected":"")+(used?" disabled":"");
   const img=document.createElement("img");
   img.src=p.img;
   d.onclick=()=>{ selected=p.id; render(); };
   d.appendChild(img);
   grid.appendChild(d);
 });
}

btn.onclick=()=>{
 if(gameState==="WAITING" && selected)
   ws.send(JSON.stringify({type:"JOIN",data:{pawn:selected}}));
 else if(myTurn)
   ws.send(JSON.stringify({type:"ROLL"}));
};
</script>

</body>
</html>
