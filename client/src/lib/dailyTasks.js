import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GAMES } from "@/lib/games";

// Daily tasks: the backend draws a few of the tasks in MongoDB every UTC day, seeded with the latest
// Bitcoin block hash read through the Hemi Bitcoin Kit, and counts each wallet's plays (saved games) and
// minutes of verified play on the hub. Each task: { id, title, description, reward, game (from GAMES, or
// null for any game), unit ("plays" or "minutes"), goal, progress, boost, claimed }.

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
export const BITCOIN_BLOCK_URL = "https://mempool.space/block/";

const gamesByContract = new Map(GAMES.filter(g => g.contract).map(g => [g.contract.toLowerCase(), g]));

async function fetchDailyTasks(address) {
  const res = await fetch(`${API_BASE}/api/tasks/daily${address ? `?wallet=${address}` : ""}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Daily tasks answered ${res.status}`);
  return data;
}

export function useDailyTasks(address) {
  const queryClient = useQueryClient();
  const wallet = address?.toLowerCase() ?? null;
  const query = useQuery({
    queryKey: ["daily-tasks", wallet],
    queryFn: () => fetchDailyTasks(address),
    staleTime: 30000,
    refetchInterval: 60000, // also picks up the new day's tasks after the reset
    retry: 1,
  });
  const [claiming, setClaiming] = useState(null);
  const [claimErrors, setClaimErrors] = useState({}); // task id → message

  const markClaimed = useCallback((taskId) => {
    queryClient.setQueryData(["daily-tasks", wallet], (d) => d && {
      ...d,
      tasks: d.tasks.map(t => (t.id === taskId ? { ...t, claimed: true } : t)),
    });
  }, [queryClient, wallet]);

  // Resolves to the wallet's new HP total, or null if the claim didn't go through.
  const claim = useCallback(async (taskId) => {
    if (!address) return null;
    setClaiming(taskId);
    setClaimErrors(e => ({ ...e, [taskId]: null }));
    try {
      const res = await fetch(`${API_BASE}/api/tasks/daily/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, taskId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.alreadyDone) {
        markClaimed(taskId);
        return data.newTotal ?? null;
      }
      setClaimErrors(e => ({ ...e, [taskId]: data.error || "The claim didn't go through. Try again." }));
      query.refetch();
      return null;
    } catch {
      setClaimErrors(e => ({ ...e, [taskId]: "Couldn't reach the server. Try again." }));
      return null;
    } finally {
      setClaiming(null);
    }
  }, [address, markClaimed, query]);

  const data = query.data;
  const tasks = (data?.tasks ?? []).map(t => ({
    ...t,
    game: t.contract ? gamesByContract.get(t.contract.toLowerCase()) ?? null : null,
    // An older backend only sends playCount and plays.
    unit: t.unit ?? "plays",
    goal: t.goal ?? t.playCount,
    progress: t.progress ?? t.plays,
  }));
  return {
    tasks,
    bitcoin: data?.bitcoin ?? null,
    resetsAt: data?.resetsAt ?? null,
    loading: query.isLoading,
    error: query.error,
    retry: query.refetch,
    claim,
    claiming,
    claimErrors,
  };
}
