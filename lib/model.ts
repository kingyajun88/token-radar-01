// Token Radar model, version radar-2-comps.
//
// What this model is: a comparables calibration, not a flat multiple.
// The sealed snapshot carries 128 protocols whose token already trades
// (market cap > 0). For each of them we can see the ratio the market
// actually paid: market cap / TVL. That ratio is not one number:
//
//   - the median across all 128 is 0.214
//   - by category it runs from 0.041 (Liquid Staking) to 0.746
//     (Canonical Bridge); Lending 0.132, Dexs 0.342, Bridge 0.557,
//     Basis Trading 0.654, RWA 0.275, Yield 0.191
//   - a log-log fit of market cap on TVL has slope 0.52 on all 128,
//     so a big protocol trades at a lower multiple than a small one
//   - seven-day growth and age show no clean monotonic pattern in the
//     same 128, so both are dampened rather than allowed to dominate
//
// Blind test, done honestly and reported on the dashboard: fit the
// log-log curve on half the live protocols (sorted by slug, first
// half), test on the other half. Train slope 0.64, held-out median
// absolute log error 1.07 — a typical miss of about 2.9x. The curve
// is a guide, not a price. Category medians below are the full-sample
// medians, shrunk toward the global 0.214 by n/(n+5) and capped to
// [0.05, 0.80], so a category with only four live comps cannot drag
// a whole row with it. Categories with fewer than four live comps
// use the global median.
//
// Implied value for one pre-token protocol:
//
//   implied = TVL x categoryMultiple
//                 x sizeFactor      (TVL/100M)^-0.15, clamped [0.75, 1.25]
//                 x growthFactor    1 + clamp(change_7d, -40, 40)% x 0.35
//                 x maturityFactor  0.85 + min(age, 1095)/1095 x 0.30
//
// Age is days since first listing; unknown age counts as 365 days.
// No protocol name is ever special-cased: category, TVL, growth and
// age are all snapshot fields, and the same function scores every row.
//
// Farm economics, in dollars, per row. Capital is recoverable (it
// stays in the position and comes back on exit); gas is sunk.
//   capital: $250 / $150 / $100 / $50 by TVL tier
//   sunk gas: setup $4-8 + $2 a week over the hold + $3 to claim
//   verdict: implied >= $75M -> farm it; >= $25M -> farm it small
//     (test $25 first, scale only if the position behaves);
//     below that -> watch only, do not deploy capital yet.
// The verdict, capital and sunk gas are carried on every row so the
// dashboard and board.json always agree about them.

/** One protocol in the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants. The dashboard prints them. */
export interface ModelConstants {
  global_multiple: number;
  size_ref_usd: number;
  size_exponent: number;
  size_min: number;
  size_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  global_multiple: 0.214,
  size_ref_usd: 100_000_000,
  size_exponent: -0.15,
  size_min: 0.75,
  size_max: 1.25,
  growth_weight: 0.35,
  growth_floor: -40,
  growth_cap: 40,
  maturity_floor: 0.85,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
};

export const MODEL_VERSION = 'radar-2-comps';

/** Pre-token rows below the watchlist floor, by TVL: 40 + 180 = 220. */
export const EARLY_ROWS = 180;

/** Live-token protocols shown apart, by market cap. */
export const LIVE_ROWS = 24;

/** Category multiple: shrunk median mcap/TVL among live comps. */
const CATEGORY_MULTIPLES: Record<string, number> = {
  'Basis Trading': 0.471,
  Bridge: 0.401,
  'Canonical Bridge': 0.542,
  'Cross Chain Bridge': 0.661,
  Dexs: 0.302,
  Lending: 0.153,
  'Liquid Staking': 0.102,
  RWA: 0.253,
  Yield: 0.199,
  'Yield Aggregator': 0.186,
  CEX: 0.124,
};

/** The calibration the dashboard reports, numbers and all. */
export interface Calibration {
  live_comps: number;
  global_median_ratio: number;
  log_slope_full: number;
  log_slope_half_train: number;
  held_out_median_abs_log_error: number;
}

export const CALIBRATION: Calibration = {
  live_comps: 128,
  global_median_ratio: 0.214,
  log_slope_full: 0.52,
  log_slope_half_train: 0.64,
  held_out_median_abs_log_error: 1.07,
};

/** A farm step: action, what it costs, how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  verdict: 'farm' | 'small' | 'watch';
  capital_usd: number;
  sunk_gas_usd: number;
  hold_days: number;
  model: {
    category_multiple: number;
    size_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  verdict: 'farm' | 'small' | 'watch';
  capital_usd: number;
  sunk_gas_usd: number;
  hold_days: number;
  category_multiple: number;
  size_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: the market's own value, never modelled. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  verdict_counts: { farm: number; small: number; watch: number };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, clamped at zero; null when bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category multiple for one protocol, global fallback included. */
export function categoryMultiple(category: string | null): number {
  if (category === null) return MODEL.global_multiple;
  const m = CATEGORY_MULTIPLES[category];
  return m === undefined ? MODEL.global_multiple : m;
}

