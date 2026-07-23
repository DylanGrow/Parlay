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
let currentMainTab: 'bets' | 'parlays' | 'ai' | 'tracker' | 'leaderboard' = 'bets';
let currentSportFilter: string = 'All';
let searchQuery: string = '';
let watchlist: string[] = [];
let trackedBets: TrackedBet[] = [];
let sortColumn: 'ev' | 'odds' | 'none' = 'none';
let sortDirection: 'asc' | 'desc' = 'desc';

// Preference and filter state variables (loaded from local storage)
let oddsFormat: 'american' | 'decimal' | 'implied' = 'american';
let bankrollSize: number = 500;
let defaultStake: number = 25;
let minEvFilter: number = 0;
let bookmakerFilter: string = 'All';

// Active selection for Parlay Builder simulator
let simulatedLegs: { betId: string; outcome: string; price: number; sport: string }[] = [];
let betStake: number = 25;

// Hedge & Arbitrage Calculator state variables
let activeCalculatorTab: 'parlay' | 'hedge' | 'customEv' = 'parlay';
let hedgePrimaryStake: number = 25;
let hedgePrimaryOdds: number = 150;
let hedgeOpposingOdds: number = -110;

// Custom EV & Monte Carlo Growth state variables
let customEvWinProb: number = 45;
let customEvOdds: number = 130;

// Tracker Tab Chart active selection
let activeTrackerChartTab: 'trend' | 'allocation' | 'performance' = 'trend';

// AI Agent active model provider selection
let activeAiProvider: 'gemini' | 'openai' | 'openrouter' = 'gemini';
let activeModelGemini: string = 'gemini-2.5-flash';
let activeModelOpenAI: string = 'gpt-4o-mini';
let activeModelOpenRouter: string = 'meta-llama/llama-3.1-8b-instruct:free';

// Peer-to-Peer Leaderboard friends record
interface FriendRecord {
  name: string;
  netProfit: number;
  yieldPercent: number;
  wins: number;
  losses: number;
  streakText: string;
  lastUpdated: string;
}
let friendsList: FriendRecord[] = [];

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
    const savedDefaultStake = localStorage.getItem('parlay_default_stake');
    if (savedDefaultStake) {
      const parsed = parseFloat(savedDefaultStake);
      if (!isNaN(parsed) && parsed > 0) {
        defaultStake = parsed;
        betStake = parsed;
        hedgePrimaryStake = parsed;
      }
    } else {
      defaultStake = Math.min(25, Math.round(bankrollSize * 0.05));
      betStake = defaultStake;
      hedgePrimaryStake = defaultStake;
    }
    const savedProvider = localStorage.getItem('parlay_ai_provider');
    if (savedProvider === 'gemini' || savedProvider === 'openai' || savedProvider === 'openrouter') {
      activeAiProvider = savedProvider;
    }
    activeModelGemini = localStorage.getItem('parlay_model_gemini') || 'gemini-2.5-flash';
    activeModelOpenAI = localStorage.getItem('parlay_model_openai') || 'gpt-4o-mini';
    activeModelOpenRouter = localStorage.getItem('parlay_model_openrouter') || 'meta-llama/llama-3.1-8b-instruct:free';
    friendsList = JSON.parse(localStorage.getItem('parlay_friends_list') || '[]');
  } catch (e) {
    console.error('Failed to load preferences', e);
  }
}

