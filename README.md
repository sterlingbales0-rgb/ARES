# Cachy Chat

Plain HTML/CSS/JS chat for OpenRouter. No build step.

## Host on GitHub Pages
1. Put `index.html`, `style.css` and `app.js` at the root of your repo (delete the old Next.js files).
2. Repo Settings > Pages > Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open the URL GitHub shows. Visitors paste their own OpenRouter key in Settings.

Keys are stored in each visitor's browser (localStorage) and sent only to openrouter.ai.
Shortcuts: Ctrl/Cmd+K new chat, Enter send, Shift+Enter newline, Esc stop.
