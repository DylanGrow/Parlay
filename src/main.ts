console.log('[Parlay] Script execution started.');
import './index.css';
import type { ValueBet, Parlay, BetsData } from './types';

// State management
let currentData: BetsData | null = null;
let currentSportFilter: string = 'All';
let watchlist: string[] = [];

// Load Watchlist from Local Storage
function loadWatchlist() {
  try {
    const saved = localStorage.getItem('parlay_watchlist');
    if (saved) {
      watchlist = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load watchlist from localStorage', e);
  }
}

// Save Watchlist to Local Storage
function saveWatchlist() {
  try {
    localStorage.setItem('parlay_watchlist', JSON.stringify(watchlist));
  } catch (e) {
    console.error('Failed to save watchlist to localStorage', e);
  }
}

// Toggle Watchlist Bet
function toggleWatchlistItem(betId: string) {
  const index = watchlist.indexOf(betId);
  if (index === -1) {
    watchlist.push(betId);
  } else {
    watchlist.splice(index, 1);
  }
  saveWatchlist();
  renderApp();
}

// Utility to format odds to +X or -X format
const formatOdds = (price: number) => price >= 0 ? `+${price}` : `${price}`;

// Get emoji based on sport key and accessibility text
const getSportIcon = (sportKey: string): { emoji: string; label: string } => {
  const key = sportKey.toLowerCase();
  if (key.includes('nba') || key.includes('basketball')) return { emoji: '🏀', label: 'Basketball' };
  if (key.includes('mlb') || key.includes('baseball')) return { emoji: '⚾', label: 'Baseball' };
  if (key.includes('soccer') || key.includes('epl')) return { emoji: '⚽', label: 'Soccer' };
  if (key.includes('mma') || key.includes('ufc')) return { emoji: '🥊', label: 'MMA' };
  if (key.includes('football') || key.includes('nfl')) return { emoji: '🏈', label: 'Football' };
  return { emoji: '🏆', label: 'Championship' };
};

// Render AI Insights Section
function renderAIAnalysis(data: BetsData): HTMLElement | null {
  const analysis = data.aiAnalysis;
  if (!analysis) return null;

  const topPick = data.topValueBets.find(b => b.id === analysis.topPickId);

  const container = document.createElement('section');
  container.className = 'card relative overflow-hidden border border-neutral-800 bg-neutral-900/40 shadow-2xl p-6 mb-8';
  container.setAttribute('aria-labelledby', 'ai-analyst-title');

  // Pulsing glow bg accent
  const glow = document.createElement('div');
  glow.className = 'absolute -right-20 -top-20 w-80 h-80 rounded-full bg-primary-500/10 blur-3xl pointer-events-none';
  container.appendChild(glow);

  const riskColors = {
    Low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    High: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  };
  const riskBadgeColor = riskColors[analysis.riskRating] || riskColors.Medium;

  let topPickHtml = '';
  if (topPick) {
    const sportInfo = getSportIcon(topPick.sportKey);
    const isWatched = watchlist.includes(topPick.id);
    topPickHtml = `
      <div class="mt-6 p-5 rounded-xl bg-neutral-950/50 border border-neutral-800/80 relative overflow-hidden">
        <div class="absolute -right-6 -bottom-6 text-6xl opacity-15 pointer-events-none" aria-hidden="true">${sportInfo.emoji}</div>
        <span class="absolute -top-0 right-4 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-primary-500 text-neutral-950 rounded-b">
          PICK OF THE DAY
        </span>
        <div class="flex flex-wrap items-start justify-between gap-4 mt-1">
          <div>
            <div class="text-[10px] font-bold text-primary-400 uppercase tracking-widest flex items-center gap-1.5">
              <span role="img" aria-label="${sportInfo.label}">${sportInfo.emoji}</span>
              <span>${topPick.sport} • ${topPick.marketLabel}</span>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <div class="text-xl font-extrabold text-neutral-100">${topPick.outcome}</div>
              <button class="watchlist-btn text-sm text-neutral-500 hover:text-amber-400 transition-colors focus:outline-none" 
                      data-id="${topPick.id}" aria-label="${isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}">
                ${isWatched ? '★' : '☆'}
              </button>
            </div>
            <div class="text-xs text-neutral-400 mt-0.5">${topPick.awayTeam} @ ${topPick.homeTeam}</div>
          </div>
          <div class="flex items-center gap-5">
            <div class="text-center">
              <div class="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Best Odds</div>
              <div class="text-lg font-black text-primary-400 mt-0.5">${formatOdds(topPick.bestPrice)}</div>
              <div class="text-[9px] text-neutral-500 font-medium">${topPick.bestBookmakerTitle}</div>
            </div>
            <div class="w-px h-8 bg-neutral-800"></div>
            <div class="text-center">
              <div class="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">EV Edge</div>
              <div class="text-lg font-black text-emerald-400 mt-0.5">+${(topPick.evPercent * 100).toFixed(1)}%</div>
              <div class="text-[9px] text-neutral-500 font-medium">Consensus</div>
            </div>
          </div>
        </div>
        <p class="mt-4 text-xs text-neutral-300 leading-relaxed border-t border-neutral-850 pt-3 font-medium">
          <span class="text-primary-400 font-bold">Analyst Rationale:</span> ${analysis.topPickRationale}
        </p>
      </div>
    `;
  }

  const formattedDate = new Date(analysis.lastUpdated).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  container.innerHTML = `
    <div class="flex items-center justify-between border-b border-neutral-800/80 pb-4 mb-4">
      <div class="flex items-center gap-2.5">
        <div class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500"></span>
        </div>
        <h2 id="ai-analyst-title" class="text-xs font-extrabold uppercase tracking-widest text-neutral-200">
          AI Daily Analyst Insights
        </h2>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Risk Profile:</span>
        <span class="px-2 py-0.5 text-[10px] font-black border rounded-full ${riskBadgeColor}">${analysis.riskRating.toUpperCase()}</span>
      </div>
    </div>
    
    <p class="text-neutral-300 text-xs leading-relaxed font-medium">
      ${analysis.summary}
    </p>

    ${topPickHtml}

    <div class="mt-4 text-[9px] text-neutral-500 font-semibold flex items-center justify-between border-t border-neutral-800/40 pt-3">
      <span class="flex items-center gap-1">🤖 Powered by Gemini 2.5 Flash</span>
      <span>Last Refreshed: ${formattedDate}</span>
    </div>
  `;

  // Attach event listener for top pick watchlist button
  const topWatchBtn = container.querySelector('.watchlist-btn');
  if (topWatchBtn) {
    topWatchBtn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) toggleWatchlistItem(id);
    });
  }

  return container;
}

