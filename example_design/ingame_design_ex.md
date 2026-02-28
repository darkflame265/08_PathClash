<!DOCTYPE html>
<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>1v1 TBS - Battle Arena</title>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Outfit:wght@500;700&amp;family=Material+Icons+Outlined&amp;display=swap" rel="stylesheet"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
<script>
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        primary: "#386641",
                        secondary: "#bc4749",
                        "background-light": "#F2E8CF",
                        "background-dark": "#1a1c1a",
                        "card-light": "#ffffff",
                        "card-dark": "#2a2d2a",
                    },
                    fontFamily: {
                        sans: ["Inter", "sans-serif"],
                        display: ["Outfit", "sans-serif"],
                    },
                    borderRadius: {
                        DEFAULT: "12px",
                    },
                },
            },
        };
    </script>
<style>
        body {
            font-family: 'Inter', sans-serif;
        }
        .board-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
        }
        .cell {
            aspect-ratio: 1 / 1;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }
    </style>
</head>
<body class="bg-background-light dark:bg-background-dark min-h-screen text-slate-800 dark:text-slate-200 transition-colors duration-300">
<header class="max-w-7xl mx-auto px-6 pt-8">
<div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
<div>
<h1 class="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
<span class="text-primary material-icons-outlined">sports_esports</span>
                    Match ID: <span class="font-mono text-lg font-medium opacity-60">70e2d73a...bd7e</span>
</h1>
<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-1 text-slate-500 dark:text-slate-400">
<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500"></span> Status: waiting</span>
<span>|</span>
<span>Phase: planning</span>
<span>|</span>
<span>Round: 1</span>
<span>|</span>
<span class="font-semibold text-secondary">Piece: Red</span>
</div>
</div>
<div class="flex items-center gap-3">
<button class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-card-light dark:bg-card-dark border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
<span class="material-icons-outlined text-lg">volume_up</span>
                    SFX
                </button>
<button class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-white hover:bg-red-700 transition-all shadow-sm">
<span class="material-icons-outlined text-lg">logout</span>
                    Leave Match
                </button>
</div>
</div>
<div class="bg-card-light dark:bg-card-dark p-4 rounded-xl shadow-sm border border-slate-200/50 dark:border-slate-700/50">
<div class="flex justify-between text-xs font-bold uppercase tracking-wider mb-2 text-slate-500">
<span>Planning Phase</span>
<span class="text-primary">timer: 0.0s</span>
</div>
<div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
<div class="bg-primary h-full w-2/3 transition-all duration-300"></div>
</div>
</div>
</header>
<main class="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
<div class="lg:col-span-8 space-y-6">
<div class="bg-card-light dark:bg-card-dark p-6 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50">
<div class="flex items-center justify-between mb-8">
<h2 class="font-display text-xl font-bold">Board 5x5</h2>
<div class="flex items-center gap-6">
<div class="flex items-center gap-3">
<div class="text-right">
<p class="text-[10px] font-bold uppercase text-secondary">Player Red</p>
<div class="flex gap-0.5 mt-0.5">
<span class="material-icons-outlined text-secondary text-lg">favorite</span>
<span class="material-icons-outlined text-secondary text-lg">favorite</span>
<span class="material-icons-outlined text-secondary text-lg">favorite</span>
</div>
</div>
<div class="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center border-2 border-secondary">
<span class="material-icons-outlined text-secondary">person</span>
</div>
</div>
<div class="h-8 w-[1px] bg-slate-200 dark:bg-slate-700"></div>
<div class="flex items-center gap-3">
<div class="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border-2 border-blue-500">
<span class="material-icons-outlined text-blue-500">person</span>
</div>
<div>
<p class="text-[10px] font-bold uppercase text-blue-500">Player Blue</p>
<div class="flex gap-0.5 mt-0.5">
<span class="material-icons-outlined text-blue-500 text-lg">favorite</span>
<span class="material-icons-outlined text-blue-500 text-lg">favorite</span>
<span class="material-icons-outlined text-blue-500 text-lg">favorite</span>
</div>
</div>
</div>
</div>
</div>
<div class="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
<div class="md:col-span-8">
<div class="board-grid">
<script>
                                const board = document.querySelector('.board-grid');
                                for (let r = 0; r < 5; r++) {
                                    for (let c = 0; c < 5; c++) {
                                        const cell = document.createElement('div');
                                        cell.className = 'cell bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg relative group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors';
                                        const coord = document.createElement('span');
                                        coord.className = 'absolute top-1 left-1 text-[8px] font-mono text-slate-400 pointer-events-none';
                                        coord.innerText = `(${r},${c})`;
                                        cell.appendChild(coord);
                                        if (r === 0 && c === 2) {
                                            const dot = document.createElement('div');
                                            dot.className = 'w-6 h-6 rounded-full bg-secondary shadow-[0_0_15px_rgba(188,71,73,0.6)] animate-pulse';
                                            cell.appendChild(dot);
                                        }
                                        if (r === 4 && c === 2) {
                                            const dot = document.createElement('div');
                                            dot.className = 'w-6 h-6 rounded-full bg-blue-500';
                                            cell.appendChild(dot);
                                        }
                                        board.appendChild(cell);
                                    }
                                }
                            </script>
