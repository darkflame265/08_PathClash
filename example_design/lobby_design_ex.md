<!DOCTYPE html>
<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>1v1 TBS Lobby Redesign</title>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0" rel="stylesheet"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
<script>
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        primary: "#386641",
                        "primary-hover": "#2a4d31",
                        "background-light": "#F2E8CF",
                        "background-dark": "#1a1c18",
                        "card-light": "#FFFFFF",
                        "card-dark": "#242822",
                    },
                    fontFamily: {
                        display: ["'Plus Jakarta Sans'", "sans-serif"],
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
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .glass-effect {
            backdrop-filter: blur(8px);
        }
    </style>
</head>
<body class="bg-background-light dark:bg-background-dark min-h-screen transition-colors duration-300">
<div class="fixed top-6 right-6 z-50">
<button class="p-3 rounded-full bg-card-light dark:bg-card-dark shadow-lg hover:shadow-xl transition-all border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300" onclick="document.documentElement.classList.toggle('dark')">
<span class="material-symbols-rounded block dark:hidden">dark_mode</span>
<span class="material-symbols-rounded hidden dark:block">light_mode</span>
</button>
</div>
<div class="max-w-3xl mx-auto px-6 py-16 md:py-24">
<header class="mb-12 text-center">
<h1 class="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white mb-4 tracking-tight">
                1v1 TBS Lobby
            </h1>
<p class="text-gray-600 dark:text-gray-400 text-lg">
                Sign in, then start a friend match or join random matchmaking.
            </p>
</header>
<div class="space-y-6">
<section class="bg-card-light dark:bg-card-dark p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md">
<div class="flex items-center gap-3 mb-6">
<span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">1</span>
<h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">Guest Profile</h2>
</div>
<div class="mb-4">
<p class="text-xs font-medium text-primary mb-2 flex items-center gap-2">
<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Signed in: d719d379-8903-4221-9338-b26757e76514
                    </p>
</div>
<div class="flex flex-col md:flex-row gap-3">
<div class="flex-grow">
<input class="w-full bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-primary focus:border-primary transition-all" placeholder="Enter nickname..." type="text" value="hahaha"/>
<p class="mt-2 text-xs text-gray-500 dark:text-gray-400 ml-1">Current nickname: <span class="font-semibold text-gray-700 dark:text-gray-200">hahaha</span></p>
</div>
<button class="bg-primary hover:bg-primary-hover text-white font-semibold px-8 py-3 rounded-xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98]">
                        Confirm
                    </button>
</div>
</section>
<section class="bg-card-light dark:bg-card-dark p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md">
<div class="flex items-center gap-3 mb-6">
<span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">2</span>
<h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">Friend Match</h2>
</div>
<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
<div class="space-y-3">
<p class="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">Start a new match</p>
<button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-4 rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 active:scale-[0.98]">
<span class="material-symbols-rounded text-xl">add_circle</span>
                            Create Room
                        </button>
</div>
<div class="space-y-3">
<p class="text-sm font-medium text-gray-500 dark:text-gray-400 ml-1">Enter invite code</p>
<div class="flex gap-2">
<input class="flex-grow bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500 transition-all uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal" placeholder="INVITE-CODE" type="text"/>
<button class="bg-gray-400 hover:bg-gray-500 dark:bg-gray-600 dark:hover:bg-gray-500 text-white font-semibold px-6 py-3 rounded-xl transition-all active:scale-[0.98]">
                                Join
                            </button>
</div>
</div>
</div>
</section>
<section class="bg-card-light dark:bg-card-dark p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md">
<div class="flex items-center gap-3 mb-6">
<span class="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">3</span>
<h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">Random Matchmaking</h2>
</div>
<div class="relative group">
<div class="absolute -inset-1 bg-gradient-to-r from-primary to-green-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
<button class="relative w-full bg-primary hover:bg-primary-hover text-white font-bold text-lg px-8 py-5 rounded-xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-[0.99]">
<span class="material-symbols-rounded">swords</span>
                        Join Matchmaking Queue
                    </button>
</div>
<div class="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
<div class="flex items-center gap-1.5">
<span class="material-symbols-rounded text-lg">group</span>
<span>42 Players Online</span>
</div>
<div class="flex items-center gap-1.5">
<span class="material-symbols-rounded text-lg">timer</span>
<span>Avg. wait: 12s</span>
</div>
</div>
</section>
</div>
<footer class="mt-12 text-center text-sm text-gray-500 dark:text-gray-500">
<p>Version 0.8.2-beta • Built for modern browsers</p>
</footer>
</div>
<div class="fixed top-0 left-0 w-full h-full -z-10 overflow-hidden pointer-events-none opacity-40 dark:opacity-20">
<div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]"></div>
<div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]"></div>
</div>

</body></html>
