<!DOCTYPE html>
<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Refined Dark Mode Game Board</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
<script>
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        primary: "#EF4444", // Red for Attack/Primary actions
                        "background-light": "#F3F4F6",
                        "background-dark": "#12181B", // Darkest background
                        "panel-dark": "#1E252B",      // Main panels
                        "tile-dark": "#2A3137",       // Tiles/Cards
                        "tile-border": "#3A444D",     // Subtle border
                        "tile-hover": "#333C44",      // Hover state
                        "text-muted": "#9AA4AE",      // Muted text
                    },
                    fontFamily: {
                        display: ["Inter", "sans-serif"],
                        mono: ["JetBrains Mono", "monospace"],
                    },
                    borderRadius: {
                        DEFAULT: "0.5rem",
                    },
                },
            },
        };
    </script>
<style>
        body {
            font-family: 'Inter', sans-serif;
        }
        .path-line {
            stroke: #EF4444;
            stroke-width: 4;
            stroke-linecap: round;
            stroke-linejoin: round;
            opacity: 0.7;
        }
        .glow-red {
            box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
        }
    </style>
</head>
<body class="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen p-6 transition-colors duration-300">
<header class="max-w-7xl mx-auto mb-6">
<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
<div class="flex items-center gap-3">
<div class="bg-primary p-2 rounded-lg text-white shadow-lg">
<span class="material-icons-round text-2xl">videogame_asset</span>
</div>
<div>
<div class="flex items-center gap-3">
<h1 class="text-2xl font-bold tracking-tight">Match</h1>
<span class="text-xs font-mono text-text-muted bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded">5613a260-7806-4f5b-9b95-966ee3a90cc5</span>
</div>
<div class="text-xs uppercase tracking-wider text-text-muted mt-1 space-x-2">
<span>Status: <span class="text-emerald-500">active</span></span>
<span>|</span>
<span>Phase: <span class="text-amber-500">planning</span></span>
<span>|</span>
<span>Round: 1</span>
<span>|</span>
<span>Piece: <span class="text-primary font-bold">Red</span></span>
<span>|</span>
<span>Role: ATTACK</span>
<span>|</span>
<span>Max path points: 5</span>
</div>
</div>
</div>
<div class="flex items-center gap-3">
<button class="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    SFX Off
                </button>
<button class="px-4 py-2 text-sm font-medium bg-primary hover:bg-red-600 text-white rounded-lg shadow-lg shadow-red-500/20 transition-all">
                    Leave match
                </button>
