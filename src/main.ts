console.log('[Parlay] Script execution started.');
import './index.css';
import type { ValueBet, Parlay, BetsData, TrackedBet } from './types';
import { americanToDecimal, decimalToAmerican, americanToImpliedProb } from './ev-engine';

// Helper function to calculate combined American odds for N-leg parlay
function calculateCombinedAmerican(prices: number[]): number {
  if (prices.length === 0) return 0;
  const decimalOdds = prices.map(p => americanToDecimal(p));
  const combinedDecimal = decimalOdds.reduce((product, odd) => product * odd, 1);
  return decimalToAmerican(combinedDecimal);
}

// State management
let currentData: BetsData | null = null;
let currentSportFilter: string = 'All';
let searchQuery: string = '';
let watchlist: string[] = [];
let trackedBets: TrackedBet[] = [];
let sortColumn: 'ev' | 'odds' | 'none' = 'none';
let sortDirection: 'asc' | 'desc' = 'desc';

// Preference and filter state variables (loaded from local storage)
let oddsFormat: 'american' | 'decimal' | 'implied' = 'american';
let bankrollSize: number = 1000;
let minEvFilter: number = 0;
let bookmakerFilter: string = 'All';

// Active selection for Parlay Builder simulator
let simulatedLegs: { betId: string; outcome: string; price: number; sport: string }[] = [];
let betStake: number = 100;

// Hedge & Arbitrage Calculator state variables
let activeCalculatorTab: 'parlay' | 'hedge' | 'customEv' = 'parlay';
let hedgePrimaryStake: number = 100;
let hedgePrimaryOdds: number = 150;
let hedgeOpposingOdds: number = -110;

// Custom EV & Monte Carlo Growth state variables
let customEvWinProb: number = 45;
let customEvOdds: number = 130;

// Tracker Tab Chart active selection
let activeTrackerChartTab: 'trend' | 'allocation' = 'trend';

// Sleek Toast Notification System
function showToast(message: string, type: 'success' | 'info' | 'error' = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `px-4 py-3 rounded-lg shadow-lg font-bold text-xs pointer-events-auto border transition-all duration-300 transform translate-y-4 opacity-0 flex items-center gap-2 select-none`;
  
  if (type === 'success') {
    toast.className += ' bg-emerald-950/90 text-emerald-400 border-emerald-500/20';
  } else if (type === 'error') {
    toast.className += ' bg-rose-950/90 text-rose-400 border-rose-500/20';
  } else {
    toast.className += ' bg-neutral-900/90 text-neutral-350 border-neutral-800';
  }

  const icons = {
    success: '✅',
    info: 'ℹ️',
    error: '⚠️'
  };

  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);

  // Trigger animation after adding to DOM
  setTimeout(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  }, 10);

  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// Load Preferences from Local Storage
