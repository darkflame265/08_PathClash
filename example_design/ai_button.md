<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Play vs AI Lobby Card</title>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
<script>
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        primary: "#3d6446", // Dark green from the reference
                        "background-light": "#f0e6d2", // Sandy background from reference
                        "background-dark": "#1a1a1a",
                        "card-light": "#ffffff",
                        "card-dark": "#2d2d2d",
                        "accent-blue": "#2563eb",
                    },
                    fontFamily: {
                        display: ["Inter", "sans-serif"],
                    },
                    borderRadius: {
                        DEFAULT: "1.5rem",
                    },
                },
            },
        };
    </script>
<style>
        body {
            font-family: 'Inter', sans-serif;
        }
    </style>
</head>
<body class="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center p-6">
<div class="max-w-2xl w-full space-y-6">
<div class="bg-card-light dark:bg-card-dark rounded-[2rem] p-8 shadow-sm transition-all duration-300">
<div class="flex items-start gap-4 mb-6">
<div class="flex items-center justify-center w-10 h-10 rounded-full bg-[#e8f1ed] dark:bg-gray-700">
<span class="text-[#3d6446] dark:text-emerald-400 font-bold">4</span>
</div>
<div class="pt-1">
<h2 class="text-2xl font-bold text-[#0f172a] dark:text-white mb-4">Play vs AI</h2>
<div class="space-y-1">
<p class="text-sm text-slate-500 dark:text-slate-400">
                            Practice against an AI opponent.
                        </p>
<p class="text-sm text-slate-400 dark:text-slate-500">
                            Good for warm-up or learning the game.
                        </p>
</div>
</div>
</div>
<button class="w-full bg-primary hover:bg-[#34563c] text-white font-bold py-5 px-6 rounded-2xl transition-colors duration-200 text-xl tracking-wide flex items-center justify-center gap-2">
                Start AI Match
            </button>
</div>
<div class="fixed bottom-6 right-6">
<button class="p-3 rounded-full bg-white dark:bg-gray-800 shadow-lg text-gray-800 dark:text-white border border-gray-200 dark:border-gray-700" onclick="document.documentElement.classList.toggle('dark')">
<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
</svg>
</button>
</div>
</div>

</body></html>
