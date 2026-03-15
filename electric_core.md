<body>
<canvas id = "canvas1"></canvas>
<canvas id = "canvas2"></canvas>
</body>

body {
background:rgb(60, 60, 60);
margin: 0;
overflow: hidden;
}
canvas {
position:fixed;
top:0;
left:0;
}
#canvas2 {
filter:blur(8px);
background:rgba(0,0,0,0)
}

var lightning = []
var core = {x: window.innerWidth/2, y: window.innerHeight/2, r: 30}
var wallRadius = Math.min(window.innerWidth/2,window.innerHeight/2);
//can1 is the normal drawing canvas
//can2 is the canvas where the glowing effects are drawn.
var can1 = document.getElementById("canvas1");
var can2 = document.getElementById("canvas2");
can1.width = window.innerWidth;
can1.height = window.innerHeight;
can2.width = window.innerWidth;
can2.height = window.innerHeight;
var ctx = can1.getContext("2d");
var ctx2 = can2.getContext("2d");
var active = false;
var frameNo = 1;
function dis(x,y,x2,y2) {
var xl = x2 - x;
var yl = y2 - y;
return Math.sqrt(xl ** 2 + yl ** 2);
}
function randFrom(min,max) {
return (Math.random() * (max - min)) + min;
}
function map(val,min,max,min2,max2) {
var diff1 = max - min;
var diff2 = max2 - min2;
return diff2/diff1*val;
}
function randBet(c1,c2) {
var nArr = [c1,c2];
return nArr[randFrom(0,1)];
}
function light(ang, hue) {
//Object function that creates a lightning bolt with an direction and colour.
this.ang = ang
this.x = core.x + core.r
this.y = 0;
this.num = 8
//Moving points on the lightning bolt
this.points = []
for(j = 0; j < this.num; j++) {
this.points.push({x: core.r + (j/(this.num-1)) _ (wallRadius-core.r), y: 0})
}
this.drift = Math.random() _ (0.01+0.01) - 0.01
this.timer = 1
this.timerRate = 0.01
this.width = 3
this.fadeRate = Math.random() _ (0.2-0.09) + 0.09
this.angVel = 0.05
this.phase = 0
this.phaseDiff = Math.random() _ (1.9-1.5) + 1.5
var amp = 20;
this.draw = function() {
ctx.lineWidth = this.width*1.3
ctx.strokeStyle = "hsl(" + hue + ",100%,50%)"
ctx.save()
ctx.translate(core.x,core.y)
ctx.rotate(this.ang)
ctx.beginPath()
ctx.moveTo(this.points[0].x,this.points[0].y)
for(j = 0; j < this.num; j++) {
if(j == 0) continue;
ctx.lineTo(this.points[j].x,this.points[j].y)
}
ctx.stroke()
ctx.restore()
//Glow render
ctx2.lineWidth = this.width*3
ctx2.strokeStyle = "hsl(" + hue + ",100%,50%)"
ctx2.save()
ctx2.translate(core.x,core.y)
ctx2.rotate(this.ang)
ctx2.beginPath()
ctx2.moveTo(this.points[0].x,this.points[0].y)
for(j = 0; j < this.num; j++) {
if(j == 0) continue;
ctx2.lineTo(this.points[j].x,this.points[j].y)
}
ctx2.stroke()
ctx2.beginPath()
ctx2.arc(this.points[this.num-1].x,this.points[this.num-1].y,this.width*3 + Math.random()*10,0,2\*Math.PI)
ctx2.fill()

ctx2.restore()
}
this.upd = function() {
//Angle(direction), width and phase of the electricity is changes at random intervals to make the lightning look wild
this.ang += this.drift
this.width -= this.fadeRate
this.timer -= this.timerRate
if(this.width <= 0) {
this.ang = Math.random()*2*Math.PI
this.width = 3;
this.phaseDiff = Math.random() _ (1.9-1.5) + 1.5
this.fadeRate = Math.random()_ (0.2-0.09) + 0.09
this.timerRate = Math.random() _ (0.1-0.01) + 0.01
}
if(this.timer <= 0) {
this.phase = Math.random() _ 2 _ Math.PI
this.amp = Math.random()_(20-10) + 10
this.angVel = Math.random()_(0.07-0.03) + 0.03
this.timer = 1;
}
//The whole lightning bolt is essentially a random looking wave.
for(j = 0; j < this.num; j++) {
this.phase -= this.angVel
this.points[j].y = amp_(j-0)*(this.num-1-j)*0.1*Math.sin(this.phase + (j*this.phaseDiff))
}
}
}
var num = 6;
var hue = Math.random() * 360;
function gameMake() {
for(i = 0; i < num; i++) {
lightning.push(new light(Math.random()*2*Math.PI, hue))
}
}
function gameMove() {
requestAnimationFrame(gameMove)
ctx.clearRect(0,0,can1.width,can1.height);
ctx2.clearRect(0,0,can1.width,can1.height);
for(i = 0; i < num; i++) {
if(Math.random() > 0.1) {
lightning[i].draw()
}
lightning[i].upd()
}
//Drawing Core
//Shell
ctx.lineWidth = Math.random()*(6-3) + 3
ctx2.lineWidth = ctx.lineWidth*2
ctx.fillStyle = "rgb(50,50,50)"
ctx.strokeStyle = "hsl(" + hue + ",100%,50%)"
ctx.beginPath()
ctx.arc(core.x,core.y,core.r,0,2*Math.PI)
ctx.fill()
ctx.stroke()
//Glowing shell
ctx2.strokeStyle = "hsl(" + hue + ",100%,50%)"
ctx2.beginPath()
ctx2.arc(core.x,core.y,core.r,0,2*Math.PI)
ctx2.stroke()
//Middle
ctx.fillStyle = "hsl(" + hue + ",100%,50%)"
ctx.beginPath()
ctx.arc(core.x,core.y,core.r/3,0,2*Math.PI)
ctx.fill()
ctx.stroke()
//Glowing middle
ctx2.fillStyle = "hsl(" + hue + ",100%,50%)"
ctx2.beginPath()
ctx2.arc(core.x,core.y,core.r/3,0,2\*Math.PI)
ctx2.fill()
ctx2.stroke()
//Drawing wall
var grd = ctx.createRadialGradient(core.x, core.y, wallRadius, core.x, core.y, wallRadius + 100);
grd.addColorStop(0, "rgba(0,0,0,0)");
grd.addColorStop(0.01, "rgb(40,40,40)");
grd.addColorStop(0.333, "rgb(40,40,40)");
grd.addColorStop(0.343, "rgb(20,20,20)");
grd.addColorStop(0.666, "rgb(20,20,20)");
grd.addColorStop(0.766, "rgb(0,0,0)");

ctx.fillStyle = grd
ctx.beginPath()
ctx.arc(core.x,core.y,Math.max(can1.width,can1.height),0,2\*Math.PI)
ctx.fill()
ctx.stroke()
}
gameMake();
gameMove();
