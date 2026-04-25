##html

<main class="main-container">
  <svg class="svg-container">
    <defs>
      <filter id="turbulent-displace" colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="1" />
        <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
          <animate attributeName="dy" values="700; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
        </feOffset>

        <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="1" />
        <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
          <animate attributeName="dy" values="0; -700" dur="6s" repeatCount="indefinite" calcMode="linear" />
        </feOffset>

        <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="2" />
        <feOffset in="noise1" dx="0" dy="0" result="offsetNoise3">
          <animate attributeName="dx" values="490; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
        </feOffset>

        <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="2" />
        <feOffset in="noise2" dx="0" dy="0" result="offsetNoise4">
          <animate attributeName="dx" values="0; -490" dur="6s" repeatCount="indefinite" calcMode="linear" />
        </feOffset>

        <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
        <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
        <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />

        <feDisplacementMap in="SourceGraphic" in2="combinedNoise" scale="30" xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </defs>

  </svg>

  <div class="card-container">
    <div class="inner-container">
      <div class="border-outer">
        <div class="main-card"></div>
      </div>
      <div class="glow-layer-1"></div>
      <div class="glow-layer-2"></div>
    </div>

    <div class="overlay-1"></div>
    <div class="overlay-2"></div>
    <div class="background-glow"></div>

    <div class="content-container">
      <div class="content-top">
        <div class="scrollbar-glass">
          Dramatic
        </div>
        <p class="title">Electric Border</p>
      </div>

      <hr class="divider" />

      <div class="content-bottom">
        <p class="description">In case you'd like to emphasize something very dramatically.</p>
      </div>
    </div>

  </div>
</main>

## css

/_ Reset and base styles _/

/_ CSS Variables _/
:root {
--electric-border-color: #dd8448;
--electric-light-color: oklch(from var(--electric-border-color) l c h);
--gradient-color: oklch(
from var(--electric-border-color) 0.3 calc(c / 2) h / 0.4
);
--color-neutral-900: oklch(0.185 0 0);
}

- {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  }

body {
font-family: system-ui, -apple-system, sans-serif;
background-color: oklch(0.145 0 0);
color: oklch(0.985 0 0);
height: 100vh;
overflow: hidden;
}

/_ Main container _/
.main-container {
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
height: 100vh;
}

/_ SVG positioning _/
.svg-container {
position: absolute;
}

/_ Card container _/
.card-container {
padding: 2px;
border-radius: 24px;
position: relative;
background: linear-gradient(
-30deg,
var(--gradient-color),
transparent,
var(--gradient-color)
),
linear-gradient(
to bottom,
var(--color-neutral-900),
var(--color-neutral-900)
);
}

/_ Inner container _/
.inner-container {
position: relative;
}

/_ Border layers _/
.border-outer {
border: 2px solid rgba(221, 132, 72, 0.5);
border-radius: 24px;
padding-right: 4px;
padding-bottom: 4px;
}

