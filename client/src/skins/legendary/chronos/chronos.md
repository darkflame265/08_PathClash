/_ ═══════════════════════════════════════════════
C. 천문 크로노스 원본
═══════════════════════════════════════════════ _/
.piece-astro {
position:relative; width:88px; height:88px; border-radius:50%;
background:radial-gradient(circle at 38% 32%,#f1f5f9 0%,#cbd5e1 35%,#475569 70%,#0f1923 100%);
border:2px solid rgba(203,213,225,0.85);
box-shadow:0 0 18px rgba(203,213,225,.4),0 0 40px rgba(148,163,184,.22),inset 0 0 12px rgba(255,255,255,.12);
animation:astro-pulse 2s ease-in-out infinite;
}
.astro-core { position:absolute; inset:24px; border-radius:50%; background:radial-gradient(circle at 35% 30%,#fde68a 0%,#f59e0b 40%,#78350f 80%,transparent 100%); opacity:.7; animation:astro-core-anim 2s ease-in-out infinite; }
.astro-ri { position:absolute; inset:-16px; border-radius:50%; border:1.5px solid rgba(251,191,36,.5); animation:spin-cw 12s linear infinite; }
.astro-ti { position:absolute; left:50%; top:0; width:2px; height:6px; margin-left:-1px; background:rgba(251,191,36,.8); border-radius:1px; transform-origin:1px 59px; }
.astro-rm { position:absolute; inset:-32px; border-radius:50%; border:1.5px solid rgba(203,213,225,.45); animation:spin-ccw 20s linear infinite; }
.astro-tm { position:absolute; left:50%; top:0; width:2px; height:7px; margin-left:-1px; background:rgba(203,213,225,.65); border-radius:1px; transform-origin:1px 75px; }
.astro-ro { position:absolute; inset:-50px; border-radius:50%; border:1px solid rgba(251,191,36,.25); animation:spin-cw 35s linear infinite; }
.astro-to { position:absolute; left:50%; top:0; width:1.5px; height:8px; margin-left:-.75px; background:rgba(251,191,36,.5); border-radius:1px; transform-origin:.75px 93px; }
.astro-h-hr { width:2.5px; height:19px; margin-left:-1.25px; background:linear-gradient(to top,#fde68a,#e2e8f0); animation:hand-hr 3600s linear infinite; }
.astro-h-min { width:2px; height:27px; margin-left:-1px; background:linear-gradient(to top,#cbd5e1,#fff); animation:hand-min 60s linear infinite; }
.astro-h-sec { width:1px; height:32px; margin-left:-.5px; background:#fbbf24; box-shadow:0 0 3px rgba(251,191,36,.9); animation:hand-sec 3s linear infinite; }
.astro-pivot-el { width:7px; height:7px; background:radial-gradient(circle,#fde68a,#d97706); box-shadow:0 0 8px rgba(251,191,36,.9); }
.astro-ob { width:9px; height:9px; margin:-4.5px; background:radial-gradient(circle at 30% 30%,#fde68a,#d97706); box-shadow:0 0 6px rgba(251,191,36,.8); }
.ao1 { animation:astro-om 7s linear infinite 0s; }
.ao2 { animation:astro-om 7s linear infinite -1.75s; }
.ao3 { animation:astro-om 7s linear infinite -3.5s; }
.ao4 { animation:astro-om 7s linear infinite -5.25s; }
.astro-st { width:6px; height:6px; margin:-3px; background:#e2e8f0; box-shadow:0 0 5px rgba(226,232,240,.9); }
.as1 { animation:astro-os 14s linear infinite 0s; }
.as2 { animation:astro-os 14s linear infinite -4.67s; }
.as3 { animation:astro-os 14s linear infinite -9.33s; }
@keyframes astro-pulse { 0%,100%{box-shadow:0 0 18px rgba(203,213,225,.4),0 0 40px rgba(148,163,184,.22),inset 0 0 12px rgba(255,255,255,.12);} 50%{box-shadow:0 0 28px rgba(226,232,240,.6),0 0 60px rgba(203,213,225,.35),inset 0 0 18px rgba(255,255,255,.2);} }
@keyframes astro-core-anim{ 0%,100%{opacity:.6;transform:scale(.95);} 50%{opacity:.9;transform:scale(1.05);} }
@keyframes astro-om { from{transform:rotate(0deg) translateX(49px);} to{transform:rotate(360deg) translateX(49px);} }
@keyframes astro-os { from{transform:rotate(0deg) translateX(70px);} to{transform:rotate(-360deg) translateX(70px);} }

/_ ── 카드 공통 ── _/
.card-label { font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; margin-bottom:8px; }
.card h3 { font-size:20px; font-weight:800; margin-bottom:6px; }
.card-sub { font-size:12px; color:#889aab; margin-bottom:16px; line-height:1.55; }
.card-tags { display:flex; flex-wrap:wrap; gap:6px; }
.tag { font-size:11px; padding:3px 10px; border-radius:20px; font-weight:600; letter-spacing:.06em; }

.card-a { border-color:rgba(165,243,252,.25); }
.card-a .badge { background:rgba(165,243,252,.12); color:#a5f3fc; border:1px solid rgba(165,243,252,.3); }
.card-a .card-label { color:#a5f3fc; }
.card-a h3 { background:linear-gradient(90deg,#ff79c6,#a5f3fc,#86efac); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.card-a .tag { background:rgba(165,243,252,.1); color:#a5f3fc; border:1px solid rgba(165,243,252,.25); }

.card-b { border-color:rgba(249,115,22,.28); }
.card-b .badge { background:rgba(249,115,22,.14); color:#fb923c; border:1px solid rgba(249,115,22,.35); }
.card-b .card-label { color:#fb923c; }
.card-b h3 { color:#fed7aa; }
.card-b .tag { background:rgba(249,115,22,.1); color:#fb923c; border:1px solid rgba(249,115,22,.28); }

.card-c { border-color:rgba(203,213,225,.25); }
.card-c .badge { background:rgba(203,213,225,.1); color:#cbd5e1; border:1px solid rgba(203,213,225,.3); }
.card-c .card-label { color:#cbd5e1; }
.card-c h3 { color:#f1f5f9; }
.card-c .tag { background:rgba(203,213,225,.1); color:#cbd5e1; border:1px solid rgba(203,213,225,.25); }

.selected-bar {
position:fixed; bottom:0; left:0; right:0; padding:14px 24px;
background:rgba(13,17,23,.95); border-top:1px solid rgba(255,255,255,.08);
text-align:center; font-size:14px; color:#8899aa; backdrop-filter:blur(8px); display:none;
}
.selected-bar.show { display:block; }
.selected-bar span { color:#a5f3fc; font-weight:700; }
</style>

</head>
<body>

<!-- C. 천문 크로노스 원본 -->
  <div class="card card-c" onclick="sel(this,'C')">
    <div class="badge">C — 원본</div>
    <div class="stage">
      <div class="piece-astro">
        <div class="astro-core"></div>
        <div class="astro-ri">
          <div class="astro-ti" style="transform:rotate(0deg)"></div>
          <div class="astro-ti" style="transform:rotate(45deg)"></div>
          <div class="astro-ti" style="transform:rotate(90deg)"></div>
          <div class="astro-ti" style="transform:rotate(135deg)"></div>
          <div class="astro-ti" style="transform:rotate(180deg)"></div>
          <div class="astro-ti" style="transform:rotate(225deg)"></div>
          <div class="astro-ti" style="transform:rotate(270deg)"></div>
          <div class="astro-ti" style="transform:rotate(315deg)"></div>
        </div>
        <div class="astro-rm">
          <div class="astro-tm" style="transform:rotate(0deg)"></div>
          <div class="astro-tm" style="transform:rotate(30deg)"></div>
          <div class="astro-tm" style="transform:rotate(60deg)"></div>
          <div class="astro-tm" style="transform:rotate(90deg)"></div>
          <div class="astro-tm" style="transform:rotate(120deg)"></div>
          <div class="astro-tm" style="transform:rotate(150deg)"></div>
          <div class="astro-tm" style="transform:rotate(180deg)"></div>
          <div class="astro-tm" style="transform:rotate(210deg)"></div>
          <div class="astro-tm" style="transform:rotate(240deg)"></div>
          <div class="astro-tm" style="transform:rotate(270deg)"></div>
          <div class="astro-tm" style="transform:rotate(300deg)"></div>
          <div class="astro-tm" style="transform:rotate(330deg)"></div>
        </div>
        <div class="astro-ro">
          <div class="astro-to" style="transform:rotate(0deg)"></div>
          <div class="astro-to" style="transform:rotate(22.5deg)"></div>
          <div class="astro-to" style="transform:rotate(45deg)"></div>
          <div class="astro-to" style="transform:rotate(67.5deg)"></div>
          <div class="astro-to" style="transform:rotate(90deg)"></div>
          <div class="astro-to" style="transform:rotate(112.5deg)"></div>
          <div class="astro-to" style="transform:rotate(135deg)"></div>
          <div class="astro-to" style="transform:rotate(157.5deg)"></div>
          <div class="astro-to" style="transform:rotate(180deg)"></div>
          <div class="astro-to" style="transform:rotate(202.5deg)"></div>
          <div class="astro-to" style="transform:rotate(225deg)"></div>
          <div class="astro-to" style="transform:rotate(247.5deg)"></div>
          <div class="astro-to" style="transform:rotate(270deg)"></div>
          <div class="astro-to" style="transform:rotate(292.5deg)"></div>
          <div class="astro-to" style="transform:rotate(315deg)"></div>
          <div class="astro-to" style="transform:rotate(337.5deg)"></div>
        </div>
        <div class="cw-hand astro-h-hr"></div>
        <div class="cw-hand astro-h-min"></div>
        <div class="cw-hand astro-h-sec"></div>
        <div class="pivot astro-pivot-el" style="width:7px;height:7px;border-radius:50%;background:radial-gradient(circle,#fde68a,#d97706);box-shadow:0 0 8px rgba(251,191,36,.9);"></div>
        <div class="orb astro-ob ao1"></div>
        <div class="orb astro-ob ao2"></div>
        <div class="orb astro-ob ao3"></div>
        <div class="orb astro-ob ao4"></div>
        <div class="orb astro-st as1"></div>
        <div class="orb astro-st as2"></div>
        <div class="orb astro-st as3"></div>
      </div>
    </div>
