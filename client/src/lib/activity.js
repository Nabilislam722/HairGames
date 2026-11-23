import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

// A player's recent plays, read from the Hemi explorer: the transactions their wallet sent to a game
// contract. A start (startGame, startLevel, startRun, startMatch, playGame) counts as a play and a submit
// saves a result; anything else, like the owner's claimFees, isn't a play.

export const EXPLORER_URL = "https://explorer.hemi.xyz";
export const ACTIVITY_DAYS = 14;

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const DAY = 86400000;
const MAX_PAGES = 5; // 50 transactions a page; a wallet that also trades elsewhere needs a few

const STATUS = { ok: "ok", error: "failed" };

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
    const game = gamesByContract.get(tx.to?.hash?.toLowerCase());
    const kind = playKind(tx.method);
    if (!game || !kind) return [];
    return [{
      hash: tx.hash,
      game,
      kind,
      status: STATUS[tx.status] ?? "pending",
      cost: BigInt(tx.value ?? "0") + BigInt(tx.fee?.value ?? "0"),
      at: Date.parse(tx.timestamp),
    }];
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

async function fetchSentTransactions(address) {
  const since = Date.now() - ACTIVITY_DAYS * DAY;
  const items = [];
  let next = null;
  for (let page = 0; page < MAX_PAGES; page++) {
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

// What the wallet's games paid out in HP over the activity window, as [{ at, hp }].
async function fetchPayouts(address) {
  const res = await fetch(`${API_BASE}/api/points/history?wallet=${address}&days=${ACTIVITY_DAYS}`);
  if (!res.ok) throw new Error(`Points history answered ${res.status}`);
  return (await res.json()).payouts;
}

// hpByDay is the HP the wallet's games paid per local day, from the backend's payout ledger (null until
// it loads). Task rewards aren't in the ledger, so they don't show in it.
export function usePlayerActivity(address, games) {
  const gamesByContract = useMemo(
    () => new Map(games.filter(g => g.contract).map(g => [g.contract.toLowerCase(), g])),
    [games],
  );

  const query = useQuery({
    queryKey: ["player-activity", address?.toLowerCase()],
    queryFn: () => fetchSentTransactions(address),
    enabled: !!address,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
  const plays = useMemo(
    () => (query.data ? toPlays(query.data, gamesByContract) : []),
    [query.data, gamesByContract],
  );

  const payouts = useQuery({
    queryKey: ["hp-payouts", address?.toLowerCase()],
    queryFn: () => fetchPayouts(address),
    enabled: !!address,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: 1,
  });
  const hpByDay = useMemo(() => (payouts.data ? perDay(payouts.data, p => p.hp) : null), [payouts.data]);

  return { plays, hpByDay, loading: query.isLoading, error: query.error, retry: query.refetch };
}
