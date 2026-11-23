import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient, useReadContracts, useWatchAsset, useWriteContract } from "wagmi";
import { formatUnits, parseAbi } from "viem";
import { hemi } from "@/lib/hemi";
import { useHemiNetwork } from "@/lib/useHemiNetwork";
import { MOCK_DATA, mockAllocations } from "@/lib/mockData";

/*
 * Rewards: tokens the team allocates to a wallet, which the player claims on Hemi. Weekly event
 * prizes pay HEMI. Each token has its own claim contract: the team allocates an amount to each
 * wallet, and the page shows the connected wallet what it's eligible to claim. The contracts aren't
 * written yet; each needs the three functions in CLAIM_ABI:
 *
 *   allocated(account)  everything ever allocated to the wallet, in base units. Allocations add up,
 *                       so each week's prizes can go on top of what's already there.
 *   claimed(account)    how much of that the wallet has already claimed
 *   claim()             sends allocated - claimed to msg.sender
 *
 *   VITE_HEMI_REWARDS_CONTRACT  the HEMI claim contract
 *   VITE_HAIR_REWARDS_CONTRACT  the HAIR claim contract
 *
 * A token without a contract address isn't shown. In dev without either address, mock allocations
 * stand in and claiming them is simulated.
 */

export const REWARD_TOKENS = {
  HEMI: {
    symbol: "HEMI",
    name: "Weekly event prize",
    address: "0x99e3dE3817F6081B2568208337ef83295b7f591D",
    decimals: 18,
    logo: "/hemi.png",
    color: "#ff3d00",
    contract: import.meta.env.VITE_HEMI_REWARDS_CONTRACT || "",
  },
  HAIR: {
    symbol: "HAIR",
    name: "HAIR reward",
    address: "0x5B774f563C902FA7b203FB7029ed6eD4Ce274705",
    decimals: 18,
    logo: "/hair.png",
    color: "#ff6b1a",
    contract: import.meta.env.VITE_HAIR_REWARDS_CONTRACT || "",
  },
};

export const CLAIM_ABI = parseAbi([
  "function allocated(address account) view returns (uint256)",
  "function claimed(address account) view returns (uint256)",
  "function claim()",
]);

const TOKENS = Object.values(REWARD_TOKENS);
const LIVE_TOKENS = TOKENS.filter((t) => t.contract);
const MOCK = MOCK_DATA && LIVE_TOKENS.length === 0;

/** Whether any claim is set up yet (always in dev, with mock allocations). */
export const CLAIMING_OPEN = MOCK || LIVE_TOKENS.length > 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A token amount in base units as a readable number, like 25,000 or 1,250.5. */
export function formatAmount(units, symbol) {
  const n = Number(formatUnits(units, REWARD_TOKENS[symbol].decimals));
  return n.toLocaleString("en", { maximumFractionDigits: n > 0 && n < 1 ? 6 : 2 });
}

function claimError(e) {
  const text = e?.shortMessage || e?.message || "";
  if (e?.name === "UserRejectedRequestError" || /user (rejected|denied)|rejected the request/i.test(text)) {
    return "You cancelled the claim in your wallet.";
  }
  return text.split("\n")[0] || "The claim didn't go through. Try again.";
}

/**
 * The connected wallet's allocation per token, and claim() for each.
 *
 * Each reward has `allocated`, `claimed` and `claimable` (bigints) and a `state`: "eligible"
 * (something to claim), "claimed" (allocated and all claimed) or "none". `steps` holds the claim in
 * progress per token: { phase: "confirm" | "pending" | "error", hash?, error? }.
 */
