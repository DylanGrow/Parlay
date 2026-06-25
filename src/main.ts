console.log('[Parlay] Script execution started.');
import './index.css';
import type { ValueBet, Parlay, BetsData } from './types';
import { americanToDecimal } from './ev-engine';

// State management
let currentData: BetsData | null = null;
let currentSportFilter: string = 'All';
let searchQuery: string = '';
let watchlist: string[] = [];
let sortColumn: 'ev' | 'odds' | 'none' = 'none';
let sortDirection: 'asc' | 'desc' = 'desc';

// Active selection for Parlay Builder simulator
let simulatedLegs: { betId: string; outcome: string; price: number; sport: string }[] = [];
let betStake: number = 100;

// Load Watchlist from Local Storage
function loadWatchlist() {
  try {
    const saved = localStorage.getItem('parlay_watchlist');
    if (saved) {
      watchlist = JSON.parse(saved);
      updateTabTitle();
    }
  } catch (e) {
    console.error('Failed to load watchlist from localStorage', e);
  }
}

// Save Watchlist to Local Storage
function saveWatchlist() {
  try {
    localStorage.setItem('parlay_watchlist', JSON.stringify(watchlist));
    updateTabTitle();
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

// Update Browser Tab Title with watchlist items count
function updateTabTitle() {
  if (watchlist.length > 0) {
    document.title = `(${watchlist.length}) Parlay – Betting Odds Dashboard`;
  } else {
    document.title = `Parlay – Betting Odds Dashboard`;
  }
}

// Utility to format odds to +X or -X format
const formatOdds = (price: number) => price >= 0 ? `+${price}` : `${price}`;

// Convert American odds list to combined American odds payout multiplier
function calculateCombinedAmerican(prices: number[]): number {
  if (prices.length === 0) return 0;
  const decimals = prices.map(price => americanToDecimal(price));
  const product = decimals.reduce((acc, dec) => acc * dec, 1);
  
  if (product >= 2) {
    return Math.round((product - 1) * 100);
  } else {
    return Math.round(-100 / (product - 1));
  }
}

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

// Open Bookmaker Odds Comparison Modal
function openComparisonModal(bet: ValueBet) {
  // Remove existing modal if any
  const oldModal = document.getElementById('odds-modal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'odds-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-fade-in';
  
  const sportInfo = getSportIcon(bet.sportKey);

  // Generate odds items list
  const oddsListHtml = bet.allOdds.map(odd => {
    const isBest = odd.price === bet.bestPrice;
    return `
      <div class="flex items-center justify-between p-3 rounded-lg border ${isBest ? 'border-primary-500/30 bg-primary-500/5' : 'border-neutral-800 bg-neutral-900/50'}">
        <div class="flex items-center gap-2">
          <span class="font-extrabold text-neutral-200 text-xs">${odd.bookmakerTitle}</span>
          ${isBest ? `<span class="text-[8px] bg-primary-500 text-neutral-950 font-black px-1 rounded">BEST</span>` : ''}
        </div>
        <span class="font-black text-sm ${isBest ? 'text-primary-400' : 'text-neutral-350'}">${formatOdds(odd.price)}</span>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="card max-w-sm w-full border border-neutral-800 bg-neutral-900 shadow-2xl p-6 relative animate-scale-up">
      <button id="close-modal-btn" class="absolute top-4 right-4 text-neutral-500 hover:text-neutral-200 text-lg cursor-pointer" aria-label="Close modal">×</button>
      <div class="flex items-center gap-2 border-b border-neutral-800 pb-3 mb-4">
        <span class="text-xl" role="img" aria-label="${sportInfo.label}">${sportInfo.emoji}</span>
        <div>
          <h3 class="font-black text-sm text-neutral-200">${bet.outcome}</h3>
          <p class="text-[10px] text-neutral-500 font-semibold">${bet.awayTeam} @ ${bet.homeTeam}</p>
        </div>
      </div>
      <div class="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-2">Bookmaker Odds comparison</div>
      <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
        ${oddsListHtml}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close modal logic
  const closeModal = () => modal.remove();
  modal.querySelector('#close-modal-btn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// Copy Parlay Card to clipboard helper
function copyParlayToClipboard(parlayIndex: number, parlay: Parlay) {
  const legsText = parlay.legs.map((leg, idx) => {
    return `Leg ${idx + 1}: ${leg.bet.outcome} [${leg.bet.marketLabel}] (${formatOdds(leg.price)})`;
  }).join('\n');

  const fullText = `🚀 BetRadar Premium Parlay Card #${parlayIndex + 1}\nCombined Odds: ${formatOdds(parlay.combinedAmericanOdds)}\nCompound EV: +${(parlay.estimatedEvPercent * 100).toFixed(1)}%\n\nSelections:\n${legsText}\n\nDisclaimer: Verify odds before placing bets. Math over emotions.`;

  navigator.clipboard.writeText(fullText).then(() => {
    alert(`Parlay #${parlayIndex + 1} copied to clipboard!`);
  }).catch(err => {
    console.error('Failed to copy to clipboard', err);
  });
}

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
              <button class="watchlist-btn text-sm text-neutral-500 hover:text-amber-400 transition-colors focus:outline-none cursor-pointer" 
                      data-id="${topPick.id}" aria-label="${isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}">
                ${isWatched ? '★' : '☆'}
              </button>
            </div>
            <div class="text-xs text-neutral-450 mt-0.5">${topPick.awayTeam} @ ${topPick.homeTeam}</div>
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

// Render Sport Filters Bar & Search input field
function renderFilters(data: BetsData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'mb-6 space-y-4 border-b border-neutral-800 pb-4';

  const filterRow = document.createElement('div');
  filterRow.className = 'flex flex-wrap items-center justify-between gap-4';

  const sportsContainer = document.createElement('div');
  sportsContainer.className = 'flex flex-wrap items-center gap-2';

  const sports = new Set<string>();
  data.topValueBets.forEach(bet => sports.add(bet.sport));

  const allCategories = ['All', 'Watchlist', ...Array.from(sports)];

  allCategories.forEach(category => {
    const btn = document.createElement('button');
    let label = category;
    if (category === 'Watchlist') {
      label = `⭐ Watchlist (${watchlist.length})`;
    } else if (category !== 'All') {
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
    sportsContainer.appendChild(btn);
  });

  // Search input creation
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'relative w-full max-w-xs';
  searchWrapper.innerHTML = `
    <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500 text-xs">🔍</span>
    <input id="search-input" type="text" placeholder="Search team or matchup..." value="${searchQuery}" 
           class="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-900 text-neutral-200 border border-neutral-800 rounded-lg focus:outline-none focus:border-primary-500 placeholder-neutral-500 transition-colors" />
  `;

  filterRow.appendChild(sportsContainer);
  filterRow.appendChild(searchWrapper);
  container.appendChild(filterRow);

  // Attach search event listener
  const searchInput = searchWrapper.querySelector('#search-input') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value.trim();
      // Render without rebuilding entire DOM structure to preserve input focus
      debounceRenderBets();
    });
  }

  return container;
}

// Debounce helper to prevent input stuttering on typing search queries
let debounceTimer: number | null = null;
function debounceRenderBets() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    const betsContainer = document.getElementById('bets-section-container');
    if (betsContainer && currentData) {
      const parent = betsContainer.parentNode;
      if (parent) {
        renderBets(currentData.topValueBets);
        const newSection = renderBets(currentData.topValueBets);
        parent.replaceChild(newSection, betsContainer);
      }
    }
  }, 100);
}

