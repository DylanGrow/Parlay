import './index.css';
import type { ValueBet, Parlay } from './types';

// Utility to format decimal odds to +X format
const formatOdds = (price: number) => `+${Math.round((price - 1) * 100)}`;

function renderBets(bets: ValueBet[]) {
  const table = document.createElement('table');
  table.className = 'w-full text-sm border-collapse';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr class="bg-gray-800 text-white">
    <th class="p-2 text-left">Sport</th>
    <th class="p-2 text-left">Market</th>
    <th class="p-2 text-left">Selection</th>
    <th class="p-2 text-left">Odds</th>
    <th class="p-2 text-left">EV</th>
    <th class="p-2 text-left">Why</th>
  </tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  bets.forEach((b) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-700';
    tr.innerHTML = `<td class="p-2">${b.sport}</td>
      <td class="p-2">${b.market}</td>
      <td class="p-2">${b.outcome}</td>
      <td class="p-2">${formatOdds(b.bestPrice)}</td>
      <td class="p-2">${(b.evPercent * 100).toFixed(2)}%</td>
      <td class="p-2">${b.reasoning}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function renderParlays(parlays: Parlay[]) {
  const container = document.createElement('div');
  container.className = 'mt-8';
  const title = document.createElement('h2');
  title.className = 'text-xl font-bold mb-4 text-gray-200';
  title.textContent = 'Top Parlays (3‑6 legs)';
  container.appendChild(title);
  parlays.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'mb-4 p-2 bg-gray-800 rounded';
    const legs = p.legs.map(l => `${l.bet.outcome} (${formatOdds(l.price)})`).join(' + ');
    div.innerHTML = `<strong>Parlay ${i + 1}:</strong> ${legs}<br/>
      Combined Odds: ${formatOdds(p.combinedAmericanOdds)}<br/>
      EV: ${(p.estimatedEvPercent * 100).toFixed(2)}%`;
    container.appendChild(div);
  });
  return container;
}

async function init() {
  const resp = await fetch('/bets.json');
  if (!resp.ok) {
    document.body.textContent = 'Failed to load betting data.';
    return;
  }
  const data = await resp.json();
  const { topValueBets, parlays } = data as { topValueBets: ValueBet[]; parlays: Parlay[] };
  const app = document.getElementById('app')!;
  app.innerHTML = '<h1 class="text-3xl font-bold text-center mb-6 text-gray-100">Best Value Bets</h1>';
  app.appendChild(renderBets(topValueBets));
  app.appendChild(renderParlays(parlays));
}

init();

