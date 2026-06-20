// ============================================================
// BetRadar — +EV Calculation Engine
// Compares multi-book odds to find mispriced lines.
// All calculations are deterministic and pure (no side effects).
// ============================================================

import type { BookmakerOdds, ValueBet } from './types'

/** Convert American odds to decimal odds */
export function americanToDecimal(american: number): number {
  if (american > 0) {
    return american / 100 + 1
  } else {
    return 100 / Math.abs(american) + 1
  }
}

/** Convert decimal odds to American odds */
export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100)
  } else {
    return Math.round(-100 / (decimal - 1))
  }
}

/** Convert decimal odds to implied probability (raw, with vig) */
export function decimalToImpliedProb(decimal: number): number {
  return 1 / decimal
}

/** Convert American odds to implied probability (raw, with vig) */
export function americanToImpliedProb(american: number): number {
  return decimalToImpliedProb(americanToDecimal(american))
}

/**
 * Remove vig from a set of implied probabilities using the Shin method
 * (approximation: proportional scaling)
 */
export function removeVig(impliedProbs: number[]): number[] {
  const total = impliedProbs.reduce((sum, p) => sum + p, 0)
  return impliedProbs.map(p => p / total)
}

/**
 * Calculate the consensus true probability for an outcome.
 * Uses the average no-vig probability across all bookmakers.
 */
export function calcConsensusTrueProb(
  outcomePrices: number[], // American odds from each bookmaker
  totalOutcomes: number,   // number of outcomes in this market (2 for h2h)
  allOutcomePricesByBook: number[][] // [outcome0prices, outcome1prices, ...]
): number {
  // For each bookmaker, remove vig and get true prob for this outcome
  const trueProbs: number[] = []

  const numBooks = outcomePrices.length
  for (let bookIdx = 0; bookIdx < numBooks; bookIdx++) {
    const bookPrices = Array.from({ length: totalOutcomes }, (_, outcomeIdx) => {
      return allOutcomePricesByBook[outcomeIdx]?.[bookIdx] ?? null
    })

    // Skip if this book doesn't have all outcomes
    if (bookPrices.some(p => p === null)) continue

    const impliedProbs = (bookPrices as number[]).map(p => americanToImpliedProb(p))
    const noVigProbs = removeVig(impliedProbs)

    // Find index of this outcome in the book's prices
    const outcomeIdx = allOutcomePricesByBook.findIndex(prices => prices[bookIdx] === outcomePrices[bookIdx])
    if (outcomeIdx >= 0 && noVigProbs[outcomeIdx] !== undefined) {
      trueProbs.push(noVigProbs[outcomeIdx])
    }
  }

  if (trueProbs.length === 0) return 0
  return trueProbs.reduce((sum, p) => sum + p, 0) / trueProbs.length
}

/**
 * Calculate Expected Value percentage.
 * EV% = (trueProb * payout) - (1 - trueProb)
 * where payout = decimalOdds - 1
 */
export function calcEV(trueProb: number, decimalOdds: number): number {
  const payout = decimalOdds - 1
  return trueProb * payout - (1 - trueProb)
}

/** Generate human-readable reasoning for a value bet */
export function generateReasoning(
  outcome: string,
  bestPrice: number,
  trueOdds: number,
  evPercent: number,
  bestBookmaker: string,
  bookCount: number
): string {
  const evPct = (evPercent * 100).toFixed(1)
  const sign = bestPrice > 0 ? '+' : ''
  const trueSign = trueOdds > 0 ? '+' : ''

  return (
    `${outcome} is priced at ${sign}${bestPrice} on ${bestBookmaker}, ` +
    `while the consensus across ${bookCount} books sets the true fair price at ` +
    `${trueSign}${trueOdds}. This represents ${evPct}% positive expected value — ` +
    `the market is mispricing this outcome in your favor.`
  )
}

