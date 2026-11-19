// Educational guide: famous approaches, how each rule works, and the selection checklist.
// Rules are simplified versions. Read the original books before relying on any of them.

export const DISCLAIMER =
  'Educational research tool. Not financial advice. Past performance does not predict future results. ' +
  'Verify data yourself and consult a SEBI-registered (India) or otherwise licensed adviser before investing.';

export const STRATEGY_GUIDE = [
  {
    id: 'minervini_trend_template',
    name: 'Minervini Trend Template (SEPA)',
    who: 'Mark Minervini, US Investing Championship winner',
    horizon: 'Medium term, weeks to months',
    idea: 'Buy only strong stocks in a confirmed Stage 2 uptrend. Trend first, then fundamentals and a precise entry point.',
    rules: ['Price above 150 and 200-day averages', '150-day above 200-day', '200-day rising about a month', '50-day above 150 and 200', 'Price above 50-day', '30%+ above 52-week low', 'Within 25% of 52-week high', 'Outperforming the benchmark'],
  },
  {
    id: 'weinstein_stage2',
    name: 'Weinstein Stage Analysis',
    who: 'Stan Weinstein, "Secrets for Profiting in Bull and Bear Markets"',
    horizon: 'Long term, months to years',
    idea: 'Every stock cycles through four stages. Buy in Stage 2 (advancing), avoid Stage 4 (declining). Use the 30-week average as the guide.',
    rules: ['Price above the 30-week (about 150-day) average', 'That average is rising'],
  },
  {
    id: 'darvas_livermore_breakout',
    name: 'Darvas Box and Livermore Pivotal Points',
    who: 'Nicolas Darvas (box theory), Jesse Livermore (pivotal points)',
    horizon: 'Short to medium term',
    idea: 'Price consolidates in a range (a "box"). Buy when it breaks above the top on heavy volume. Cut losses fast if it fails.',
    rules: ['Close above the prior 20-day high', 'Volume at least 1.5x its 20-day average'],
  },
  {
    id: 'turtle_entry',
    name: 'Turtle Trading',
    who: 'Richard Dennis and William Eckhardt ("Turtles" experiment)',
    horizon: 'Trend following, weeks to months',
    idea: 'Mechanical rules with no opinions. Enter on breakouts to 20-day highs, exit on 10-day lows, and size positions by volatility (ATR).',
    rules: ['Enter: close above the 20-day high', 'Exit: close below the 10-day low', 'Position size from ATR, so each trade risks a fixed share of capital'],
  },
  {
    id: 'oneil_canslim_style',
    name: "O'Neil CAN SLIM (style)",
    who: 'William J. O\'Neil, founder of Investor\'s Business Daily',
    horizon: 'Medium term, growth stocks',
    idea: 'Combine strong current earnings growth with leadership: stocks near highs, outperforming the market, backed by strong institutions and a healthy market.',
    rules: ['Quarterly EPS growth at least 25%', 'Within 15% of the 52-week high', 'Outperforming the benchmark'],
  },
  {
    id: 'buffett_quality',
    name: 'Buffett-style Quality',
    who: 'Warren Buffett; screens popularized by Robert Hagstrom',
    horizon: 'Long term, years to decades',
    idea: 'Buy high-quality businesses with durable advantages, high returns on capital and sensible prices. Hold for the long run.',
    rules: ['ROE at least 15%', 'Profit margin at least 10%', 'P/E between 0 and 25'],
  },
  {
    id: 'graham_value',
    name: 'Graham-style Value',
    who: 'Benjamin Graham, "The Intelligent Investor"',
    horizon: 'Long term',
    idea: 'Buy with a margin of safety. Pay a low price relative to earnings and assets.',
    rules: ['P/E at most 15', 'Price-to-book at most 1.5'],
  },
  {
    id: 'lynch_garp',
    name: 'Lynch GARP (Growth at a Reasonable Price)',
    who: 'Peter Lynch, Fidelity Magellan Fund',
    horizon: 'Long term',
    idea: 'Look for companies whose growth is not yet priced in. PEG below 1 means the P/E is lower than the earnings growth rate.',
    rules: ['PEG ratio between 0 and 1'],
  },
  {
    id: 'golden_cross_trend',
    name: 'Moving-average trend (50 over 200)',
    who: 'Classic trend-following convention',
    horizon: 'Medium to long term',
    idea: 'When the 50-day average is above the 200-day and rising, the medium-term trend is up.',
    rules: ['50-day above 200-day and rising'],
  },
  {
    id: 'rsi_pullback',
    name: 'Pullback in an uptrend (RSI)',
    who: 'Common swing-trading practice',
    horizon: 'Short term, days to weeks',
    idea: 'Buy temporary dips in a strong stock, not a falling one. RSI below 35 with price still above the 200-day.',
    rules: ['RSI(14) below 35', 'Price above the 200-day average'],
  },
];

export const SELECTION_CHECKLIST = {
  global: [
    'Read the global dashboard first: US, Asian and European indices, dollar, oil, gold, 10-year yield and the VIX (fear gauge).',
    'A rising dollar and rising yields usually pressure emerging markets such as India. Falling oil helps oil importers.',
    'A rising VIX (above about 25) signals stress, when breakout strategies fail more often.',
    'Check which sectors lead over 3 months. Leadership usually rotates slowly, and buying into a fading sector is a common mistake.',
  ],
  longTermFundamentals: [
    'Consistent ROE and ROIC above the cost of capital over 5 or more years, compared with industry peers.',
    'Revenue and earnings growing, with free cash flow that matches reported profit (earnings that do not turn into cash are a warning sign).',
    'Debt that the business can carry. Compare debt with cash flow and interest cover, not only the debt-to-equity ratio, and judge by industry.',
    'A competitive advantage (moat): pricing power, high margins that hold up, switching costs, brands, network effects or cost leadership.',
    'Valuation: P/E, PEG and price-to-book compared with the company\'s own history and peers. Expensive quality can still be a poor buy.',
    'Management: capital allocation track record, insider ownership, and honest reporting.',
  ],
  shortTermTechnicals: [
    'Trend first: price above the 50 and 200-day averages, with those averages rising.',
    'Relative strength: a stock outperforming its benchmark over 3 to 12 months.',
    'Entry: a breakout on above-average volume, or a pullback in an uptrend. Avoid buying into weakness.',
    'Risk: set the stop before entering, commonly 2x ATR below the entry, and never risk more than 1% to 2% of capital on one trade.',
    'Exit: take profit or tighten the stop when the trend breaks (for example a close below the 10-day low or the 50-day average).',
  ],
  localDemand: [
    'Local demand: check the company\'s domestic customers, government policy, rural or urban spending, and the local industry cycle.',
    'Global demand: check export share, currency exposure, commodity input prices and competitors abroad.',
    'News and sentiment: company announcements, results, regulatory filings and analyst revisions. Verify before acting on news.',
  ],
  riskRules: [
    'Position size, not prediction, controls most of the risk. A 1% risk per trade means 100 losing trades in a row are needed to lose everything.',
    'Diversify across sectors and do not hold more than about 20% of capital in one stock.',
    'Keep a trading journal: entry reason, stop, outcome. Review it monthly.',
    'Use paper trading or a backtest before risking real money on any rule.',
  ],
};
