# modest‑meitner – Betting Odds PWA

A full‑screen dark‑mode betting dashboard built with **Vite**, **TypeScript**, and **Tailwind v4**. It displays pre‑computed value bets and a demo 3‑leg parlay from a static `public/bets.json` file. No runtime API calls – the site can be hosted on any static‑file host (GitHub Pages, Netlify, Vercel, etc.).

## Features
- Dark‑mode UI with a custom teal accent and glass‑morphism cards.
- Responsive layout for desktop and mobile.
- Static data (`bets.json`) containing value‑bet details, odds, EV percentages and a sample parlay.
- Tailwind v4 powered by CSS‑variable theming (`src/index.css`).
- Zero backend – pure static site.

## Getting Started
```bash
# Clone the repo
git clone https://github.com/DylanGrow/Parlay.git
cd modest-meitner

# Install dependencies
npm install

# Run the dev server
npm run dev
```
Open the URL printed in the terminal (default `http://localhost:5173/`).

## Build for Production
```bash
npm run build
```
The production bundle is generated in the `dist/` folder.

## Deploy to GitHub Pages
```bash
# Create a gh‑pages branch with the built files
git checkout -b gh-pages
git add dist -f
git commit -m "Deploy site"
git push -u origin gh-pages
```
Alternatively, add the `gh-pages` package and run `npm run deploy`.

## Project Structure
```
modest-meitner/
├─ public/        # static assets (bets.json, fonts, icons)
├─ src/           # source code (main.ts, types.ts, ev‑engine.ts, parlay‑builder.ts, index.css)
├─ index.html
├─ package.json
├─ vite.config.ts
└─ README.md
```

## License
MIT – feel free to fork, modify, and deploy.
