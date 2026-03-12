.atom
.nucleus
.electron
.electron
.electron

html,body {
width:100%;
height:100%;
position:relative;
overflow:hidden;
}

.atom {
position:absolute;
left:50%;
top:50%;
border:2px solid #ccc;
border-radius:50%;
height:300px;
width:300px;
transform-style:preserve-3d;
perspective:1000px;
transform:translate(-50%, -50%);
}

.electron {
position:absolute;
left:50%;
top:50%;

border:1px solid #ccc;
border-radius:50%;
height:300px;
width:300px;
transform-style:preserve-3d;
transform:translate(-50%, -50%) rotateY(40deg) rotate(0deg);
animation:orbit 6s infinite linear;
transform-origin:50% 50%;
z-index:0;

&:before {
content:"";
width:20%;
height:0;
padding-bottom:20%;
background-color:blue;
transform-origin:50% 50%;
position:absolute;
border-radius:50%;
top:0;
left:50%;
animation:rotateWithOrbit 6s infinite linear;

    //background-image:radial-gradient(circle at top left, #94ffaf, darken(#94ffaf, 25%) 75%);

}
}

.electron:nth-of-type(2) {
animation:orbit2 6s infinite linear;
&:before{
animation:rotateWithOrbit2 6s infinite linear;
}
}

.electron:nth-of-type(3) {
animation:orbit3 6s infinite linear;
&:before{
animation:rotateWithOrbit3 6s infinite linear;
}
}

.nucleus {
content:"";
width:40%;
height:0;
padding-bottom:40%;
transform:translate(-50%, -50%);
background-color:red;
transform-origin:50% 50%;
position:absolute;
border-radius:50%;
border:1px solid green;
top:50%;
left:50%;
//animation:rotateWithOrbit 6s infinite linear;

    background-image:radial-gradient(circle at top left, red, darken(red, 15%) 75%);

}

@keyframes orbit {
0% {
transform:translate(-50%, -50%) rotateY(60deg) rotateX(-30deg) rotate(0deg) ;}

100% {
transform:translate(-50%, -50%) rotateY(60deg) rotateX(-30deg) rotate(360deg) ;
}
}

//orbit is rotated 40deg, so rotate ball -40deg to keep it inline
@keyframes rotateWithOrbit {
0% {transform:translate(-50%, -50%) rotateZ(0deg) rotateX(30deg) rotateY(-40deg) scale(.80);}
25% {transform:translate(-50%, -50%) rotateZ(-90deg) rotateX(30deg) rotateY(-40deg) scale(.60);}
50% {transform:translate(-50%, -50%) rotateZ(-180deg) rotateX(30deg) rotateY(-40deg) scale(.80);}
75% {transform:translate(-50%, -50%) rotateZ(-270deg) rotateX(30deg) rotateY(-40deg) scale(1);}
100% {transform:translate(-50%, -50%) rotateZ(-360deg) rotateX(30deg) rotateY(-40deg) scale(.80);}
}

@keyframes orbit2 {
0% {
transform:translate(-50%, -50%) rotateY(60deg) rotateX(30deg) rotate(180deg) ;}

100% {
transform:translate(-50%, -50%) rotateY(60deg) rotateX(30deg) rotate(540deg) ;
}
}

//orbit is rotated 40deg, so rotate ball -40deg to keep it inline
@keyframes rotateWithOrbit2 {
0% {transform:translate(-50%, -50%) rotateZ(-180deg) rotateX(-30deg) rotateY(-40deg) scale(.80);}
25% {transform:translate(-50%, -50%) rotateZ(-270deg) rotateX(-30deg) rotateY(-40deg) scale(1);}
50% {transform:translate(-50%, -50%) rotateZ(-360deg) rotateX(-30deg) rotateY(-40deg) scale(.80);}
75% {transform:translate(-50%, -50%) rotateZ(-450deg) rotateX(-30deg) rotateY(-40deg) scale(.60);}
100% {transform:translate(-50%, -50%) rotateZ(-540deg) rotateX(-30deg) rotateY(-40deg) scale(.80);}
}

@keyframes orbit3 {
0% {
transform:translate(-50%, -50%) rotateY(0deg) rotateX(75deg) rotate(180deg) ;}

100% {
transform:translate(-50%, -50%) rotateY(0deg) rotateX(75deg) rotate(540deg) ;
}
}

//orbit is rotated 40deg, so rotate ball -40deg to keep it inline
@keyframes rotateWithOrbit3 {
0% {transform:translate(-50%, -50%) rotateZ(-180deg) rotateX(-80deg) rotateY(0deg) scale(1);}
25% {transform:translate(-50%, -50%) rotateZ(-270deg) rotateX(-80deg) rotateY(0deg) scale(.8);}
50% {transform:translate(-50%, -50%) rotateZ(-360deg) rotateX(-80deg) rotateY(0deg) scale(.60);}
75% {transform:translate(-50%, -50%) rotateZ(-450deg) rotateX(-80deg) rotateY(0deg) scale(.80);}
100% {transform:translate(-50%, -50%) rotateZ(-540deg) rotateX(-80deg) rotateY(0deg) scale(1);}
}