// Render Sport Filters Bar
function renderFilters(data: BetsData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'flex flex-wrap items-center gap-2 mb-6 border-b border-neutral-800 pb-4';

  const sports = new Set<string>();
  data.topValueBets.forEach(bet => sports.add(bet.sport));

  const allCategories = ['All', 'Watchlist', ...Array.from(sports)];

  allCategories.forEach(category => {
    const btn = document.createElement('button');
    let label = category;
    if (category === 'Watchlist') {
      label = `⭐ Watchlist (${watchlist.length})`;
    } else if (category !== 'All') {
      // Find a matching icon
      const matchingBet = data.topValueBets.find(b => b.sport === category);
      if (matchingBet) {
        const sportInfo = getSportIcon(matchingBet.sportKey);
        label = `${sportInfo.emoji} ${category}`;
      }
    }

    btn.className = `px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
      currentSportFilter === category
        ? 'bg-primary-500 text-neutral-950 border-primary-500 shadow-md shadow-primary-500/20'
        : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-neutral-200'
    }`;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      currentSportFilter = category;
      renderApp();
    });
    container.appendChild(btn);
  });

  return container;
}

// Render Value Bets List (Responsive Table/Grid card)
function renderBets(bets: ValueBet[]): HTMLElement {
  const container = document.createElement('section');
  container.className = 'mb-10';
  container.setAttribute('aria-labelledby', 'bets-heading');

  const filteredBets = bets.filter(b => {
    if (currentSportFilter === 'All') return true;
    if (currentSportFilter === 'Watchlist') return watchlist.includes(b.id);
    return b.sport === currentSportFilter;
  });

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';
  header.innerHTML = `
    <h2 id="bets-heading" class="text-lg font-black text-neutral-100 flex items-center gap-2">
      <span>📊</span> Top Value Bets
    </h2>
    <span class="px-2.5 py-0.5 text-[10px] font-bold bg-neutral-800 text-neutral-450 border border-neutral-700/50 rounded-full">
      ${filteredBets.length} Opportunities
    </span>
  `;
  container.appendChild(header);

  if (filteredBets.length === 0) {
    const noBets = document.createElement('div');
    noBets.className = 'card border border-neutral-800 bg-neutral-900/10 p-8 text-center text-neutral-400 text-xs';
    noBets.innerHTML = `
      <span class="text-2xl mb-2 block">✨</span>
      No value bets found under this filter option.
    `;
    container.appendChild(noBets);
    return container;
  }

  // Desktop Table View (Hidden on mobile)
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'hidden md:block overflow-x-auto rounded-xl border border-neutral-850 bg-neutral-900/20 backdrop-blur-sm shadow-xl';

  const table = document.createElement('table');
  table.className = 'w-full text-left border-collapse text-xs';

  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = 'Individual value bets sorted by expected value';
  table.appendChild(caption);

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr class="border-b border-neutral-800 bg-neutral-900/60 text-[10px] font-bold text-neutral-450 uppercase tracking-wider">
      <th scope="col" class="px-4 py-3 w-10 text-center">Watch</th>
      <th scope="col" class="px-4 py-3">Event / Selection</th>
      <th scope="col" class="px-4 py-3">Market</th>
      <th scope="col" class="px-4 py-3 text-center">Best Odds</th>
      <th scope="col" class="px-4 py-3 text-center">Bookmaker</th>
      <th scope="col" class="px-4 py-3 text-center">EV Edge</th>
      <th scope="col" class="px-4 py-3">Mathematical Rationale</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.className = 'divide-y divide-neutral-850';

  // Mobile Grid View (Hidden on desktop)
  const mobileGrid = document.createElement('div');
  mobileGrid.className = 'grid grid-cols-1 gap-4 md:hidden';

  filteredBets.forEach((b) => {
    const isWatched = watchlist.includes(b.id);
    const sportInfo = getSportIcon(b.sportKey);
    const commenceDate = new Date(b.commenceTime).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // EV Pill Style scale
    let evBadgeStyle = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (b.evPercent >= 0.08) {
      evBadgeStyle = 'text-emerald-300 bg-emerald-500/25 border-emerald-500/40 font-black animate-pulse';
    } else if (b.evPercent < 0.03) {
      evBadgeStyle = 'text-neutral-400 bg-neutral-800 border-neutral-700';
    }

    // 1. Append Desktop Row
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-neutral-850/30 transition-colors group new-bet-row';
    tr.innerHTML = `
      <td class="px-4 py-3.5 text-center">
        <button class="watchlist-btn text-sm text-neutral-600 hover:text-amber-400 transition-colors cursor-pointer" 
                data-id="${b.id}" aria-label="${isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}">
          ${isWatched ? '★' : '☆'}
        </button>
      </td>
      <td class="px-4 py-3.5">
        <div class="flex items-start gap-2.5">
          <span class="text-base select-none mt-0.5" role="img" aria-label="${sportInfo.label}">${sportInfo.emoji}</span>
          <div>
            <div class="font-extrabold text-neutral-100 group-hover:text-primary-400 transition-colors">${b.outcome}</div>
            <div class="text-[10px] text-neutral-400 font-semibold mt-0.5">${b.awayTeam} @ ${b.homeTeam}</div>
            <div class="text-[9px] text-neutral-500 font-semibold mt-0.5">${commenceDate}</div>
          </div>
        </div>
      </td>
      <td class="px-4 py-3.5">
        <span class="px-2 py-0.5 text-[10px] font-bold bg-neutral-800 text-neutral-300 rounded border border-neutral-750">
          ${b.marketLabel}
        </span>
      </td>
      <td class="px-4 py-3.5 text-center font-extrabold text-primary-400 text-sm">
        ${formatOdds(b.bestPrice)}
      </td>
      <td class="px-4 py-3.5 text-center font-semibold text-neutral-350">
        ${b.bestBookmakerTitle}
      </td>
      <td class="px-4 py-3.5 text-center">
        <span class="inline-block px-2 py-0.5 text-[11px] font-extrabold border rounded ${evBadgeStyle}">
          +${(b.evPercent * 100).toFixed(1)}%
        </span>
      </td>
      <td class="px-4 py-3.5 text-neutral-450 max-w-xs text-[11px] leading-relaxed">
        ${b.reasoning}
      </td>
    `;
    tbody.appendChild(tr);

    // 2. Append Mobile Card
    const card = document.createElement('div');
    card.className = 'card border border-neutral-800 bg-neutral-900/40 p-4 space-y-3 relative overflow-hidden new-bet-row';
    card.innerHTML = `
      <div class="flex items-start justify-between border-b border-neutral-800/60 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-lg" role="img" aria-label="${sportInfo.label}">${sportInfo.emoji}</span>
          <div>
            <div class="font-extrabold text-neutral-150 text-sm">${b.outcome}</div>
            <div class="text-[10px] text-neutral-500 font-semibold">${sportInfo.label} • ${b.marketLabel}</div>
          </div>
        </div>
        <button class="watchlist-btn text-lg text-neutral-600 hover:text-amber-400 transition-colors" 
                data-id="${b.id}" aria-label="${isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}">
          ${isWatched ? '★' : '☆'}
        </button>
      </div>

      <div class="flex items-center justify-between text-xs">
        <div>
          <span class="text-neutral-550 block text-[9px] font-bold uppercase tracking-wider">Matchup</span>
          <span class="font-bold text-neutral-300 text-[11px]">${b.awayTeam} @ ${b.homeTeam}</span>
        </div>
        <div class="text-right">
          <span class="text-neutral-550 block text-[9px] font-bold uppercase tracking-wider">Commences</span>
          <span class="text-neutral-400 text-[10px] font-medium">${commenceDate}</span>
        </div>
      </div>

      <div class="flex items-center justify-between bg-neutral-950/40 p-3 rounded-lg border border-neutral-850">
        <div class="text-center">
          <span class="text-[9px] font-bold text-neutral-550 uppercase tracking-wider block">Best Odds</span>
          <span class="text-sm font-black text-primary-400 mt-0.5 block">${formatOdds(b.bestPrice)}</span>
          <span class="text-[8px] text-neutral-500 font-semibold block">${b.bestBookmakerTitle}</span>
        </div>
        <div class="w-px h-8 bg-neutral-850"></div>
        <div class="text-center">
          <span class="text-[9px] font-bold text-neutral-550 uppercase tracking-wider block">EV Edge</span>
          <span class="inline-block px-2 py-0.5 text-xs font-extrabold border rounded mt-1 ${evBadgeStyle}">
            +${(b.evPercent * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <p class="text-[10px] text-neutral-400 leading-relaxed border-t border-neutral-850 pt-2 font-medium">
        ${b.reasoning}
      </p>
    `;
    mobileGrid.appendChild(card);
  });

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
  container.appendChild(mobileGrid);

  // Attach event listener delegation for watchlist buttons
  container.querySelectorAll('.watchlist-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) toggleWatchlistItem(id);
    });
  });

  return container;
}