function loadPreferences() {
  try {
    const savedFormat = localStorage.getItem('parlay_odds_format');
    if (savedFormat === 'american' || savedFormat === 'decimal' || savedFormat === 'implied') {
      oddsFormat = savedFormat;
    }
    const savedBankroll = localStorage.getItem('parlay_bankroll_size');
    if (savedBankroll) {
      const parsed = parseFloat(savedBankroll);
      if (!isNaN(parsed) && parsed > 0) {
        bankrollSize = parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load preferences', e);
  }
}

// Save Preferences to Local Storage
function savePreferences() {
  try {
    localStorage.setItem('parlay_odds_format', oddsFormat);
    localStorage.setItem('parlay_bankroll_size', bankrollSize.toString());
  } catch (e) {
    console.error('Failed to save preferences', e);
  }
}

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
    showToast('Added to watchlist ⭐', 'success');
  } else {
    watchlist.splice(index, 1);
    showToast('Removed from watchlist', 'info');
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

// Load Tracked Bets from Local Storage
function loadTrackedBets() {
  try {
    const saved = localStorage.getItem('parlay_tracked_bets');
    if (saved) {
      trackedBets = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load tracked bets from localStorage', e);
  }
}

// Save Tracked Bets to Local Storage
function saveTrackedBets() {
  try {
    localStorage.setItem('parlay_tracked_bets', JSON.stringify(trackedBets));
  } catch (e) {
    console.error('Failed to save tracked bets to localStorage', e);
  }
}

// Utility to format odds based on user preference
const formatOdds = (price: number): string => {
  if (oddsFormat === 'decimal') {
    return americanToDecimal(price).toFixed(2);
  }
  if (oddsFormat === 'implied') {
    return (americanToImpliedProb(price) * 100).toFixed(1) + '%';
  }
  return price >= 0 ? `+${price}` : `${price}`;
};

// Open Track Bet Confirmation Modal
function openTrackBetModal(outcome: string, matchup: string, price: number, sport: string, marketLabel: string) {
  const oldModal = document.getElementById('track-modal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'track-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-fade-in';
  
  modal.innerHTML = `
    <div class="card max-w-sm w-full border border-neutral-800 bg-neutral-900 shadow-2xl p-6 relative animate-scale-up">
      <h3 class="font-black text-sm text-neutral-250 border-b border-neutral-800 pb-3 mb-4">🎯 Track This Bet</h3>
      <div class="space-y-3 text-xs mb-6">
        <div class="flex justify-between"><span class="text-neutral-500">Selection:</span><span class="font-bold text-neutral-200">${outcome}</span></div>
        <div class="flex justify-between"><span class="text-neutral-500">Matchup:</span><span class="font-semibold text-neutral-350">${matchup}</span></div>
        <div class="flex justify-between"><span class="text-neutral-500">Odds:</span><span class="font-black text-primary-400">${formatOdds(price)}</span></div>
        <div class="flex flex-col gap-2 pt-3 border-t border-neutral-850">
          <label for="track-stake-input" class="font-bold text-neutral-400">Stake Amount ($)</label>
          <input id="track-stake-input" type="number" min="1" value="${betStake}" class="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs text-right" />
        </div>
      </div>
      <div class="flex gap-3">
        <button id="cancel-track-btn" class="flex-1 py-2 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-bold rounded-lg cursor-pointer transition-all active:scale-95 text-xs">Cancel</button>
        <button id="confirm-track-btn" class="flex-1 py-2 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold rounded-lg cursor-pointer transition-all active:scale-95 text-xs">Track Bet</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#cancel-track-btn')?.addEventListener('click', closeModal);
  modal.querySelector('#confirm-track-btn')?.addEventListener('click', () => {
    const input = modal.querySelector('#track-stake-input') as HTMLInputElement;
    const stake = parseFloat(input.value);
    if (!isNaN(stake) && stake > 0) {
      betStake = stake; // Save as default stake
      const newBet: TrackedBet = {
        id: `tracked-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        outcome,
        matchup,
        price,
        sport,
        marketLabel,
        stake,
        status: 'pending',
        trackedAt: new Date().toISOString()
      };
      trackedBets.push(newBet);
      saveTrackedBets();
      closeModal();
      showToast(`Tracked: ${outcome} (${formatOdds(price)}) for $${stake.toFixed(0)}!`, 'success');
      renderApp();
    } else {
      showToast('Please enter a valid stake amount.', 'error');
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// Track Simulated Parlay Card
function trackSimulatedParlay() {
  if (simulatedLegs.length === 0) return;
  const combinedOdds = calculateCombinedAmerican(simulatedLegs.map(l => l.price));
  const parlayMatchup = simulatedLegs.map(l => l.outcome).join(' + ');

  const oldModal = document.getElementById('track-modal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'track-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-fade-in';
  
  modal.innerHTML = `
    <div class="card max-w-sm w-full border border-neutral-800 bg-neutral-900 shadow-2xl p-6 relative animate-scale-up">
      <h3 class="font-black text-sm text-neutral-250 border-b border-neutral-800 pb-3 mb-4">🚀 Track Custom Parlay</h3>
      <div class="space-y-3 text-xs mb-6">
        <div class="flex justify-between"><span class="text-neutral-500">Selection:</span><span class="font-bold text-neutral-250">${simulatedLegs.length}-Leg Parlay</span></div>
        <div class="flex justify-between"><span class="text-neutral-500 font-semibold">Combined Odds:</span><span class="font-black text-primary-400">${formatOdds(combinedOdds)}</span></div>
        <div class="flex flex-col gap-2 pt-3 border-t border-neutral-850">
          <label for="track-stake-input" class="font-bold text-neutral-400">Total Parlay Stake ($)</label>
          <input id="track-stake-input" type="number" min="1" value="${betStake}" class="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs text-right" />
        </div>
      </div>
      <div class="flex gap-3">
        <button id="cancel-track-btn" class="flex-1 py-2 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-bold rounded-lg cursor-pointer transition-all active:scale-95 text-xs">Cancel</button>
        <button id="confirm-track-btn" class="flex-1 py-2 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-bold rounded-lg cursor-pointer transition-all active:scale-95 text-xs">Track Parlay</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#cancel-track-btn')?.addEventListener('click', closeModal);
  modal.querySelector('#confirm-track-btn')?.addEventListener('click', () => {
    const input = modal.querySelector('#track-stake-input') as HTMLInputElement;
    const stake = parseFloat(input.value);
    if (!isNaN(stake) && stake > 0) {
      const newBet: TrackedBet = {
        id: `tracked-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        outcome: `${simulatedLegs.length}-Leg Parlay`,
        matchup: parlayMatchup,
        price: combinedOdds,
        sport: 'Multi-Sport',
        marketLabel: 'Parlay Combo',
        stake,
        status: 'pending',
        trackedAt: new Date().toISOString()
      };
      trackedBets.push(newBet);
      saveTrackedBets();
      closeModal();
      simulatedLegs = []; // Clear simulator on tracking success
      showToast(`Custom Parlay tracked for $${stake.toFixed(0)}!`, 'success');
      renderApp();
    } else {
      showToast('Please enter a valid stake amount.', 'error');
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// Update Tracked Bet Status (won / lost / pending)
function updateBetStatus(trackedId: string, status: 'won' | 'lost' | 'pending') {
  const bet = trackedBets.find(b => b.id === trackedId);
  if (bet) {
    bet.status = status;
    saveTrackedBets();
    renderApp();
  }
}

// Delete Tracked Bet from History
function deleteTrackedBet(trackedId: string) {
  if (confirm('Are you sure you want to delete this tracked bet from your history?')) {
    trackedBets = trackedBets.filter(b => b.id !== trackedId);
    saveTrackedBets();
    renderApp();
  }
}



// Get emoji based on sport key and accessibility text
const getSportIcon = (sportKey: string): { emoji: string; label: string } => {
  const key = sportKey.toLowerCase();
  if (key.includes('nba') || key.includes('basketball') || key.includes('california_classic')) return { emoji: '🏀', label: 'Basketball' };
  if (key.includes('mlb') || key.includes('baseball')) return { emoji: '⚾', label: 'Baseball' };
  if (key.includes('soccer') || key.includes('epl') || key.includes('world_cup')) return { emoji: '⚽', label: 'Soccer' };
  if (key.includes('mma') || key.includes('ufc')) return { emoji: '🥊', label: 'MMA' };
  if (key.includes('football') || key.includes('nfl')) return { emoji: '🏈', label: 'Football' };
  if (key.includes('nascar') || key.includes('racing')) return { emoji: '🏎️', label: 'Racing' };
  return { emoji: '🏆', label: 'Championship' };
};

function openComparisonModal(bet: ValueBet) {
  const oldModal = document.getElementById('odds-modal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'odds-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-fade-in';
  
  const sportInfo = getSportIcon(bet.sportKey);

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

  // Kelly Sizing calculations
  const trueProb = bet.consensusImpliedProb;
  const decimalOdds = americanToDecimal(bet.bestPrice);
  const bFactor = decimalOdds - 1;
  let kellyPercent = 0;
  if (bFactor > 0) {
    kellyPercent = (trueProb * (bFactor + 1) - 1) / bFactor;
  }
  if (kellyPercent < 0) kellyPercent = 0;
  const suggestedKellyPercent = kellyPercent * 0.25;

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
      <div class="space-y-2 max-h-40 overflow-y-auto pr-1 mb-4">
        ${oddsListHtml}
      </div>

      <!-- Kelly Criterion Calculator -->
      <div class="mt-4 pt-4 border-t border-neutral-800 space-y-3">
        <div class="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">📐 Kelly Staking Calculator</div>
        <div class="flex items-center justify-between gap-3 text-xs">
          <label for="modal-bankroll-input" class="text-neutral-400 font-semibold">Bankroll Size ($)</label>
          <input id="modal-bankroll-input" type="number" min="10" value="${bankrollSize}" class="w-24 px-2 py-1 bg-neutral-950 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs text-right" />
        </div>
        
        <div class="p-3 bg-neutral-950/50 rounded-lg border border-neutral-850/80 space-y-2 text-xs">
          <div class="flex justify-between">
            <span class="text-neutral-450 font-medium">EV Edge:</span>
            <span class="font-extrabold text-primary-400">+${(bet.evPercent * 100).toFixed(1)}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-neutral-450 font-medium">Full Kelly Stake:</span>
            <span class="font-extrabold text-neutral-250" id="full-kelly-display">${(kellyPercent * 100).toFixed(2)}% ($${(kellyPercent * bankrollSize).toFixed(2)})</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-neutral-400 font-bold text-emerald-450">Suggested (1/4 Kelly):</span>
            <span class="font-black text-emerald-400 text-sm" id="sug-kelly-display">${(suggestedKellyPercent * 100).toFixed(2)}% ($${(suggestedKellyPercent * bankrollSize).toFixed(2)})</span>
          </div>
        </div>
      </div>

      <!-- Direct Track Action -->
      <button id="modal-track-btn" class="w-full mt-4 py-2 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-black rounded-lg cursor-pointer transition-all active:scale-95 text-xs">
        🎯 Track this Bet
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-modal-btn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Attach Bankroll update listener
  const bankrollInput = modal.querySelector('#modal-bankroll-input') as HTMLInputElement;
  if (bankrollInput) {
    bankrollInput.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val) && val > 0) {
        bankrollSize = val;
        savePreferences();
        
        const fullDisplay = modal.querySelector('#full-kelly-display')!;
        const sugDisplay = modal.querySelector('#sug-kelly-display')!;
        
        fullDisplay.textContent = `${(kellyPercent * 100).toFixed(2)}% ($${(kellyPercent * bankrollSize).toFixed(2)})`;
        sugDisplay.textContent = `${(suggestedKellyPercent * 100).toFixed(2)}% ($${(suggestedKellyPercent * bankrollSize).toFixed(2)})`;
      }
    });
  }

  // Direct Track action handler
  modal.querySelector('#modal-track-btn')?.addEventListener('click', () => {
    modal.remove();
    openTrackBetModal(bet.outcome, `${bet.awayTeam} @ ${bet.homeTeam}`, bet.bestPrice, bet.sport, bet.marketLabel);
  });
}

// Copy Parlay Card to clipboard helper
function copyParlayToClipboard(parlayIndex: number, parlay: Parlay) {
  const legsText = parlay.legs.map((leg, idx) => {
    return `Leg ${idx + 1}: ${leg.bet.outcome} [${leg.bet.marketLabel}] (${formatOdds(leg.price)})`;
  }).join('\n');

  const fullText = `🚀 BetRadar Premium Parlay Card #${parlayIndex + 1}\nCombined Odds: ${formatOdds(parlay.combinedAmericanOdds)}\nCompound EV: +${(parlay.estimatedEvPercent * 100).toFixed(1)}%\n\nSelections:\n${legsText}\n\nDisclaimer: Verify odds before placing bets. Math over emotions.`;

  navigator.clipboard.writeText(fullText).then(() => {
    showToast(`Parlay #${parlayIndex + 1} details copied to clipboard!`, 'success');
  }).catch(err => {
    console.error('Failed to copy to clipboard', err);
    showToast('Failed to copy parlay details.', 'error');
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
            <div class="text-xs text-neutral-455 mt-0.5">${topPick.awayTeam} @ ${topPick.homeTeam}</div>
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

  const allCategories = ['All', 'Watchlist', 'Tracker', ...Array.from(sports)];

  allCategories.forEach(category => {
    const btn = document.createElement('button');
    let label = category;
    if (category === 'Watchlist') {
      label = `⭐ Watchlist (${watchlist.length})`;
    } else if (category === 'Tracker') {
      const pendingCount = trackedBets.filter(b => b.status === 'pending').length;
      label = `📈 Bet Tracker (${trackedBets.length})${pendingCount > 0 ? ` [${pendingCount}]` : ''}`;
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

  // Advanced sub-filter row (EV threshold and Bookmaker)
  if (currentSportFilter !== 'Tracker') {
    const advRow = document.createElement('div');
    advRow.className = 'flex flex-wrap items-center gap-6 pt-2 border-t border-neutral-850/30 text-xs';

    // Min EV filter buttons
    const evFilterWrapper = document.createElement('div');
    evFilterWrapper.className = 'flex items-center gap-2';
    evFilterWrapper.innerHTML = `<span class="text-neutral-500 font-bold text-[10px] uppercase tracking-wider">Min Edge:</span>`;
    
    const evSteps = [
      { label: 'All', val: 0 },
      { label: '5%+', val: 0.05 },
      { label: '8%+', val: 0.08 },
      { label: '10%+', val: 0.10 }
    ];

    evSteps.forEach(step => {
      const btn = document.createElement('button');
      btn.className = `px-2 py-1 text-[10px] font-bold rounded border transition-all cursor-pointer ${
        minEvFilter === step.val
          ? 'bg-neutral-800 text-primary-400 border-primary-500/30 font-black'
          : 'bg-neutral-950 text-neutral-450 border-neutral-900 hover:border-neutral-800 hover:text-neutral-300'
      }`;
      btn.textContent = step.label;
      btn.addEventListener('click', () => {
        minEvFilter = step.val;
        // Re-render filters panel and bets
        const newFilters = renderFilters(data);
        container.parentNode?.replaceChild(newFilters, container);
        debounceRenderBets();
      });
      evFilterWrapper.appendChild(btn);
    });

    // Bookmaker filter dropdown
    const bookFilterWrapper = document.createElement('div');
    bookFilterWrapper.className = 'flex items-center gap-2 ml-auto sm:ml-0';
    
    const bookmakers = new Map<string, string>();
    data.topValueBets.forEach(bet => {
      bet.allOdds.forEach(odd => {
        bookmakers.set(odd.bookmaker, odd.bookmakerTitle);
      });
    });

    let bookOptionsHtml = `<option value="All" ${bookmakerFilter === 'All' ? 'selected' : ''}>All Bookmakers</option>`;
    bookmakers.forEach((title, key) => {
      bookOptionsHtml += `<option value="${key}" ${bookmakerFilter === key ? 'selected' : ''}>${title}</option>`;
    });

    bookFilterWrapper.innerHTML = `
      <span class="text-neutral-500 font-bold text-[10px] uppercase tracking-wider">Bookmaker:</span>
      <select id="bookmaker-filter-select" class="bg-neutral-950 border border-neutral-850 text-neutral-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:border-primary-500 cursor-pointer">
        ${bookOptionsHtml}
      </select>
    `;

    const select = bookFilterWrapper.querySelector('#bookmaker-filter-select') as HTMLSelectElement;
    select.addEventListener('change', (e) => {
      bookmakerFilter = (e.target as HTMLSelectElement).value;
      debounceRenderBets();
    });

    advRow.appendChild(evFilterWrapper);
    advRow.appendChild(bookFilterWrapper);
    container.appendChild(advRow);
  }

  const searchInput = searchWrapper.querySelector('#search-input') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value.trim();
      debounceRenderBets();
    });
  }

  return container;
}

// Debounce helper to prevent input stuttering
let debounceTimer: number | null = null;
function debounceRenderBets() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    const betsContainer = document.getElementById('bets-section-container');
    if (betsContainer && currentData) {
      const parent = betsContainer.parentNode;
      if (parent) {
        const newSection = renderBets(currentData.topValueBets);
        parent.replaceChild(newSection, betsContainer);
      }
    }
  }, 100);
}

// Render Value Bets List (Responsive Table/Grid card)
function renderBets(bets: ValueBet[]): HTMLElement {
  const container = document.getElementById('bets-section-container') || document.createElement('section');
  container.id = 'bets-section-container';
  container.className = 'mb-10';
  container.setAttribute('aria-labelledby', 'bets-heading');
  container.innerHTML = '';

  let filteredBets = bets.filter(b => {
    // 1. Sport/Tab Filter
    if (currentSportFilter === 'Watchlist') {
      if (!watchlist.includes(b.id)) return false;
    } else if (currentSportFilter !== 'All') {
      if (b.sport !== currentSportFilter) return false;
    }

    // 2. EV Threshold Filter
    if (b.evPercent < minEvFilter) return false;

    // 3. Bookmaker Filter
    if (bookmakerFilter !== 'All') {
      const hasBook = b.allOdds.some(odd => odd.bookmaker === bookmakerFilter);
      if (!hasBook) return false;
    }

    return true;
  });

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredBets = filteredBets.filter(b => 
      b.outcome.toLowerCase().includes(query) ||
      b.homeTeam.toLowerCase().includes(query) ||
      b.awayTeam.toLowerCase().includes(query)
    );
  }

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
      <th scope="col" class="px-4 py-3 w-10 text-center">Sim</th>
      <th scope="col" class="px-4 py-3 w-10 text-center">Watch</th>
      <th scope="col" class="px-4 py-3 w-10 text-center">Track</th>
      <th scope="col" class="px-4 py-3">Event / Selection</th>
      <th scope="col" class="px-4 py-3">Market</th>
      <th scope="col" class="px-4 py-3 text-center cursor-pointer hover:text-neutral-100 transition-colors" id="sort-odds">
        <span class="tooltip">Best Odds ${getSortIconIndicator('odds')}
          <span class="tooltiptext">The highest available odds in the market for this outcome.</span>
        </span>
      </th>
      <th scope="col" class="px-4 py-3 text-center">Bookmaker</th>
      <th scope="col" class="px-4 py-3 text-center cursor-pointer hover:text-neutral-100 transition-colors" id="sort-ev">
        <span class="tooltip">EV Edge ${getSortIconIndicator('ev')}
          <span class="tooltiptext">Expected Value: The theoretical margin of profit relative to the consensus fair odds.</span>
        </span>
      </th>
      <th scope="col" class="px-4 py-3 w-[250px]">Mathematical Rationale</th>
    </tr>
  `;
  table.appendChild(thead);

  thead.querySelector('#sort-odds')?.addEventListener('click', () => handleSort('odds'));
  thead.querySelector('#sort-ev')?.addEventListener('click', () => handleSort('ev'));

  const tbody = document.createElement('tbody');
  tbody.className = 'divide-y divide-neutral-850';

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

    let evBadgeStyle = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    let rowHighlightClass = '';
    let cardHighlightClass = '';

    if (b.evPercent >= 0.10) {
      evBadgeStyle = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30 font-black animate-pulse';
      rowHighlightClass = ' border-l-2 border-l-yellow-500/70 bg-yellow-950/5';
      cardHighlightClass = ' border-yellow-500/40 shadow-yellow-500/5 bg-yellow-950/5';
    } else if (b.evPercent >= 0.08) {
      evBadgeStyle = 'text-primary-300 bg-primary-500/15 border-primary-500/30 font-extrabold';
      rowHighlightClass = ' border-l-2 border-l-primary-500/50 bg-primary-950/5';
      cardHighlightClass = ' border-primary-500/40 shadow-primary-500/5 bg-primary-950/5';
    } else if (b.evPercent < 0.03) {
      evBadgeStyle = 'text-neutral-400 bg-neutral-800 border-neutral-700';
    }

    const trueProbPct = Math.round(b.consensusImpliedProb * 100);

    const tr = document.createElement('tr');
    tr.className = `hover:bg-neutral-850/30 transition-colors group new-bet-row${rowHighlightClass}`;
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
      <td class="px-4 py-3.5 text-center">
        <button class="track-bet-btn text-xs bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 hover:border-primary-500/50 rounded px-1.5 py-0.5 cursor-pointer font-bold transition-all"
                data-outcome="${b.outcome}" data-matchup="${b.awayTeam} @ ${b.homeTeam}" data-price="${b.bestPrice}" data-sport="${b.sport}" data-market="${b.marketLabel}">
          🎯 Track
        </button>
      </td>
      <td class="px-4 py-3.5">
        <div class="flex items-start gap-2.5">
          <span class="text-base select-none mt-0.5" role="img" aria-label="${sportInfo.label}">${sportInfo.emoji}</span>
          <div class="w-full">
            <div class="font-extrabold text-neutral-100 group-hover:text-primary-400 transition-colors flex items-center gap-2">
              <span>${b.outcome}</span>
              <span class="text-[9px] text-neutral-550 font-bold">📈</span>
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

    const card = document.createElement('div');
    card.className = `card border border-neutral-800 bg-neutral-900/40 p-4 space-y-3 relative overflow-hidden new-bet-row${cardHighlightClass}`;
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
            Sim
          </label>
          <button class="watchlist-btn text-lg text-neutral-600 hover:text-amber-400 transition-colors" 
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

      <div class="flex gap-2 border-t border-neutral-850 pt-2.5">
        <button class="track-bet-btn flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 hover:border-primary-500/50 rounded text-[11px] font-bold cursor-pointer transition-all text-center"
                data-outcome="${b.outcome}" data-matchup="${b.awayTeam} @ ${b.homeTeam}" data-price="${b.bestPrice}" data-sport="${b.sport}" data-market="${b.marketLabel}">
          🎯 Track Bet
        </button>
      </div>
    `;
    mobileGrid.appendChild(card);

    setTimeout(() => {
      tr.querySelector(`#compare-btn-${b.id}`)?.addEventListener('click', () => openComparisonModal(b));
      card.querySelector(`#compare-btn-mobile-${b.id}`)?.addEventListener('click', () => openComparisonModal(b));
    }, 0);
  });

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
  container.appendChild(mobileGrid);

  setTimeout(() => {
    container.querySelectorAll('.watchlist-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) toggleWatchlistItem(id);
      });
    });

    container.querySelectorAll('.track-bet-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const outcome = target.getAttribute('data-outcome')!;
        const matchup = target.getAttribute('data-matchup')!;
        const price = parseInt(target.getAttribute('data-price')!, 10);
        const sport = target.getAttribute('data-sport')!;
        const market = target.getAttribute('data-market')!;
        openTrackBetModal(outcome, matchup, price, sport, market);
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

function renderTrackerView(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'mb-10 animate-fade-in';
  container.setAttribute('aria-labelledby', 'tracker-heading');

  const total = trackedBets.length;
  const wins = trackedBets.filter(b => b.status === 'won').length;
  const losses = trackedBets.filter(b => b.status === 'lost').length;
  const pending = trackedBets.filter(b => b.status === 'pending').length;
  
  const winRate = (total - pending) > 0 ? (wins / (wins + losses)) * 100 : 0;

  const totalRisked = trackedBets.reduce((sum, b) => sum + b.stake, 0);
  const totalProfit = trackedBets.reduce((sum, b) => {
    if (b.status === 'pending') return sum;
    if (b.status === 'lost') return sum - b.stake;
    const multiplier = americanToDecimal(b.price);
    const profit = b.stake * (multiplier - 1);
    return sum + profit;
  }, 0);
  const yieldPercent = totalRisked > 0 ? (totalProfit / totalRisked) * 100 : 0;

  // Calculate Average Odds played (convert to decimal first, average, convert back)
  const resolved = trackedBets.filter(b => b.status !== 'pending');
  const avgDecimalOdds = resolved.length > 0
    ? resolved.reduce((sum, b) => sum + americanToDecimal(b.price), 0) / resolved.length
    : 1;
  const avgOddsFormatted = resolved.length > 0
    ? formatOdds(decimalToAmerican(avgDecimalOdds))
    : 'N/A';

  // Calculate active win/loss streak in chronological order
  const chronologicalResolved = [...trackedBets]
    .filter(b => b.status !== 'pending')
    .sort((a, b) => new Date(a.trackedAt).getTime() - new Date(b.trackedAt).getTime());
  
  let streakText = 'No streak';
  if (chronologicalResolved.length > 0) {
    const lastBet = chronologicalResolved[chronologicalResolved.length - 1];
    const type = lastBet.status;
    let count = 0;
    for (let i = chronologicalResolved.length - 1; i >= 0; i--) {
      if (chronologicalResolved[i].status === type) {
        count++;
      } else {
        break;
      }
    }
    streakText = type === 'won' ? `🔥 ${count} Win Streak` : `❄️ ${count} Loss Streak`;
  }

  // Stats widgets header row
  const statsHtml = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Record (W - L)</span>
        <span class="text-lg font-black text-neutral-100 mt-1 block">${wins} - ${losses}</span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block">${pending} Pending Bets</span>
      </div>
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Win Rate</span>
        <span class="text-lg font-black text-primary-400 mt-1 block">${winRate.toFixed(1)}%</span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block font-bold ${chronologicalResolved.length > 0 && chronologicalResolved[chronologicalResolved.length - 1].status === 'won' ? 'text-emerald-405' : 'text-rose-450'}">${streakText}</span>
      </div>
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center relative overflow-hidden">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Net Profit / Loss</span>
        <span class="text-lg font-black mt-1 block ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
          ${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}
        </span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block">Yield: <span class="font-extrabold ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${totalProfit >= 0 ? '+' : ''}${yieldPercent.toFixed(1)}%</span></span>
      </div>
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Average Odds</span>
        <span class="text-lg font-black mt-1 block text-neutral-200">${avgOddsFormatted}</span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block">Risked: $${totalRisked.toFixed(0)}</span>
      </div>
    </div>
  `;

  let logListHtml = '';
  if (total === 0) {
    logListHtml = `
      <div class="card border border-neutral-800 bg-neutral-900/10 p-12 text-center text-neutral-550 text-xs">
        <span class="text-3xl mb-3 block" role="img" aria-label="Target Icon">🎯</span>
        Your Tracked Bets Log is empty.<br>Click "🎯 Track" next to any Value Bet or simulated parlay to start recording wins and losses.
      </div>
    `;
  } else {
    // Reverse chronological order (latest tracked first)
    const reversedBets = [...trackedBets].reverse();

    const tableRowsHtml = reversedBets.map((b) => {
      const formattedDate = new Date(b.trackedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const multiplier = americanToDecimal(b.price);
      const toReturn = b.stake * multiplier;
      const profitVal = toReturn - b.stake;

      let statusBadge = '';
      let payoutText = '';
      let actionButtons = '';

      if (b.status === 'pending') {
        statusBadge = `<span class="px-2 py-0.5 text-[9px] font-black border border-amber-500/20 bg-amber-500/10 text-amber-400 rounded-full uppercase">Pending</span>`;
        payoutText = `<span class="text-neutral-400 font-semibold">$0.00</span>`;
        actionButtons = `
          <button class="win-btn bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold border border-emerald-500/20 transition-all cursor-pointer" data-id="${b.id}">✓ Won</button>
          <button class="loss-btn bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-2 py-1 rounded text-[10px] font-bold border border-rose-500/20 transition-all cursor-pointer" data-id="${b.id}">✗ Lost</button>
        `;
      } else if (b.status === 'won') {
        statusBadge = `<span class="px-2 py-0.5 text-[9px] font-black border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 rounded-full uppercase">Won</span>`;
        payoutText = `<span class="text-emerald-400 font-extrabold">+$${profitVal.toFixed(2)}</span>`;
        actionButtons = `<button class="revert-btn bg-neutral-800 hover:bg-neutral-750 text-neutral-350 px-2 py-1 rounded text-[10px] font-bold border border-neutral-700 transition-all cursor-pointer" data-id="${b.id}">↩ Revert</button>`;
      } else {
        statusBadge = `<span class="px-2 py-0.5 text-[9px] font-black border border-rose-500/20 bg-rose-500/10 text-rose-400 rounded-full uppercase">Lost</span>`;
        payoutText = `<span class="text-rose-400 font-extrabold">-$${b.stake.toFixed(2)}</span>`;
        actionButtons = `<button class="revert-btn bg-neutral-800 hover:bg-neutral-750 text-neutral-350 px-2 py-1 rounded text-[10px] font-bold border border-neutral-700 transition-all cursor-pointer" data-id="${b.id}">↩ Revert</button>`;
      }

      return `
        <tr class="hover:bg-neutral-850/20 transition-colors text-xs border-b border-neutral-850">
          <td class="px-4 py-3.5">
            <div class="font-extrabold text-neutral-100">${b.outcome}</div>
            <div class="text-[10px] text-neutral-455 font-semibold mt-0.5">${b.matchup}</div>
            <span class="text-[9px] bg-neutral-800 text-neutral-400 px-1 rounded inline-block mt-1 font-bold">${b.sport} • ${b.marketLabel}</span>
          </td>
          <td class="px-4 py-3.5 text-center font-black text-neutral-200">${formatOdds(b.price)}</td>
          <td class="px-4 py-3.5 text-center font-bold text-neutral-300">$${b.stake.toFixed(2)}</td>
          <td class="px-4 py-3.5 text-center">${payoutText}</td>
          <td class="px-4 py-3.5 text-center">${statusBadge}</td>
          <td class="px-4 py-3.5 text-center text-[9px] text-neutral-505 font-semibold">${formattedDate}</td>
          <td class="px-4 py-3.5 text-center">
            <div class="flex items-center justify-center gap-1.5">
              ${actionButtons}
              <button class="delete-tracked-btn text-rose-500 hover:text-rose-400 px-1.5 py-1 text-sm font-extrabold cursor-pointer transition-all" data-id="${b.id}" title="Delete Record">🗑</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const mobileCardsHtml = reversedBets.map((b) => {
      const formattedDate = new Date(b.trackedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const multiplier = americanToDecimal(b.price);
      const toReturn = b.stake * multiplier;
      const profitVal = toReturn - b.stake;

      let statusBadge = '';
      let payoutText = '';
      let actionButtons = '';

      if (b.status === 'pending') {
        statusBadge = `<span class="px-2 py-0.5 text-[9px] font-black border border-amber-500/20 bg-amber-500/10 text-amber-400 rounded-full uppercase">Pending</span>`;
        payoutText = `<span class="text-neutral-450 font-semibold">$0.00</span>`;
        actionButtons = `
          <button class="win-btn flex-1 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded text-[11px] font-bold border border-emerald-500/20 cursor-pointer transition-all" data-id="${b.id}">Won</button>
          <button class="loss-btn flex-1 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded text-[11px] font-bold border border-rose-500/20 cursor-pointer transition-all" data-id="${b.id}">Lost</button>
        `;
      } else if (b.status === 'won') {
        statusBadge = `<span class="px-2 py-0.5 text-[9px] font-black border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 rounded-full uppercase">Won</span>`;
        payoutText = `<span class="text-emerald-400 font-extrabold">+$${profitVal.toFixed(2)}</span>`;
        actionButtons = `<button class="revert-btn flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-350 rounded text-[11px] font-bold border border-neutral-700 cursor-pointer transition-all" data-id="${b.id}">Revert to Pending</button>`;
      } else {
        statusBadge = `<span class="px-2 py-0.5 text-[9px] font-black border border-rose-500/20 bg-rose-500/10 text-rose-400 rounded-full uppercase">Lost</span>`;
        payoutText = `<span class="text-rose-400 font-extrabold">-$${b.stake.toFixed(2)}</span>`;
        actionButtons = `<button class="revert-btn flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-350 rounded text-[11px] font-bold border border-neutral-700 cursor-pointer transition-all" data-id="${b.id}">Revert to Pending</button>`;
      }

      return `
        <div class="card border border-neutral-850 bg-neutral-900/40 p-4 space-y-3 relative">
          <div class="flex items-start justify-between border-b border-neutral-800 pb-2">
            <div>
              <div class="font-extrabold text-neutral-150 text-sm">${b.outcome}</div>
              <div class="text-[10px] text-neutral-500 font-semibold">${b.sport} • ${b.marketLabel}</div>
            </div>
            <button class="delete-tracked-btn text-rose-500 hover:text-rose-400 text-lg focus:outline-none cursor-pointer" data-id="${b.id}">🗑</button>
          </div>
          
          <div class="text-[10px] text-neutral-450 font-semibold leading-relaxed">${b.matchup}</div>
          
          <div class="grid grid-cols-3 gap-2 bg-neutral-950/40 p-2.5 rounded-lg border border-neutral-850 text-center">
            <div>
              <span class="text-[8px] text-neutral-500 font-bold uppercase tracking-wider block">Odds</span>
              <span class="text-xs font-extrabold text-neutral-255 mt-0.5 block">${formatOdds(b.price)}</span>
            </div>
            <div>
              <span class="text-[8px] text-neutral-500 font-bold uppercase tracking-wider block">Stake</span>
              <span class="text-xs font-extrabold text-neutral-300 mt-0.5 block">$${b.stake.toFixed(2)}</span>
            </div>
            <div>
              <span class="text-[8px] text-neutral-500 font-bold uppercase tracking-wider block">Payout</span>
              <span class="text-xs font-black mt-0.5 block">${payoutText}</span>
            </div>
          </div>
          
          <div class="flex items-center justify-between border-t border-neutral-850 pt-2">
            <div class="text-[9px] text-neutral-550 font-bold">${formattedDate}</div>
            ${statusBadge}
          </div>
          
          <div class="flex gap-2 pt-1 border-t border-neutral-850/40">
            ${actionButtons}
          </div>
        </div>
      `;
    }).join('');

    logListHtml = `
      <div class="hidden md:block overflow-x-auto rounded-xl border border-neutral-850 bg-neutral-900/20 backdrop-blur-sm shadow-xl">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-neutral-800 bg-neutral-900/60 text-[10px] font-bold text-neutral-450 uppercase tracking-wider select-none">
              <th scope="col" class="px-4 py-3">Bet Selection</th>
              <th scope="col" class="px-4 py-3 text-center">Odds</th>
              <th scope="col" class="px-4 py-3 text-center">Stake</th>
              <th scope="col" class="px-4 py-3 text-center">Payout</th>
              <th scope="col" class="px-4 py-3 text-center">Status</th>
              <th scope="col" class="px-4 py-3 text-center">Date Tracked</th>
              <th scope="col" class="px-4 py-3 text-center">Resolve Record</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-850">
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
      <div class="grid grid-cols-1 gap-4 md:hidden">
        ${mobileCardsHtml}
      </div>
    `;
  }

  // Graph Timeline canvas HTML
  const chartHtml = chronologicalResolved.length > 0 ? `
    <div class="card border border-neutral-800 bg-neutral-900/30 p-5 mb-6 relative overflow-hidden flex flex-col">
      <div class="flex items-center justify-between mb-4 select-none">
        <div class="text-[10px] text-neutral-455 font-bold uppercase tracking-wider">📊 Analytics Visualization</div>
        <div class="flex items-center gap-1.5 bg-neutral-950/40 p-1 rounded-lg border border-neutral-850">
          <button id="chart-tab-trend" class="px-2 py-1 text-[9px] font-black uppercase rounded transition-all cursor-pointer ${
            activeTrackerChartTab === 'trend'
              ? 'bg-neutral-850 text-neutral-100 shadow-sm border border-neutral-700'
              : 'text-neutral-500 hover:text-neutral-350'
          }">
            📈 Trendline
          </button>
          <button id="chart-tab-allocation" class="px-2 py-1 text-[9px] font-black uppercase rounded transition-all cursor-pointer ${
            activeTrackerChartTab === 'allocation'
              ? 'bg-neutral-850 text-neutral-100 shadow-sm border border-neutral-700'
              : 'text-neutral-500 hover:text-neutral-350'
          }">
            🍩 Allocation
          </button>
        </div>
      </div>
      <canvas id="profit-timeline-canvas" class="w-full h-48 bg-neutral-950/40 rounded-lg border border-neutral-850" style="max-height: 192px;"></canvas>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-neutral-850 pb-3">
      <h2 id="tracker-heading" class="text-lg font-black text-neutral-100 flex items-center gap-2">
        <span>📈</span> Bet Performance Record
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <button id="export-history-btn" class="px-2.5 py-1 text-[10px] font-bold border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-350 rounded-lg transition-all cursor-pointer">
          📥 Export JSON
        </button>
        <button id="import-history-btn" class="px-2.5 py-1 text-[10px] font-bold border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-350 rounded-lg transition-all cursor-pointer">
          📤 Import JSON
        </button>
        <input type="file" id="import-history-file" class="hidden" accept=".json" />
        <div class="w-px h-5 bg-neutral-800 mx-1"></div>
        <button id="clear-history-btn" class="px-2.5 py-1 text-[10px] font-bold border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 rounded-lg transition-all cursor-pointer">
          Clear History
        </button>
      </div>
    </div>
    
    ${statsHtml}
    
    ${chartHtml}
    
    <div class="text-[10px] text-neutral-450 font-bold uppercase tracking-wider mb-3">Tracked Bets History Log</div>
    ${logListHtml}
  `;

  // Attach dynamic resolvers listeners & Draw chart
  setTimeout(() => {
    // Export handler
    container.querySelector('#export-history-btn')?.addEventListener('click', () => {
      if (trackedBets.length === 0) {
        showToast('No tracked bets to export.', 'error');
        return;
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(trackedBets));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `parlay_tracker_history_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Tracker history exported!', 'success');
    });

    // Import click triggers file input click
    const importFileInput = container.querySelector('#import-history-file') as HTMLInputElement;
    container.querySelector('#import-history-btn')?.addEventListener('click', () => {
      importFileInput.click();
    });

    // Import file select handler
    importFileInput?.addEventListener('change', (e) => {
      const fileInput = e.target as HTMLInputElement;
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target?.result as string);
            if (Array.isArray(imported)) {
              const valid = imported.every(item => item && typeof item.id === 'string' && typeof item.stake === 'number');
              if (valid) {
                trackedBets = imported;
                saveTrackedBets();
                showToast('Tracker history imported!', 'success');
                renderApp();
              } else {
                showToast('Invalid file format structure.', 'error');
              }
            } else {
              showToast('Must be a valid JSON array.', 'error');
            }
          } catch (err) {
            showToast('Failed to parse import JSON.', 'error');
          }
        };
        reader.readAsText(file);
      }
    });

    // Clear history handler
    container.querySelector('#clear-history-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete ALL tracked bets from history? This action is permanent.')) {
        trackedBets = [];
        saveTrackedBets();
        showToast('Bet history cleared.', 'info');
        renderApp();
      }
    });

    // Render cumulative canvas profit graph or allocation chart
    const canvas = container.querySelector('#profit-timeline-canvas') as HTMLCanvasElement;
    if (canvas) {
      if (activeTrackerChartTab === 'trend') {
        drawProfitChart(canvas);
      } else {
        drawSportAllocationChart(canvas);
      }
    }

    container.querySelector('#chart-tab-trend')?.addEventListener('click', () => {
      activeTrackerChartTab = 'trend';
      renderApp();
    });

    container.querySelector('#chart-tab-allocation')?.addEventListener('click', () => {
      activeTrackerChartTab = 'allocation';
      renderApp();
    });

    container.querySelectorAll('.win-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        updateBetStatus(id, 'won');
      });
    });

    container.querySelectorAll('.loss-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        updateBetStatus(id, 'lost');
      });
    });

    container.querySelectorAll('.revert-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        updateBetStatus(id, 'pending');
      });
    });

    container.querySelectorAll('.delete-tracked-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
        deleteTrackedBet(id);
      });
    });
  }, 0);

  return container;
}

// Render dynamic HTML5 Canvas Profit Chart
function drawProfitChart(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set logical dimensions for high DPI
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const width = rect.width;
  const height = rect.height;

  // Calculate cumulative profit points
  const chronologicalResolved = [...trackedBets]
    .filter(b => b.status !== 'pending')
    .sort((a, b) => new Date(a.trackedAt).getTime() - new Date(b.trackedAt).getTime());

  let profitTimeline = [0];
  let currentProfit = 0;
  chronologicalResolved.forEach(b => {
    if (b.status === 'won') {
      const multiplier = americanToDecimal(b.price);
      currentProfit += b.stake * (multiplier - 1);
    } else if (b.status === 'lost') {
      currentProfit -= b.stake;
    }
    profitTimeline.push(currentProfit);
  });

  const n = profitTimeline.length;
  const minVal = Math.min(...profitTimeline, 0);
  const maxVal = Math.max(...profitTimeline, 0);
  const range = maxVal - minVal === 0 ? 100 : maxVal - minVal;

  // Layout parameters
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 25;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Clear background
  ctx.clearRect(0, 0, width, height);

  // Draw grid lines and labels
  ctx.strokeStyle = '#1e1e1e';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#737373';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const val = minVal + (range * i) / gridSteps;
    const y = height - paddingBottom - (chartHeight * i) / gridSteps;

    // Draw horizontal grid line
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    // Draw axis label
    ctx.fillText(`${val >= 0 ? '+' : ''}$${val.toFixed(0)}`, paddingLeft - 8, y);
  }

  // Draw timeline path
  if (n > 1) {
    const points = profitTimeline.map((val, idx) => {
      const x = paddingLeft + (chartWidth * idx) / (n - 1);
      const y = height - paddingBottom - (chartHeight * (val - minVal)) / range;
      return { x, y };
    });

    // Create gradient fill underneath timeline line
    const areaGrad = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
    areaGrad.addColorStop(0, 'rgba(0, 198, 162, 0.15)');
    areaGrad.addColorStop(1, 'rgba(0, 198, 162, 0.0)');
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - paddingBottom - (chartHeight * (0 - minVal)) / range); // Start at zero axis y value
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height - paddingBottom);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Draw trend line
    ctx.strokeStyle = '#00c6a2'; // Emerald green
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Draw grid dot markers on points
    points.forEach((p, idx) => {
      const isLast = idx === points.length - 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isLast ? 4 : 2, 0, 2 * Math.PI);
      ctx.fillStyle = isLast ? '#facc15' : '#00c6a2'; // Gold for latest endpoint
      ctx.fill();
      if (isLast) {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    });
  } else {
    // Empty state text
    ctx.fillStyle = '#404040';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO RESOLVED BET DATA YET', width / 2, height / 2);
  }
}

// Render dynamic HTML5 Canvas Sport Risk Allocation Donut Chart
function drawSportAllocationChart(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const w = rect.width;
  const h = rect.height;

  // Clear background
  ctx.clearRect(0, 0, w, h);

  // Group bets by sport (calculate total stakes placed per sport)
  const allocation: Record<string, number> = {};
  let totalStaked = 0;
  trackedBets.forEach(b => {
    const sport = b.sport || 'Multi-Sport';
    allocation[sport] = (allocation[sport] || 0) + b.stake;
    totalStaked += b.stake;
  });

  const sports = Object.keys(allocation);
  if (sports.length === 0 || totalStaked === 0) {
    ctx.fillStyle = '#737373';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO TRACKED BET DATA YET', w / 2, h / 2);
    return;
  }

  // Curated premium HSL colors for sports segments
  const colors = [
    'hsl(169, 100%, 39%)',  // primary emerald-cyan
    'hsl(48, 96%, 53%)',   // golden EV
    'hsl(217, 91%, 60%)',  // sports blue
    'hsl(262, 83%, 58%)',  // purple highlight
    'hsl(339, 90%, 51%)',  // rose pink
    'hsl(25, 95%, 53%)'    // warm orange
  ];

  let startAngle = -Math.PI / 2; // Start drawing at the top
  const centerX = w * 0.35;
  const centerY = h / 2;
  const outerRadius = Math.min(centerX, centerY) * 0.75;
  const innerRadius = outerRadius * 0.6; // Donut hole size

  sports.forEach((sport, idx) => {
    const stake = allocation[sport];
    const percentage = stake / totalStaked;
    const sliceAngle = percentage * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    const color = colors[idx % colors.length];

    // Draw donut slice
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();

    // Subtle gap border between segments
    ctx.strokeStyle = '#171717';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    startAngle = endAngle;
  });

  // Draw central stats texts inside the donut hole
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RISKED', centerX, centerY - 6);

  ctx.fillStyle = '#a3a3a3';
  ctx.font = 'black 10px monospace';
  ctx.fillText(`$${totalStaked.toFixed(0)}`, centerX, centerY + 6);

  // Draw Legend columns on the right side
  const legendX = w * 0.70;
  let legendY = h / 2 - (sports.length * 15) / 2 + 5;
  
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 8px monospace';

  sports.forEach((sport, idx) => {
    const stake = allocation[sport];
    const pct = (stake / totalStaked) * 100;
    const color = colors[idx % colors.length];

    // Colored square bullet
    ctx.fillStyle = color;
    ctx.fillRect(legendX - 12, legendY - 3, 6, 6);

    // Label text
    ctx.fillStyle = '#d4d4d4';
    ctx.fillText(`${sport}: ${pct.toFixed(0)}%`, legendX, legendY);

    legendY += 15;
  });
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

function renderParlayCalculator(): HTMLElement {
  const container = document.createElement('section');
  container.id = 'parlay-calculator-section';
  container.className = 'card border border-neutral-800 bg-neutral-900/40 shadow-2xl p-6 mb-8';
  container.setAttribute('aria-labelledby', 'calculator-title');

  // Calculator Sub-Tabs Header
  const tabHeaderHtml = `
    <div class="flex items-center gap-4 border-b border-neutral-800 pb-3 mb-4 select-none">
      <button id="calc-tab-parlay" class="text-xs font-black uppercase tracking-widest pb-1 border-b-2 cursor-pointer transition-all ${
        activeCalculatorTab === 'parlay'
          ? 'border-primary-500 text-neutral-100'
          : 'border-transparent text-neutral-500 hover:text-neutral-350'
      }">
        🚀 Parlay Builder
      </button>
      <button id="calc-tab-hedge" class="text-xs font-black uppercase tracking-widest pb-1 border-b-2 cursor-pointer transition-all ${
        activeCalculatorTab === 'hedge'
          ? 'border-primary-500 text-neutral-100'
          : 'border-transparent text-neutral-500 hover:text-neutral-350'
      }">
        ⚖️ Hedge Calculator
      </button>
      <button id="calc-tab-custom" class="text-xs font-black uppercase tracking-widest pb-1 border-b-2 cursor-pointer transition-all ${
        activeCalculatorTab === 'customEv'
          ? 'border-primary-500 text-neutral-100'
          : 'border-transparent text-neutral-500 hover:text-neutral-350'
      }">
        📐 Custom EV Vet
      </button>
    </div>
  `;

  if (activeCalculatorTab === 'parlay') {
    const legsCount = simulatedLegs.length;

    if (legsCount === 0) {
      container.innerHTML = `
        ${tabHeaderHtml}
        <h2 id="calculator-title" class="sr-only">Interactive Parlay Calculator</h2>
        <div class="text-center py-6 text-neutral-500 text-xs">
          <span class="text-2xl mb-2 block">🔲</span>
          Check the checkboxes on any Value Bets above to build and calculate your custom parlay card.
        </div>
      `;
      
      // Attach tab change listeners
      setTimeout(() => {
        container.querySelector('#calc-tab-hedge')?.addEventListener('click', () => {
          activeCalculatorTab = 'hedge';
          renderSimulatorApp();
        });
        container.querySelector('#calc-tab-custom')?.addEventListener('click', () => {
          activeCalculatorTab = 'customEv';
          renderSimulatorApp();
        });
      }, 0);

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
      ${tabHeaderHtml}
      <h2 id="calculator-title" class="sr-only">Custom Parlay Simulator</h2>
      
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
              <label for="stake-input" class="font-bold text-neutral-455">Stake ($)</label>
              <input id="stake-input" type="number" min="1" value="${betStake}" 
                     class="w-20 px-2 py-1 bg-neutral-900 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-right text-xs" />
            </div>

            <div class="flex items-center justify-between text-xs pt-1">
              <span class="font-bold text-neutral-400">Potential Return</span>
              <span class="font-black text-emerald-400">$${potentialReturn.toFixed(2)}</span>
            </div>
            <div class="flex items-center justify-between text-xs border-b border-neutral-805 pb-3">
              <span class="font-bold text-neutral-400">Net Profit</span>
              <span class="font-bold text-neutral-200">$${potentialProfit.toFixed(2)}</span>
            </div>
            
            <button id="track-parlay-btn" class="w-full py-2 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-black rounded-lg cursor-pointer transition-all active:scale-95 text-xs text-center">
              🎯 Track Custom Parlay
            </button>
          </div>
        </div>
      </div>
    `;

    // Attach interactive listeners
    setTimeout(() => {
      container.querySelector('#calc-tab-hedge')?.addEventListener('click', () => {
        activeCalculatorTab = 'hedge';
        renderSimulatorApp();
      });
      container.querySelector('#calc-tab-custom')?.addEventListener('click', () => {
        activeCalculatorTab = 'customEv';
        renderSimulatorApp();
      });

      container.querySelector('#stake-input')?.addEventListener('input', (e) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(value) && value > 0) {
          betStake = value;
          renderSimulatorApp();
        }
      });

      container.querySelector('#track-parlay-btn')?.addEventListener('click', () => {
        trackSimulatedParlay();
      });

      container.querySelectorAll('.remove-leg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).getAttribute('data-id')!;
          simulatedLegs = simulatedLegs.filter(l => l.betId !== id);
          renderApp();
        });
      });
    }, 0);

  } else if (activeCalculatorTab === 'hedge') {
    // Render Hedge / Arbitrage Calculator Tab
    const dec1 = americanToDecimal(hedgePrimaryOdds);
    const dec2 = americanToDecimal(hedgeOpposingOdds);
    
    const payout1 = hedgePrimaryStake * dec1;
    
    // Check for arbitrage margin
    const implied1 = 1 / dec1;
    const implied2 = 1 / dec2;
    const totalImplied = implied1 + implied2;
    const isArb = totalImplied < 1.0;

    // Equalizer profit hedge
    const optimalHedgeStake = payout1 / dec2;
    const totalCost = hedgePrimaryStake + optimalHedgeStake;
    const guaranteedProfit = payout1 - totalCost;
    const guaranteedROI = (guaranteedProfit / totalCost) * 100;

    // Risk-free refund hedge
    const refundHedgeStake = hedgePrimaryStake / (dec2 - 1);

    container.innerHTML = `
      ${tabHeaderHtml}
      <h2 id="calculator-title" class="sr-only">Hedge / Arbitrage Calculator</h2>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Input section -->
        <div class="lg:col-span-6 bg-neutral-950/30 border border-neutral-850 p-4 rounded-xl space-y-4">
          <div class="text-[10px] text-neutral-500 font-black uppercase tracking-wider mb-1">Hedge Parameters Configuration</div>
          
          <div class="space-y-3.5 text-xs">
            <div class="flex flex-col gap-1">
              <label for="hedge-prim-stake" class="font-bold text-neutral-450">Primary Bet Stake ($)</label>
              <input id="hedge-prim-stake" type="number" min="1" value="${hedgePrimaryStake}" 
                     class="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs" />
            </div>
            
            <div class="grid grid-cols-2 gap-3.5">
              <div class="flex flex-col gap-1">
                <label for="hedge-prim-odds" class="font-bold text-neutral-455">Primary Odds (American)</label>
                <input id="hedge-prim-odds" type="number" value="${hedgePrimaryOdds}" 
                       class="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs" />
                <span class="text-[9px] text-neutral-500 font-semibold mt-0.5">Decimal: ${dec1.toFixed(2)}</span>
              </div>
              <div class="flex flex-col gap-1">
                <label for="hedge-opp-odds" class="font-bold text-neutral-455">Opposing Odds (American)</label>
                <input id="hedge-opp-odds" type="number" value="${hedgeOpposingOdds}" 
                       class="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs" />
                <span class="text-[9px] text-neutral-500 font-semibold mt-0.5">Decimal: ${dec2.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Output section -->
        <div class="lg:col-span-6 space-y-4">
          <div class="bg-neutral-950/50 border border-neutral-850/80 p-4 rounded-xl space-y-3">
            <div class="text-[10px] text-neutral-450 font-black uppercase tracking-wider mb-1">Optimal Calculations</div>
            
            ${
              isArb
                ? `<div class="p-3 bg-emerald-950/40 rounded-lg border border-emerald-500/25 text-xs space-y-1">
                     <div class="flex justify-between items-center">
                       <span class="font-extrabold text-emerald-400">⚖️ Arbitrage Opportunity Found!</span>
                       <span class="text-[8px] bg-emerald-500 text-neutral-950 font-black px-1.5 rounded">MARGIN: +${((1 - totalImplied) * 100).toFixed(1)}%</span>
                     </div>
                     <p class="text-[9px] text-neutral-400 leading-relaxed mt-1">Odds are mispriced between bookmakers. Betting both outcomes secures a risk-free profit.</p>
                   </div>`
                : `<div class="p-3 bg-neutral-900/60 rounded-lg border border-neutral-850 text-xs space-y-1">
                     <span class="font-bold text-neutral-450 block">Hedge Calculation Basis</span>
                     <p class="text-[9px] text-neutral-500 leading-relaxed">No direct arbitrage exists. Use the hedge calculator to lock in profits or neutralize risk.</p>
                   </div>`
            }

            <div class="space-y-2 text-xs pt-1">
              <div class="flex justify-between border-b border-neutral-850/50 pb-2">
                <span class="text-neutral-450 font-semibold">Optimal Hedge Stake:</span>
                <span class="font-extrabold text-primary-400">$${optimalHedgeStake.toFixed(2)}</span>
              </div>
              <div class="flex justify-between border-b border-neutral-850/50 pb-2">
                <span class="text-neutral-450 font-semibold">Total Outlay:</span>
                <span class="font-bold text-neutral-350">$${totalCost.toFixed(2)}</span>
              </div>
              <div class="flex justify-between border-b border-neutral-850/50 pb-2">
                <span class="text-neutral-450 font-semibold">Equalized Payout:</span>
                <span class="font-bold text-neutral-200">$${payout1.toFixed(2)}</span>
              </div>
              <div class="flex justify-between items-center pt-1">
                <span class="font-extrabold text-neutral-200">Guaranteed Return:</span>
                <span class="font-black text-sm ${guaranteedProfit >= 0 ? 'text-emerald-450' : 'text-rose-400'}">
                  ${guaranteedProfit >= 0 ? '+' : ''}$${guaranteedProfit.toFixed(2)} (${guaranteedROI.toFixed(1)}% ROI)
                </span>
              </div>
            </div>

            <!-- Risk free refund stake alternative -->
            <div class="mt-3 pt-3 border-t border-neutral-800 space-y-2 text-xs">
              <span class="text-[9px] text-neutral-500 font-black uppercase tracking-wider block">Risk-Refund Alternative</span>
              <div class="p-2.5 bg-neutral-900/40 rounded-lg border border-neutral-850 space-y-1.5">
                <div class="flex justify-between">
                  <span class="text-neutral-450 font-semibold">Refund Hedge Stake:</span>
                  <span class="font-bold text-neutral-300">$${refundHedgeStake.toFixed(2)}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-neutral-450 font-semibold">Profit if Primary Wins:</span>
                  <span class="font-extrabold text-emerald-450">+$${(payout1 - hedgePrimaryStake - refundHedgeStake).toFixed(2)}</span>
                </div>
                <div class="flex justify-between text-[10px] text-neutral-500">
                  <span>Profit if Opposing Wins:</span>
                  <span>$0.00 (Stake Returned)</span>
                </div>
              </div>
            </div>
            
            <button id="track-hedge-btn" class="w-full mt-3 py-2 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 font-bold border border-neutral-700 hover:border-primary-500/50 rounded-lg cursor-pointer transition-all active:scale-95 text-xs text-center">
              🎯 Track Hedge Bet
            </button>
          </div>
        </div>
      </div>
    `;

    // Attach listeners for Hedge tab
    setTimeout(() => {
      container.querySelector('#calc-tab-parlay')?.addEventListener('click', () => {
        activeCalculatorTab = 'parlay';
        renderSimulatorApp();
      });
      container.querySelector('#calc-tab-custom')?.addEventListener('click', () => {
        activeCalculatorTab = 'customEv';
        renderSimulatorApp();
      });

      const primStakeInput = container.querySelector('#hedge-prim-stake') as HTMLInputElement;
      const primOddsInput = container.querySelector('#hedge-prim-odds') as HTMLInputElement;
      const oppOddsInput = container.querySelector('#hedge-opp-odds') as HTMLInputElement;

      primStakeInput?.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val) && val > 0) {
          hedgePrimaryStake = val;
          renderSimulatorApp();
        }
      });

      primOddsInput?.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        if (!isNaN(val)) {
          hedgePrimaryOdds = val;
          renderSimulatorApp();
        }
      });

      oppOddsInput?.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        if (!isNaN(val)) {
          hedgeOpposingOdds = val;
          renderSimulatorApp();
        }
      });

      container.querySelector('#track-hedge-btn')?.addEventListener('click', () => {
        openTrackBetModal(
          `Hedge against ${hedgePrimaryOdds >= 0 ? `+${hedgePrimaryOdds}` : hedgePrimaryOdds}`,
          `Primary bet stake: $${hedgePrimaryStake.toFixed(0)}`,
          hedgeOpposingOdds,
          'Multi-Sport',
          'Hedge bet'
        );
      });
    }, 0);

  } else {
    // Render Custom EV Vet & Monte Carlo Tab
    const decOdds = americanToDecimal(customEvOdds);
    const ev = (customEvWinProb / 100) * decOdds - 1;
    const evEdgePercent = ev * 100;

    const bFactor = decOdds - 1;
    const pWin = customEvWinProb / 100;
    let kellyStakePct = 0;
    if (bFactor > 0) {
      kellyStakePct = (pWin * (bFactor + 1) - 1) / bFactor;
    }
    if (kellyStakePct < 0) kellyStakePct = 0;
    const sugKellyStakePct = kellyStakePct * 0.25;

    container.innerHTML = `
      ${tabHeaderHtml}
      <h2 id="calculator-title" class="sr-only">Custom EV Vet & Monte Carlo Simulator</h2>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Inputs Column -->
        <div class="lg:col-span-5 bg-neutral-950/30 border border-neutral-850 p-4 rounded-xl space-y-4">
          <div class="text-[10px] text-neutral-500 font-black uppercase tracking-wider mb-1">Vet Custom Selections</div>
          
          <div class="space-y-3.5 text-xs">
            <div class="flex flex-col gap-1.5">
              <div class="flex justify-between items-center">
                <label for="custom-win-prob" class="font-bold text-neutral-450">Consensus Win Probability</label>
                <span class="font-black text-neutral-200" id="custom-win-prob-val">${customEvWinProb}%</span>
              </div>
              <input id="custom-win-prob" type="range" min="1" max="99" value="${customEvWinProb}" 
                     class="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-primary-500" />
            </div>

            <div class="flex flex-col gap-1">
              <label for="custom-odds" class="font-bold text-neutral-450">My Odds (American)</label>
              <input id="custom-odds" type="number" value="${customEvOdds}" 
                     class="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs" />
              <div class="flex justify-between text-[9px] text-neutral-500 font-semibold mt-1">
                <span>Decimal Odds: ${decOdds.toFixed(2)}</span>
                <span>Break-Even Prob: ${(100 / decOdds).toFixed(1)}%</span>
              </div>
            </div>

            <div class="p-3 rounded-lg border text-xs space-y-2 ${
              evEdgePercent > 0
                ? 'bg-emerald-950/20 border-emerald-500/20'
                : 'bg-rose-950/20 border-rose-500/20'
            }">
              <div class="flex justify-between items-center">
                <span class="font-bold text-neutral-400">Expected Value:</span>
                <span class="font-black text-sm ${evEdgePercent > 0 ? 'text-emerald-450' : 'text-rose-400'}">
                  ${evEdgePercent > 0 ? '+' : ''}${evEdgePercent.toFixed(1)}% Edge
                </span>
              </div>
              
              <div class="flex justify-between text-[10px] text-neutral-500">
                <span>Suggested Stake (1/4 Kelly):</span>
                <span class="font-bold text-neutral-350">${(sugKellyStakePct * 100).toFixed(2)}% ($${(sugKellyStakePct * bankrollSize).toFixed(0)})</span>
              </div>
              <div class="flex justify-between text-[10px] text-neutral-500">
                <span>Full Kelly Stake:</span>
                <span>${(kellyStakePct * 100).toFixed(2)}% ($${(kellyStakePct * bankrollSize).toFixed(0)})</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Monte Carlo Graph Column -->
        <div class="lg:col-span-7 space-y-4">
          <div class="bg-neutral-950/50 border border-neutral-850/80 p-4 rounded-xl space-y-3 relative flex flex-col items-center">
            <div class="text-[10px] text-neutral-455 font-bold uppercase tracking-wider self-start mb-2">⚡ 100-Bet Bankroll Growth Simulator</div>
            
            <canvas id="monte-carlo-canvas" class="w-full h-40 bg-neutral-950/40 rounded-lg border border-neutral-850" style="max-height: 160px;"></canvas>
            
            <div class="flex items-center justify-between w-full pt-1">
              <span class="text-[9px] text-neutral-500 font-semibold max-w-[60%] leading-normal">Runs a random trial over 100 consecutive bets to compare staking styles.</span>
              <button id="run-monte-carlo-btn" class="px-3 py-1.5 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-black rounded-lg cursor-pointer transition-all active:scale-95 text-[10px] uppercase tracking-wider">
                Re-Simulate
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach listeners for Custom EV tab
    setTimeout(() => {
      container.querySelector('#calc-tab-parlay')?.addEventListener('click', () => {
        activeCalculatorTab = 'parlay';
        renderSimulatorApp();
      });
      container.querySelector('#calc-tab-hedge')?.addEventListener('click', () => {
        activeCalculatorTab = 'hedge';
        renderSimulatorApp();
      });

      const winSlider = container.querySelector('#custom-win-prob') as HTMLInputElement;
      const oddsInput = container.querySelector('#custom-odds') as HTMLInputElement;
      const winValSpan = container.querySelector('#custom-win-prob-val')!;
      const canvas = container.querySelector('#monte-carlo-canvas') as HTMLCanvasElement;

      // Draw initial simulation
      if (canvas) {
        drawMonteCarloSimulation(canvas);
      }

      winSlider?.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        customEvWinProb = val;
        winValSpan.textContent = `${val}%`;
        
        // Re-render and re-draw
        renderSimulatorApp();
      });

      oddsInput?.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        if (!isNaN(val)) {
          customEvOdds = val;
          renderSimulatorApp();
        }
      });

      container.querySelector('#run-monte-carlo-btn')?.addEventListener('click', () => {
        if (canvas) {
          drawMonteCarloSimulation(canvas);
          showToast('Growth simulator re-run with fresh random trial!', 'success');
        }
      });

    }, 0);
  }

  return container;
}

// Monte Carlo simulator drawing helper
function drawMonteCarloSimulation(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const w = rect.width;
  const h = rect.height;

  // Run 100 bets simulation
  const steps = 100;
  const startBankroll = bankrollSize;
  const pWin = customEvWinProb / 100;
  const decOdds = americanToDecimal(customEvOdds);
  const bFactor = decOdds - 1;

  // Calculate Kelly Staking Fractions
  const fullKellyF = bFactor > 0 ? Math.max(0, (pWin * (bFactor + 1) - 1) / bFactor) : 0;
  const qKellyF = fullKellyF * 0.25;
  const flatF = 0.05; // 5% flat bet

  let fullPath = [startBankroll];
  let qPath = [startBankroll];
  let flatPath = [startBankroll];

  let fullCurrent = startBankroll;
  let qCurrent = startBankroll;
  let flatCurrent = startBankroll;

  for (let i = 0; i < steps; i++) {
    const isWin = Math.random() < pWin;

    // Full Kelly
    const fullStake = fullCurrent * fullKellyF;
    if (fullCurrent > 1) {
      fullCurrent = isWin ? fullCurrent + fullStake * bFactor : fullCurrent - fullStake;
    }
    fullPath.push(fullCurrent);

    // Quarter Kelly
    const qStake = qCurrent * qKellyF;
    if (qCurrent > 1) {
      qCurrent = isWin ? qCurrent + qStake * bFactor : qCurrent - qStake;
    }
    qPath.push(qCurrent);

    // Flat Staking
    const flatStake = startBankroll * flatF;
    if (flatCurrent > flatStake) {
      flatCurrent = isWin ? flatCurrent + flatStake * bFactor : flatCurrent - flatStake;
    }
    flatPath.push(flatCurrent);
  }

  // Clear background
  ctx.clearRect(0, 0, w, h);

  // Math limits for scale
  const allValues = [...fullPath, ...qPath, ...flatPath];
  const maxVal = Math.max(...allValues, startBankroll * 2);
  const minVal = Math.min(...allValues, 0);
  const valRange = maxVal - minVal;

  const padLeft = 40;
  const padRight = 15;
  const padTop = 20;
  const padBottom = 20;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  // Draw grid lines
  ctx.strokeStyle = '#1e1e1e';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#737373';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const gridSteps = 3;
  for (let i = 0; i <= gridSteps; i++) {
    const val = minVal + (valRange * i) / gridSteps;
    const y = h - padBottom - (chartH * i) / gridSteps;
    
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();

    ctx.fillText(`$${val.toFixed(0)}`, padLeft - 6, y);
  }

  // Draw Paths
  const drawPath = (path: number[], color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    path.forEach((val, idx) => {
      const x = padLeft + (chartW * idx) / steps;
      const y = h - padBottom - (chartH * (val - minVal)) / valRange;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  // Draw Flat Stake (Blue)
  drawPath(flatPath, '#3b82f6', 1.5);
  // Draw Full Kelly (Orange/Red)
  drawPath(fullPath, '#f97316', 1.5);
  // Draw Quarter Kelly (Emerald green)
  drawPath(qPath, '#00c6a2', 2.5);

  // Legend
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  
  // 1/4 Kelly
  ctx.fillStyle = '#00c6a2';
  ctx.fillText('● 1/4 Kelly', padLeft + 10, padTop - 8);
  // Full Kelly
  ctx.fillStyle = '#f97316';
  ctx.fillText('● Full Kelly', padLeft + 80, padTop - 8);
  // Flat
  ctx.fillStyle = '#3b82f6';
  ctx.fillText('● Flat ($50)', padLeft + 150, padTop - 8);
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

// Fetch betting data — cache-busted so GitHub Pages never serves stale data
async function loadData() {
  const bust = `?v=${Date.now()}`;
  const resp = await fetch(`bets.json${bust}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
  });
  if (!resp.ok) {
    throw new Error(`HTTP error ${resp.status}`);
  }
  return await resp.json() as BetsData;
}