/**
 * Core analysis function. Given raw odds data for a single event,
 * returns any ValueBet entries that qualify (+300 to +800, positive EV).
 */
export function analyzeEventOdds(
  eventId: string,
  sportKey: string,
  sportTitle: string,
  homeTeam: string,
  awayTeam: string,
  commenceTime: string,
  bookmakers: Array<{
    key: string
    title: string
    markets: Array<{
      key: string
      outcomes: Array<{ name: string; price: number; point?: number }>
    }>
  }>,
  minOdds = 300,
  maxOdds = 800
): ValueBet[] {
  const results: ValueBet[] = []

  // Group by market
  const marketMap = new Map<string, Map<string, BookmakerOdds[]>>()

  for (const book of bookmakers) {
    for (const market of book.markets) {
      if (!marketMap.has(market.key)) {
        marketMap.set(market.key, new Map())
      }
      const outcomeMap = marketMap.get(market.key)!
      for (const outcome of market.outcomes) {
        if (!outcomeMap.has(outcome.name)) {
          outcomeMap.set(outcome.name, [])
        }
        outcomeMap.get(outcome.name)!.push({
          bookmaker: book.key,
          bookmakerTitle: book.title,
          price: outcome.price,
        })
      }
    }
  }

  const marketLabels: Record<string, string> = {
    h2h: 'Moneyline',
    spreads: 'Spread',
    totals: 'Over/Under',
    outrights: 'Futures',
  }

  for (const [marketKey, outcomeMap] of marketMap) {
    const outcomeNames = Array.from(outcomeMap.keys())
    const allOutcomePricesByOutcome = outcomeNames.map(name =>
      outcomeMap.get(name)!.map(o => o.price)
    )

    for (let i = 0; i < outcomeNames.length; i++) {
      const outcomeName = outcomeNames[i]
      const oddsForOutcome = outcomeMap.get(outcomeName)!

      // Filter to +300 to +800 range only
      const validOdds = oddsForOutcome.filter(
        o => o.price >= minOdds && o.price <= maxOdds
      )
      if (validOdds.length === 0) continue

      // Best (highest) price available
      const bestOdds = validOdds.reduce((best, o) =>
        o.price > best.price ? o : best
      )

      // Need at least 3 books for reliable consensus
      if (oddsForOutcome.length < 3) continue

      // Calculate consensus true probability
      const pricesForThisOutcome = oddsForOutcome.map(o => o.price)
      const trueProb = calcConsensusTrueProb(
        pricesForThisOutcome,
        outcomeNames.length,
        allOutcomePricesByOutcome
      )

      if (trueProb <= 0) continue

      const bestDecimal = americanToDecimal(bestOdds.price)
      const evRaw = calcEV(trueProb, bestDecimal)

      // Only positive EV bets
      if (evRaw <= 0) continue

      const trueOdds = decimalToAmerican(1 / trueProb)

      results.push({
        id: `${eventId}-${marketKey}-${outcomeName.replace(/\s+/g, '-')}`,
        sport: sportTitle,
        sportKey,
        sportTitle,
        league: sportTitle,
        eventId,
        homeTeam,
        awayTeam,
        commenceTime,
        outcome: outcomeName,
        market: marketKey,
        marketLabel: marketLabels[marketKey] ?? marketKey,
        bestPrice: bestOdds.price,
        bestBookmaker: bestOdds.bookmaker,
        bestBookmakerTitle: bestOdds.bookmakerTitle,
        consensusImpliedProb: trueProb,
        trueOdds,
        evPercent: evRaw,
        allOdds: oddsForOutcome,
        reasoning: generateReasoning(
          outcomeName,
          bestOdds.price,
          trueOdds,
          evRaw,
          bestOdds.bookmakerTitle,
          oddsForOutcome.length
        ),
      })
    }
  }

  // Sort by EV descending
  return results.sort((a, b) => b.evPercent - a.evPercent)
}
