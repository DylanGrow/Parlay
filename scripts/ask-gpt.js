import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const betsPath = path.join(__dirname, '../public/bets.json');

async function run() {
  console.log('[ask-gpt] Reading bets data...');
  if (!fs.existsSync(betsPath)) {
    console.error(`[ask-gpt] Error: bets.json not found at ${betsPath}`);
    process.exit(1);
  }

  const fileData = fs.readFileSync(betsPath, 'utf8');
  const data = JSON.parse(fileData);

  const valueBets = data.topValueBets || [];
  const parlays = data.parlays || [];

  if (valueBets.length === 0) {
    console.error('[ask-gpt] Error: No value bets found in bets.json.');
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log('[ask-gpt] GEMINI_API_KEY env variable not found. Generating high-quality fallback mock analysis...');
    
    // Sort to find the highest EV bet for fallback pick of the day
    const sortedBets = [...valueBets].sort((a, b) => b.evPercent - a.evPercent);
    const topBet = sortedBets[0];
    
    data.aiAnalysis = {
      summary: `Analyzed ${valueBets.length} value bets and ${parlays.length} parlay cards. Strong market pricing discrepancies detected in ${Array.from(new Set(valueBets.map(b => b.sport))).join(', ')} moneyline underdogs, indicating an edge vs consensus books.`,
      topPickId: topBet.id,
      topPickRationale: `${topBet.outcome} is currently mispriced at ${topBet.bestPrice >= 0 ? '+' : ''}${topBet.bestPrice} on ${topBet.bestBookmakerTitle}. Sharp market consensus sets the fair true odds closer to ${topBet.trueOdds >= 0 ? '+' : ''}${topBet.trueOdds}, resulting in a ${(topBet.evPercent * 100).toFixed(1)}% mathematical expected value edge.`,
      parlayAnalysis: parlays.length > 0
        ? `The featured ${parlays[0].legs.length}-leg parlay combines independent value legs paying ${parlays[0].combinedAmericanOdds >= 0 ? '+' : ''}${parlays[0].combinedAmericanOdds} with a combined estimated EV of ${(parlays[0].estimatedEvPercent * 100).toFixed(1)}%. Recommend small stake sizing.`
        : 'No parlay cards analyzed for today.',
      riskRating: 'High',
      lastUpdated: new Date().toISOString()
    };
  } else {
    console.log('[ask-gpt] Contacting Gemini API for daily analysis...');
    
    const prompt = `You are a professional sports betting quantitative analyst and modeler.
Analyze the following value bets and parlay options. Select the single best value bet as your "Top Pick of the Day" (referencing its ID), write a concise overview of today's betting market opportunities, provide an analysis of the top parlay card, and assess the overall risk profile (Low, Medium, or High).

Value Bets:
${JSON.stringify(valueBets.map(b => ({ id: b.id, sport: b.sport, teams: `${b.awayTeam} @ ${b.homeTeam}`, outcome: b.outcome, odds: b.bestPrice, bookmaker: b.bestBookmakerTitle, trueOdds: b.trueOdds, ev: `${(b.evPercent * 100).toFixed(1)}%`, reasoning: b.reasoning })), null, 2)}

Parlays:
${JSON.stringify(parlays.map(p => ({ id: p.id, legs: p.legs.map(l => `${l.bet.outcome} (${l.price})`), combinedOdds: p.combinedAmericanOdds, ev: `${(p.estimatedEvPercent * 100).toFixed(1)}%` })), null, 2)}

Generate structured JSON representing your analysis. Be highly detailed and mathematical but readable for a sports bettor.`;

    const requestPayload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            summary: {
              type: "STRING",
              description: "A summary of today's betting market conditions, highlighting where the biggest edges are."
            },
            topPickId: {
              type: "STRING",
              description: "The exact ID of the best Value Bet to make. Must match one of the value bet IDs provided."
            },
            topPickRationale: {
              type: "STRING",
              description: "A detailed 2-3 sentence mathematical and situational rationale for why this is the top pick of the day."
            },
            parlayAnalysis: {
              type: "STRING",
              description: "An analysis of the parlay cards, recommending strategy and highlighting their risk/reward structure."
            },
            riskRating: {
              type: "STRING",
              enum: ["Low", "Medium", "High"],
              description: "The overall risk rating of the day's picks."
            }
          },
          required: ["summary", "topPickId", "topPickRationale", "parlayAnalysis", "riskRating"]
        }
      }
    };

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`Gemini API returned status ${response.status}: ${await response.text()}`);
      }

      const resJson = await response.json();
      const textContent = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textContent) {
        throw new Error('Could not parse text candidate from Gemini API response');
      }

      const result = JSON.parse(textContent);
      
      // Validate that topPickId exists in the bets
      const topPickExists = valueBets.some(b => b.id === result.topPickId);
      if (!topPickExists) {
        console.warn(`[ask-gpt] Warning: GPT returned a topPickId (${result.topPickId}) that is not in the value bets. Defaulting to the highest EV bet.`);
        const sortedBets = [...valueBets].sort((a, b) => b.evPercent - a.evPercent);
        result.topPickId = sortedBets[0].id;
      }

      data.aiAnalysis = {
        ...result,
        lastUpdated: new Date().toISOString()
      };
      
      console.log('[ask-gpt] Gemini analysis generated successfully!');
    } catch (err) {
      console.error('[ask-gpt] Error contacting Gemini API:', err);
      console.log('[ask-gpt] Falling back to local mock analysis generation...');
      
      const sortedBets = [...valueBets].sort((a, b) => b.evPercent - a.evPercent);
      const topBet = sortedBets[0];
      
      data.aiAnalysis = {
        summary: `Analyzed ${valueBets.length} value bets. Strong pricing opportunities are present on today's betting slate, particularly on underdogs in the moneyline markets.`,
        topPickId: topBet.id,
        topPickRationale: `${topBet.outcome} (+${topBet.bestPrice}) on ${topBet.bestBookmakerTitle} is the strongest pick, carrying an expected value of ${(topBet.evPercent * 100).toFixed(1)}% against the market consensus.`,
        parlayAnalysis: parlays.length > 0 
          ? `The featured ${parlays[0].legs.length}-leg parlay pays ${parlays[0].combinedAmericanOdds} and holds a compounding edge of ${(parlays[0].estimatedEvPercent * 100).toFixed(1)}%.`
          : 'No parlays analyzed for today.',
        riskRating: 'High',
        lastUpdated: new Date().toISOString()
      };
    }
  }

  fs.writeFileSync(betsPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[ask-gpt] Saved updated data to ${betsPath}`);
}

run();