// Render Value Bets List (Responsive Table/Grid card)
function renderBets(bets: ValueBet[]): HTMLElement {
  const container = document.createElement('section');
  container.id = 'bets-section-container';
  container.className = 'mb-10';
  container.setAttribute('aria-labelledby', 'bets-heading');

  // Filter logic: Sport Filter + Search Query
  let filteredBets = bets.filter(b => {
    if (currentSportFilter === 'All') return true;
    if (currentSportFilter === 'Watchlist') return watchlist.includes(b.id);
    return b.sport === currentSportFilter;
  });

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredBets = filteredBets.filter(b => 
      b.outcome.toLowerCase().includes(query) ||
      b.homeTeam.toLowerCase().includes(query) ||
      b.awayTeam.toLowerCase().includes(query)
    );
  }

  // Sort logic
  if (sortColumn === 'ev') {
    filteredBets.sort((a, b) => sortDirection === 'desc' ? b.evPercent - a.evPercent : a.evPercent - b.evPercent);
  } else if (sortColumn === 'odds') {
    filteredBets.sort((a, b) => sortDirection === 'desc' ? b.bestPrice - a.bestPrice : a.bestPrice - b.bestPrice);
  }

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
      No value bets matching your filters were found.
    `;
    container.appendChild(noBets);
    return container;
  }

  // Desktop Table View
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'hidden md:block overflow-x-auto rounded-xl border border-neutral-850 bg-neutral-900/20 backdrop-blur-sm shadow-xl';

  const table = document.createElement('table');
  table.className = 'w-full text-left border-collapse text-xs';

  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = 'Individual value bets sorted by expected value';
  table.appendChild(caption);

  const getSortIconIndicator = (col: 'ev' | 'odds') => {
    if (sortColumn !== col) return '↕';
    return sortDirection === 'desc' ? '↓' : '↑';
  };

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr class="border-b border-neutral-800 bg-neutral-900/60 text-[10px] font-bold text-neutral-450 uppercase tracking-wider select-none">
      <th scope="col" class="px-4 py-3 w-10 text-center">Add</th>
      <th scope="col" class="px-4 py-3 w-10 text-center">Watch</th>
      <th scope="col" class="px-4 py-3">Event / Selection</th>
      <th scope="col" class="px-4 py-3">Market</th>
      <th scope="col" class="px-4 py-3 text-center cursor-pointer hover:text-neutral-100 transition-colors" id="sort-odds">Best Odds ${getSortIconIndicator('odds')}</th>
      <th scope="col" class="px-4 py-3 text-center">Bookmaker</th>
      <th scope="col" class="px-4 py-3 text-center cursor-pointer hover:text-neutral-100 transition-colors" id="sort-ev">EV Edge ${getSortIconIndicator('ev')}</th>
      <th scope="col" class="px-4 py-3 w-[250px]">Mathematical Rationale</th>
    </tr>
  `;
  table.appendChild(thead);

  // Attach Sort Header Event Handlers
  thead.querySelector('#sort-odds')?.addEventListener('click', () => handleSort('odds'));
  thead.querySelector('#sort-ev')?.addEventListener('click', () => handleSort('ev'));

  const tbody = document.createElement('tbody');
  tbody.className = 'divide-y divide-neutral-850';

  // Mobile Grid View
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

    const isAddedToSim = simulatedLegs.some(l => l.betId === b.id);

    // EV Pill Style scale
    let evBadgeStyle = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (b.evPercent >= 0.08) {
      evBadgeStyle = 'text-emerald-300 bg-emerald-500/25 border-emerald-500/40 font-black animate-pulse';
    } else if (b.evPercent < 0.03) {
      evBadgeStyle = 'text-neutral-400 bg-neutral-800 border-neutral-700';
    }

    // Implied true probability calculation
    const trueProbPct = Math.round(b.consensusImpliedProb * 100);

    // 1. Desktop Row
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-neutral-850/30 transition-colors group new-bet-row';
    tr.innerHTML = `
      <td class="px-4 py-3.5 text-center">
        <input type="checkbox" class="sim-checkbox cursor-pointer" data-id="${b.id}" data-outcome="${b.outcome}" data-price="${b.bestPrice}" data-sport="${b.sport}" ${isAddedToSim ? 'checked' : ''} aria-label="Add to parlay calculator" />
      </td>
      <td class="px-4 py-3.5 text-center">
        <button class="watchlist-btn text-sm text-neutral-600 hover:text-amber-400 transition-colors cursor-pointer" 
                data-id="${b.id}" aria-label="${isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}">
          ${isWatched ? '★' : '☆'}
        </button>
      </td>
      <td class="px-4 py-3.5">
        <div class="flex items-start gap-2.5">
          <span class="text-base select-none mt-0.5" role="img" aria-label="${sportInfo.label}">${sportInfo.emoji}</span>
          <div class="w-full">
            <div class="font-extrabold text-neutral-100 group-hover:text-primary-400 transition-colors flex items-center gap-2">
              <span>${b.outcome}</span>
              <span class="text-[9px] text-neutral-500 font-bold">📈</span>
            </div>
            <div class="text-[10px] text-neutral-400 font-semibold mt-0.5">${b.awayTeam} @ ${b.homeTeam}</div>
            <div class="text-[9px] text-neutral-500 font-semibold mt-0.5">${commenceDate}</div>
            <div class="w-full bg-neutral-800 h-1 rounded overflow-hidden mt-1.5" title="Consensus true probability: ${trueProbPct}%">
              <div class="bg-primary-500 h-full rounded" style="width: ${trueProbPct}%"></div>
            </div>
          </div>
        </div>
      </td>
      <td class="px-4 py-3.5">
        <span class="px-2 py-0.5 text-[10px] font-bold bg-neutral-800 text-neutral-300 rounded border border-neutral-750">
          ${b.marketLabel}
        </span>
      </td>
      <td class="px-4 py-3.5 text-center font-extrabold text-primary-400 text-sm cursor-pointer hover:underline" id="compare-btn-${b.id}">
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
      <td class="px-4 py-3.5 text-neutral-450 text-[11px] leading-relaxed">
        ${b.reasoning}
      </td>
    `;
    tbody.appendChild(tr);

    // 2. Mobile Card
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
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1 text-[10px] font-bold text-neutral-450 cursor-pointer">
            <input type="checkbox" class="sim-checkbox" data-id="${b.id}" data-outcome="${b.outcome}" data-price="${b.bestPrice}" data-sport="${b.sport}" ${isAddedToSim ? 'checked' : ''} />
            Add
          </label>
          <button class="watchlist-btn text-lg text-neutral-600 hover:text-amber-400 transition-colors focus:outline-none" 
                  data-id="${b.id}" aria-label="${isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}">
            ${isWatched ? '★' : '☆'}
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between text-xs">
        <div class="w-2/3">
          <span class="text-neutral-550 block text-[9px] font-bold uppercase tracking-wider">Matchup</span>
          <span class="font-bold text-neutral-300 text-[11px] block truncate">${b.awayTeam} @ ${b.homeTeam}</span>
          <div class="w-full bg-neutral-800 h-1 rounded overflow-hidden mt-1.5" title="Consensus probability: ${trueProbPct}%">
            <div class="bg-primary-500 h-full rounded" style="width: ${trueProbPct}%"></div>
          </div>
        </div>
        <div class="text-right">
          <span class="text-neutral-550 block text-[9px] font-bold uppercase tracking-wider">Commences</span>
          <span class="text-neutral-400 text-[10px] font-medium">${commenceDate}</span>
        </div>
      </div>

      <div class="flex items-center justify-between bg-neutral-950/40 p-3 rounded-lg border border-neutral-850">
        <div class="text-center cursor-pointer hover:underline" id="compare-btn-mobile-${b.id}">
          <span class="text-[9px] font-bold text-neutral-550 uppercase tracking-wider block">Best Odds ↕</span>
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

    // Click handler to open Compare Odds Modal
    setTimeout(() => {
      tr.querySelector(`#compare-btn-${b.id}`)?.addEventListener('click', () => openComparisonModal(b));
      card.querySelector(`#compare-btn-mobile-${b.id}`)?.addEventListener('click', () => openComparisonModal(b));
    }, 0);
  });

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
  container.appendChild(mobileGrid);

  // Attach event listener delegation for watchlist buttons & simulator checkboxes
  setTimeout(() => {
    container.querySelectorAll('.watchlist-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) toggleWatchlistItem(id);
      });
    });

    container.querySelectorAll('.sim-checkbox').forEach(box => {
      box.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const id = target.getAttribute('data-id')!;
        if (target.checked) {
          simulatedLegs.push({
            betId: id,
            outcome: target.getAttribute('data-outcome')!,
            price: parseInt(target.getAttribute('data-price')!, 10),
            sport: target.getAttribute('data-sport')!
          });
        } else {
          simulatedLegs = simulatedLegs.filter(l => l.betId !== id);
        }
        renderSimulatorApp();
      });
    });
  }, 0);

  return container;
}

