- var np = 3;
- var ng = 5;
- var n = ng\*np;

while n--
.poly

@import 'compass/css3';

$np: 3;
$data:
(ini: 50vw 50vh)
(ini: 75vw 25vh)
(ini: 25vw 75vh)
(ini: 5vw 39vh, dif: 80vw -47vh)
(ini: 85vw 73vh, dif: -65vw 7vh);
$ng: length($data);
$rc: 10em;
$t: 6s;

@function getPolyPoints(
$n: 3 /* number of poly vertices */, 
		$oa: -90deg /* angular offset of 1st poly vertex */, 
		$bw: 50% /* polygon border-width */) {
	
	$ba: 360deg/$n; // base angle corrensponding to 1 poly edge
$l0: (); // list of points, initially empty
	$l1: (); // list of points, initially empty
	
	@for $i from 0 through $n {
		$ca: $i*$ba + $oa; // angle current point is at wrt x axis
		$x: calc(50%*(1 + #{cos($ca)})); // x coord of current point
$y: calc(50%*(1 + #{sin($ca)})); // y coord of current point
$l0: $l0, $x $y; // add current point coords to points list
		$ca: -$i*$ba + $oa; // angle current point is at wrt x axis
		$x: calc(50% + (50% - #{$bw})*#{cos($ca)}); // x coord of current point
		$y: calc(50% + (50% - #{$bw})\*#{sin($ca)}); // y coord of current point
		$l1: $l1, $x $y // add current point coords to points list
	}
	
	@return join($l0, $l1, comma)
}

html {
overflow: hidden;
background: #000
}

body { filter: drop-shadow(0 0 15px #fff) }

.poly {
position: absolute;
color: HSL(var(--hue), 100%, 65%);
filter: drop-shadow(0 0 15px currentcolor);
mix-blend-mode: screen;
animation: pos $t linear infinite;
	
	&:before {
		display: block;
		margin: -$rc;
padding: $rc;
		border-radius: 50%;
		transform: scale(0);
		background: currentcolor;
		clip-path: var(--p0);
		animation: inherit;
		animation-name: poly;
		animation-timing-function: ease-out;
		content: ''
	}
	
	@for $i from 0 to $ng {
		$n: 3 + random(7);
		$oa: random(360)*1deg;
		$cd: nth($data, $i + 1);
		$ini: map-get($cd, ini);
$dif: if(map-has-key($cd, dif), map-get($cd, dif), 0 0);
		
		&:nth-child(n + #{$i*$np + 1}) {
			top: nth($ini, 2); left: nth($ini, 1);
			--x: nth($dif, 1);
--y: nth($dif, 2);
			--hue: #{random(360)};
			--p0: polygon(getPolyPoints($n, $oa));
			--p1: polygon(getPolyPoints($n, $oa, 4px));
		}
	}
	
	@for $i from 0 to $np {
		&:nth-child(#{$np}n + #{$i + 1}) { animation-delay: -$i*$t/$np }
}
}

@keyframes pos { to { transform: translate(var(--x), var(--y)) rotate(270deg) } }

@keyframes poly {
25% {
opacity: .99;
clip-path: var(--p1)
}
75% { opacity: .99 }
to {
transform: scale(1);
opacity: 0;
clip-path: var(--p1)
}
}