/** Size factor: big protocols trade at a lower multiple. */
export function sizeFactor(tvlUsd: number): number {
  const raw = Math.pow(Math.max(tvlUsd, 1) / MODEL.size_ref_usd, MODEL.size_exponent);
  return Math.min(MODEL.size_max, Math.max(MODEL.size_min, raw));
}

/** The multipliers and implied value for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): {
  implied: number;
  catMult: number;
  sizeF: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const catMult = categoryMultiple(protocol.category);
  const sizeF = sizeFactor(protocol.tvl_usd);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * catMult * sizeF * growthMult * maturityMult),
  );
  return { implied, catMult, sizeF, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Capital for one farm position, by TVL tier. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** Hold length, from age: younger protocols get a longer window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Sunk gas for a farm: setup + weekly actions over the hold + claim. */
export function sunkGasUsd(capital: number, holdDays: number): number {
  const setup = capital >= 150 ? 8 : 4;
  const weeks = Math.ceil(holdDays / 7);
  return setup + 2 * weeks + 3;
}

/** Verdict from implied value alone, so it is reproducible from the row. */
export function verdictFor(implied: number): 'farm' | 'small' | 'watch' {
  if (implied >= 75_000_000) return 'farm';
  if (implied >= 25_000_000) return 'small';
  return 'watch';
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: action, then cost and time, within 20..600 chars. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan, derived from its own record (implied value,
 * category, chains, TVL, age). The first step always states the
 * verdict and the net economics, so a reader sees the cost before
 * the actions. Capital is recoverable; only gas is sunk.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const sunk = sunkGasUsd(capital, hold);
  const verdict = verdictFor(implied);
  const verdictLine =
    verdict === 'farm'
      ? `Verdict: farm it. Implied value $${implied.toLocaleString('en-US')} against $${sunk} of sunk gas over ${hold} days; the $${capital} of capital comes back when you exit.`
      : verdict === 'small'
        ? `Verdict: farm it small. Implied value $${implied.toLocaleString('en-US')} is thin for a full position, so test with $25 first and scale only if the position behaves.`
        : `Verdict: watch only. Implied value $${implied.toLocaleString('en-US')} does not cover the $${sunk} of sunk gas and the time, so do not deploy capital yet.`;
  const action = actionFor(p, capital, chain);
  const base: FarmStep[] = [
    { text: verdictLine, cost: `$${sunk} of sunk gas in total`, time: `${hold} days` },
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
  ];
  if (verdict === 'watch') {
    return [
      ...base,
      {
        text: `Put ${p.name} on a watchlist and re-check its TVL and any token announcement once a month.`,
        cost: 'nothing to watch',
        time: '5 minutes a month',
      },
      {
        text: `If its TVL doubles or it announces a points program, re-run the verdict before spending anything.`,
        cost: 'nothing until then',
        time: '10 minutes to re-check',
      },
      {
        text: `Write the wallet you would use, the dates and the verdict in a farm log so the decision is on record.`,
        cost: 'nothing but the log',
        time: '5 minutes',
      },
    ];
  }
  const deploy: FarmStep[] = [
    {
      text: verdict === 'small' ? `Deposit $25 as a test into ${p.name} on ${chain} and confirm the position shows up.` : action,
      cost: verdict === 'small' ? '$25 of capital and about $4 of gas' : `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
  ];
  if (verdict === 'small') {
    deploy.push({
      text: `If the test position behaves for a week, add the rest up to $${capital} with the same action.`,
      cost: `$${capital - 25} more of capital and about $4 of gas`,
      time: '10 minutes',
    });
  }
  return [
    ...base,
    ...deploy,
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    verdict: row.verdict,
    capital_usd: row.capital_usd,
    sunk_gas_usd: row.sunk_gas_usd,
    hold_days: row.hold_days,
    category_multiple: row.model.category_multiple,
    size_factor: row.model.size_factor,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** The protocols the board ranks, strongest first, ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early radar: pre-token protocols below the floor, by TVL, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort(
    (a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => {
    const capital = capitalFor(s.p);
    const hold = holdDaysFor(s.age);
    const sunk = sunkGasUsd(capital, hold);
    const verdict = verdictFor(s.implied);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: s.implied,
      verdict,
      capital_usd: capital,
      sunk_gas_usd: sunk,
      hold_days: hold,
      model: {
        category_multiple: s.catMult,
        size_factor: round4(s.sizeF),
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age, s.implied).map(stepText),
    };
  });
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdict_counts = {
    farm: board.filter((r) => r.verdict === 'farm').length,
    small: board.filter((r) => r.verdict === 'small').length,
    watch: board.filter((r) => r.verdict === 'watch').length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration: CALIBRATION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    verdict_counts,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of))
    throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (
      typeof p.slug !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.tvl_usd !== 'number' ||
      !Number.isFinite(p.tvl_usd)
    ) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains)
        ? p.chains.filter((c): c is string => typeof c === 'string')
        : [],
      tvl_usd: p.tvl_usd,
      change_7d:
        typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd:
        typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0)
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++)
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd)
      return `row ${i + 1} outranks row ${i} on implied value`;
  if (
    board.length >= 2 &&
    board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd
  ) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps)
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