</div>
</div>
<div class="mt-6 bg-panel-dark border border-slate-800 rounded-xl p-4">
<div class="flex justify-between items-center mb-2">
<span class="text-[10px] font-bold tracking-[0.2em] text-text-muted uppercase">Planning Phase</span>
<span class="text-[10px] font-mono text-emerald-500">TIMER: 0.6S</span>
</div>
<div class="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
<div class="h-full bg-emerald-500/60 w-1/4 rounded-full transition-all duration-500"></div>
</div>
</div>
</header>
<main class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
<section class="lg:col-span-8 bg-panel-dark rounded-2xl p-6 border border-slate-800 shadow-2xl relative overflow-hidden">
<div class="flex justify-between items-start mb-8">
<h2 class="text-xl font-bold">Board 5x5</h2>
<div class="flex items-center gap-6">
<div class="flex items-center gap-3">
<div class="text-right">
<p class="text-[10px] font-bold text-primary tracking-widest uppercase">KIHEEGOD</p>
<div class="flex gap-0.5 justify-end mt-0.5">
<span class="material-icons-round text-primary text-xs">favorite</span>
<span class="material-icons-round text-primary text-xs">favorite</span>
<span class="material-icons-round text-primary text-xs">favorite</span>
</div>
</div>
<div class="w-10 h-10 rounded-full border-2 border-primary flex items-center justify-center p-0.5">
<div class="w-full h-full rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
<div class="w-2.5 h-2.5 bg-primary rounded-full glow-red"></div>
</div>
</div>
</div>
<div class="h-8 w-px bg-slate-700"></div>
<div class="flex items-center gap-3">
<div class="w-10 h-10 rounded-full border-2 border-blue-500 flex items-center justify-center p-0.5">
<div class="w-full h-full rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
<div class="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
</div>
</div>
<div class="text-left">
<p class="text-[10px] font-bold text-blue-400 tracking-widest uppercase">AI BOT</p>
<div class="flex gap-0.5 mt-0.5">
<span class="material-icons-round text-primary text-xs">favorite</span>
<span class="material-icons-round text-primary text-xs">favorite</span>
<span class="material-icons-round text-primary text-xs">favorite</span>
</div>
</div>
</div>
</div>
</div>
<div class="flex flex-col md:flex-row gap-8 items-start">
<div class="grid grid-cols-5 gap-3 relative">
<svg class="absolute inset-0 pointer-events-none w-full h-full z-10" viewBox="0 0 355 355">
<path class="path-line" d="M177.5 71 L177.5 177.5 L284 177.5 L284 284" fill="none"></path>
</svg>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(0,0)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(0,1)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group relative overflow-hidden z-20">
<span class="text-[9px] font-mono text-text-muted">(0,2)</span>
<div class="absolute inset-0 flex items-center justify-center">
<div class="w-4 h-4 bg-orange-500 rounded-full shadow-[0_0_15px_#f97316]"></div>
</div>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(0,3)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(0,4)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(1,0)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(1,1)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group">
<span class="text-[9px] font-mono text-text-muted">(1,2)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group">
<span class="text-[9px] font-mono text-text-muted">(1,3)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group">
<span class="text-[9px] font-mono text-text-muted">(1,4)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(2,0)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center justify-center group">
<span class="text-[9px] font-mono text-blue-400 font-bold">(2,1)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center justify-center group">
<span class="text-[9px] font-mono text-blue-400 font-bold">(2,2)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center justify-center group">
<span class="text-[9px] font-mono text-blue-400 font-bold">(2,3)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group">
<span class="text-[9px] font-mono text-text-muted">(2,4)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(3,0)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(3,1)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(3,2)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(3,3)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group">
<span class="text-[9px] font-mono text-text-muted">(3,4)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(4,0)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(4,1)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors relative">
<div class="w-3.5 h-3.5 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></div>
<span class="text-[9px] font-mono text-text-muted mt-0.5">(4,2)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(4,3)</span>
</div>
<div class="w-16 h-16 rounded-lg bg-tile-dark border border-tile-border flex flex-col items-center justify-center group hover:bg-tile-hover transition-colors">
<span class="text-[9px] font-mono text-text-muted">(4,4)</span>
</div>
</div>
<div class="flex-1 space-y-4 w-full md:w-auto">
<div class="bg-tile-dark border border-tile-border rounded-2xl p-6 text-center shadow-lg">
<p class="text-[10px] font-bold tracking-[0.2em] text-text-muted uppercase mb-4">Your Role</p>
<div class="relative inline-block mb-4">
<div class="absolute inset-0 bg-primary/20 blur-2xl rounded-full"></div>
<div class="relative w-32 h-32 rounded-full border-[12px] border-primary/10 flex items-center justify-center">
<span class="material-icons-round text-primary text-6xl rotate-45" style="font-size: 4rem;">colorize</span>
</div>
</div>
<h3 class="text-3xl font-black text-primary tracking-tight">ATTACK</h3>
</div>
<div class="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-4">
<div class="flex justify-between items-end mb-2">
<span class="text-[10px] font-bold tracking-wider text-emerald-500/80 uppercase">Path Points</span>
<span class="text-xs font-mono font-bold text-emerald-500">0 / 5</span>
</div>
<div class="flex gap-1.5 h-2">
<div class="flex-1 rounded-full bg-emerald-500/30"></div>
<div class="flex-1 rounded-full bg-slate-800"></div>
<div class="flex-1 rounded-full bg-slate-800"></div>
<div class="flex-1 rounded-full bg-slate-800"></div>
<div class="flex-1 rounded-full bg-slate-800"></div>
</div>
</div>
</div>
</div>
</section>
<aside class="lg:col-span-4 bg-panel-dark border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden min-h-[500px]">
<div class="p-5 border-b border-slate-800 flex justify-between items-center">
<h3 class="font-bold text-lg">Match Chat</h3>
<span class="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1 uppercase tracking-wider">
<span class="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
                    Live
                </span>
</div>
<div class="flex-1 p-6 flex flex-col items-center justify-center text-center opacity-60">
<div class="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
<span class="material-icons-round text-slate-500">forum</span>
</div>
<p class="text-sm text-text-muted italic">No messages yet. Say hi to your opponent!</p>
</div>
<div class="p-4 bg-slate-900/50 border-t border-slate-800">
<div class="flex gap-2">
<div class="relative flex-1">
<input class="w-full bg-slate-800 border-slate-700 focus:ring-primary focus:border-primary text-sm rounded-lg py-2.5 px-4 placeholder-slate-500 transition-all" placeholder="Type a message..." type="text"/>
</div>
<button class="bg-slate-700 hover:bg-slate-600 text-white p-2.5 rounded-lg transition-all flex items-center justify-center">
<span class="material-icons-round text-sm">send</span>
</button>
</div>
</div>
</aside>
</main>
<footer class="max-w-7xl mx-auto mt-8 pb-12 flex justify-center opacity-30">
<div class="flex items-center gap-2">
<span class="material-icons-round text-lg">info</span>
<p class="text-xs uppercase tracking-[0.2em] font-medium">Refined Dark Mode Experience</p>
</div>
</footer>

</body></html>