// Handle value bets sorting
function handleSort(col: 'ev' | 'odds') {
  if (sortColumn === col) {
    sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
  } else {
    sortColumn = col;
    sortDirection = 'desc';
  }
  renderApp();
}

// Render Parlay Combos Section
function renderParlays(parlays: Parlay[]): HTMLElement {
  const container = document.createElement('section');
  container.className = 'mb-10';
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
          <div class="flex items-center gap-2">
            <button class="copy-parlay-btn text-xs text-neutral-500 hover:text-neutral-200 focus:outline-none cursor-pointer" 
                    title="Copy Parlay Details" data-index="${i}">
              📋 Copy
            </button>
            <span class="text-[10px] text-neutral-500 font-extrabold bg-neutral-950/40 px-2 py-0.5 rounded border border-neutral-850">
              ${p.legs.length} LEGS
            </span>
          </div>
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

    // Copy clip listener
    setTimeout(() => {
      card.querySelector('.copy-parlay-btn')?.addEventListener('click', () => copyParlayToClipboard(i, p));
    }, 0);
  });

  container.appendChild(grid);
  return container;
}

// Render Parlay Builder Simulator Calculator
function renderParlayCalculator(): HTMLElement {
  const container = document.createElement('section');
  container.id = 'parlay-calculator-section';
  container.className = 'card border border-neutral-800 bg-neutral-900/40 shadow-2xl p-6 mb-8';
  container.setAttribute('aria-labelledby', 'calculator-title');

  const legsCount = simulatedLegs.length;

  if (legsCount === 0) {
    container.innerHTML = `
      <h2 id="calculator-title" class="text-xs font-extrabold uppercase tracking-widest text-neutral-200 border-b border-neutral-800/80 pb-4 mb-4">
        🧮 Interactive Parlay Calculator
      </h2>
      <div class="text-center py-6 text-neutral-500 text-xs">
        <span class="text-2xl mb-2 block">🔲</span>
        Check the checkboxes on any Value Bets above to build and calculate your custom parlay card.
      </div>
    `;
    return container;
  }

  const combinedOdds = calculateCombinedAmerican(simulatedLegs.map(l => l.price));
  const multiplier = americanToDecimal(combinedOdds);
  const potentialReturn = betStake * multiplier;
  const potentialProfit = potentialReturn - betStake;

  const legsListHtml = simulatedLegs.map((l, index) => {
    return `
      <div class="flex items-center justify-between py-2 border-b border-neutral-800 last:border-b-0 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-[10px] bg-neutral-850 px-1.5 py-0.5 text-neutral-400 rounded font-bold">#${index + 1}</span>
          <span class="font-extrabold text-neutral-200">${l.outcome}</span>
          <span class="text-[9px] text-neutral-500 font-semibold">${l.sport}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="font-black text-primary-400">${formatOdds(l.price)}</span>
          <button class="remove-leg-btn text-rose-500 hover:text-rose-400 font-extrabold cursor-pointer" data-id="${l.betId}" aria-label="Remove leg">×</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <h2 id="calculator-title" class="text-xs font-extrabold uppercase tracking-widest text-neutral-200 border-b border-neutral-800/80 pb-4 mb-4">
      🧮 Custom Parlay Simulator
    </h2>
    
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div class="lg:col-span-7 bg-neutral-950/30 border border-neutral-850 p-4 rounded-xl space-y-1">
        <div class="text-[10px] text-neutral-500 font-black uppercase tracking-wider mb-2">Simulated Legs (${legsCount})</div>
        <div class="divide-y divide-neutral-850 max-h-48 overflow-y-auto pr-1">
          ${legsListHtml}
        </div>
      </div>
      
      <div class="lg:col-span-5 space-y-4">
        <div class="bg-neutral-950/50 border border-neutral-850/80 p-4 rounded-xl space-y-3">
          <div class="flex items-center justify-between text-xs border-b border-neutral-800 pb-2">
            <span class="font-bold text-neutral-400">Total Combined Odds</span>
            <span class="font-black text-primary-400 text-sm">${formatOdds(combinedOdds)}</span>
          </div>

          <div class="flex items-center justify-between text-xs gap-3">
            <label for="stake-input" class="font-bold text-neutral-450">Stake ($)</label>
            <input id="stake-input" type="number" min="1" value="${betStake}" 
                   class="w-20 px-2 py-1 bg-neutral-900 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-right text-xs" />
          </div>

          <div class="flex items-center justify-between text-xs pt-1">
            <span class="font-bold text-neutral-400">Potential Return</span>
            <span class="font-black text-emerald-400">$${potentialReturn.toFixed(2)}</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-neutral-400">Net Profit</span>
            <span class="font-bold text-neutral-200">$${potentialProfit.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach interactive listeners
  setTimeout(() => {
    // Stake input change
    container.querySelector('#stake-input')?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(value) && value > 0) {
        betStake = value;
        renderSimulatorApp();
      }
    });

    // Remove single leg
    container.querySelectorAll('.remove-leg-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        simulatedLegs = simulatedLegs.filter(l => l.betId !== id);
        renderApp();
      });
    });
  }, 0);

  return container;
}

// Sub-rendering function to refresh only the calculator values dynamically
function renderSimulatorApp() {
  const calcSection = document.getElementById('parlay-calculator-section');
  if (calcSection) {
    const parent = calcSection.parentNode;
    if (parent) {
      const newCalc = renderParlayCalculator();
      parent.replaceChild(newCalc, calcSection);
    }
  }
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
        <div class="text-[9px] text-neutral-500 font-extrabold uppercase tracking-wider">Watchlist ⭐</div>
        <div class="text-amber-400 font-extrabold text-[11px] mt-0.5">${watchlist.length} Starred</div>
      </div>
      <div class="w-px h-7 bg-neutral-800"></div>
      <div class="text-right text-xs">
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

  // Render Calculator Simulator
  app.appendChild(renderParlayCalculator());

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

// App Initialization with skeleton loading states
async function init() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="space-y-6">
      <div class="h-10 bg-neutral-900/50 rounded-xl border border-neutral-850 animate-pulse w-1/3"></div>
      <div class="h-40 bg-neutral-900/50 rounded-xl border border-neutral-850 animate-pulse"></div>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="h-8 bg-neutral-900/50 rounded-xl border border-neutral-850 animate-pulse"></div>
        <div class="h-8 bg-neutral-900/50 rounded-xl border border-neutral-850 animate-pulse"></div>
        <div class="h-8 bg-neutral-900/50 rounded-xl border border-neutral-850 animate-pulse"></div>
        <div class="h-8 bg-neutral-900/50 rounded-xl border border-neutral-850 animate-pulse"></div>
      </div>
      <div class="h-60 bg-neutral-900/50 rounded-xl border border-neutral-850 animate-pulse"></div>
    </div>
  `;

  loadWatchlist();

  try {
    // Simulate real brief delay to showcase loading skeletons
    await new Promise(resolve => setTimeout(resolve, 600));
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