// Save Preferences to Local Storage
function savePreferences() {
  try {
    localStorage.setItem('parlay_odds_format', oddsFormat);
    localStorage.setItem('parlay_bankroll_size', bankrollSize.toString());
    localStorage.setItem('parlay_default_stake', defaultStake.toString());
    localStorage.setItem('parlay_ai_provider', activeAiProvider);
    localStorage.setItem('parlay_model_gemini', activeModelGemini);
    localStorage.setItem('parlay_model_openai', activeModelOpenAI);
    localStorage.setItem('parlay_model_openrouter', activeModelOpenRouter);
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
function openTrackBetModal(outcome: string, matchup: string, price: number, sport: string, marketLabel: string, trueOdds?: number, evPercent?: number) {
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
        trackedAt: new Date().toISOString(),
        trueOdds,
        evPercent
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

// Render dynamic HTML5 Canvas Sport & Bookmaker Performance Bar Charts
function drawPerformanceCharts(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  const resolved = trackedBets.filter(b => b.status !== 'pending');
  if (resolved.length === 0) {
    ctx.fillStyle = '#737373';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO RESOLVED BET DATA YET', w / 2, h / 2);
    return;
  }

  const sportProfits: Record<string, number> = {};
  const bookProfits: Record<string, number> = {};

  resolved.forEach(b => {
    const sport = b.sport || 'Multi-Sport';
    const book = b.id.includes('fanduel') ? 'FanDuel' : (b.id.includes('caesars') ? 'Caesars' : (b.id.includes('betmgm') ? 'BetMGM' : (b.id.includes('bet365') ? 'Bet365' : 'DraftKings')));
    const profit = b.status === 'won' ? b.stake * (americanToDecimal(b.price) - 1) : -b.stake;
    sportProfits[sport] = (sportProfits[sport] || 0) + profit;
    bookProfits[book] = (bookProfits[book] || 0) + profit;
  });

  const midX = w / 2;
  ctx.strokeStyle = '#262626';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(midX, 10);
  ctx.lineTo(midX, h - 10);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('NET PROFIT BY SPORT', midX / 2, 18);
  ctx.fillText('NET PROFIT BY BOOKMAKER', midX + midX / 2, 18);

  const drawBarList = (data: Record<string, number>, startX: number, endX: number) => {
    const items = Object.keys(data);
    if (items.length === 0) {
      ctx.fillStyle = '#737373';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', (startX + endX) / 2, h / 2);
      return;
    }

    const maxAbsVal = Math.max(...items.map(k => Math.abs(data[k])), 10);
    const colWidth = endX - startX;
    const padding = 15;
    const usableW = colWidth - padding * 2;
    const centerBarX = startX + padding + usableW / 2;

    const rowH = (h - 40) / Math.max(items.length, 4);

    items.forEach((item, index) => {
      const profit = data[item];
      const barY = 32 + index * rowH;
      const barW = (profit / maxAbsVal) * (usableW / 2);

      ctx.fillStyle = '#a3a3a3';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(item, startX + padding, barY + 4);

      ctx.fillStyle = profit >= 0 ? '#00c6a2' : '#f43f5e';
      ctx.beginPath();
      ctx.rect(centerBarX, barY - 3, barW, 6);
      ctx.fill();

      ctx.fillStyle = profit >= 0 ? '#4ddac0' : '#f87171';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = profit >= 0 ? 'left' : 'right';
      ctx.fillText(`${profit >= 0 ? '+' : ''}$${profit.toFixed(0)}`, centerBarX + barW + (profit >= 0 ? 4 : -4), barY + 4);
    });
  };

  drawBarList(sportProfits, 0, midX);
  drawBarList(bookProfits, midX, w);
}

// Convert tracked ledger bets to CSV format
function convertLedgerToCsv(): string {
  const headers = ['id', 'outcome', 'matchup', 'sport', 'marketLabel', 'price', 'stake', 'status', 'trackedAt'];
  const rows = trackedBets.map(b => [
    b.id,
    `"${b.outcome.replace(/"/g, '""')}"`,
    `"${b.matchup.replace(/"/g, '""')}"`,
    `"${b.sport.replace(/"/g, '""')}"`,
    `"${b.marketLabel.replace(/"/g, '""')}"`,
    b.price,
    b.stake,
    b.status,
    b.trackedAt
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// Parse imported CSV file to tracked wagers array
function parseCsvToLedger(csvText: string): TrackedBet[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) return [];
  
  const parseCsvRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseCsvRow(lines[0]);
  const bets: TrackedBet[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i]);
    if (values.length < headers.length) continue;
    
    const record: any = {};
    headers.forEach((h, index) => {
      let val: any = values[index];
      if (h === 'price' || h === 'stake') {
        val = parseFloat(val);
      }
      record[h] = val;
    });

    if (record.id && record.outcome && record.price && record.stake && record.status) {
      bets.push({
        id: record.id,
        outcome: record.outcome,
        matchup: record.matchup || '',
        sport: record.sport || '',
        marketLabel: record.marketLabel || '',
        price: record.price,
        stake: record.stake,
        status: record.status as 'won' | 'lost' | 'pending',
        trackedAt: record.trackedAt || new Date().toISOString()
      });
    }
  }
  return bets;
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
  if (key.includes('wnba')) return { emoji: '🏀', label: 'WNBA' };
  if (key.includes('nba') || key.includes('basketball') || key.includes('california_classic')) return { emoji: '🏀', label: 'Basketball' };
  if (key.includes('mlb') || key.includes('baseball')) return { emoji: '⚾', label: 'Baseball' };
  if (key.includes('golf') || key.includes('pga')) return { emoji: '⛳', label: 'Golf' };
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
    openTrackBetModal(bet.outcome, `${bet.awayTeam} @ ${bet.homeTeam}`, bet.bestPrice, bet.sport, bet.marketLabel, bet.trueOdds, bet.evPercent);
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
      <th scope="col" class="px-4 py-3 text-center w-[110px]">Scout Details</th>
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
                data-outcome="${b.outcome}" data-matchup="${b.awayTeam} @ ${b.homeTeam}" data-price="${b.bestPrice}" data-sport="${b.sport}" data-market="${b.marketLabel}" data-true-odds="${b.trueOdds}" data-ev-percent="${b.evPercent}">
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
      <td class="px-4 py-3.5 text-center">
        <button class="toggle-scout-btn px-2 py-1 bg-neutral-800 hover:bg-neutral-755 text-primary-500 hover:text-primary-400 border border-neutral-700 hover:border-primary-500/30 rounded text-[10px] font-black uppercase cursor-pointer transition-all active:scale-95">
          🔍 Scout
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    // Expandable Desktop Scout Row
    const scoutTr = document.createElement('tr');
    scoutTr.id = `scout-row-${b.id}`;
    scoutTr.className = 'hidden bg-neutral-950/60 border-l border-r border-neutral-850';
    scoutTr.innerHTML = `
      <td colspan="9" class="px-6 py-4 border-b border-neutral-850">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-neutral-300">
          <div class="space-y-3">
            <div>
              <span class="text-neutral-500 font-bold uppercase text-[9px] tracking-wider block">AI Projections Confidence</span>
              <div class="flex items-center gap-3 mt-1.5">
                <div class="w-full bg-neutral-850 h-2 rounded overflow-hidden relative">
                  <div class="bg-gradient-to-r from-emerald-500 to-primary-500 h-full rounded shadow-[0_0_8px_#00c6a2]" style="width: ${b.confidenceScore || 75}%"></div>
                </div>
                <span class="font-black text-primary-400 text-xs">${b.confidenceScore || 75}%</span>
              </div>
            </div>
            
            <div class="bg-neutral-900/60 border border-neutral-850 p-3 rounded-lg">
              <span class="text-neutral-500 font-bold uppercase text-[9px] tracking-wider block">Kelly Portfolio Staker</span>
              <div class="flex items-center justify-between mt-2">
                <div>
                  <span class="text-[10px] text-neutral-450 block">Suggested Stake (1/4 Kelly)</span>
                  <span class="text-xs font-black text-emerald-450 mt-0.5 block">$${((b.evPercent / (americanToDecimal(b.bestPrice) - 1)) * 0.25 * bankrollSize).toFixed(2)}</span>
                </div>
                <div class="text-right">
                  <span class="text-[10px] text-neutral-450 block">Edge</span>
                  <span class="text-xs font-black text-primary-400 mt-0.5 block">+${(b.evPercent * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-2 border-l border-neutral-850 pl-6">
            <div>
              <span class="text-neutral-500 font-bold uppercase text-[9px] tracking-wider block">Matchup Injury Report</span>
              ${b.injuries && b.injuries.length > 0 ? `
                <ul class="list-disc list-inside space-y-1 mt-1.5 text-neutral-350 text-[11px]">
                  ${b.injuries.map(inj => `<li>${inj}</li>`).join('')}
                </ul>
              ` : `
                <p class="text-[11px] text-neutral-500 mt-1.5 italic">No major injuries reported.</p>
              `}
            </div>
            ${b.injuryImpact ? `
              <div class="mt-2 text-[10px] bg-rose-500/5 text-rose-300 border border-rose-500/10 p-2 rounded leading-relaxed">
                <strong>Impact:</strong> ${b.injuryImpact}
              </div>
            ` : ''}
          </div>

          <div class="space-y-1.5 border-l border-neutral-850 pl-6">
            <span class="text-neutral-500 font-bold uppercase text-[9px] tracking-wider block">Scout Matchup Vetting</span>
            <p class="text-[11px] text-neutral-350 leading-relaxed mt-1.5 font-medium">${b.reasoning}</p>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(scoutTr);

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

      <button class="toggle-scout-mobile-btn w-full mt-2 py-1.5 bg-neutral-950 border border-neutral-850 rounded text-[10px] font-black uppercase text-primary-400 hover:text-primary-300 flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95" data-id="${b.id}">
        <span>🔍</span> Show Scout & Injury Report
      </button>
      <div id="scout-drawer-mobile-${b.id}" class="hidden space-y-4 pt-3 border-t border-neutral-850/50 mt-3 text-xs">
        <div>
          <span class="text-neutral-550 block text-[9px] font-bold uppercase tracking-wider mb-1">AI Projections Confidence</span>
          <div class="flex items-center gap-3">
            <div class="w-full bg-neutral-850 h-2 rounded overflow-hidden relative">
              <div class="bg-gradient-to-r from-emerald-500 to-primary-500 h-full rounded shadow-[0_0_8px_#00c6a2]" style="width: ${b.confidenceScore || 75}%"></div>
            </div>
            <span class="font-black text-primary-400">${b.confidenceScore || 75}%</span>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-3 bg-neutral-950/60 p-2.5 rounded-lg border border-neutral-850">
          <div>
            <span class="text-[9px] text-neutral-500 font-bold uppercase block">1/4 Kelly Stake</span>
            <span class="text-xs font-black text-emerald-450 block mt-0.5">$${((b.evPercent / (americanToDecimal(b.bestPrice) - 1)) * 0.25 * bankrollSize).toFixed(2)}</span>
          </div>
          <div class="text-right">
            <span class="text-[9px] text-neutral-500 font-bold uppercase block">Portfolio Edge</span>
            <span class="text-xs font-black text-primary-400 block mt-0.5">+${(b.evPercent * 100).toFixed(1)}%</span>
          </div>
        </div>

        <div>
          <span class="text-neutral-550 block text-[9px] font-bold uppercase tracking-wider mb-1">Injuries Report</span>
          ${b.injuries && b.injuries.length > 0 ? `
            <ul class="list-disc list-inside space-y-1 text-neutral-350 text-[11px]">
              ${b.injuries.map(inj => `<li>${inj}</li>`).join('')}
            </ul>
          ` : `
            <p class="text-[11px] text-neutral-500 italic">No major injuries reported.</p>
          `}
          ${b.injuryImpact ? `
            <p class="text-[10px] text-rose-300 bg-rose-500/5 border border-rose-500/10 p-2 rounded leading-relaxed mt-2">
              <strong>Impact:</strong> ${b.injuryImpact}
            </p>
          ` : ''}
        </div>

        <div>
          <span class="text-neutral-550 block text-[9px] font-bold uppercase tracking-wider mb-1">Matchup Scout Vetting</span>
          <p class="text-[11px] text-neutral-350 leading-relaxed font-medium">${b.reasoning}</p>
        </div>
      </div>

      <div class="flex gap-2 border-t border-neutral-850 pt-2.5">
        <button class="track-bet-btn flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 hover:border-primary-500/50 rounded text-[11px] font-bold cursor-pointer transition-all text-center"
                data-outcome="${b.outcome}" data-matchup="${b.awayTeam} @ ${b.homeTeam}" data-price="${b.bestPrice}" data-sport="${b.sport}" data-market="${b.marketLabel}" data-true-odds="${b.trueOdds}" data-ev-percent="${b.evPercent}">
          🎯 Track Bet
        </button>
      </div>
    `;
    mobileGrid.appendChild(card);

    setTimeout(() => {
      tr.querySelector(`#compare-btn-${b.id}`)?.addEventListener('click', () => openComparisonModal(b));
      card.querySelector(`#compare-btn-mobile-${b.id}`)?.addEventListener('click', () => openComparisonModal(b));
      
      tr.querySelector(`.toggle-scout-btn`)?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const row = tbody.querySelector(`#scout-row-${b.id}`) as HTMLElement;
        if (row) {
          const isHidden = row.classList.toggle('hidden');
          btn.textContent = isHidden ? '🔍 Scout' : '❌ Hide';
        }
      });

      card.querySelector(`.toggle-scout-mobile-btn`)?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        const drawer = card.querySelector(`#scout-drawer-mobile-${b.id}`) as HTMLElement;
        if (drawer) {
          const isHidden = drawer.classList.toggle('hidden');
          btn.innerHTML = isHidden ? '<span>🔍</span> Show Scout & Injury Report' : '<span>❌</span> Hide Scout Report';
        }
      });
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
        const trueOddsStr = target.getAttribute('data-true-odds');
        const evPercentStr = target.getAttribute('data-ev-percent');
        const trueOdds = trueOddsStr ? parseInt(trueOddsStr, 10) : undefined;
        const evPercent = evPercentStr ? parseFloat(evPercentStr) : undefined;
        openTrackBetModal(outcome, matchup, price, sport, market, trueOdds, evPercent);
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

// Render Peer-to-Peer Leaderboard (Friends Pool) tab
function renderLeaderboardView(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'mb-10 animate-fade-in';

  const resolved = trackedBets.filter(b => b.status !== 'pending');
  const wins = resolved.filter(b => b.status === 'won').length;
  const losses = resolved.filter(b => b.status === 'lost').length;
  
  const totalRisked = resolved.reduce((sum, b) => sum + b.stake, 0);
  const totalProfit = resolved.reduce((sum, b) => {
    if (b.status === 'lost') return sum - b.stake;
    const multiplier = americanToDecimal(b.price);
    const profit = b.stake * (multiplier - 1);
    return sum + profit;
  }, 0);
  const yieldPercent = totalRisked > 0 ? (totalProfit / totalRisked) * 100 : 0;

  const chronologicalResolved = [...resolved]
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
    streakText = type === 'won' ? `🔥 ${count} W` : `❄️ ${count} L`;
  }

  const myRecord: FriendRecord = {
    name: 'You (Base)',
    netProfit: totalProfit,
    yieldPercent: yieldPercent,
    wins: wins,
    losses: losses,
    streakText: streakText,
    lastUpdated: new Date().toISOString()
  };

  const leaderboard: FriendRecord[] = [myRecord, ...friendsList];
  leaderboard.sort((a, b) => b.yieldPercent - a.yieldPercent);

  container.innerHTML = `
    <div class="card bg-neutral-900 border border-neutral-850 p-6 space-y-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <h2 class="text-lg font-black tracking-tight text-neutral-100 uppercase">👥 Friend Group Pool</h2>
          <p class="text-xs text-neutral-450 mt-1 leading-normal">Compare your yield and betting performance side-by-side with friends using serverless client-side sharing.</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button id="generate-share-code" class="px-3 py-2 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-black rounded-lg cursor-pointer text-xs transition-all active:scale-95">
            📤 Copy My Share Code
          </button>
          <button id="import-friend-code" class="px-3 py-2 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-750 font-black rounded-lg cursor-pointer text-xs transition-all active:scale-95">
            📥 Import Friend Code
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs leading-normal border-collapse">
          <thead>
            <tr class="border-b border-neutral-800 text-[10px] font-black uppercase text-neutral-450 tracking-wider">
              <th class="py-3 px-2">Rank</th>
              <th class="py-3 px-2">Nickname</th>
              <th class="py-3 px-2 text-right">Yield %</th>
              <th class="py-3 px-2 text-right">Net Profit</th>
              <th class="py-3 px-2 text-center">Record (W-L)</th>
              <th class="py-3 px-2 text-center">Streak</th>
              <th class="py-3 px-2 text-right">Last Sync</th>
              <th class="py-3 px-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-850">
            ${leaderboard.map((f, idx) => {
              const isUser = f.name.includes('You');
              const yieldClass = f.yieldPercent > 0 ? 'text-emerald-450 font-black' : f.yieldPercent < 0 ? 'text-rose-400 font-bold' : 'text-neutral-400';
              const profitClass = f.netProfit > 0 ? 'text-emerald-450' : f.netProfit < 0 ? 'text-rose-400' : 'text-neutral-400';
              const dateStr = new Date(f.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              
              return `
                <tr class="${isUser ? 'bg-primary-500/5 font-extrabold border-l-2 border-primary-500' : ''} hover:bg-neutral-850/30 transition-colors">
                  <td class="py-4 px-2 font-black">${idx + 1}</td>
                  <td class="py-4 px-2 flex items-center gap-2">
                    <span>${isUser ? '🏆' : '👤'}</span>
                    <span>${f.name}</span>
                  </td>
                  <td class="py-4 px-2 text-right ${yieldClass}">${f.yieldPercent.toFixed(2)}%</td>
                  <td class="py-4 px-2 text-right ${profitClass}">$${f.netProfit.toFixed(2)}</td>
                  <td class="py-4 px-2 text-center font-mono">${f.wins}W - ${f.losses}L</td>
                  <td class="py-4 px-2 text-center">${f.streakText}</td>
                  <td class="py-4 px-2 text-right text-[10px] text-neutral-500">${dateStr}</td>
                  <td class="py-4 px-2 text-center">
                    ${isUser ? '<span class="text-neutral-600">-</span>' : `
                      <button data-remove-name="${f.name}" class="remove-friend-btn text-rose-400 hover:text-rose-300 hover:underline cursor-pointer font-bold text-[10px]">
                        Remove
                      </button>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  setTimeout(() => {
    container.querySelector('#generate-share-code')?.addEventListener('click', () => {
      const shareData = {
        name: 'You',
        netProfit: totalProfit,
        yieldPercent: yieldPercent,
        wins: wins,
        losses: losses,
        streakText: streakText,
        lastUpdated: new Date().toISOString()
      };
      
      const shareCode = btoa(JSON.stringify(shareData));
      navigator.clipboard.writeText(shareCode).then(() => {
        showToast('Your share code has been copied to your clipboard! Send it to your friends.', 'success');
      }).catch(err => {
        console.error('Clipboard copy failed:', err);
        window.prompt('Copy your share code:', shareCode);
      });
    });

    container.querySelector('#import-friend-code')?.addEventListener('click', () => {
      const code = window.prompt('Paste your friend\'s share code here:');
      if (!code) return;
      try {
        const decoded = JSON.parse(atob(code.trim())) as FriendRecord;
        if (typeof decoded.yieldPercent !== 'number' || typeof decoded.name !== 'string') {
          throw new Error('Invalid code format');
        }

        const nick = window.prompt(`Enter a nickname for this friend (e.g. "${decoded.name}"):`, decoded.name);
        if (!nick) return;

        decoded.name = nick.trim();
        decoded.lastUpdated = new Date().toISOString();

        friendsList = friendsList.filter(f => f.name !== decoded.name);
        friendsList.push(decoded);

        localStorage.setItem('parlay_friends_list', JSON.stringify(friendsList));
        showToast(`Friend "${decoded.name}" successfully added to pool!`, 'success');
        renderApp();
      } catch (err) {
        showToast('Failed to parse share code. Please make sure you copied the entire code.', 'error');
      }
    });

    container.querySelectorAll('.remove-friend-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = (e.currentTarget as HTMLElement).getAttribute('data-remove-name');
        if (name && window.confirm(`Are you sure you want to remove "${name}" from your pool?`)) {
          friendsList = friendsList.filter(f => f.name !== name);
          localStorage.setItem('parlay_friends_list', JSON.stringify(friendsList));
          showToast(`Removed "${name}" from pool.`, 'info');
          renderApp();
        }
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
  const resolved = trackedBets.filter(b => b.status !== 'pending');
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

  // 1. Calculate Sharpe Ratio of returns
  let sharpeRatio = 0;
  if (resolved.length > 1) {
    const returns = resolved.map(b => {
      if (b.status === 'won') {
        const multiplier = americanToDecimal(b.price);
        return b.stake * (multiplier - 1);
      } else {
        return -b.stake;
      }
    });

    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) : 0;
  }

  // 2. Calculate Max Drawdown % (based on chronological resolved profits)
  let maxDrawdown = 0;
  if (resolved.length > 0) {
    let currentBankroll = bankrollSize;
    let peak = currentBankroll;
    let maxDd = 0;
    
    // Sort resolved bets chronologically
    const chrono = [...resolved].sort((a, b) => new Date(a.trackedAt).getTime() - new Date(b.trackedAt).getTime());
    chrono.forEach(b => {
      if (b.status === 'won') {
        const multiplier = americanToDecimal(b.price);
        currentBankroll += b.stake * (multiplier - 1);
      } else {
        currentBankroll -= b.stake;
      }
      peak = Math.max(peak, currentBankroll);
      const dd = peak > 0 ? ((peak - currentBankroll) / peak) * 100 : 0;
      maxDd = Math.max(maxDd, dd);
    });
    maxDrawdown = maxDd;
  }

  // 3. Calculate CLV Beating Rate
  let clvBeatenCount = 0;
  let clvMeasurableCount = 0;
  resolved.forEach(b => {
    if (b.trueOdds !== undefined) {
      clvMeasurableCount++;
      const placementDec = americanToDecimal(b.price);
      const fairDec = americanToDecimal(b.trueOdds);
      if (placementDec > fairDec) {
        clvBeatenCount++;
      }
    }
  });
  const clvBeatRate = clvMeasurableCount > 0 ? (clvBeatenCount / clvMeasurableCount) * 100 : 0;

  // Stats widgets header row (extended to 6 cards showing advanced quantitative metrics)
  const statsHtml = `
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center flex flex-col justify-between animate-fade-in">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Record (W - L)</span>
        <span class="text-lg font-black text-neutral-100 mt-1 block">${wins} - ${losses}</span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block">${pending} Pending Bets</span>
      </div>
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center flex flex-col justify-between animate-fade-in">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Win Rate</span>
        <span class="text-lg font-black text-primary-400 mt-1 block">${winRate.toFixed(1)}%</span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block font-bold ${chronologicalResolved.length > 0 && chronologicalResolved[chronologicalResolved.length - 1].status === 'won' ? 'text-emerald-450' : 'text-rose-450'}">${streakText}</span>
      </div>
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center flex flex-col justify-between relative overflow-hidden animate-fade-in">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Net Profit / Loss</span>
        <span class="text-lg font-black mt-1 block ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
          ${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}
        </span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block">Yield: <span class="font-extrabold ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${totalProfit >= 0 ? '+' : ''}${yieldPercent.toFixed(1)}%</span></span>
      </div>
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center flex flex-col justify-between animate-fade-in">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Sharpe Ratio</span>
        <span class="text-lg font-black mt-1 block ${sharpeRatio >= 1.0 ? 'text-emerald-400' : sharpeRatio > 0 ? 'text-amber-400' : 'text-neutral-400'}">
          ${sharpeRatio.toFixed(2)}
        </span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block">${sharpeRatio >= 1.0 ? '🔥 Low Risk Variance' : 'Standard Variance'}</span>
      </div>
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center flex flex-col justify-between animate-fade-in">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">Max Drawdown</span>
        <span class="text-lg font-black mt-1 block ${maxDrawdown > 20 ? 'text-rose-400' : maxDrawdown > 10 ? 'text-amber-400' : 'text-emerald-400'}">
          -${maxDrawdown.toFixed(1)}%
        </span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block">Worst capital dip</span>
      </div>
      <div class="card border border-neutral-800 bg-neutral-900/30 p-4 text-center flex flex-col justify-between animate-fade-in">
        <span class="text-[9px] text-neutral-500 uppercase font-black tracking-wider block">CLV Beat Rate</span>
        <span class="text-lg font-black mt-1 block ${clvBeatRate >= 60 ? 'text-emerald-400' : clvBeatRate >= 45 ? 'text-amber-400' : 'text-rose-400'}">
          ${clvBeatRate.toFixed(1)}%
        </span>
        <span class="text-[9px] text-neutral-500 mt-0.5 block">Beats consensus fair line</span>
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
          <button id="chart-tab-performance" class="px-2 py-1 text-[9px] font-black uppercase rounded transition-all cursor-pointer ${
            activeTrackerChartTab === 'performance'
              ? 'bg-neutral-850 text-neutral-100 shadow-sm border border-neutral-700'
              : 'text-neutral-500 hover:text-neutral-350'
          }">
            📊 Performance
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
        <button id="export-csv-btn" class="px-2.5 py-1 text-[10px] font-bold border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-350 rounded-lg transition-all cursor-pointer">
          📥 Export CSV
        </button>
        <button id="import-csv-btn" class="px-2.5 py-1 text-[10px] font-bold border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-350 rounded-lg transition-all cursor-pointer">
          📤 Import CSV
        </button>
        <input type="file" id="import-history-file" class="hidden" accept=".json" />
        <input type="file" id="import-csv-file" class="hidden" accept=".csv" />
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
    // Export JSON handler
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

    // Export CSV handler
    container.querySelector('#export-csv-btn')?.addEventListener('click', () => {
      if (trackedBets.length === 0) {
        showToast('No tracked bets to export.', 'error');
        return;
      }
      const csvContent = convertLedgerToCsv();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", url);
      downloadAnchor.setAttribute("download", `parlay_tracker_history_${Date.now()}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('CSV tracker history exported!', 'success');
    });

    // JSON Import click triggers file input
    const importFileInput = container.querySelector('#import-history-file') as HTMLInputElement;
    container.querySelector('#import-history-btn')?.addEventListener('click', () => {
      importFileInput.click();
    });

    // CSV Import click triggers file input
    const importCsvFileInput = container.querySelector('#import-csv-file') as HTMLInputElement;
    container.querySelector('#import-csv-btn')?.addEventListener('click', () => {
      importCsvFileInput.click();
    });

    // JSON Import file select handler
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

    // CSV Import file select handler
    importCsvFileInput?.addEventListener('change', (e) => {
      const fileInput = e.target as HTMLInputElement;
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = parseCsvToLedger(event.target?.result as string);
            if (imported.length > 0) {
              trackedBets = imported;
              saveTrackedBets();
              showToast('CSV tracker history imported!', 'success');
              renderApp();
            } else {
              showToast('Failed to parse valid CSV rows.', 'error');
            }
          } catch (err) {
            showToast('Failed to parse CSV.', 'error');
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
      } else if (activeTrackerChartTab === 'allocation') {
        drawSportAllocationChart(canvas);
      } else {
        drawPerformanceCharts(canvas);
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

    container.querySelector('#chart-tab-performance')?.addEventListener('click', () => {
      activeTrackerChartTab = 'performance';
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

  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 25;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = profitTimeline.map((val, idx) => {
    const x = paddingLeft + (chartWidth * idx) / Math.max(n - 1, 1);
    const y = height - paddingBottom - (chartHeight * (val - minVal)) / range;
    return { x, y };
  });

  const renderBaseChart = (hoverIdx: number = -1) => {
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

      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      ctx.fillText(`${val >= 0 ? '+' : ''}$${val.toFixed(0)}`, paddingLeft - 8, y);
    }

    if (n > 1) {
      // Area gradient
      const areaGrad = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
      areaGrad.addColorStop(0, 'rgba(0, 198, 162, 0.15)');
      areaGrad.addColorStop(1, 'rgba(0, 198, 162, 0.0)');
      
      ctx.beginPath();
      ctx.moveTo(points[0].x, height - paddingBottom - (chartHeight * (0 - minVal)) / range);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, height - paddingBottom);
      ctx.closePath();
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Trendline
      ctx.strokeStyle = 'var(--color-primary-500)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();

      // Draw dots
      points.forEach((p, idx) => {
        const isHovered = idx === hoverIdx;
        const isLast = idx === points.length - 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isHovered ? 6 : (isLast ? 4 : 2), 0, 2 * Math.PI);
        ctx.fillStyle = isHovered ? '#38bdf8' : (isLast ? '#facc15' : 'var(--color-primary-500)');
        ctx.fill();
        if (isLast || isHovered) {
          ctx.strokeStyle = isHovered ? 'rgba(56, 189, 248, 0.4)' : 'rgba(250, 204, 21, 0.4)';
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      });
    } else {
      ctx.fillStyle = '#404040';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO RESOLVED BET DATA YET', width / 2, height / 2);
    }
  };

  renderBaseChart();

  // Mouse event listeners for hover details
  if (n > 1) {
    let tooltip = canvas.parentNode?.querySelector('#canvas-chart-tooltip') as HTMLElement;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'canvas-chart-tooltip';
      tooltip.className = 'absolute hidden bg-neutral-950/95 border border-neutral-800 p-2.5 rounded-lg text-[10px] text-neutral-250 pointer-events-none z-50 shadow-xl leading-normal font-semibold max-w-[190px]';
      canvas.parentNode?.appendChild(tooltip);
    }

    const onMouseMove = (e: MouseEvent) => {
      const mouseX = e.offsetX;

      // Find closest point by x coordinate
      let closestIdx = -1;
      let minDistance = Infinity;

      points.forEach((p, idx) => {
        const dx = Math.abs(p.x - mouseX);
        if (dx < minDistance) {
          minDistance = dx;
          closestIdx = idx;
        }
      });

      if (closestIdx !== -1 && minDistance < 16) {
        renderBaseChart(closestIdx);
        const p = points[closestIdx];

        // Draw vertical dotted focus line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, paddingTop);
        ctx.lineTo(p.x, height - paddingBottom);
        ctx.stroke();
        ctx.setLineDash([]); // Reset

        // Update tooltip content
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${p.x + 12}px`;
        tooltip.style.top = `${Math.min(p.y - 12, height - 80)}px`;

        if (closestIdx === 0) {
          tooltip.innerHTML = `
            <div class="text-[9px] text-neutral-500 uppercase tracking-widest font-black">Initial Ledger</div>
            <div class="font-extrabold text-neutral-100 mt-1">Starting point</div>
            <div class="border-t border-neutral-850 my-1.5"></div>
            <div class="flex justify-between"><span>Profit:</span> <span class="text-neutral-400">$0.00</span></div>
          `;
        } else {
          const bet = chronologicalResolved[closestIdx - 1];
          if (bet) {
            const isWon = bet.status === 'won';
            const profit = isWon ? bet.stake * (americanToDecimal(bet.price) - 1) : -bet.stake;
            tooltip.innerHTML = `
              <div class="text-[9px] ${isWon ? 'text-emerald-450' : 'text-rose-450'} uppercase tracking-widest font-black mb-1">Bet Resolved</div>
              <div class="font-extrabold text-neutral-100 truncate">${bet.outcome}</div>
              <div class="text-neutral-455 text-[9px] mt-0.5 truncate">${bet.matchup}</div>
              <div class="border-t border-neutral-850 my-1.5"></div>
              <div class="flex justify-between gap-4"><span>Odds:</span> <span class="text-neutral-300 font-bold">${formatOdds(bet.price)}</span></div>
              <div class="flex justify-between gap-4"><span>Stake:</span> <span class="text-neutral-300 font-bold">$${bet.stake.toFixed(0)}</span></div>
              <div class="flex justify-between gap-4"><span>Net Return:</span> <span class="${isWon ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}">${isWon ? '+' : ''}$${profit.toFixed(2)}</span></div>
            `;
          }
        }
      } else {
        renderBaseChart(-1);
        tooltip.classList.add('hidden');
      }
    };

    const onMouseLeave = () => {
      renderBaseChart(-1);
      tooltip.classList.add('hidden');
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
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

function renderArbitrageBanner(bets: ValueBet[]): HTMLElement | null {
  const arbOpportunities: {
    eventId: string;
    matchup: string;
    outcomeA: string;
    outcomeB: string;
    oddsA: number;
    oddsB: number;
    bookA: string;
    bookB: string;
    margin: number;
  }[] = [];

  for (let i = 0; i < bets.length; i++) {
    for (let j = i + 1; j < bets.length; j++) {
      const b1 = bets[i];
      const b2 = bets[j];
      if (b1.eventId === b2.eventId && b1.market === b2.market && b1.outcome !== b2.outcome) {
        const dec1 = americanToDecimal(b1.bestPrice);
        const dec2 = americanToDecimal(b2.bestPrice);
        const sumImplied = (1 / dec1) + (1 / dec2);
        if (sumImplied < 1.0) {
          const margin = (1 - sumImplied) * 100;
          arbOpportunities.push({
            eventId: b1.eventId,
            matchup: `${b1.awayTeam} @ ${b1.homeTeam}`,
            outcomeA: b1.outcome,
            outcomeB: b2.outcome,
            oddsA: b1.bestPrice,
            oddsB: b2.bestPrice,
            bookA: b1.bestBookmakerTitle,
            bookB: b2.bestBookmakerTitle,
            margin
          });
        }
      }
    }
  }

  if (arbOpportunities.length === 0) return null;

  const container = document.createElement('div');
  container.className = 'bg-gradient-to-r from-emerald-950/40 via-primary-950/20 to-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 mb-6 shadow-lg shadow-emerald-950/10 animate-fade-in';
  
  let html = `
    <div class="flex items-center gap-2 mb-3">
      <span class="text-lg">⚖️</span>
      <div>
        <h3 class="font-extrabold text-xs text-primary-400 uppercase tracking-wider">Arbitrage Alert Detected</h3>
        <p class="text-[10px] text-neutral-400 font-semibold leading-relaxed mt-0.5">Risk-free hedging opportunities found between bookmaker line discrepancies.</p>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  `;

  arbOpportunities.forEach(opp => {
    const decA = americanToDecimal(opp.oddsA);
    const decB = americanToDecimal(opp.oddsB);
    const totalImplied = (1 / decA) + (1 / decB);
    const stakeA = (100 / (decA * totalImplied)).toFixed(2);
    const stakeB = (100 / (decB * totalImplied)).toFixed(2);
    const profit = (100 / totalImplied - 100).toFixed(2);

    html += `
      <div class="bg-neutral-950/60 border border-neutral-850 p-3 rounded-lg flex flex-col justify-between gap-2.5">
        <div class="flex justify-between items-start text-xs border-b border-neutral-850/60 pb-1.5">
          <div>
            <span class="font-extrabold text-neutral-200 block">${opp.matchup}</span>
            <span class="text-[9px] text-neutral-550 font-bold uppercase tracking-wider">Arbitrage Hedge</span>
          </div>
          <span class="px-1.5 py-0.5 text-[10px] font-black bg-emerald-500/10 text-emerald-450 rounded border border-emerald-500/25">+${opp.margin.toFixed(1)}% ROI</span>
        </div>
        
        <div class="grid grid-cols-2 gap-2 text-[11px] leading-normal font-semibold">
          <div>
            <span class="text-neutral-450 block">${opp.outcomeA}</span>
            <span class="text-primary-400 font-bold block">${opp.bookA} (${opp.oddsA > 0 ? '+' : ''}${opp.oddsA})</span>
            <span class="text-neutral-450 block mt-1">Bet Stake: <strong class="text-neutral-200">$${stakeA}</strong></span>
          </div>
          <div class="text-right">
            <span class="text-neutral-450 block">${opp.outcomeB}</span>
            <span class="text-primary-450 font-bold block">${opp.bookB} (${opp.oddsB > 0 ? '+' : ''}${opp.oddsB})</span>
            <span class="text-neutral-455 block mt-1">Bet Stake: <strong class="text-neutral-200">$${stakeB}</strong></span>
          </div>
        </div>

        <div class="bg-emerald-950/20 text-emerald-400 border border-emerald-500/10 p-2 rounded text-[10px] text-center font-bold">
          Guaranteed return of <span class="font-black text-emerald-400">$${profit}</span> profit on a $100 total wager split!
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
  return container;
}

function renderApp() {
  const app = document.getElementById('app')!;
  if (!currentData) return;

  // Reset container and layout
  app.innerHTML = '';

  // Render Horizontal Scrolling Stock-Exchange Odds Ticker
  app.appendChild(renderOddsTicker(currentData));

  // Render Arbitrage Warning Banner if applicable
  const arbBanner = renderArbitrageBanner(currentData.topValueBets);
  if (arbBanner) {
    app.appendChild(arbBanner);
  }

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
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center font-black text-neutral-950 shadow-lg shadow-primary-500/20">P</div>
        <h1 class="text-2xl font-black tracking-tighter text-neutral-50 bg-clip-text">PARLAY</h1>
        <svg width="131" height="42" viewBox="0 0 131 42" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-8 w-auto ml-1 filter drop-shadow-md">
          <path d="M116 0.5C124.008 0.5 130.5 6.99187 130.5 15V41.5H15C6.99187 41.5 0.5 35.0081 0.5 27V0.5H116Z" fill="black" stroke="#ACACAC"/>
          <path d="M27.8497 24.1575C24.3836 26.9643 19.4266 26.9643 15.9605 24.1575L17.3007 22.5026C19.9854 24.6766 23.8248 24.6766 26.5095 22.5026L27.8497 24.1575Z" fill="white"/>
          <path d="M17.404 17.6365V20.5134H19.5336V17.6365H17.404Z" fill="white"/>
          <path d="M24.012 17.6365V20.5134H26.1415V17.6365H24.012Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M21.5 33C27.8513 33 33 27.8513 33 21.5C33 15.1487 27.8513 10 21.5 10C15.1487 10 10 15.1487 10 21.5C10 27.8513 15.1487 33 21.5 33ZM21.5 30.8705C26.6752 30.8705 30.8705 26.6752 30.8705 21.5C30.8705 16.3248 26.6752 12.1295 21.5 12.1295C16.3248 12.1295 12.1295 16.3248 12.1295 21.5C12.1295 26.6752 16.3248 30.8705 21.5 30.8705Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M89.1305 32.15L93.7615 19.2822H96.8254L101.421 32.15H98.4806L97.6442 29.5049H92.8635L91.9655 32.15H89.1305ZM95.2671 22.2242L93.5943 27.2875H96.887L95.2671 22.2242Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M76.3315 23.7781C75.6213 22.876 74.6352 22.425 73.3733 22.425C72.6748 22.425 72.0996 22.5705 71.6476 22.8615C71.2661 23.0943 70.9169 23.4318 70.5999 23.8741V19.2997H68.0995V32.15H70.5559V30.954C70.8905 31.4196 71.2016 31.7455 71.4892 31.9318C71.9705 32.2461 72.6073 32.4032 73.3997 32.4032C74.6616 32.4032 75.6447 31.9172 76.3491 30.9453C77.0534 29.9734 77.4056 28.7483 77.4056 27.27C77.4056 25.8442 77.0475 24.6802 76.3315 23.7781ZM74.2361 29.5747C73.878 30.0927 73.3762 30.3517 72.7306 30.3517C71.9851 30.3517 71.4305 30.084 71.0666 29.5485C70.7027 29.0131 70.5207 28.338 70.5207 27.5232C70.5207 26.8306 70.6087 26.2661 70.7848 25.8296C71.1253 25.009 71.7504 24.5987 72.6601 24.5987C73.5581 24.5987 74.1744 25.0177 74.509 25.8558C74.6851 26.2981 74.7731 26.8568 74.7731 27.5319C74.7731 28.3758 74.5941 29.0567 74.2361 29.5747Z" fill="white"/>
          <path d="M62.2729 30.2556C62.1731 30.1567 62.1232 29.9123 62.1232 29.5223V24.4939H63.6816V22.7218H62.1232V20.0679H59.6404V22.7218H58.3022V24.4939H59.6404V30.3517C59.6404 30.9453 59.7813 31.3847 60.063 31.6699C60.4974 32.118 61.3074 32.3217 62.493 32.281L63.6816 32.2373V30.3779C63.5994 30.3837 63.5143 30.3895 63.4262 30.3953H63.1885C62.6779 30.3953 62.3727 30.3488 62.2729 30.2556Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M56.9897 30.9977C57.7996 30.0025 58.2046 28.8065 58.2046 27.4097C58.2046 26.0362 57.7996 24.8461 56.9897 23.8392C56.1797 22.8324 54.95 22.3289 53.3007 22.3289C51.6514 22.3289 50.4217 22.8324 49.6117 23.8392C48.8018 24.8461 48.3968 26.0362 48.3968 27.4097C48.3968 28.8065 48.8018 30.0025 49.6117 30.9977C50.4217 31.9871 51.6514 32.4818 53.3007 32.4818C54.95 32.4818 56.1797 31.9871 56.9897 30.9977ZM54.9823 29.6184C54.589 30.1363 54.0256 30.3953 53.2919 30.3953C52.5582 30.3953 51.9918 30.1363 51.5927 29.6184C51.1994 29.1004 51.0028 28.3642 51.0028 27.4097C51.0028 26.4553 51.1994 25.7219 51.5927 25.2098C51.9918 24.6918 52.5582 24.4328 53.2919 24.4328C54.0256 24.4328 54.589 24.6918 54.9823 25.2098C55.3756 25.7219 55.5722 26.4553 55.5722 27.4097C55.5722 28.3642 55.3756 29.1004 54.9823 29.6184Z" fill="white"/>
          <path d="M44.0028 22.4075C44.9947 22.4075 45.8047 22.6665 46.4327 23.1845C47.0666 23.6966 47.3836 24.5492 47.3836 25.7423V32.15H44.8127V26.3621C44.8127 25.8616 44.7453 25.4775 44.6103 25.2098C44.3637 24.7209 43.8942 24.4765 43.2016 24.4765C42.3505 24.4765 41.7665 24.8344 41.4495 25.5503C41.2852 25.9286 41.203 26.4116 41.203 26.9994V32.15H38.7026V22.6519H41.1238V24.04C41.4466 23.5511 41.7518 23.199 42.0394 22.9837C42.5559 22.5996 43.2104 22.4075 44.0028 22.4075Z" fill="white"/>
          <path d="M78.8766 33.9746L79.1935 33.992C79.4401 34.0037 79.6748 33.9949 79.8979 33.9658C80.1209 33.9367 80.3087 33.8698 80.4613 33.765C80.6081 33.6661 80.7431 33.4595 80.8663 33.1452C80.9955 32.831 81.0483 32.6389 81.0248 32.5691L77.5031 22.6345H80.2941L82.3895 29.6533L84.3704 22.6345H87.0381L83.7453 31.9929C83.1114 33.7971 82.6096 34.9145 82.2398 35.3451C81.87 35.7816 81.1305 35.9999 80.0211 35.9999C79.7981 35.9999 79.6191 35.997 79.4841 35.9912C79.3491 35.9912 79.1466 35.9824 78.8766 35.965V33.9746Z" fill="white"/>
          <path d="M103.733 29.9642V21.471H102.134V19.2822H107.839V21.471H106.427V29.9642H107.839V32.153H102.134V29.9642H103.733Z" fill="white"/>
          <path d="M80.6357 13.8379L82.0566 9.55176H83.0342C82.9096 9.88935 82.6332 10.6593 82.2041 11.8613C81.883 12.7656 81.6137 13.5031 81.3975 14.0732C80.8863 15.4167 80.5261 16.2363 80.3164 16.5312C80.1067 16.826 79.7463 16.9736 79.2354 16.9736C79.111 16.9736 79.0141 16.9688 78.9453 16.959C78.8798 16.9492 78.7975 16.9305 78.6992 16.9043V16.0986C78.8529 16.1411 78.9644 16.1669 79.0332 16.1768C79.102 16.1866 79.1634 16.1914 79.2158 16.1914C79.3794 16.1914 79.4989 16.164 79.5742 16.1084C79.6527 16.0561 79.7181 15.9906 79.7705 15.9121C79.7869 15.8859 79.8467 15.7513 79.9482 15.5088C80.0498 15.2663 80.1231 15.0857 80.1689 14.9678L78.2227 9.55176H79.2256L80.6357 13.8379Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M54.9873 9.42383C55.5836 9.42386 56.0897 9.6536 56.5059 10.1123C56.9219 10.5678 57.1299 11.2198 57.1299 12.0684C57.1298 13.2151 56.8301 14.0339 56.2305 14.5254C55.8504 14.8367 55.4079 14.9922 54.9033 14.9922C54.5072 14.9921 54.1748 14.9059 53.9062 14.7324C53.749 14.6341 53.5732 14.4648 53.3799 14.2256V16.9141H52.4951V9.57617H53.3555V10.2744C53.5324 10.0352 53.7258 9.84982 53.9355 9.71875C54.2337 9.5222 54.5843 9.42383 54.9873 9.42383ZM54.7861 10.2002C54.1735 10.2002 53.7535 10.5066 53.5273 11.1191C53.4061 11.4468 53.3457 11.8635 53.3457 12.3682C53.3457 12.7744 53.4061 12.1203 53.5273 13.4053C53.7567 13.9491 54.1767 14.2207 54.7861 14.2207C55.1986 14.2206 55.5407 14.0488 55.8125 13.7051C56.0877 13.3577 56.2256 12.8395 56.2256 12.1514C56.2256 11.7321 56.1652 11.3717 56.0439 11.0703C55.8146 10.4905 55.3953 10.2003 54.7861 10.2002Z" fill="white"/>
          <path d="M39.9209 9.41406C40.7139 9.41406 41.2861 9.64701 41.6367 10.1123C41.8561 10.4071 41.9626 10.7248 41.9561 11.0654H41.1201C41.1037 10.8656 41.0337 10.6834 40.9092 10.5195C40.706 10.287 40.3537 10.1709 39.8525 10.1709C39.5185 10.1709 39.2645 10.2346 39.0908 10.3623C38.9204 10.4901 38.835 10.6594 38.835 10.8691C38.8351 11.0982 38.9481 11.2814 39.1738 11.4189C39.3049 11.5008 39.4984 11.5735 39.7539 11.6357L40.3389 11.7783C40.9746 11.9323 41.4009 12.0814 41.6172 12.2256C41.9611 12.4517 42.1328 12.8072 42.1328 13.292C42.1328 13.7604 41.9546 14.1651 41.5977 14.5059C41.2438 14.8466 40.7029 15.0175 39.9756 15.0176C39.1926 15.0176 38.6373 14.8401 38.3096 14.4863C37.9852 14.1292 37.811 13.6883 37.7881 13.1641H38.6387C38.6649 13.459 38.7381 13.6855 38.8594 13.8428C39.0822 14.1278 39.4691 14.2705 40.0195 14.2705C40.3472 14.2705 40.6357 14.1995 40.8848 14.0586C41.1336 13.9145 41.2577 13.6935 41.2578 13.3955C41.2578 13.1694 41.1579 12.9969 40.958 12.8789C40.8301 12.8069 40.5777 12.7239 40.2012 12.6289L39.499 12.4512C39.0503 12.3398 38.7189 12.2157 38.5059 12.0781C38.1258 11.8389 37.9355 11.5077 37.9355 11.085C37.9356 10.587 38.1145 10.184 38.4717 9.87598C38.832 9.56815 39.315 9.41412 39.9209 9.41406Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M62.5566 9.43359C62.9302 9.43359 63.2929 9.52228 63.6436 9.69922C63.9939 9.87281 64.2609 10.0986 64.4443 10.377C64.6213 10.6424 64.7389 10.9528 64.7979 11.3066C64.8502 11.5491 64.8769 11.9354 64.877 12.4658H61.0186C61.0349 12.9999 61.1615 13.4295 61.3975 13.7539C61.6334 14.0749 61.9985 14.2354 62.4932 14.2354C62.9551 14.2353 63.3234 14.083 63.5986 13.7783C63.7559 13.6014 63.8681 13.3967 63.9336 13.1641H64.8027C64.7798 13.3573 64.7032 13.5735 64.5723 13.8125C64.4445 14.0483 64.3001 14.2419 64.1396 14.3926C63.871 14.6547 63.5381 14.8321 63.1416 14.9238C62.9287 14.9762 62.6875 15.002 62.4189 15.002C61.7638 15.0018 61.2083 14.765 60.7529 14.29C60.2975 13.8116 60.0703 13.1427 60.0703 12.2842C60.0703 11.4389 60.2991 10.7521 60.7578 10.2246C61.2165 9.69718 61.8163 9.43368 62.5566 9.43359ZM62.5029 10.2051C62.0966 10.2051 61.7557 10.3526 61.4805 10.6475C61.2052 10.9391 61.0594 11.3115 61.043 11.7637H63.9678C63.9317 11.3805 63.8478 11.0741 63.7168 10.8447C63.4743 10.4188 63.0698 10.2051 62.5029 10.2051Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M69.957 7.57031V14.8154H69.1611V14.083C68.9548 14.4073 68.7104 14.6419 68.4287 14.7861C68.1469 14.9303 67.8237 15.002 67.46 15.002C66.8736 15.0019 66.3657 14.7569 65.9365 14.2656C65.5073 13.7708 65.293 13.1131 65.293 12.2939C65.293 11.5274 65.4872 10.8639 65.877 10.3037C66.2702 9.74011 66.8312 9.45801 67.5586 9.45801C67.9615 9.45804 68.2994 9.54351 68.5713 9.71387C68.7284 9.81216 68.9068 9.98407 69.1064 10.2295V7.57031H69.957ZM67.7256 10.2295C67.28 10.2295 66.9182 10.4005 66.6396 10.7412C66.3644 11.082 66.2266 11.5832 66.2266 12.2451C66.2266 12.8085 66.3459 13.2801 66.585 13.6602C66.8242 14.0403 67.2078 14.2305 67.7354 14.2305C68.1449 14.2305 68.481 14.0557 68.7432 13.7051C69.0085 13.3513 69.1406 12.8449 69.1406 12.1865C69.1406 11.5216 69.0052 11.0298 68.7334 10.7119C68.4614 10.3908 68.1253 10.2295 67.7256 10.2295Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M88.0635 9.42383C88.6826 9.42387 89.1857 9.54147 89.5723 9.77734C89.9556 10.0133 90.1475 10.3808 90.1475 10.8789V13.9111C90.1475 14.0029 90.1651 14.0771 90.2012 14.1328C90.2405 14.1884 90.3213 14.2158 90.4424 14.2158C90.4816 14.2158 90.5262 14.2142 90.5752 14.2109C90.6242 14.2044 90.6769 14.1963 90.7324 14.1865V14.8398C90.5951 14.8791 90.49 14.9042 90.418 14.9141C90.346 14.9239 90.2473 14.9287 90.123 14.9287C89.8184 14.9287 89.5966 14.8207 89.459 14.6045C89.3869 14.4899 89.3361 14.3277 89.3066 14.1182C89.1264 14.354 88.8676 14.5588 88.5303 14.7324C88.1928 14.9061 87.8204 14.9922 87.4141 14.9922C86.926 14.9921 86.5261 14.8446 86.2148 14.5498C85.9071 14.2517 85.7529 13.88 85.7529 13.4346C85.7529 12.9463 85.9052 12.5675 86.21 12.2988C86.5146 12.0302 86.9145 11.865 87.4092 11.8027L88.8203 11.626C89.0234 11.5997 89.1597 11.5142 89.2285 11.3701C89.2677 11.2915 89.2871 11.1785 89.2871 11.0312C89.2871 10.7298 89.1791 10.5113 88.9629 10.377C88.75 10.2394 88.4435 10.1709 88.0439 10.1709C87.5821 10.1709 87.2539 10.2951 87.0605 10.5439C86.9524 10.6816 86.8824 10.8872 86.8496 11.1592H86.0234C86.0398 10.5106 86.2495 10.06 86.6523 9.80762C87.0587 9.55203 87.5294 9.42383 88.0635 9.42383ZM89.2627 12.1367C89.1546 12.2055 89.015 12.2627 88.8447 12.3086C88.6745 12.3544 88.5075 12.3876 88.3438 12.4072L87.8076 12.4756C87.4865 12.5182 87.2455 12.586 87.085 12.6777C86.8131 12.8317 86.6768 13.0776 86.6768 13.415C86.6768 13.6705 86.7704 13.8721 86.957 14.0195C87.1438 14.167 87.3655 14.2402 87.6211 14.2402C87.9323 14.2402 88.2339 14.1685 88.5254 14.0244C89.0168 13.7852 89.2627 13.3935 89.2627 12.8496V12.1367Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M114.55 9.42383C115.169 9.42385 115.672 9.54149 116.059 9.77734C116.442 10.0133 116.634 10.3808 116.634 10.8789V13.9111C116.634 14.0029 116.651 14.0771 116.688 14.1328C116.727 14.1884 116.808 14.2158 116.929 14.2158C116.968 14.2158 117.012 14.2142 117.062 14.2109C117.111 14.2044 117.163 14.1963 117.219 14.1865V14.8398C117.081 14.8791 116.976 14.9042 116.904 14.9141C116.832 14.9239 116.734 14.9287 116.609 14.9287C116.305 14.9287 116.083 14.8207 115.945 14.6045C115.873 14.4899 115.822 14.3277 115.793 14.1182C115.613 14.3539 115.354 14.5588 115.017 14.7324C114.679 14.9061 114.307 14.9922 113.9 14.9922C113.412 14.9921 113.012 14.8446 112.701 14.5498C112.393 14.2517 112.239 13.88 112.239 13.4346C112.239 12.9464 112.392 12.5675 112.696 12.2988C113.001 12.0302 113.401 11.865 113.896 11.8027L115.307 11.626C115.51 11.5998 115.646 11.5143 115.715 11.3701C115.754 11.2915 115.773 11.1785 115.773 11.0312C115.773 10.7298 115.665 10.5113 115.449 10.377C115.236 10.2394 114.93 10.1709 114.53 10.1709C114.068 10.1709 113.74 10.2951 113.547 10.5439C113.439 10.6816 113.369 10.8872 113.336 11.1592H112.51C112.526 10.5106 112.736 10.06 113.139 9.80762C113.545 9.55203 114.016 9.42383 114.55 9.42383ZM115.749 12.1367C115.641 12.2055 115.501 12.2627 115.331 12.3086C115.161 12.3544 114.994 12.3876 114.83 12.4072L114.294 12.4756C113.973 12.5182 113.732 12.586 113.571 12.6777C113.299 12.8317 113.163 13.0776 113.163 13.415C113.163 13.6705 113.257 13.8721 113.443 14.0195C113.63 14.167 113.852 14.2402 114.107 14.2402C114.419 14.2402 114.72 14.1686 115.012 14.0244C115.503 13.7852 115.749 13.3935 115.749 12.8496V12.1367Z" fill="white"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M74.2578 7.57031V10.1904C74.4511 9.93812 74.6825 9.7463 74.9512 9.61523C75.2199 9.48089 75.5116 9.41406 75.8262 9.41406C76.4815 9.41406 77.0126 9.63968 77.4189 10.0918C77.8285 10.5407 78.0332 11.2048 78.0332 12.083C78.0332 12.9152 77.8317 13.6068 77.4287 14.1572C77.0257 14.7077 76.4663 14.9824 75.752 14.9824C75.3524 14.9823 75.0154 14.8856 74.7402 14.6924C74.5764 14.5777 74.4006 14.3948 74.2139 14.1426V14.8154H73.3984V7.57031H74.2578ZM75.7227 10.2051C75.3198 10.2052 74.9658 10.3543 74.6611 10.6523C74.3597 10.9505 74.209 11.4422 74.209 12.127C74.209 12.6216 74.2711 13.0231 74.3955 13.3311C74.6281 13.911 75.0626 14.2011 75.6982 14.2012C76.1766 14.2012 76.5336 14.011 76.7695 13.6309C77.0087 13.2508 77.1289 12.7495 77.1289 12.127C77.1289 11.5732 77.0087 11.1147 76.7695 10.751C76.5336 10.3873 76.1846 10.2051 75.7227 10.2051Z" fill="white"/>
          <path d="M44.873 9.39941C45.4661 9.39941 45.9481 9.54368 46.3184 9.83203C46.6919 10.1204 46.9168 10.6168 46.9922 11.3213H46.1318C46.0794 10.9969 45.9592 10.7276 45.7725 10.5146C45.5857 10.2987 45.2857 10.1904 44.873 10.1904C44.3097 10.1906 43.9065 10.4663 43.6641 11.0166C43.5069 11.3737 43.4287 11.8148 43.4287 12.3389C43.4288 12.8662 43.5399 13.3106 43.7627 13.6709C43.9855 14.0311 44.3362 14.2109 44.8145 14.2109C45.1814 14.2109 45.4716 14.0998 45.6846 13.877C45.9008 13.6509 46.0499 13.3429 46.1318 12.9531H46.9922C46.8939 13.6508 46.648 14.162 46.2549 14.4863C45.8618 14.8074 45.3587 14.9677 44.7461 14.9678C44.058 14.9678 43.5092 14.7171 43.0996 14.2158C42.69 13.7112 42.4844 13.0818 42.4844 12.3281C42.4845 11.4043 42.7094 10.6853 43.1582 10.1709C43.607 9.65658 44.1786 9.39952 44.873 9.39941Z" fill="white"/>
          <path d="M99.9854 13.0459C99.9854 13.3146 100.028 13.5347 100.113 13.7051C100.271 14.0195 100.564 14.1767 100.993 14.1768C101.609 14.1768 102.029 13.9011 102.252 13.3506C102.373 13.0557 102.434 12.6509 102.434 12.1367V9.55176H103.318V14.8154H102.482L102.492 14.0391C102.378 14.2389 102.235 14.4073 102.064 14.5449C101.727 14.8202 101.318 14.958 100.836 14.958C100.086 14.958 99.5747 14.7074 99.3027 14.2061C99.1553 13.9374 99.0811 13.5787 99.0811 13.1299V9.55176H99.9854V13.0459Z" fill="white"/>
          <path d="M58.9365 8.08203V9.55176H59.7773V10.2744H58.9365V13.71C58.9366 13.8931 58.9989 14.0158 59.123 14.0781C59.1919 14.1142 59.3072 14.1328 59.4678 14.1328H59.6055C59.6546 14.1295 59.7119 14.1247 59.7773 14.1182V14.8154C59.6758 14.8449 59.5693 14.8668 59.458 14.8799C59.3499 14.893 59.2313 14.8994 59.1035 14.8994C58.6911 14.8994 58.4112 14.7944 58.2637 14.585C58.1162 14.372 58.042 14.0963 58.042 13.7588V10.2744H57.3291V9.55176H58.042V8.08203H58.9365Z" fill="white"/>
          <path d="M49.958 9.43848C49.9973 9.44175 50.0651 9.44818 50.1602 9.45801V10.3916C50.1078 10.3818 50.0585 10.3754 50.0127 10.3721C49.9701 10.3688 49.9225 10.3672 49.8701 10.3672C49.4246 10.3672 49.082 10.5116 48.8428 10.7998C48.6036 11.0849 48.4844 11.4145 48.4844 11.7881V14.8154H47.5996V9.55176H48.4395V10.4609C48.5083 10.284 48.6776 10.0697 48.9463 9.81738C49.215 9.5618 49.5244 9.43359 49.875 9.43359C49.8913 9.4336 49.919 9.43523 49.958 9.43848Z" fill="white"/>
          <path d="M51.5244 14.8154H50.625V9.57617H51.5244V14.8154Z" fill="white"/>
          <path d="M94.6846 7.57031V10.2646C94.8943 9.99923 95.0829 9.81223 95.25 9.7041C95.535 9.51741 95.8905 9.42383 96.3164 9.42383C97.0796 9.42388 97.5971 9.69079 97.8691 10.2246C98.0166 10.5162 98.0908 10.9217 98.0908 11.4395V14.8154H97.1816V11.498C97.1816 11.1114 97.1325 10.8277 97.0342 10.6475C96.8737 10.3592 96.572 10.2149 96.1299 10.2148C95.7629 10.2148 95.43 10.3415 95.1318 10.5938C94.8337 10.846 94.6846 11.3225 94.6846 12.0234V14.8154H93.7998V7.57031H94.6846Z" fill="white"/>
          <path d="M109.833 9.43359C110.541 9.43359 111.023 9.68912 111.278 10.2002C111.416 10.4754 111.484 10.8462 111.484 11.3115V14.8154H110.565V11.1592C110.565 10.8086 110.477 10.5676 110.3 10.4365C110.126 10.3055 109.913 10.2393 109.661 10.2393C109.314 10.2393 109.014 10.3562 108.762 10.5889C108.513 10.8215 108.389 11.2101 108.389 11.7539V14.8154H107.489V11.3799C107.489 11.023 107.446 10.7625 107.361 10.5986C107.227 10.353 106.976 10.2296 106.609 10.2295C106.275 10.2295 105.97 10.3593 105.694 10.6182C105.423 10.877 105.287 11.3456 105.287 12.0234V14.8154H104.402V9.55176H105.277V10.2988C105.487 10.0402 105.676 9.85136 105.847 9.7334C106.138 9.53355 106.47 9.43362 106.84 9.43359C107.259 9.43359 107.597 9.53675 107.853 9.74316C107.997 9.86113 108.128 10.0353 108.246 10.2646C108.443 9.98287 108.673 9.77399 108.938 9.63965C109.204 9.50206 109.502 9.43363 109.833 9.43359Z" fill="white"/>
          <path d="M120.348 9.43359C121.094 9.43369 121.599 9.69402 121.861 10.2148C122.006 10.4999 122.077 10.9086 122.077 11.4395V14.8154H121.178V11.498C121.178 11.177 121.13 10.9183 121.035 10.7217C120.878 10.394 120.593 10.2295 120.18 10.2295C119.97 10.2295 119.798 10.2514 119.664 10.2939C119.422 10.366 119.209 10.5103 119.025 10.7266C118.878 10.9001 118.781 11.08 118.735 11.2666C118.693 11.4501 118.671 11.7145 118.671 12.0586V14.8154H117.786V9.55176H118.627V10.2988C118.876 9.99086 119.139 9.76912 119.418 9.63477C119.696 9.50042 120.007 9.43359 120.348 9.43359Z" fill="white"/>
          <path d="M51.5244 8.59766H50.625V7.5957H51.5244V8.59766Z" fill="white"/>
        </svg>
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
      <button id="ai-config-btn" class="px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-350 hover:text-neutral-100 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all active:scale-95">
        🤖 AI Config
      </button>
      <div class="text-right cursor-pointer group" id="go-to-tracker">
        <div class="text-[9px] text-neutral-500 font-extrabold uppercase tracking-wider group-hover:underline">Record (W-L) 🏆</div>
        <div class="text-emerald-450 font-black text-[11px] mt-0.5 group-hover:underline" id="go-to-tracker-val">${wins}W - ${losses}L ${pending > 0 ? `[${pending}P]` : ''}</div>
      </div>
      <div class="w-px h-7 bg-neutral-800"></div>
      <div class="text-right cursor-pointer group" id="go-to-watchlist">
        <div class="text-[9px] text-neutral-500 font-extrabold uppercase tracking-wider group-hover:underline">Watchlist ⭐</div>
        <div class="text-amber-400 font-extrabold text-[11px] mt-0.5 group-hover:underline">${watchlist.length} Starred</div>
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
  header.querySelector('#ai-config-btn')?.addEventListener('click', openAiConfigModal);
  
  header.querySelector('#go-to-tracker')?.addEventListener('click', () => {
    currentMainTab = 'tracker';
    renderApp();
  });
  header.querySelector('#go-to-tracker-val')?.addEventListener('click', () => {
    currentMainTab = 'tracker';
    renderApp();
  });
  header.querySelector('#go-to-watchlist')?.addEventListener('click', () => {
    currentMainTab = 'bets';
    currentSportFilter = 'Watchlist';
    renderApp();
  });

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

  // Render Top Level Main Tab Navigation
  const tabNavigation = document.createElement('nav');
  tabNavigation.className = 'flex items-center gap-2 mb-6 border-b border-neutral-800 pb-px overflow-x-auto whitespace-nowrap scrollbar-none';
  
  const mainTabs = [
    { id: 'bets', label: '🔥 Value Bets', desc: 'EV opportunities' },
    { id: 'parlays', label: '⚡ Parlay Builder', desc: 'Custom builder & suggested parlays' },
    { id: 'ai', label: '🤖 Daily AI Insights', desc: 'Projections & bankroll config' },
    { id: 'tracker', label: '📈 Bet Tracker', desc: 'Staking ledger & charts' },
    { id: 'leaderboard', label: '👥 Friends Pool', desc: 'P2P leaderboard pool' }
  ];

  mainTabs.forEach(tab => {
    const tabBtn = document.createElement('button');
    tabBtn.className = `flex flex-col items-start px-4 py-2 border-b-2 font-bold cursor-pointer transition-all ${
      currentMainTab === tab.id
        ? 'border-primary-500 text-neutral-100 bg-neutral-900/10'
        : 'border-transparent text-neutral-450 hover:text-neutral-200 hover:bg-neutral-900/5'
    }`;
    tabBtn.innerHTML = `
      <span class="text-xs sm:text-sm tracking-tight">${tab.label}</span>
      <span class="text-[9px] text-neutral-500 font-medium font-semibold leading-none mt-0.5 hidden sm:inline">${tab.desc}</span>
    `;
    tabBtn.addEventListener('click', () => {
      currentMainTab = tab.id as any;
      if (currentMainTab === 'bets' && currentSportFilter === 'Watchlist') {
        currentSportFilter = 'All';
      }
      renderApp();
    });
    tabNavigation.appendChild(tabBtn);
  });
  app.appendChild(tabNavigation);

  // Render active tab view
  if (currentMainTab === 'tracker') {
    app.appendChild(renderTrackerView());
  } else if (currentMainTab === 'leaderboard') {
    app.appendChild(renderLeaderboardView());
  } else if (currentMainTab === 'parlays') {
    app.appendChild(renderParlayCalculator());
    app.appendChild(renderParlays(currentData.parlays));
  } else if (currentMainTab === 'ai') {
    const aiPanel = renderAIAnalysis(currentData);
    if (aiPanel) {
      app.appendChild(aiPanel);
    }
    app.appendChild(renderBankrollConfig());
    app.appendChild(renderAiAgentSearchBox());
  } else {
    // currentMainTab === 'bets'
    app.appendChild(renderFilters(currentData));
    app.appendChild(renderBets(currentData.topValueBets));
  }

  // Footer Disclaimer
  const footer = document.createElement('footer');
  footer.className = 'mt-12 pt-6 border-t border-neutral-850 pb-8 text-[10px] text-neutral-500 leading-relaxed text-center font-semibold';
  footer.innerHTML = `
    <div class="flex justify-center mb-4">
      <svg width="131" height="42" viewBox="0 0 131 42" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-8 w-auto filter drop-shadow-md">
        <path d="M116 0.5C124.008 0.5 130.5 6.99187 130.5 15V41.5H15C6.99187 41.5 0.5 35.0081 0.5 27V0.5H116Z" fill="black" stroke="#ACACAC"/>
        <path d="M27.8497 24.1575C24.3836 26.9643 19.4266 26.9643 15.9605 24.1575L17.3007 22.5026C19.9854 24.6766 23.8248 24.6766 26.5095 22.5026L27.8497 24.1575Z" fill="white"/>
        <path d="M17.404 17.6365V20.5134H19.5336V17.6365H17.404Z" fill="white"/>
        <path d="M24.012 17.6365V20.5134H26.1415V17.6365H24.012Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M21.5 33C27.8513 33 33 27.8513 33 21.5C33 15.1487 27.8513 10 21.5 10C15.1487 10 10 15.1487 10 21.5C10 27.8513 15.1487 33 21.5 33ZM21.5 30.8705C26.6752 30.8705 30.8705 26.6752 30.8705 21.5C30.8705 16.3248 26.6752 12.1295 21.5 12.1295C16.3248 12.1295 12.1295 16.3248 12.1295 21.5C12.1295 26.6752 16.3248 30.8705 21.5 30.8705Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M89.1305 32.15L93.7615 19.2822H96.8254L101.421 32.15H98.4806L97.6442 29.5049H92.8635L91.9655 32.15H89.1305ZM95.2671 22.2242L93.5943 27.2875H96.887L95.2671 22.2242Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M76.3315 23.7781C75.6213 22.876 74.6352 22.425 73.3733 22.425C72.6748 22.425 72.0996 22.5705 71.6476 22.8615C71.2661 23.0943 70.9169 23.4318 70.5999 23.8741V19.2997H68.0995V32.15H70.5559V30.954C70.8905 31.4196 71.2016 31.7455 71.4892 31.9318C71.9705 32.2461 72.6073 32.4032 73.3997 32.4032C74.6616 32.4032 75.6447 31.9172 76.3491 30.9453C77.0534 29.9734 77.4056 28.7483 77.4056 27.27C77.4056 25.8442 77.0475 24.6802 76.3315 23.7781ZM74.2361 29.5747C73.878 30.0927 73.3762 30.3517 72.7306 30.3517C71.9851 30.3517 71.4305 30.084 71.0666 29.5485C70.7027 29.0131 70.5207 28.338 70.5207 27.5232C70.5207 26.8306 70.6087 26.2661 70.7848 25.8296C71.1253 25.009 71.7504 24.5987 72.6601 24.5987C73.5581 24.5987 74.1744 25.0177 74.509 25.8558C74.6851 26.2981 74.7731 26.8568 74.7731 27.5319C74.7731 28.3758 74.5941 29.0567 74.2361 29.5747Z" fill="white"/>
        <path d="M62.2729 30.2556C62.1731 30.1567 62.1232 29.9123 62.1232 29.5223V24.4939H63.6816V22.7218H62.1232V20.0679H59.6404V22.7218H58.3022V24.4939H59.6404V30.3517C59.6404 30.9453 59.7813 31.3847 60.063 31.6699C60.4974 32.118 61.3074 32.3217 62.493 32.281L63.6816 32.2373V30.3779C63.5994 30.3837 63.5143 30.3895 63.4262 30.3953H63.1885C62.6779 30.3953 62.3727 30.3488 62.2729 30.2556Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M56.9897 30.9977C57.7996 30.0025 58.2046 28.8065 58.2046 27.4097C58.2046 26.0362 57.7996 24.8461 56.9897 23.8392C56.1797 22.8324 54.95 22.3289 53.3007 22.3289C51.6514 22.3289 50.4217 22.8324 49.6117 23.8392C48.8018 24.8461 48.3968 26.0362 48.3968 27.4097C48.3968 28.8065 48.8018 30.0025 49.6117 30.9977C50.4217 31.9871 51.6514 32.4818 53.3007 32.4818C54.95 32.4818 56.1797 31.9871 56.9897 30.9977ZM54.9823 29.6184C54.589 30.1363 54.0256 30.3953 53.2919 30.3953C52.5582 30.3953 51.9918 30.1363 51.5927 29.6184C51.1994 29.1004 51.0028 28.3642 51.0028 27.4097C51.0028 26.4553 51.1994 25.7219 51.5927 25.2098C51.9918 24.6918 52.5582 24.4328 53.2919 24.4328C54.0256 24.4328 54.589 24.6918 54.9823 25.2098C55.3756 25.7219 55.5722 26.4553 55.5722 27.4097C55.5722 28.3642 55.3756 29.1004 54.9823 29.6184Z" fill="white"/>
        <path d="M44.0028 22.4075C44.9947 22.4075 45.8047 22.6665 46.4327 23.1845C47.0666 23.6966 47.3836 24.5492 47.3836 25.7423V32.15H44.8127V26.3621C44.8127 25.8616 44.7453 25.4775 44.6103 25.2098C44.3637 24.7209 43.8942 24.4765 43.2016 24.4765C42.3505 24.4765 41.7665 24.8344 41.4495 25.5503C41.2852 25.9286 41.203 26.4116 41.203 26.9994V32.15H38.7026V22.6519H41.1238V24.04C41.4466 23.5511 41.7518 23.199 42.0394 22.9837C42.5559 22.5996 43.2104 22.4075 44.0028 22.4075Z" fill="white"/>
        <path d="M78.8766 33.9746L79.1935 33.992C79.4401 34.0037 79.6748 33.9949 79.8979 33.9658C80.1209 33.9367 80.3087 33.8698 80.4613 33.765C80.6081 33.6661 80.7431 33.4595 80.8663 33.1452C80.9955 32.831 81.0483 32.6389 81.0248 32.5691L77.5031 22.6345H80.2941L82.3895 29.6533L84.3704 22.6345H87.0381L83.7453 31.9929C83.1114 33.7971 82.6096 34.9145 82.2398 35.3451C81.87 35.7816 81.1305 35.9999 80.0211 35.9999C79.7981 35.9999 79.6191 35.997 79.4841 35.9912C79.3491 35.9912 79.1466 35.9824 78.8766 35.965V33.9746Z" fill="white"/>
        <path d="M103.733 29.9642V21.471H102.134V19.2822H107.839V21.471H106.427V29.9642H107.839V32.153H102.134V29.9642H103.733Z" fill="white"/>
        <path d="M80.6357 13.8379L82.0566 9.55176H83.0342C82.9096 9.88935 82.6332 10.6593 82.2041 11.8613C81.883 12.7656 81.6137 13.5031 81.3975 14.0732C80.8863 15.4167 80.5261 16.2363 80.3164 16.5312C80.1067 16.826 79.7463 16.9736 79.2354 16.9736C79.111 16.9736 79.0141 16.9688 78.9453 16.959C78.8798 16.9492 78.7975 16.9305 78.6992 16.9043V16.0986C78.8529 16.1411 78.9644 16.1669 79.0332 16.1768C79.102 16.1866 79.1634 16.1914 79.2158 16.1914C79.3794 16.1914 79.4989 16.164 79.5742 16.1084C79.6527 16.0561 79.7181 15.9906 79.7705 15.9121C79.7869 15.8859 79.8467 15.7513 79.9482 15.5088C80.0498 15.2663 80.1231 15.0857 80.1689 14.9678L78.2227 9.55176H79.2256L80.6357 13.8379Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M54.9873 9.42383C55.5836 9.42386 56.0897 9.6536 56.5059 10.1123C56.9219 10.5678 57.1299 11.2198 57.1299 12.0684C57.1298 13.2151 56.8301 14.0339 56.2305 14.5254C55.8504 14.8367 55.4079 14.9922 54.9033 14.9922C54.5072 14.9921 54.1748 14.9059 53.9062 14.7324C53.749 14.6341 53.5732 14.4648 53.3799 14.2256V16.9141H52.4951V9.57617H53.3555V10.2744C53.5324 10.0352 53.7258 9.84982 53.9355 9.71875C54.2337 9.5222 54.5843 9.42383 54.9873 9.42383ZM54.7861 10.2002C54.1735 10.2002 53.7535 10.5066 53.5273 11.1191C53.4061 11.4468 53.3457 11.8635 53.3457 12.3682C53.3457 12.7744 53.4061 12.1203 53.5273 13.4053C53.7567 13.9491 54.1767 14.2207 54.7861 14.2207C55.1986 14.2206 55.5407 14.0488 55.8125 13.7051C56.0877 13.3577 56.2256 12.8395 56.2256 12.1514C56.2256 11.7321 56.1652 11.3717 56.0439 11.0703C55.8146 10.4905 55.3953 10.2003 54.7861 10.2002Z" fill="white"/>
        <path d="M39.9209 9.41406C40.7139 9.41406 41.2861 9.64701 41.6367 10.1123C41.8561 10.4071 41.9626 10.7248 41.9561 11.0654H41.1201C41.1037 10.8656 41.0337 10.6834 40.9092 10.5195C40.706 10.287 40.3537 10.1709 39.8525 10.1709C39.5185 10.1709 39.2645 10.2346 39.0908 10.3623C38.9204 10.4901 38.835 10.6594 38.835 10.8691C38.8351 11.0982 38.9481 11.2814 39.1738 11.4189C39.3049 11.5008 39.4984 11.5735 39.7539 11.6357L40.3389 11.7783C40.9746 11.9323 41.4009 12.0814 41.6172 12.2256C41.9611 12.4517 42.1328 12.8072 42.1328 13.292C42.1328 13.7604 41.9546 14.1651 41.5977 14.5059C41.2438 14.8466 40.7029 15.0175 39.9756 15.0176C39.1926 15.0176 38.6373 14.8401 38.3096 14.4863C37.9852 14.1292 37.811 13.6883 37.7881 13.1641H38.6387C38.6649 13.459 38.7381 13.6855 38.8594 13.8428C39.0822 14.1278 39.4691 14.2705 40.0195 14.2705C40.3472 14.2705 40.6357 14.1995 40.8848 14.0586C41.1336 13.9145 41.2577 13.6935 41.2578 13.3955C41.2578 13.1694 41.1579 12.9969 40.958 12.8789C40.8301 12.8069 40.5777 12.7239 40.2012 12.6289L39.499 12.4512C39.0503 12.3398 38.7189 12.2157 38.5059 12.0781C38.1258 11.8389 37.9355 11.5077 37.9355 11.085C37.9356 10.587 38.1145 10.184 38.4717 9.87598C38.832 9.56815 39.315 9.41412 39.9209 9.41406Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M62.5566 9.43359C62.9302 9.43359 63.2929 9.52228 63.6436 9.69922C63.9939 9.87281 64.2609 10.0986 64.4443 10.377C64.6213 10.6424 64.7389 10.9528 64.7979 11.3066C64.8502 11.5491 64.8769 11.9354 64.877 12.4658H61.0186C61.0349 12.9999 61.1615 13.4295 61.3975 13.7539C61.6334 14.0749 61.9985 14.2354 62.4932 14.2354C62.9551 14.2353 63.3234 14.083 63.5986 13.7783C63.7559 13.6014 63.8681 13.3967 63.9336 13.1641H64.8027C64.7798 13.3573 64.7032 13.5735 64.5723 13.8125C64.4445 14.0483 64.3001 14.2419 64.1396 14.3926C63.871 14.6547 63.5381 14.8321 63.1416 14.9238C62.9287 14.9762 62.6875 15.002 62.4189 15.002C61.7638 15.0018 61.2083 14.765 60.7529 14.29C60.2975 13.8116 60.0703 13.1427 60.0703 12.2842C60.0703 11.4389 60.2991 10.7521 60.7578 10.2246C61.2165 9.69718 61.8163 9.43368 62.5566 9.43359ZM62.5029 10.2051C62.0966 10.2051 61.7557 10.3526 61.4805 10.6475C61.2052 10.9391 61.0594 11.3115 61.043 11.7637H63.9678C63.9317 11.3805 63.8478 11.0741 63.7168 10.8447C63.4743 10.4188 63.0698 10.2051 62.5029 10.2051Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M69.957 7.57031V14.8154H69.1611V14.083C68.9548 14.4073 68.7104 14.6419 68.4287 14.7861C68.1469 14.9303 67.8237 15.002 67.46 15.002C66.8736 15.0019 66.3657 14.7569 65.9365 14.2656C65.5073 13.7708 65.293 13.1131 65.293 12.2939C65.293 11.5274 65.4872 10.8639 65.877 10.3037C66.2702 9.74011 66.8312 9.45801 67.5586 9.45801C67.9615 9.45804 68.2994 9.54351 68.5713 9.71387C68.7284 9.81216 68.9068 9.98407 69.1064 10.2295V7.57031H69.957ZM67.7256 10.2295C67.28 10.2295 66.9182 10.4005 66.6396 10.7412C66.3644 11.082 66.2266 11.5832 66.2266 12.2451C66.2266 12.8085 66.3459 13.2801 66.585 13.6602C66.8242 14.0403 67.2078 14.2305 67.7354 14.2305C68.1449 14.2305 68.481 14.0557 68.7432 13.7051C69.0085 13.3513 69.1406 12.8449 69.1406 12.1865C69.1406 11.5216 69.0052 11.0298 68.7334 10.7119C68.4614 10.3908 68.1253 10.2295 67.7256 10.2295Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M88.0635 9.42383C88.6826 9.42387 89.1857 9.54147 89.5723 9.77734C89.9556 10.0133 90.1475 10.3808 90.1475 10.8789V13.9111C90.1475 14.0029 90.1651 14.0771 90.2012 14.1328C90.2405 14.1884 90.3213 14.2158 90.4424 14.2158C90.4816 14.2158 90.5262 14.2142 90.5752 14.2109C90.6242 14.2044 90.6769 14.1963 90.7324 14.1865V14.8398C90.5951 14.8791 90.49 14.9042 90.418 14.9141C90.346 14.9239 90.2473 14.9287 90.123 14.9287C89.8184 14.9287 89.5966 14.8207 89.459 14.6045C89.3869 14.4899 89.3361 14.3277 89.3066 14.1182C89.1264 14.354 88.8676 14.5588 88.5303 14.7324C88.1928 14.9061 87.8204 14.9922 87.4141 14.9922C86.926 14.9921 86.5261 14.8446 86.2148 14.5498C85.9071 14.2517 85.7529 13.88 85.7529 13.4346C85.7529 12.9463 85.9052 12.5675 86.21 12.2988C86.5146 12.0302 86.9145 11.865 87.4092 11.8027L88.8203 11.626C89.0234 11.5997 89.1597 11.5142 89.2285 11.3701C89.2677 11.2915 89.2871 11.1785 89.2871 11.0312C89.2871 10.7298 89.1791 10.5113 88.9629 10.377C88.75 10.2394 88.4435 10.1709 88.0439 10.1709C87.5821 10.1709 87.2539 10.2951 87.0605 10.5439C86.9524 10.6816 86.8824 10.8872 86.8496 11.1592H86.0234C86.0398 10.5106 86.2495 10.06 86.6523 9.80762C87.0587 9.55203 87.5294 9.42383 88.0635 9.42383ZM89.2627 12.1367C89.1546 12.2055 89.015 12.2627 88.8447 12.3086C88.6745 12.3544 88.5075 12.3876 88.3438 12.4072L87.8076 12.4756C87.4865 12.5182 87.2455 12.586 87.085 12.6777C86.8131 12.8317 86.6768 13.0776 86.6768 13.415C86.6768 13.6705 86.7704 13.8721 86.957 14.0195C87.1438 14.167 87.3655 14.2402 87.6211 14.2402C87.9323 14.2402 88.2339 14.1685 88.5254 14.0244C89.0168 13.7852 89.2627 13.3935 89.2627 12.8496V12.1367Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M114.55 9.42383C115.169 9.42385 115.672 9.54149 116.059 9.77734C116.442 10.0133 116.634 10.3808 116.634 10.8789V13.9111C116.634 14.0029 116.651 14.0771 116.688 14.1328C116.727 14.1884 116.808 14.2158 116.929 14.2158C116.968 14.2158 117.012 14.2142 117.062 14.2109C117.111 14.2044 117.163 14.1963 117.219 14.1865V14.8398C117.081 14.8791 116.976 14.9042 116.904 14.9141C116.832 14.9239 116.734 14.9287 116.609 14.9287C116.305 14.9287 116.083 14.8207 115.945 14.6045C115.873 14.4899 115.822 14.3277 115.793 14.1182C115.613 14.3539 115.354 14.5588 115.017 14.7324C114.679 14.9061 114.307 14.9922 113.9 14.9922C113.412 14.9921 113.012 14.8446 112.701 14.5498C112.393 14.2517 112.239 13.88 112.239 13.4346C112.239 12.9464 112.392 12.5675 112.696 12.2988C113.001 12.0302 113.401 11.865 113.896 11.8027L115.307 11.626C115.51 11.5998 115.646 11.5143 115.715 11.3701C115.754 11.2915 115.773 11.1785 115.773 11.0312C115.773 10.7298 115.665 10.5113 115.449 10.377C115.236 10.2394 114.93 10.1709 114.53 10.1709C114.068 10.1709 113.74 10.2951 113.547 10.5439C113.439 10.6816 113.369 10.8872 113.336 11.1592H112.51C112.526 10.5106 112.736 10.06 113.139 9.80762C113.545 9.55203 114.016 9.42383 114.55 9.42383ZM115.749 12.1367C115.641 12.2055 115.501 12.2627 115.331 12.3086C115.161 12.3544 114.994 12.3876 114.83 12.4072L114.294 12.4756C113.973 12.5182 113.732 12.586 113.571 12.6777C113.299 12.8317 113.163 13.0776 113.163 13.415C113.163 13.6705 113.257 13.8721 113.443 14.0195C113.63 14.167 113.852 14.2402 114.107 14.2402C114.419 14.2402 114.72 14.1686 115.012 14.0244C115.503 13.7852 115.749 13.3935 115.749 12.8496V12.1367Z" fill="white"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M74.2578 7.57031V10.1904C74.4511 9.93812 74.6825 9.7463 74.9512 9.61523C75.2199 9.48089 75.5116 9.41406 75.8262 9.41406C76.4815 9.41406 77.0126 9.63968 77.4189 10.0918C77.8285 10.5407 78.0332 11.2048 78.0332 12.083C78.0332 12.9152 77.8317 13.6068 77.4287 14.1572C77.0257 14.7077 76.4663 14.9824 75.752 14.9824C75.3524 14.9823 75.0154 14.8856 74.7402 14.6924C74.5764 14.5777 74.4006 14.3948 74.2139 14.1426V14.8154H73.3984V7.57031H74.2578ZM75.7227 10.2051C75.3198 10.2052 74.9658 10.3543 74.6611 10.6523C74.3597 10.9505 74.209 11.4422 74.209 12.127C74.209 12.6216 74.2711 13.0231 74.3955 13.3311C74.6281 13.911 75.0626 14.2011 75.6982 14.2012C76.1766 14.2012 76.5336 14.011 76.7695 13.6309C77.0087 13.2508 77.1289 12.7495 77.1289 12.127C77.1289 11.5732 77.0087 11.1147 76.7695 10.751C76.5336 10.3873 76.1846 10.2051 75.7227 10.2051Z" fill="white"/>
        <path d="M44.873 9.39941C45.4661 9.39941 45.9481 9.54368 46.3184 9.83203C46.6919 10.1204 46.9168 10.6168 46.9922 11.3213H46.1318C46.0794 10.9969 45.9592 10.7276 45.7725 10.5146C45.5857 10.2987 45.2857 10.1904 44.873 10.1904C44.3097 10.1906 43.9065 10.4663 43.6641 11.0166C43.5069 11.3737 43.4287 11.8148 43.4287 12.3389C43.4288 12.8662 43.5399 13.3106 43.7627 13.6709C43.9855 14.0311 44.3362 14.2109 44.8145 14.2109C45.1814 14.2109 45.4716 14.0998 45.6846 13.877C45.9008 13.6509 46.0499 13.3429 46.1318 12.9531H46.9922C46.8939 13.6508 46.648 14.162 46.2549 14.4863C45.8618 14.8074 45.3587 14.9677 44.7461 14.9678C44.058 14.9678 43.5092 14.7171 43.0996 14.2158C42.69 13.7112 42.4844 13.0818 42.4844 12.3281C42.4845 11.4043 42.7094 10.6853 43.1582 10.1709C43.607 9.65658 44.1786 9.39952 44.873 9.39941Z" fill="white"/>
        <path d="M99.9854 13.0459C99.9854 13.3146 100.028 13.5347 100.113 13.7051C100.271 14.0195 100.564 14.1767 100.993 14.1768C101.609 14.1768 102.029 13.9011 102.252 13.3506C102.373 13.0557 102.434 12.6509 102.434 12.1367V9.55176H103.318V14.8154H102.482L102.492 14.0391C102.378 14.2389 102.235 14.4073 102.064 14.5449C101.727 14.8202 101.318 14.958 100.836 14.958C100.086 14.958 99.5747 14.7074 99.3027 14.2061C99.1553 13.9374 99.0811 13.5787 99.0811 13.1299V9.55176H99.9854V13.0459Z" fill="white"/>
        <path d="M58.9365 8.08203V9.55176H59.7773V10.2744H58.9365V13.71C58.9366 13.8931 58.9989 14.0158 59.123 14.0781C59.1919 14.1142 59.3072 14.1328 59.4678 14.1328H59.6055C59.6546 14.1295 59.7119 14.1247 59.7773 14.1182V14.8154C59.6758 14.8449 59.5693 14.8668 59.458 14.8799C59.3499 14.893 59.2313 14.8994 59.1035 14.8994C58.6911 14.8994 58.4112 14.7944 58.2637 14.585C58.1162 14.372 58.042 14.0963 58.042 13.7588V10.2744H57.3291V9.55176H58.042V8.08203H58.9365Z" fill="white"/>
        <path d="M49.958 9.43848C49.9973 9.44175 50.0651 9.44818 50.1602 9.45801V10.3916C50.1078 10.3818 50.0585 10.3754 50.0127 10.3721C49.9701 10.3688 49.9225 10.3672 49.8701 10.3672C49.4246 10.3672 49.082 10.5116 48.8428 10.7998C48.6036 11.0849 48.4844 11.4145 48.4844 11.7881V14.8154H47.5996V9.55176H48.4395V10.4609C48.5083 10.284 48.6776 10.0697 48.9463 9.81738C49.215 9.5618 49.5244 9.43359 49.875 9.43359C49.8913 9.4336 49.919 9.43523 49.958 9.43848Z" fill="white"/>
        <path d="M51.5244 14.8154H50.625V9.57617H51.5244V14.8154Z" fill="white"/>
        <path d="M94.6846 7.57031V10.2646C94.8943 9.99923 95.0829 9.81223 95.25 9.7041C95.535 9.51741 95.8905 9.42383 96.3164 9.42383C97.0796 9.42388 97.5971 9.69079 97.8691 10.2246C98.0166 10.5162 98.0908 10.9217 98.0908 11.4395V14.8154H97.1816V11.498C97.1816 11.1114 97.1325 10.8277 97.0342 10.6475C96.8737 10.3592 96.572 10.2149 96.1299 10.2148C95.7629 10.2148 95.43 10.3415 95.1318 10.5938C94.8337 10.846 94.6846 11.3225 94.6846 12.0234V14.8154H93.7998V7.57031H94.6846Z" fill="white"/>
        <path d="M109.833 9.43359C110.541 9.43359 111.023 9.68912 111.278 10.2002C111.416 10.4754 111.484 10.8462 111.484 11.3115V14.8154H110.565V11.1592C110.565 10.8086 110.477 10.5676 110.3 10.4365C110.126 10.3055 109.913 10.2393 109.661 10.2393C109.314 10.2393 109.014 10.3562 108.762 10.5889C108.513 10.8215 108.389 11.2101 108.389 11.7539V14.8154H107.489V11.3799C107.489 11.023 107.446 10.7625 107.361 10.5986C107.227 10.353 106.976 10.2296 106.609 10.2295C106.275 10.2295 105.97 10.3593 105.694 10.6182C105.423 10.877 105.287 11.3456 105.287 12.0234V14.8154H104.402V9.55176H105.277V10.2988C105.487 10.0402 105.676 9.85136 105.847 9.7334C106.138 9.53355 106.47 9.43362 106.84 9.43359C107.259 9.43359 107.597 9.53675 107.853 9.74316C107.997 9.86113 108.128 10.0353 108.246 10.2646C108.443 9.98287 108.673 9.77399 108.938 9.63965C109.204 9.50206 109.502 9.43363 109.833 9.43359Z" fill="white"/>
        <path d="M120.348 9.43359C121.094 9.43369 121.599 9.69402 121.861 10.2148C122.006 10.4999 122.077 10.9086 122.077 11.4395V14.8154H121.178V11.498C121.178 11.177 121.13 10.9183 121.035 10.7217C120.878 10.394 120.593 10.2295 120.18 10.2295C119.97 10.2295 119.798 10.2514 119.664 10.2939C119.422 10.366 119.209 10.5103 119.025 10.7266C118.878 10.9001 118.781 11.08 118.735 11.2666C118.693 11.4501 118.671 11.7145 118.671 12.0586V14.8154H117.786V9.55176H118.627V10.2988C118.876 9.99086 119.139 9.76912 119.418 9.63477C119.696 9.50042 120.007 9.43359 120.348 9.43359Z" fill="white"/>
        <path d="M51.5244 8.59766H50.625V7.5957H51.5244V8.59766Z" fill="white"/>
      </svg>
    </div>
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
  const urlParams = new URLSearchParams(window.location.search);
  const urlKey = urlParams.get('openai_key') || urlParams.get('key');
  if (urlKey) {
    localStorage.setItem('openai_api_key', urlKey);
    localStorage.setItem('parlay_ai_provider', 'openai');
    activeAiProvider = 'openai';
    window.history.replaceState({}, document.title, window.location.pathname);
    showToast('OpenAI API Key configured from URL!', 'success');
  }

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
    await new Promise(resolve => setTimeout(resolve, 300));
    currentData = await loadData();
    renderApp();

    const activeKey = activeAiProvider === 'gemini' 
      ? localStorage.getItem('gemini_api_key') 
      : activeAiProvider === 'openai'
        ? localStorage.getItem('openai_api_key')
        : localStorage.getItem('openrouter_api_key');

    if (activeKey) {
      showToast(`Running background AI sync (${activeAiProvider.toUpperCase()})...`, 'info');
      runAiAgentScanBackground('Find current value bets for MLB, WNBA, Soccer, NCAA');
    }
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

// AI Config Modal to enter Gemini, OpenAI, or OpenRouter API Keys
function openAiConfigModal() {
  const existingModal = document.getElementById('ai-config-modal');
  if (existingModal) existingModal.remove();

  const savedGemini = localStorage.getItem('gemini_api_key') || '';
  const savedOpenAI = localStorage.getItem('openai_api_key') || '';
  const savedOpenRouter = localStorage.getItem('openrouter_api_key') || '';

  const modal = document.createElement('div');
  modal.id = 'ai-config-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4';
  
  modal.innerHTML = `
    <div class="card border border-neutral-800 bg-neutral-900 shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in">
      <div class="flex items-center justify-between border-b border-neutral-800 pb-3 border-neutral-800/80">
        <h3 class="font-extrabold text-neutral-100 text-sm">🤖 AI Agent Settings</h3>
        <button id="close-ai-config" class="text-neutral-505 hover:text-neutral-300 text-lg cursor-pointer">×</button>
      </div>

      <div class="space-y-4 text-xs leading-normal">
        <div class="flex flex-col gap-1.5">
          <label for="ai-provider-select" class="font-bold text-neutral-450">Active AI Model Provider</label>
          <select id="ai-provider-select" class="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs">
            <option value="gemini" ${activeAiProvider === 'gemini' ? 'selected' : ''}>Google Gemini 2.5 (Search Grounded)</option>
            <option value="openai" ${activeAiProvider === 'openai' ? 'selected' : ''}>OpenAI GPT-4o (Real-time Scout)</option>
            <option value="openrouter" ${activeAiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter (Free Llama 3 / Mistral)</option>
          </select>
        </div>

        <div class="w-full h-px bg-neutral-800/60 my-2"></div>

        <div class="flex flex-col gap-1.5">
          <label for="gemini-key-input" class="font-bold text-neutral-450 flex items-center justify-between">
            <span>Gemini API Key</span>
            <a href="https://aistudio.google.com/" target="_blank" class="text-[10px] text-primary-400 hover:underline">Get Free Key</a>
          </label>
          <input id="gemini-key-input" type="password" value="${savedGemini}" placeholder="AIzaSy..." 
                 class="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 text-neutral-252 font-bold rounded focus:outline-none focus:border-primary-500 text-xs" />
          <select id="gemini-model-select" class="w-full mt-1.5 px-3 py-2 bg-neutral-950 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs">
            <option value="gemini-2.5-flash" ${activeModelGemini === 'gemini-2.5-flash' ? 'selected' : ''}>Gemini 2.5 Flash (Default)</option>
            <option value="gemini-2.5-pro" ${activeModelGemini === 'gemini-2.5-pro' ? 'selected' : ''}>Gemini 2.5 Pro (Precision)</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="openai-key-input" class="font-bold text-neutral-450 flex items-center justify-between">
            <span>OpenAI API Key</span>
            <a href="https://platform.openai.com/api-keys" target="_blank" class="text-[10px] text-primary-400 hover:underline font-bold">Get OpenAI Key</a>
          </label>
          <input id="openai-key-input" type="password" value="${savedOpenAI}" placeholder="sk-..." 
                 class="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 text-neutral-252 font-bold rounded focus:outline-none focus:border-primary-500 text-xs" />
          <select id="openai-model-select" class="w-full mt-1.5 px-3 py-2 bg-neutral-950 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs">
            <option value="gpt-4o-mini" ${activeModelOpenAI === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini (Ultra-fast)</option>
            <option value="gpt-4o" ${activeModelOpenAI === 'gpt-4o' ? 'selected' : ''}>GPT-4o (Premium Precision)</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="openrouter-key-input" class="font-bold text-neutral-450 flex items-center justify-between">
            <span>OpenRouter API Key (Free Tier)</span>
            <a href="https://openrouter.ai/keys" target="_blank" class="text-[10px] text-primary-400 hover:underline font-bold">Get OpenRouter Key</a>
          </label>
          <input id="openrouter-key-input" type="password" value="${savedOpenRouter}" placeholder="sk-or-..." 
                 class="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 text-neutral-252 font-bold rounded focus:outline-none focus:border-primary-500 text-xs" />
          <select id="openrouter-model-select" class="w-full mt-1.5 px-3 py-2 bg-neutral-950 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs">
            <option value="meta-llama/llama-3.1-8b-instruct:free" ${activeModelOpenRouter === 'meta-llama/llama-3.1-8b-instruct:free' ? 'selected' : ''}>Llama 3.1 8B (Free)</option>
            <option value="google/gemma-2-9b-it:free" ${activeModelOpenRouter === 'google/gemma-2-9b-it:free' ? 'selected' : ''}>Gemma 2 9B (Free)</option>
            <option value="mistralai/mistral-7b-instruct:free" ${activeModelOpenRouter === 'mistralai/mistral-7b-instruct:free' ? 'selected' : ''}>Mistral 7B (Free)</option>
          </select>
        </div>
      </div>

      <div class="flex gap-2 pt-2 border-t border-neutral-800">
        <button id="save-ai-config" class="flex-1 py-2 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-black rounded-lg cursor-pointer transition-all text-xs text-center">
          Save Settings
        </button>
        <button id="clear-ai-config" class="px-3 py-2 bg-neutral-800 hover:bg-neutral-750 text-rose-400 font-bold rounded-lg cursor-pointer transition-all text-xs text-center">
          Clear Keys
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#close-ai-config')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#save-ai-config')?.addEventListener('click', () => {
    const prov = (modal.querySelector('#ai-provider-select') as HTMLSelectElement).value as 'gemini' | 'openai' | 'openrouter';
    const gemKey = (modal.querySelector('#gemini-key-input') as HTMLInputElement).value.trim();
    const oaiKey = (modal.querySelector('#openai-key-input') as HTMLInputElement).value.trim();
    const orKey = (modal.querySelector('#openrouter-key-input') as HTMLInputElement).value.trim();

    const gemModel = (modal.querySelector('#gemini-model-select') as HTMLSelectElement).value;
    const oaiModel = (modal.querySelector('#openai-model-select') as HTMLSelectElement).value;
    const orModel = (modal.querySelector('#openrouter-model-select') as HTMLSelectElement).value;

    activeAiProvider = prov;
    activeModelGemini = gemModel;
    activeModelOpenAI = oaiModel;
    activeModelOpenRouter = orModel;

    if (gemKey) localStorage.setItem('gemini_api_key', gemKey);
    else localStorage.removeItem('gemini_api_key');

    if (oaiKey) localStorage.setItem('openai_api_key', oaiKey);
    else localStorage.removeItem('openai_api_key');

    if (orKey) localStorage.setItem('openrouter_api_key', orKey);
    else localStorage.removeItem('openrouter_api_key');

    savePreferences();
    showToast(`AI settings saved. Active Engine: ${prov.toUpperCase()} (${(prov === 'gemini' ? gemModel : prov === 'openai' ? oaiModel : orModel)})`, 'success');
    modal.remove();
  });
  modal.querySelector('#clear-ai-config')?.addEventListener('click', () => {
    localStorage.removeItem('gemini_api_key');
    localStorage.removeItem('openai_api_key');
    localStorage.removeItem('openrouter_api_key');
    showToast('All stored API keys cleared.', 'info');
    modal.remove();
  });
}

// AI Agent Search Scanner Card
function renderAiAgentSearchBox(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'card border border-primary-500/20 bg-primary-500/5 shadow-2xl p-4 mb-6 flex flex-col md:flex-row gap-3 items-center';
  
  container.innerHTML = `
    <div class="flex-1 select-none">
      <div class="text-[10px] text-primary-400 font-black uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <span>🤖</span> Live AI Agent Scanner (Google Grounded)
      </div>
      <p class="text-[11px] text-neutral-400 leading-normal">
        Type a query to search the live web for today's real sports betting odds and expected value edges.
      </p>
    </div>
    <div class="flex w-full md:w-auto items-center gap-2">
      <input id="ai-search-input" type="text" placeholder="e.g. Find today's MLB moneyline value bets" 
             class="flex-1 md:w-80 px-3 py-2 bg-neutral-950 border border-neutral-850 text-neutral-200 font-bold rounded-lg focus:outline-none focus:border-primary-500 text-xs" />
      <button id="ai-search-btn" class="px-4 py-2 bg-primary-500 hover:bg-primary-400 text-neutral-950 font-black rounded-lg cursor-pointer transition-all active:scale-95 text-xs">
        Scan
      </button>
    </div>
  `;

  // Attach click listener
  setTimeout(() => {
    const input = container.querySelector('#ai-search-input') as HTMLInputElement;
    const btn = container.querySelector('#ai-search-btn');

    const triggerScan = () => {
      const q = input.value.trim();
      if (q) {
        runAiAgentScan(q);
      } else {
        showToast('Please enter a search prompt first.', 'error');
      }
    };

    btn?.addEventListener('click', triggerScan);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        triggerScan();
      }
    });
  }, 0);

  return container;
}

// Render Horizontal Scrolling Stock-Exchange Odds Ticker
function renderOddsTicker(data: BetsData | null): HTMLElement {
  const container = document.createElement('div');
  container.className = 'w-full bg-neutral-950 border-b border-neutral-900 overflow-hidden relative h-9 flex items-center z-40 select-none';
  
  const leftFade = document.createElement('div');
  leftFade.className = 'absolute left-0 top-0 bottom-0 bg-gradient-to-r from-neutral-950 to-transparent w-16 z-10 pointer-events-none';
  const rightFade = document.createElement('div');
  rightFade.className = 'absolute right-0 top-0 bottom-0 bg-gradient-to-l from-neutral-950 to-transparent w-16 z-10 pointer-events-none';
  container.appendChild(leftFade);
  container.appendChild(rightFade);

  const tickerContent = document.createElement('div');
  tickerContent.id = 'odds-ticker-content';
  tickerContent.className = 'flex whitespace-nowrap gap-12 animate-ticker text-[10px] font-black uppercase text-neutral-400 tracking-wider items-center';

  let items: { text: string; betObj?: ValueBet }[] = [];

  if (data && data.topValueBets && data.topValueBets.length > 0) {
    data.topValueBets.forEach(b => {
      const emoji = b.sport.toLowerCase().includes('soccer') || b.sport.toLowerCase().includes('world cup') ? '⚽' : b.sport.toLowerCase().includes('baseball') || b.sport.toLowerCase().includes('mlb') ? '⚾' : '🏀';
      items.push({
        text: `${emoji} ${b.outcome} (${formatOdds(b.bestPrice)} @ ${b.bestBookmakerTitle}) • +${(b.evPercent * 100).toFixed(1)}% EV`,
        betObj: b
      });
    });
  }

  const generalLines = [
    { text: '🏈 NFL • KC Chiefs -3.5 (-110) @ BAL Ravens +3.5 (-110)' },
    { text: '🏈 NFL • SF 49ers ML (-145) @ PHI Eagles ML (+125)' },
    { text: '⚾ MLB • NY Yankees ML (-115) @ BOS Red Sox ML (+105)' },
    { text: '⚾ MLB • LA Dodgers -1.5 (-110) @ SD Padres +1.5 (-110)' },
    { text: '⚽ Champions League • Real Madrid ML (+120) vs Man City ML (+210)' },
    { text: '⚽ Premier League • Arsenal ML (-130) vs Chelsea ML (+340)' },
    { text: '🎓 NCAA • Georgia Bulldogs ML (-190) @ Alabama Crimson Tide ML (+160)' },
    { text: '🎓 NCAA • Ohio State ML (-210) @ Michigan Wolverines ML (+175)' }
  ];

  generalLines.forEach(g => {
    items.push({ text: g.text });
  });

  const doubleItems = [...items, ...items];

  doubleItems.forEach((item) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'flex items-center gap-2 shrink-0';
    
    const indicator = document.createElement('span');
    if (item.betObj) {
      indicator.className = 'w-1.5 h-1.5 rounded-full bg-emerald-450 shadow-[0_0_8px_#00c6a2] animate-pulse';
      itemEl.classList.add('cursor-pointer', 'hover:text-primary-400', 'transition-colors');
      itemEl.addEventListener('click', () => {
        if (item.betObj) {
          openComparisonModal(item.betObj);
        }
      });
    } else {
      indicator.className = 'w-1 h-1 rounded-full bg-neutral-600';
    }

    const textSpan = document.createElement('span');
    textSpan.textContent = item.text;

    itemEl.appendChild(indicator);
    itemEl.appendChild(textSpan);
    tickerContent.appendChild(itemEl);
  });

  container.appendChild(tickerContent);
  return container;
}

// Helper to strip markdown formatting and parse JSON safely
function cleanAndParseJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    if (lines[0].startsWith('```')) {
      lines.shift();
    }
    if (lines[lines.length - 1].startsWith('```')) {
      lines.pop();
    }
    cleaned = lines.join('\n').trim();
  }
  return JSON.parse(cleaned);
}

// Post request to Gemini API with Search Grounding
async function runAiAgentScan(query: string) {
  const provider = activeAiProvider;
  let key = '';
  if (provider === 'gemini') {
    key = localStorage.getItem('gemini_api_key') || '';
  } else if (provider === 'openai') {
    key = localStorage.getItem('openai_api_key') || '';
  } else if (provider === 'openrouter') {
    key = localStorage.getItem('openrouter_api_key') || '';
  }

  if (!key) {
    showToast(`Configure your ${provider.toUpperCase()} API Key first by clicking "🤖 AI Config".`, 'error');
    openAiConfigModal();
    return;
  }

  showLoadingOverlay(`AI Agent (${provider.toUpperCase()}) is scanning...`);

  try {
    const promptText = `
Perform a live Google Search to find current real-world sports betting odds for matches taking place today or tomorrow.
Find real prices across licensed bookmakers (like DraftKings, FanDuel, Bet365, Caesars) and calculate positive Expected Value (+EV) opportunities relative to no-vig fair odds.

CRITICAL INSTRUCTIONS:
1. You MUST find and return between 5 to 8 distinct, high-value +EV bet opportunities.
2. For each bet, the 'reasoning' field MUST contain a detailed, high-quality matchup vetting analysis (3-4 sentences) explaining:
   - The matchup context (e.g., starting pitchers, key team injuries, recent form).
   - The fair no-vig line comparison.
   - Why the selected bookmaker's line is mispriced and represents a strong positive EV edge.
3. For each bet, include the 'confidenceScore' field (0 to 100 integer representing model confidence rating).
4. For each bet, include 'injuries' (string array of key out/doubtful players).
5. For each bet, include 'injuryImpact' (1-sentence summary of the injuries' overall impact).

Return a JSON object conforming EXACTLY to the following TypeScript interface:
interface BetsData {
  generatedAt: string; // ISO date string of now
  nextUpdateAt: string; // ISO date string
  activeCreditsUsed: number;
  creditsRemaining: number;
  lastSportsQueried: string[];
  disclaimer: string;
  topValueBets: {
    id: string; // unique ID
    sport: string; // e.g. "MLB", "World Cup", "Soccer", "WNBA"
    sportKey: string;
    sportTitle: string;
    league: string;
    eventId: string;
    homeTeam: string;
    awayTeam: string;
    commenceTime: string; // ISO string
    outcome: string; // winner selection home/away/draw
    market: string; // "h2h"
    marketLabel: string; // "Moneyline"
    bestPrice: number; // American odds e.g. +150, -110
    bestBookmaker: string;
    bestBookmakerTitle: string;
    consensusImpliedProb: number; // float 0 to 1
    trueOdds: number; // American odds
    evPercent: number; // float e.g. 0.05 for 5% edge
    reasoning: string; // VETTING REASON: detailed pitcher matchup, team news, and EV value
    confidenceScore: number; // 0 to 100 rating
    injuries: string[]; // key player injuries
    injuryImpact: string; // 1-sentence impact analysis
    allOdds: { bookmaker: string; bookmakerTitle: string; price: number }[];
  }[];
  parlays: {
    id: string;
    legs: {
      bet: any; // matches topValueBets structure
      price: number;
    }[];
    combinedAmericanOdds: number;
    combinedDecimalOdds: number;
    impliedProbability: number;
    estimatedEvPercent: number;
    sports: string[];
    reasoning: string;
    tier: "elite" | "strong";
  }[];
  aiAnalysis: {
    summary: string;
    topPickId: string;
    topPickRationale: string;
    parlayAnalysis: string;
    riskRating: string;
    lastUpdated: string;
  };
}

Only return raw JSON. Do not wrap in markdown or code blocks.
Query details: "${query}"
`;

    let rawText = '';
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModelGemini}:generateContent?key=${key}`;
      const body = {
        contents: [
          {
            parts: [
              {
                text: promptText
              }
            ]
          }
        ],
        tools: [
          {
            googleSearch: {}
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        throw new Error(`Gemini API error: ${resp.statusText}`);
      }

      const data = await resp.json();
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } else if (provider === 'openai') {
      const url = 'https://api.openai.com/v1/chat/completions';
      const body = {
        model: activeModelOpenAI,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a sports betting quantitative analyst. You scan real sports matches, search for current odds across major bookmakers (DraftKings, FanDuel, Caesars, Bet365), calculate EV relative to no-vig fair prices, and output a structured JSON feed.'
          },
          {
            role: 'user',
            content: promptText
          }
        ]
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        throw new Error(`OpenAI API error: ${resp.statusText}`);
      }

      const data = await resp.json();
      rawText = data?.choices?.[0]?.message?.content;
    } else if (provider === 'openrouter') {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const body = {
        model: activeModelOpenRouter,
        messages: [
          {
            role: 'system',
            content: 'You are a sports betting quantitative analyst. You scan real sports matches, search for current odds across major bookmakers (DraftKings, FanDuel, Caesars, Bet365), calculate EV relative to no-vig fair prices, and output a structured JSON feed. Return ONLY the raw JSON object.'
          },
          {
            role: 'user',
            content: promptText
          }
        ]
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'https://DylanGrow.github.io/Parlay/',
          'X-Title': 'Parlay EV Engine'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        throw new Error(`OpenRouter API error: ${resp.statusText}`);
      }

      const data = await resp.json();
      rawText = data?.choices?.[0]?.message?.content;
    }

    if (!rawText) {
      throw new Error(`Could not extract response text from the ${provider.toUpperCase()} API response.`);
    }

    const parsed = cleanAndParseJson(rawText) as BetsData;
    if (!parsed.topValueBets || !Array.isArray(parsed.topValueBets)) {
      throw new Error("AI Agent returned invalid data format structure.");
    }

    currentData = parsed;
    showToast('AI Agent successfully scanned Google and loaded live bets!', 'success');
    renderApp();
  } catch (err: any) {
    console.error(err);
    showToast(`AI Scan failed: ${err?.message || err}`, 'error');
  } finally {
    hideLoadingOverlay();
  }
}

// Background silent AI scanner triggered on page load
async function runAiAgentScanBackground(query: string) {
  const provider = activeAiProvider;
  let key = '';
  if (provider === 'gemini') {
    key = localStorage.getItem('gemini_api_key') || '';
  } else if (provider === 'openai') {
    key = localStorage.getItem('openai_api_key') || '';
  } else if (provider === 'openrouter') {
    key = localStorage.getItem('openrouter_api_key') || '';
  }

  if (!key) return;

  try {
    const promptText = `
Perform a live Google Search to find current real-world sports betting odds for matches taking place today or tomorrow.
Find real prices across licensed bookmakers (like DraftKings, FanDuel, Bet365, Caesars) and calculate positive Expected Value (+EV) opportunities relative to no-vig fair odds.

CRITICAL INSTRUCTIONS:
1. You MUST find and return between 5 to 8 distinct, high-value +EV bet opportunities.
2. For each bet, the 'reasoning' field MUST contain a detailed, high-quality matchup vetting analysis (3-4 sentences) explaining:
   - The matchup context (e.g., starting pitchers, key team injuries, recent form).
   - The fair no-vig line comparison.
   - Why the selected bookmaker's line is mispriced and represents a strong positive EV edge.
3. For each bet, include the 'confidenceScore' field (0 to 100 integer representing model confidence rating).
4. For each bet, include 'injuries' (string array of key out/doubtful players).
5. For each bet, include 'injuryImpact' (1-sentence summary of the injuries' overall impact).

Return a JSON object conforming EXACTLY to the following TypeScript interface:
interface BetsData {
  generatedAt: string; // ISO date string of now
  nextUpdateAt: string; // ISO date string
  activeCreditsUsed: number;
  creditsRemaining: number;
  lastSportsQueried: string[];
  disclaimer: string;
  topValueBets: {
    id: string; // unique ID
    sport: string; // e.g. "MLB", "World Cup", "Soccer", "WNBA"
    sportKey: string;
    sportTitle: string;
    league: string;
    eventId: string;
    homeTeam: string;
    awayTeam: string;
    commenceTime: string; // ISO string
    outcome: string; // winner selection home/away/draw
    market: string; // "h2h"
    marketLabel: string; // "Moneyline"
    bestPrice: number; // American odds e.g. +150, -110
    bestBookmaker: string;
    bestBookmakerTitle: string;
    consensusImpliedProb: number; // float 0 to 1
    trueOdds: number; // American odds
    evPercent: number; // float e.g. 0.05 for 5% edge
    reasoning: string; // VETTING REASON: detailed pitcher matchup, team news, and EV value
    confidenceScore: number; // 0 to 100 rating
    injuries: string[]; // key player injuries
    injuryImpact: string; // 1-sentence impact analysis
    allOdds: { bookmaker: string; bookmakerTitle: string; price: number }[];
  }[];
  parlays: {
    id: string;
    legs: {
      bet: any; // matches topValueBets structure
      price: number;
    }[];
    combinedAmericanOdds: number;
    combinedDecimalOdds: number;
    impliedProbability: number;
    estimatedEvPercent: number;
    sports: string[];
    reasoning: string;
    tier: "elite" | "strong";
  }[];
  aiAnalysis: {
    summary: string;
    topPickId: string;
    topPickRationale: string;
    parlayAnalysis: string;
    riskRating: string;
    lastUpdated: string;
  };
}

Only return raw JSON. Do not wrap in markdown or code blocks.
Query details: "${query}"
`;

    let rawText = '';
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModelGemini}:generateContent?key=${key}`;
      const body = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (resp.ok) {
        const data = await resp.json();
        rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      }
    } else if (provider === 'openai') {
      const url = 'https://api.openai.com/v1/chat/completions';
      const body = {
        model: activeModelOpenAI,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a sports betting quantitative analyst. Output a structured JSON feed.' },
          { role: 'user', content: promptText }
        ]
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(body)
      });
      if (resp.ok) {
        const data = await resp.json();
        rawText = data?.choices?.[0]?.message?.content;
      }
    } else if (provider === 'openrouter') {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const body = {
        model: activeModelOpenRouter,
        messages: [
          { role: 'system', content: 'You are a sports betting quantitative analyst. Return ONLY the raw JSON object.' },
          { role: 'user', content: promptText }
        ]
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'https://DylanGrow.github.io/Parlay/',
          'X-Title': 'Parlay EV Engine'
        },
        body: JSON.stringify(body)
      });
      if (resp.ok) {
        const data = await resp.json();
        rawText = data?.choices?.[0]?.message?.content;
      }
    }

    if (rawText) {
      const parsed = cleanAndParseJson(rawText) as BetsData;
      if (parsed.topValueBets && Array.isArray(parsed.topValueBets)) {
        currentData = parsed;
        renderApp();
        showToast('AI background sync complete: Loaded live bets!', 'success');
      }
    }
  } catch (err) {
    console.error('Background AI Scan failed:', err);
  }
}

