// Famous investors' stock-selection approaches, with a focus on the National Stock Exchange (NSE).
// These are short summaries of approaches the investors are publicly known for, not quotes and not
// a complete account of their methods. Verify against interviews, letters and books before relying on them.
// `checks` names the fields from this app's data that help test the approach. Null means no data here.

export const TRADER_METHODS = [
  {
    id: 'jhunjhunwala',
    name: 'Rakesh Jhunjhunwala',
    market: 'India (NSE and BSE)',
    horizon: 'Long term, years',
    idea: 'Bet on India\'s long-term growth by owning quality businesses with strong management, and hold through volatility.',
    rules: [
      'Look for consistent profit growth over several years, not a single good quarter',
      'Prefer high return on equity and businesses that reinvest well',
      'Favour management with a track record of integrity and capital discipline',
      'Buy into sectors tied to India\'s growth (banking, consumer, healthcare, infrastructure) when valuation is reasonable',
      'Hold for years and accept deep drawdowns in a good business rather than selling on fear',
    ],
    checks: ['roe', 'epsQuarterlyGrowth', 'pe', 'profitMargin'],
    verify: 'Check his interviews and the books written about him for the exact rules.',
  },
  {
    id: 'kedia',
    name: 'Vijay Kedia',
    market: 'India (NSE and BSE)',
    horizon: 'Long term, multi-year',
    idea: 'Find small and mid-sized companies with a strong business idea and a long runway for growth, then stay invested while the story plays out.',
    rules: [
      'Start from the business idea: a product or service with a big addressable market',
      'Prefer small and mid-cap companies early in their growth, before they are widely followed',
      'Check that revenue and earnings growth are real and the balance sheet is sound',
      'Build a position gradually and keep it while the business keeps meeting its growth targets',
      'Ignore short-term price noise when the growth story is intact',
    ],
    checks: ['revenueQuarterlyGrowth', 'epsQuarterlyGrowth', 'pe', 'beta'],
    verify: 'His framework is often summarised as "SMILE" (small and mid-size companies with a strong idea). Check the exact wording in his own interviews.',
  },
  {
    id: 'damani',
    name: 'Radhakishan Damani',
    market: 'India (NSE and BSE)',
    horizon: 'Long term, buy and hold',
    idea: 'Buy good businesses at reasonable prices, keep leverage low, and wait patiently for the market to recognise the value.',
    rules: [
      'Prefer simple, understandable businesses with steady demand, such as retail and consumer goods',
      'Avoid companies carrying heavy debt; check cash generation before buying',
      'Buy when prices are weak and the business is still sound',
      'Hold for years and let compounding work; avoid frequent trading',
      'Keep position sizes disciplined and do not chase hot stocks',
    ],
    checks: ['pe', 'priceToBook', 'profitMargin', 'roe'],
    verify: 'Check interviews and public talks for his exact criteria. Debt and cash flow need to be read from filings, which this app does not fetch.',
  },
  {
    id: 'kacholia',
    name: 'Ashish Kacholia',
    market: 'India (small caps on NSE and BSE)',
    horizon: 'Medium to long term',
    idea: 'Look for small companies with high growth and good management before institutions discover them.',
    rules: [
      'Scan under-researched small caps for strong earnings growth',
      'Check the promoters\' and management\'s track record and governance',
      'Prefer companies with a clear, growing niche',
      'Expect volatility and size positions so one miss does not hurt the portfolio',
    ],
    checks: ['epsQuarterlyGrowth', 'revenueQuarterlyGrowth', 'roe'],
    verify: 'Small caps are less liquid and more volatile. Check the exchange\'s liquidity and surveillance flags before trading.',
  },
];

// NSE-specific checks. Most need data from NSE, BSE or company filings, which this app does not fetch yet.
export const NSE_CHECKLIST = [
  'Promoter holding and its trend over the last 4 to 8 quarters. Rising promoter stake is usually a good sign.',
  'Promoter pledge percentage. A high or rising pledge can force selling in a fall.',
  'FII and DII holding changes in the shareholding pattern each quarter.',
  'Delivery percentage on NSE: a high delivery share means buyers are holding, not just trading intraday.',
  'Bulk and block deals, and who is buying or selling.',
  'Exchange surveillance (ASM and GSM) and price bands. These flag stocks under extra scrutiny or with circuit limits.',
  'Results date and the quarter\'s numbers versus expectations. Read the filing, not only the headline.',
  'Sector index strength: is the company\'s Nifty sector index leading or lagging the Nifty 50?',
  'India VIX: a high VIX means fear, and breakout rules fail more often.',
  'Liquidity: average daily traded value. Avoid positions too large for the stock to absorb when you exit.',
];