</div>
</div>
<div class="md:col-span-4 space-y-4">
<div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center text-center">
<span class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Your Role</span>
<div class="w-20 h-20 rounded-full bg-secondary/5 border-4 border-secondary/20 flex items-center justify-center mb-4">
<span class="material-icons-outlined text-secondary text-5xl">swords</span>
</div>
<span class="font-display font-bold text-lg text-secondary uppercase tracking-widest">Attack</span>
</div>
<div class="bg-primary/5 p-4 rounded-xl border border-primary/20">
<div class="flex justify-between items-center mb-1">
<span class="text-xs font-semibold text-primary">Path Points</span>
<span class="text-xs font-bold text-primary">5 / 5</span>
</div>
<div class="flex gap-1">
<div class="h-2 flex-1 rounded-full bg-primary"></div>
<div class="h-2 flex-1 rounded-full bg-primary"></div>
<div class="h-2 flex-1 rounded-full bg-primary"></div>
<div class="h-2 flex-1 rounded-full bg-primary"></div>
<div class="h-2 flex-1 rounded-full bg-primary"></div>
</div>
</div>
</div>
</div>
</div>
</div>
<div class="lg:col-span-4 h-[600px] flex flex-col">
<div class="bg-card-light dark:bg-card-dark flex flex-col h-full rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 overflow-hidden">
<div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
<h3 class="font-display font-bold text-lg flex items-center gap-2">
<span class="material-icons-outlined text-primary">chat_bubble_outline</span>
                        Match Chat
                    </h3>
<span class="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-bold rounded-full uppercase">Live</span>
</div>
<div class="flex-1 overflow-y-auto p-4 space-y-4">
<div class="text-center py-10">
<div class="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
<span class="material-icons-outlined text-slate-400">forum</span>
</div>
<p class="text-slate-400 text-sm">No messages yet. Say hi to your opponent!</p>
</div>
</div>
<div class="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
<form class="flex gap-2" onsubmit="event.preventDefault()">
<input class="flex-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-primary focus:border-primary transition-all" placeholder="Type a message..." type="text"/>
<button class="bg-primary text-white p-2 rounded-lg hover:bg-opacity-90 transition-all flex items-center justify-center" type="submit">
<span class="material-icons-outlined">send</span>
</button>
</form>
</div>
</div>
</div>
</main>
<footer class="max-w-7xl mx-auto px-6 py-12 text-center text-slate-400 text-sm">
<p>© 2024 TBS Arena • Redesign Prototype</p>
</footer>
<button class="fixed bottom-6 right-6 w-12 h-12 bg-card-light dark:bg-card-dark border border-slate-200 dark:border-slate-700 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform" onclick="document.documentElement.classList.toggle('dark')">
<span class="material-icons-outlined dark:hidden">dark_mode</span>
<span class="material-icons-outlined hidden dark:block text-yellow-400">light_mode</span>
</button>

</body></html>