.main-card {
width: 350px;
height: 500px;
border-radius: 24px;
border: 2px solid var(--electric-border-color);
margin-top: -4px;
margin-left: -4px;
filter: url(#turbulent-displace);
}

/_ Glow effects _/
.glow-layer-1 {
border: 2px solid rgba(221, 132, 72, 0.6);
border-radius: 24px;
width: 100%;
height: 100%;
position: absolute;
top: 0;
left: 0;
right: 0;
bottom: 0;
filter: blur(1px);
}

.glow-layer-2 {
border: 2px solid var(--electric-light-color);
border-radius: 24px;
width: 100%;
height: 100%;
position: absolute;
top: 0;
left: 0;
right: 0;
bottom: 0;
filter: blur(4px);
}

/_ Overlay effects _/
.overlay-1 {
position: absolute;
width: 100%;
height: 100%;
top: 0;
left: 0;
right: 0;
bottom: 0;
border-radius: 24px;
opacity: 1;
mix-blend-mode: overlay;
transform: scale(1.1);
filter: blur(16px);
background: linear-gradient(
-30deg,
white,
transparent 30%,
transparent 70%,
white
);
}

.overlay-2 {
position: absolute;
width: 100%;
height: 100%;
top: 0;
left: 0;
right: 0;
bottom: 0;
border-radius: 24px;
opacity: 0.5;
mix-blend-mode: overlay;
transform: scale(1.1);
filter: blur(16px);
background: linear-gradient(
-30deg,
white,
transparent 30%,
transparent 70%,
white
);
}

/_ Background glow _/
.background-glow {
position: absolute;
width: 100%;
height: 100%;
top: 0;
left: 0;
right: 0;
bottom: 0;
border-radius: 24px;
filter: blur(32px);
transform: scale(1.1);
opacity: 0.3;
z-index: -1;
background: linear-gradient(
-30deg,
var(--electric-light-color),
transparent,
var(--electric-border-color)
);
}

/_ Content container _/
.content-container {
position: absolute;
top: 0;
left: 0;
right: 0;
bottom: 0;
width: 100%;
height: 100%;
display: flex;
flex-direction: column;
}

/_ Content sections _/
.content-top {
display: flex;
flex-direction: column;
padding: 48px;
padding-bottom: 16px;
height: 100%;
}

.content-bottom {
display: flex;
flex-direction: column;
padding: 48px;
padding-top: 16px;
}

/_ Scrollbar glass component _/
.scrollbar-glass {
background: radial-gradient(
47.2% 50% at 50.39% 88.37%,
rgba(255, 255, 255, 0.12) 0%,
rgba(255, 255, 255, 0) 100%
),
rgba(255, 255, 255, 0.04);
position: relative;
transition: background 0.3s ease;
border-radius: 14px;
width: fit-content;
height: fit-content;
padding: 8px 16px;
text-transform: uppercase;
font-weight: bold;
font-size: 14px;
color: rgba(255, 255, 255, 0.8);
}

.scrollbar-glass:hover {
background: radial-gradient(
47.2% 50% at 50.39% 88.37%,
rgba(255, 255, 255, 0.12) 0%,
rgba(255, 255, 255, 0) 100%
),
rgba(255, 255, 255, 0.08);
}

.scrollbar-glass::before {
content: "";
position: absolute;
top: 0;
left: 0;
right: 0;
bottom: 0;
padding: 1px;
background: linear-gradient(
150deg,
rgba(255, 255, 255, 0.48) 16.73%,
rgba(255, 255, 255, 0.08) 30.2%,
rgba(255, 255, 255, 0.08) 68.2%,
rgba(255, 255, 255, 0.6) 81.89%
);
border-radius: inherit;
mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
mask-composite: xor;
-webkit-mask-composite: xor;
pointer-events: none;
}

/_ Typography _/
.title {
font-size: 36px;
font-weight: 500;
margin-top: auto;
}

.description {
opacity: 0.5;
}

/_ Divider _/
.divider {
margin-top: auto;
border: none;
height: 1px;
background-color: currentColor;
opacity: 0.1;
mask-image: linear-gradient(to right, transparent, black, transparent);
-webkit-mask-image: linear-gradient(
to right,
transparent,
black,
transparent
);
}

##요구사항.

위에 적힌 css,html은 electric border 작품이야.
이 작품에 쓰인 주황,노랑색 번개 이펙트를 내 프로젝트에 사용하고 싶어.

구체적으로는 인게임에서 벽력일섬 스킬 버튼을 눌러서 발동 예약을 활성화 하면, 자신의 말 border? outline에 이 번개 이펙트를 적용하는 거야.

벽력일섬의 번개 색은 자줏빛, 보라색이므로, 이에 맞게 어울리는 번개색으로 바꿔줘.

그리고 말이 움직이는 시간이 되어서 말이 벽력일섬 스킬을 사용하여 순식간에 돌진이동을 하면, 이동한 경로 선에도 이 번개 이펙트를 적용해줘.

이번 수정의 목적은 벽력일섬 스킬의 시각적이펙트 퀄리티 향상이야.