// Loading Spinner overlay
function showLoadingOverlay(message: string) {
  const existing = document.getElementById('loading-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.className = 'fixed inset-0 z-[11000] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-4 space-y-4';
  overlay.innerHTML = `
    <div class="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div>
    <div class="text-sm font-black text-neutral-100 uppercase tracking-widest">${message}</div>
    <div class="text-xs text-neutral-500 max-w-xs text-center leading-relaxed">This may take up to 20 seconds as the AI agent searches Google for live odds and structures the bet table.</div>
  `;
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  document.getElementById('loading-overlay')?.remove();
}

// Render Bankroll & Default Stake Config Panel
function renderBankrollConfig(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'card border border-neutral-800 bg-neutral-900/30 p-4 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-center animate-fade-in';
  
  container.innerHTML = `
    <div>
      <h3 class="font-extrabold text-neutral-100 text-xs mb-1 flex items-center gap-1">💰 Bankroll & Unit Sizing Config</h3>
      <p class="text-[10px] text-neutral-455 leading-relaxed font-semibold">
        Configure your total bankroll and preferred base unit stake. All calculators and Kelly sizing recommendations will auto-adjust to your levels.
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-4 justify-end">
      <div class="flex flex-col gap-1">
        <label for="config-bankroll-size" class="text-[9px] font-black uppercase text-neutral-500">Total Bankroll</label>
        <input id="config-bankroll-size" type="number" min="10" value="${bankrollSize}" 
               class="w-24 px-2.5 py-1 bg-neutral-950 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs text-right" />
      </div>
      <div class="flex flex-col gap-1">
        <label for="config-default-stake" class="text-[9px] font-black uppercase text-neutral-500">Default Unit Bet</label>
        <input id="config-default-stake" type="number" min="1" value="${defaultStake}" 
               class="w-24 px-2.5 py-1 bg-neutral-950 border border-neutral-850 text-neutral-200 font-bold rounded focus:outline-none focus:border-primary-500 text-xs text-right" />
      </div>
    </div>
  `;

  // Attach change listeners to save inputs
  setTimeout(() => {
    const brInput = container.querySelector('#config-bankroll-size') as HTMLInputElement;
    const stakeInput = container.querySelector('#config-default-stake') as HTMLInputElement;

    brInput?.addEventListener('input', () => {
      const val = parseFloat(brInput.value);
      if (!isNaN(val) && val > 0) {
        bankrollSize = val;
        savePreferences();
      }
    });

    stakeInput?.addEventListener('input', () => {
      const val = parseFloat(stakeInput.value);
      if (!isNaN(val) && val > 0) {
        defaultStake = val;
        // set calculator stakes automatically to align
        betStake = val;
        hedgePrimaryStake = val;
        savePreferences();
      }
    });
  }, 0);

  return container;
}
