import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SESSION_REGISTRY, sessionKeyAddress } from "@/lib/gameSession";
import { HUB_ADDRESS } from "@/lib/hub";

// A player's recent plays:
//  - Games with their own contract: read from the Hemi explorer, the transactions the wallet sent to a
//    game contract. A start (startGame, startLevel, startRun, startMatch, playGame) counts as a play and a
//    submit saves a result; anything else, like the owner's claimFees, isn't a play.
//  - Games on HairGames Hub V2: the runs the backend recorded. Their starts and saves are often sent by
//    the player's session key, so the explorer lists them under the key, not the wallet.
// Spend is what the wallet paid out for play: game transactions, hub transactions it sent itself, and
// what it put on its session key (opening or topping up a session), on the day it did.

export const EXPLORER_URL = "https://explorer.hemi.xyz";
export const ACTIVITY_DAYS = 14;

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const DAY = 86400000;
const MAX_PAGES = 5; // 50 transactions a page; a wallet that also trades elsewhere needs a few

const STATUS = { ok: "ok", error: "failed" };
const lower = (a) => a?.toLowerCase();
const txCost = (tx) => BigInt(tx.value ?? "0") + BigInt(tx.fee?.value ?? "0");

// "start", "save", or null for a call that isn't a play. A method the explorer couldn't decode (none, or
// a bare selector) counts as a save.
function playKind(method) {
  if (!method || /^0x/i.test(method)) return "save";
  if (/^(start|play)/i.test(method)) return "start";
  if (/^submit/i.test(method)) return "save";
  return null;
}

export function toPlays(items, gamesByContract) {
  return items.flatMap((tx) => {
    const game = gamesByContract.get(lower(tx.to?.hash));
    const kind = playKind(tx.method);
    if (!game || !kind) return [];
    return [{
      hash: tx.hash,
      game,
      kind,
      status: STATUS[tx.status] ?? "pending",
      cost: txCost(tx),
      at: Date.parse(tx.timestamp),
    }];
  });
}

// Hub runs as plays: a start row, and a save row once saved. Status and cost come from the explorer's
// copy of the transaction when it's in `known`; the backend only lists mined transactions, so a missing
// one is confirmed, with its cost unknown (null).
export function hubPlays(runs, gamesById, known) {
  return runs.flatMap((run) => {
    const game = gamesById.get(run.gameId);
    if (!game) return [];
    const row = (hash, kind, at) => {
      const tx = known.get(lower(hash));
      return { hash, game, kind, status: tx ? STATUS[tx.status] ?? "pending" : "ok", cost: tx ? txCost(tx) : null, at: Date.parse(at) };
    };
    return [
      ...(run.startTx ? [row(run.startTx, "start", run.startedAt)] : []),
      ...(run.saveTx ? [row(run.saveTx, "save", run.savedAt)] : []),
    ];
  });
}

// Totals per local day for the last `days` days, oldest first.
export function perDay(plays, value = () => 1, days = ACTIVITY_DAYS, now = Date.now()) {
  const first = new Date(now).setHours(0, 0, 0, 0) - (days - 1) * DAY;
  const totals = Array(days).fill(0);
  for (const play of plays) {
    const i = Math.floor((play.at - first) / DAY);
    if (i >= 0 && i < days) totals[i] += value(play);
  }
  return totals;
}

async function fetchSentTransactions(address, maxPages = MAX_PAGES) {
  const since = Date.now() - ACTIVITY_DAYS * DAY;
  const items = [];
  let next = null;
  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams({ filter: "from", ...(next ?? {}) });
    const res = await fetch(`${EXPLORER_URL}/api/v2/addresses/${address}/transactions?${query}`);
    if (!res.ok) throw new Error(`Explorer answered ${res.status}`);
    const data = await res.json();
    items.push(...data.items);
    const oldest = data.items.at(-1);
    next = data.next_page_params;
    if (!next || !oldest || Date.parse(oldest.timestamp) < since) break;
  }
  return items;
}

async function fetchHubRuns(address) {
  const res = await fetch(`${API_BASE}/api/hub/runs?wallet=${address}&days=${ACTIVITY_DAYS}`);
  if (!res.ok) throw new Error(`Hub runs answered ${res.status}`);
  return (await res.json()).runs;
}

// The wallet's transactions, the session key's latest page of them (its checkpoints fill pages fast; this
// is only for the newest rows' status and cost), and the wallet's hub runs.
async function fetchActivity(address, keyAddress) {
  const [walletTxs, keyTxs, runs] = await Promise.all([
    fetchSentTransactions(address),
    keyAddress ? fetchSentTransactions(keyAddress, 1).catch(() => []) : [],
    HUB_ADDRESS ? fetchHubRuns(address).catch(() => []) : [],
  ]);
  return { walletTxs, keyTxs, runs };
}

// What the wallet's games paid out in HP over the activity window, as [{ at, hp }].
async function fetchPayouts(address) {
  const res = await fetch(`${API_BASE}/api/points/history?wallet=${address}&days=${ACTIVITY_DAYS}`);
  if (!res.ok) throw new Error(`Points history answered ${res.status}`);
  return (await res.json()).payouts;
}

// plays: every start and save, newest first. costs: [{ at, cost }] for what the wallet spent on play.
// hpByDay is the HP paid per local day, from the backend's ledger of game payouts and task claims (null
// until it loads).
export function usePlayerActivity(address, games) {
  const gamesByContract = useMemo(
    () => new Map(games.filter(g => g.contract).map(g => [g.contract.toLowerCase(), g])),
    [games],
  );
  const gamesById = useMemo(() => new Map(games.map(g => [g.id, g])), [games]);
  const keyAddress = address ? sessionKeyAddress(address) : null;

  const query = useQuery({
    queryKey: ["player-activity", lower(address), lower(keyAddress)],
    queryFn: () => fetchActivity(address, keyAddress),
    enabled: !!address,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });

  const { plays, costs } = useMemo(() => {
    if (!query.data) return { plays: [], costs: [] };
    const { walletTxs, keyTxs, runs } = query.data;
    const known = new Map([...walletTxs, ...keyTxs].map((tx) => [lower(tx.hash), tx]));
    const all = [...toPlays(walletTxs, gamesByContract), ...hubPlays(runs, gamesById, known)].sort((a, b) => b.at - a.at);

    const hub = lower(HUB_ADDRESS);
    const funding = new Set([lower(SESSION_REGISTRY), lower(keyAddress)].filter(Boolean));
    const spent = new Map(); // hash → { at, cost }
    for (const p of all) if (p.cost != null) spent.set(lower(p.hash), { at: p.at, cost: p.cost });
    for (const tx of walletTxs) {
      const to = lower(tx.to?.hash);
      if (to === hub || funding.has(to)) spent.set(lower(tx.hash), { at: Date.parse(tx.timestamp), cost: txCost(tx) });
    }
    return { plays: all, costs: [...spent.values()] };
  }, [query.data, gamesByContract, gamesById, keyAddress]);

  const payouts = useQuery({
    queryKey: ["hp-payouts", lower(address)],
    queryFn: () => fetchPayouts(address),
    enabled: !!address,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
  const hpByDay = useMemo(() => (payouts.data ? perDay(payouts.data, p => p.hp) : null), [payouts.data]);

  return { plays, costs, hpByDay, loading: query.isLoading, error: query.error, retry: query.refetch };
}