// Render Parlay Combos Section
function renderParlays(parlays: Parlay[]): HTMLElement {
  const container = document.createElement('section');
  container.className = 'mb-8';
  container.setAttribute('aria-labelledby', 'parlays-heading');

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-4';
  header.innerHTML = `
    <h2 id="parlays-heading" class="text-lg font-black text-neutral-100 flex items-center gap-2">
      <span>🚀</span> Premium Parlay Cards
    </h2>
    <span class="px-2.5 py-0.5 text-[10px] font-bold bg-neutral-800 text-neutral-450 border border-neutral-700/50 rounded-full">
      Multi-Leg Boosts
    </span>
  `;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-6';

  parlays.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card border border-neutral-800 bg-neutral-900/20 hover:border-primary-500/30 hover:shadow-primary-500/5 transition-all p-5 flex flex-col justify-between relative overflow-hidden';
    
    // Quality Tier Color Badge
    const tierColors = {
      elite: 'bg-primary-500/10 text-primary-400 border-primary-500/20',
      strong: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      solid: 'bg-neutral-850 text-neutral-350 border-neutral-700'
    };
    const tierBadge = tierColors[p.tier] || tierColors.solid;

    const legsHtml = p.legs.map((leg) => {
      const sportInfo = getSportIcon(leg.bet.sportKey);
      return `
        <div class="flex items-center justify-between py-2 border-b border-neutral-800/40 last:border-b-0">
          <div class="flex items-center gap-2">
            <span class="text-xs select-none" role="img" aria-label="${sportInfo.label}">${sportInfo.emoji}</span>
            <div>
              <div class="font-bold text-xs text-neutral-200">${leg.bet.outcome}</div>
              <div class="text-[9px] text-neutral-500 font-bold">${leg.bet.sport} • ${leg.bet.marketLabel}</div>
            </div>
          </div>
          <div class="font-extrabold text-primary-400 text-xs">${formatOdds(leg.price)}</div>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between border-b border-neutral-800/80 pb-3 mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black text-neutral-300">PARLAY CARD #${i + 1}</span>
            <span class="px-2 py-0.5 text-[9px] font-extrabold border rounded-full uppercase tracking-wider ${tierBadge}">
              ${p.tier}
            </span>
          </div>
          <span class="text-[10px] text-neutral-500 font-extrabold bg-neutral-950/40 px-2 py-0.5 rounded border border-neutral-850">
            ${p.legs.length} LEGS
          </span>
        </div>
        
        <div class="space-y-1 my-3 bg-neutral-950/20 p-2.5 rounded-lg border border-neutral-850/50">
          ${legsHtml}
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between">
        <div>
          <div class="text-[9px] text-neutral-500 font-black uppercase tracking-wider">Combined Odds</div>
          <div class="text-lg font-black text-primary-400 mt-0.5">${formatOdds(p.combinedAmericanOdds)}</div>
        </div>
        <div class="text-right">
          <div class="text-[9px] text-neutral-500 font-black uppercase tracking-wider">Compound EV</div>
          <div class="text-lg font-black text-emerald-400 mt-0.5">+${(p.estimatedEvPercent * 100).toFixed(1)}%</div>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  container.appendChild(grid);
  return container;
}

// Fetch betting data
async function loadData() {
  const resp = await fetch('bets.json');
  if (!resp.ok) {
    throw new Error(`HTTP error ${resp.status}`);
  }
  return await resp.json() as BetsData;
}

// Render the entire app UI
function renderApp() {
  const app = document.getElementById('app')!;
  if (!currentData) return;

  // Reset container and layout
  app.innerHTML = '';

  // Header Logo & Dashboard Meta
  const header = document.createElement('header');
  header.className = 'flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-6 mb-8 mt-4';
  
  const formattedGenDate = new Date(currentData.generatedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  header.innerHTML = `
    <div>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center font-black text-neutral-950 shadow-lg shadow-primary-500/20">P</div>
        <h1 class="text-2xl font-black tracking-tighter text-neutral-50 bg-clip-text">PARLAY</h1>
      </div>
      <p class="text-[10px] text-neutral-450 font-bold uppercase tracking-widest mt-1">Expected Value (EV) Betting Engine</p>
    </div>
    <div class="flex flex-wrap items-center gap-4 text-xs font-semibold">
      <button id="refresh-btn" class="px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-350 hover:text-neutral-100 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all active:scale-95" aria-label="Refresh Data">
        <span class="refresh-icon inline-block">↻</span> Sync Odds
      </button>
      <div class="w-px h-7 bg-neutral-800 hidden sm:block"></div>
      <div class="text-right">
        <div class="text-[9px] text-neutral-500 font-extrabold uppercase tracking-wider">Sync Status</div>
        <div class="text-neutral-300 font-bold text-[11px] mt-0.5">Updated: ${formattedGenDate}</div>
      </div>
      <div class="w-px h-7 bg-neutral-800"></div>
      <div class="text-right">
        <div class="text-[9px] text-neutral-500 font-extrabold uppercase tracking-wider">API Credits</div>
        <div class="text-emerald-400 font-extrabold text-[11px] mt-0.5">${currentData.creditsRemaining} Left</div>
      </div>
    </div>
  `;
  app.appendChild(header);

  // Attach refresh listener
  const refreshBtn = header.querySelector('#refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
  }

  // AI Daily Insights panel
  const aiPanel = renderAIAnalysis(currentData);
  if (aiPanel) {
    app.appendChild(aiPanel);
  }

  // Add filters toolbar
  app.appendChild(renderFilters(currentData));

  // Value bets grid/table
  app.appendChild(renderBets(currentData.topValueBets));

  // Parlay list
  app.appendChild(renderParlays(currentData.parlays));

  // Footer Disclaimer
  const footer = document.createElement('footer');
  footer.className = 'mt-12 pt-6 border-t border-neutral-850 pb-8 text-[10px] text-neutral-500 leading-relaxed text-center font-semibold';
  footer.innerHTML = `
    <p class="max-w-xl mx-auto">${currentData.disclaimer}</p>
    <p class="mt-4 text-neutral-600">© 2026 Parlay Engine. Math over emotions.</p>
  `;
  app.appendChild(footer);

  // Trigger smooth fade-in
  app.classList.add('loaded');
}

// Handle dynamic odds refresh
async function handleRefresh() {
  const refreshBtn = document.getElementById('refresh-btn');
  const icon = refreshBtn?.querySelector('.refresh-icon');
  if (icon) icon.classList.add('animate-spin');
  if (refreshBtn) (refreshBtn as HTMLButtonElement).disabled = true;

  try {
    const data = await loadData();
    // Simulate real delay for visual confirmation
    await new Promise(resolve => setTimeout(resolve, 800));
    currentData = data;
    renderApp();
  } catch (err) {
    console.error('Failed to sync odds:', err);
    alert('Failed to sync betting data. Please try again later.');
  } finally {
    if (icon) icon.classList.remove('animate-spin');
    if (refreshBtn) (refreshBtn as HTMLButtonElement).disabled = false;
  }
}

// App Initialization
async function init() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="flex flex-col items-center justify-center p-12 text-center" role="status" aria-live="polite">
      <div class="relative flex h-8 w-8 mb-4">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-8 w-8 bg-primary-500"></span>
      </div>
      <p class="text-xs text-neutral-450 font-semibold tracking-wider uppercase">Loading Betting Feeds...</p>
    </div>
  `;

  loadWatchlist();

  try {
    currentData = await loadData();
    renderApp();
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <div class="card border border-rose-500/20 bg-rose-500/5 p-8 text-center my-10 max-w-md mx-auto">
        <span class="text-3xl" role="img" aria-label="Error Warning">⚠️</span>
        <h3 class="text-neutral-200 font-extrabold mt-3">Failed to load betting data</h3>
        <p class="text-xs text-neutral-450 mt-2 leading-relaxed">Could not load the bets.json feeds. Please ensure the server is responding and check your connection.</p>
        <button id="retry-btn" class="mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2 bg-primary-500 text-neutral-950 font-bold hover:bg-primary-400 cursor-pointer transition-all active:scale-95 text-xs">
          Retry Fetching Feeds
        </button>
      </div>
    `;
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', init);
    }
  }
}

init();