export function useRewards(address) {
  const [mock, setMock] = useState(null); // symbol → { allocated, claimed }, dev only
  const [steps, setSteps] = useState({});
  const [claimedHere, setClaimedHere] = useState({}); // symbol → tx hash ("" for a simulated claim)
  const currentAddress = useRef(address);
  currentAddress.current = address;

  // A new wallet starts from a clean slate.
  useEffect(() => {
    setMock(MOCK && address ? mockAllocations() : null);
    setSteps({});
    setClaimedHere({});
  }, [address]);

  const reads = useReadContracts({
    contracts: MOCK || !address
      ? []
      : LIVE_TOKENS.flatMap((t) => ["allocated", "claimed"].map((functionName) => ({
          address: t.contract,
          abi: CLAIM_ABI,
          functionName,
          args: [address],
          chainId: hemi.id,
        }))),
    query: { enabled: !MOCK && !!address && LIVE_TOKENS.length > 0, refetchInterval: 30000 },
  });
  const refetch = reads.refetch;

  const rewards = useMemo(() => (MOCK ? TOKENS : LIVE_TOKENS).map((token, i) => {
    let allocated = 0n;
    let claimed = 0n;
    if (MOCK) {
      ({ allocated = 0n, claimed = 0n } = mock?.[token.symbol] ?? {});
    } else {
      const [a, c] = [reads.data?.[i * 2], reads.data?.[i * 2 + 1]];
      if (a?.status === "success") allocated = a.result;
      if (c?.status === "success") claimed = c.result;
    }
    const claimable = allocated > claimed ? allocated - claimed : 0n;
    const here = claimedHere[token.symbol];
    return {
      token,
      allocated,
      claimed,
      claimable,
      state: claimable > 0n ? "eligible" : allocated > 0n ? "claimed" : "none",
      claimTx: here || null,
    };
  }), [mock, reads.data, claimedHere]);

  let status = "ready";
  if (!address) status = "idle";
  else if (MOCK ? !mock : reads.isLoading) status = "loading";
  else if (!MOCK && (reads.isError || reads.data?.some((d) => d.status === "failure"))) status = "error";

  const publicClient = usePublicClient({ chainId: hemi.id });
  const { writeContractAsync } = useWriteContract();
  const { watchAssetAsync } = useWatchAsset();
  const { ensureHemi } = useHemiNetwork();

  const claim = useCallback(async (symbol) => {
    const token = REWARD_TOKENS[symbol];
    const wallet = address;
    const setStep = (step) => {
      if (currentAddress.current !== wallet) return;
      setSteps((s) => {
        const next = { ...s };
        if (step) next[symbol] = step;
        else delete next[symbol];
        return next;
      });
    };

    setStep({ phase: "confirm" });
    try {
      let hash = "";
      if (MOCK) {
        await sleep(900);
        setStep({ phase: "pending" });
        await sleep(1400);
        setMock((m) => m && { ...m, [symbol]: { ...m[symbol], claimed: m[symbol].allocated } });
      } else {
        await ensureHemi();
        hash = await writeContractAsync({ address: token.contract, abi: CLAIM_ABI, functionName: "claim", chainId: hemi.id });
        setStep({ phase: "pending", hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error("The claim transaction failed on chain. Your reward is still here, so you can try again.");
        }
        await refetch();
      }
      if (currentAddress.current !== wallet) return;
      setClaimedHere((c) => ({ ...c, [symbol]: hash }));
      setStep(null);
    } catch (e) {
      setStep({ phase: "error", error: claimError(e) });
      // It may have been claimed already, e.g. from another tab.
      if (!MOCK) refetch();
    }
  }, [address, ensureHemi, writeContractAsync, publicClient, refetch]);

  /** Asks the wallet to show a reward token in its list (HEMI isn't there by default). */
  const addToWallet = useCallback(async (symbol) => {
    const token = REWARD_TOKENS[symbol];
    try {
      await watchAssetAsync({
        type: "ERC20",
        options: { address: token.address, symbol: token.symbol, decimals: token.decimals, image: new URL(token.logo, window.location.origin).href },
      });
    } catch {
      // Declined, or the wallet can't add tokens: nothing to do.
    }
  }, [watchAssetAsync]);

  return { rewards, status, steps, claim, addToWallet, retry: refetch };
}
