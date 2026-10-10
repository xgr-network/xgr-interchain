import {representationFor} from "./token-representation.js";

// The catalog defines which representations exist in a configured system.
// Rankings only change their order: missing prices, receipts or TVL must
// NEVER erase a catalog-listed token or imply an activated bridge.
export const MAX_VISIBLE_TOKEN_PLANETS = 6;
const TAU = Math.PI * 2;

export function systemTokenPlanets(system, ranked = [], query = "") {
 const tokens = Array.isArray(system?.tokens) ? system.tokens : [];
 const chain = system?.key;
 if (typeof chain !== "string" || !chain) return [];

 const search = String(query ?? "").trim().toLowerCase().slice(0, 80);
 const rank = new Map();
 if (Array.isArray(ranked)) for (const item of ranked) {
  if (typeof item?.assetId === "string" &&
      typeof item.value === "number" && Number.isFinite(item.value) &&
      item.value >= 0 && !rank.has(item.assetId)) {
   rank.set(item.assetId, rank.size);
  }
 }

 const matching = tokens.map((token, order) => ({
  token, order, representation: representationFor(token, chain)
 })).filter(({token, representation}) =>
  !search || [token.id, token.name, representation.symbol, representation.label]
   .some(value => String(value ?? "").toLowerCase().includes(search))
 );
 matching.sort((a, b) =>
  (rank.get(a.token.id) ?? Infinity) - (rank.get(b.token.id) ?? Infinity) ||
  a.order - b.order
 );
 const visible = matching.slice(0, MAX_VISIBLE_TOKEN_PLANETS);
 const n = visible.length;
 return visible.map(({token, representation}, index) => ({
  token, representation, index,
  // Fixed, deterministic orbit size. Never scale by absent or unverified TVL.
  orbit: 5.8 + (index % 2) * 0.85 + Math.floor(index / 3) * 0.5,
  radius: 0.72 - (index % 3) * 0.045,
  speed: 0.012 / (1 + index * 0.25),
  phase: ((index + 0.12) / Math.max(1, n)) * TAU,
  inclination: 0.21 + (index % 3) * 0.22,
  node: index * 0.71,
  twist: 0.15 + index * 0.13
 }));
}
