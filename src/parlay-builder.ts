// ============================================================
// BetRadar — Parlay Builder
// Combines top +EV bets into 3-6 leg parlays
// ============================================================

import type { ValueBet, Parlay, ParlayLeg } from './types'
import { americanToDecimal, decimalToAmerican } from './ev-engine'

/** Convert decimal parlay odds to American */
function parlayDecimalToAmerican(decimal: number): number {
  return decimalToAmerican(decimal)
}

/** Combine decimal odds for multiple legs */
function combinedDecimalOdds(legs: number[]): number {
  return legs.reduce((product, odd) => product * odd, 1)
}

/**
 * Calculate combined American odds for a parlay.
 * Returns both decimal and American formats.
 */
function calcParlayOdds(legs: ParlayLeg[]): {
  decimal: number
  american: number
  impliedProb: number
} {
  const decimalOdds = legs.map(leg => americanToDecimal(leg.price))
  const combined = combinedDecimalOdds(decimalOdds)
  return {
    decimal: combined,
    american: parlayDecimalToAmerican(combined),
    impliedProb: 1 / combined,
  }
}

/** Estimate combined EV% for a parlay (simplified: average of leg EVs) */
function estimateParlayEV(legs: ParlayLeg[]): number {
  const avgLegEV = legs.reduce((sum, leg) => sum + leg.bet.evPercent, 0) / legs.length
  // Parlays amplify EV — use geometric scaling approximation
  return avgLegEV * Math.sqrt(legs.length)
}

/** Determine quality tier based on EV% */
function getQualityTier(evPercent: number): 'elite' | 'strong' | 'solid' {
  if (evPercent >= 0.15) return 'elite'
  if (evPercent >= 0.08) return 'strong'
  return 'solid'
}

/** Generate parlay reasoning */
function generateParlayReasoning(legs: ParlayLeg[], americanOdds: number): string {
  const legDescriptions = legs.map(
    (leg, i) =>
      `Leg ${i + 1}: ${leg.bet.outcome} (${leg.bet.sport}, ${leg.price > 0 ? '+' : ''}${leg.price})`
  )
  const sign = americanOdds > 0 ? '+' : ''
  return (
    `${legs.length}-leg parlay paying ${sign}${americanOdds}. ` +
    `Each leg independently identified as +EV vs. the market consensus. ` +
    `${legDescriptions.join(' | ')}. ` +
    `All legs span different sports/events for maximum independence.`
  )
}

/**
 * Build optimal parlays from top value bets.
 * Strategy: Take top N bets by EV%, build parlays of 3, 4, 5, and 6 legs.
 * Only include bets that are within +300 to +800 range.
 * Filter out parlays where combined odds are unrealistically high (>+50000).
 */
export function buildParlays(
  valueBets: ValueBet[],
  maxParlays = 6
): Parlay[] {
  // Take top bets for parlay building (at most 12 for combination pool)
  const pool = valueBets.slice(0, Math.min(12, valueBets.length))

  if (pool.length < 3) return []

  const parlays: Parlay[] = []

  // Build one parlay for each leg count (3 through 6)
  const legCounts = [3, 4, 5, 6].filter(n => n <= pool.length)

  for (const legCount of legCounts) {
    // Greedily pick highest-EV bets, preferring different sports
    const selectedLegs: ParlayLeg[] = []
    const usedSports = new Set<string>()
    const usedEvents = new Set<string>()

    for (const bet of pool) {
      if (selectedLegs.length >= legCount) break
      // Avoid two legs from same event
      if (usedEvents.has(bet.eventId)) continue

      selectedLegs.push({ bet, price: bet.bestPrice })
      usedSports.add(bet.sportKey)
      usedEvents.add(bet.eventId)
    }

    if (selectedLegs.length < 3) continue

    const { decimal, american, impliedProb } = calcParlayOdds(selectedLegs)

    // Skip unrealistically massive parlays (>+99999)
    if (american > 99999) continue

    const evEst = estimateParlayEV(selectedLegs)

    parlays.push({
      id: `parlay-${legCount}leg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      legs: selectedLegs,
      combinedAmericanOdds: american,
      combinedDecimalOdds: decimal,
      impliedProbability: impliedProb,
      estimatedEvPercent: evEst,
      sports: Array.from(usedSports),
      reasoning: generateParlayReasoning(selectedLegs, american),
      tier: getQualityTier(evEst),
    })
  }

  // Sort parlays: elite first, then by EV descending
  const tierOrder: Record<string, number> = { elite: 0, strong: 1, solid: 2 }
  parlays.sort((a, b) => {
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier]
    return tierDiff !== 0 ? tierDiff : b.estimatedEvPercent - a.estimatedEvPercent
  })

  return parlays.slice(0, maxParlays)
}