function renderApp() {
  const app = document.getElementById('app')!;
  if (!currentData) return;

  // Reset container and layout
  app.innerHTML = '';

  // Get active win/loss tracker record details for header bar
  const wins = trackedBets.filter(b => b.status === 'won').length;
  const losses = trackedBets.filter(b => b.status === 'lost').length;
  const pending = trackedBets.filter(b => b.status === 'pending').length;

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
      <!-- Odds Format Toggle Buttons -->
      <div class="flex items-center bg-neutral-950 rounded-lg p-0.5 border border-neutral-850">
        <button id="odds-fmt-american" class="px-2 py-1 text-[10px] font-black rounded-md cursor-pointer transition-all ${oddsFormat === 'american' ? 'bg-primary-500 text-neutral-950 shadow' : 'text-neutral-450 hover:text-neutral-200'}">US</button>
        <button id="odds-fmt-decimal" class="px-2 py-1 text-[10px] font-black rounded-md cursor-pointer transition-all ${oddsFormat === 'decimal' ? 'bg-primary-500 text-neutral-950 shadow' : 'text-neutral-450 hover:text-neutral-200'}">DEC</button>
        <button id="odds-fmt-implied" class="px-2 py-1 text-[10px] font-black rounded-md cursor-pointer transition-all ${oddsFormat === 'implied' ? 'bg-primary-500 text-neutral-950 shadow' : 'text-neutral-450 hover:text-neutral-200'}">IMP</button>
      </div>

      <button id="refresh-btn" class="px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-350 hover:text-neutral-100 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all active:scale-95" aria-label="Refresh Data">
        <span class="refresh-icon inline-block">↻</span> Sync Odds
      </button>
      <div class="w-px h-7 bg-neutral-800 hidden sm:block"></div>
      <div class="text-right">
        <div class="text-[9px] text-neutral-500 font-extrabold uppercase tracking-wider cursor-pointer hover:underline" id="go-to-tracker">Record (W-L) 🏆</div>
        <div class="text-emerald-450 font-black text-[11px] mt-0.5 cursor-pointer hover:underline" id="go-to-tracker-val">${wins}W - ${losses}L ${pending > 0 ? `[${pending}P]` : ''}</div>
      </div>
      <div class="w-px h-7 bg-neutral-800"></div>
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

  // Attach refresh listener & header navigation tracker links
  const refreshBtn = header.querySelector('#refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
  }
  const goToTracker = () => {
    currentSportFilter = 'Tracker';
    renderApp();
  };
  header.querySelector('#go-to-tracker')?.addEventListener('click', goToTracker);
  header.querySelector('#go-to-tracker-val')?.addEventListener('click', goToTracker);

  // Attach odds format toggle listeners
  const setFormat = (fmt: 'american' | 'decimal' | 'implied') => {
    oddsFormat = fmt;
    savePreferences();
    showToast(`Odds format switched to ${fmt.toUpperCase()}`, 'info');
    renderApp();
  };
  header.querySelector('#odds-fmt-american')?.addEventListener('click', () => setFormat('american'));
  header.querySelector('#odds-fmt-decimal')?.addEventListener('click', () => setFormat('decimal'));
  header.querySelector('#odds-fmt-implied')?.addEventListener('click', () => setFormat('implied'));

  // Render tracker tab view exclusively or normal dashboard sections
  if (currentSportFilter === 'Tracker') {
    app.appendChild(renderFilters(currentData));
    app.appendChild(renderTrackerView());
  } else {
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
  }

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
    showToast('Failed to sync betting data. Please try again later.', 'error');
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

  loadPreferences();
  loadWatchlist();
  loadTrackedBets();

  try {
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
