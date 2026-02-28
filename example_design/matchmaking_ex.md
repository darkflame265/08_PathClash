<!DOCTYPE html>
<html class="light" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Random Matchmaking - Searching State</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<script>
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        primary: "#3f4e61", // Muted slate blue for the cancel button
                        "background-light": "#f2e9d5", // Light beige from the screenshot background
                        "background-dark": "#1a1a1a",
                        "card-light": "#ffffff",
                        "card-dark": "#2d2d2d",
                        "accent-green": "#3d633d", // The green from the join button
                    },
                    fontFamily: {
                        display: ["Inter", "sans-serif"],
                    },
                    borderRadius: {
                        DEFAULT: "1.5rem",
                    },
                    animation: {
                        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }
                },
            },
        };
    </script>
<style>
        body {
            font-family: 'Inter', sans-serif;
        }
        @keyframes pulse-custom {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.1); }
        }
        .animate-pulse-dot {
            animation: pulse-custom 1.5s ease-in-out infinite;
        }
    </style>
</head>
<body class="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center p-6 transition-colors duration-300">
<div class="w-full max-w-xl bg-card-light dark:bg-card-dark rounded-[2rem] shadow-sm p-10 transition-colors duration-300">
<div class="flex items-center gap-4 mb-8">
<div class="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full">
<span class="text-gray-600 dark:text-gray-400 font-bold text-lg">3</span>
</div>
<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Random Matchmaking</h1>
</div>
<div class="flex flex-col items-center justify-center mb-10 py-4">
<div class="flex items-center gap-3">
<div class="relative flex h-3 w-3">
<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
<span class="relative inline-flex rounded-full h-3 w-3 bg-green-600 animate-pulse-dot"></span>
</div>
<p class="text-lg font-medium text-gray-500 dark:text-gray-400">Searching for an opponent...</p>
</div>
<p class="mt-2 text-sm text-gray-400 dark:text-gray-500">Estimated wait: 0:15</p>
</div>
<button class="w-full bg-primary hover:bg-[#344151] text-white py-6 px-8 rounded-2xl font-bold text-xl transition-all active:scale-[0.98] shadow-md">
            Cancel Matchmaking
        </button>
</div>
<div class="fixed bottom-4 right-4">
<button class="p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white" onclick="document.documentElement.classList.toggle('dark')">
<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" stroke-linecap="round" stroke-linejoin="round"></path>
</svg>
</button>
</div>

</body></html>
