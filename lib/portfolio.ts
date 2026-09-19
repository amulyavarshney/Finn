/**
 * The demo portfolio: 18 NSE names chosen for spread rather than conviction.
 *
 * The brief asks for 15-20 with a mix that "makes for an interesting demo", so
 * this deliberately spans mega-cap to small-cap and eight sectors, and includes
 * a few names whose volume is spiky enough that the configurable triggers
 * actually fire during a walkthrough.
 *
 * Nothing in the engine is hard-wired to this list -- it is data, and the Tune
 * screen can add or remove any NSE symbol at runtime.
 */

export interface Holding {
  symbol: string;
  name: string;
  sector: string;
  size: "mega" | "large" | "mid" | "small";
}

export const PORTFOLIO: Holding[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy / Retail / Telecom", size: "mega" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking", size: "mega" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT Services", size: "mega" },
  { symbol: "INFY", name: "Infosys", sector: "IT Services", size: "mega" },
  { symbol: "ITC", name: "ITC", sector: "FMCG / Cigarettes", size: "mega" },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer Discretionary", size: "large" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Engineering / Construction", size: "large" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharmaceuticals", size: "large" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", sector: "Automobiles", size: "large" },
  { symbol: "BEL", name: "Bharat Electronics", sector: "Defence (PSU)", size: "large" },
  { symbol: "POLYCAB", name: "Polycab India", sector: "Electricals / Cables", size: "mid" },
  { symbol: "CUMMINSIND", name: "Cummins India", sector: "Industrial Machinery", size: "mid" },
  { symbol: "LAURUSLABS", name: "Laurus Labs", sector: "Pharma / CDMO", size: "mid" },
  { symbol: "DIXON", name: "Dixon Technologies", sector: "Electronics Manufacturing", size: "mid" },
  { symbol: "PERSISTENT", name: "Persistent Systems", sector: "IT Services", size: "mid" },
  { symbol: "KEI", name: "KEI Industries", sector: "Electricals / Cables", size: "mid" },
  { symbol: "CAMS", name: "Computer Age Management Services", sector: "Financial Infrastructure", size: "small" },
  // Listed as ZOMATO until the 2025 rename; NSE only answers to ETERNAL now.
  { symbol: "ETERNAL", name: "Eternal (formerly Zomato)", sector: "Internet / Food Delivery", size: "large" },
];

/**
 * Out-of-portfolio names for the ad-hoc research demo, to show the pull side is
 * not wired to the holdings above.
 */
export const ADHOC: Holding[] = [
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Paints", size: "large" },
  { symbol: "DMART", name: "Avenue Supermarts (DMart)", sector: "Retail", size: "large" },
  { symbol: "IRCTC", name: "IRCTC", sector: "Travel / Ticketing (PSU)", size: "mid" },
  { symbol: "JUBLFOOD", name: "Jubilant FoodWorks", sector: "QSR", size: "mid" },
];

export const PORTFOLIO_SYMBOLS = PORTFOLIO.map((h) => h.symbol);
export const ADHOC_SYMBOLS = ADHOC.map((h) => h.symbol);
export const ALL_SYMBOLS = [...PORTFOLIO_SYMBOLS, ...ADHOC_SYMBOLS];

export function holdingFor(symbol: string): Holding | undefined {
  return [...PORTFOLIO, ...ADHOC].find((h) => h.symbol === symbol.toUpperCase());
}
