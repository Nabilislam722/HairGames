import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient, useReadContracts, useWatchAsset, useWriteContract } from "wagmi";
import { formatUnits, parseAbi } from "viem";
import { hemi } from "@/lib/hemi";
import { useHemiNetwork } from "@/lib/useHemiNetwork";

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
 *
 * A token without a contract address isn't shown.
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
};

export const CLAIM_ABI = parseAbi([
  "function allocated(address account) view returns (uint256)",
  "function claimed(address account) view returns (uint256)",
  "function claim()",
]);

const LIVE_TOKENS = Object.values(REWARD_TOKENS).filter((t) => t.contract);

/** Whether any claim is set up yet. */
export const CLAIMING_OPEN = LIVE_TOKENS.length > 0;

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
  const [steps, setSteps] = useState({});
  const [claimedHere, setClaimedHere] = useState({}); // symbol → tx hash
  const currentAddress = useRef(address);
  currentAddress.current = address;

  // A new wallet starts from a clean slate.
  useEffect(() => {
    setSteps({});
    setClaimedHere({});
  }, [address]);

  const reads = useReadContracts({
    contracts: !address
      ? []
      : LIVE_TOKENS.flatMap((t) => ["allocated", "claimed"].map((functionName) => ({
          address: t.contract,
          abi: CLAIM_ABI,
          functionName,
          args: [address],
          chainId: hemi.id,
        }))),
    query: { enabled: !!address && LIVE_TOKENS.length > 0, refetchInterval: 30000 },
  });
  const refetch = reads.refetch;

  const rewards = useMemo(() => LIVE_TOKENS.map((token, i) => {
    let allocated = 0n;
    let claimed = 0n;
    const [a, c] = [reads.data?.[i * 2], reads.data?.[i * 2 + 1]];
    if (a?.status === "success") allocated = a.result;
    if (c?.status === "success") claimed = c.result;
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
  }), [reads.data, claimedHere]);

  let status = "ready";
  if (!address) status = "idle";
  else if (reads.isLoading) status = "loading";
  else if (reads.isError || reads.data?.some((d) => d.status === "failure")) status = "error";

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
      await ensureHemi();
      const hash = await writeContractAsync({ address: token.contract, abi: CLAIM_ABI, functionName: "claim", chainId: hemi.id });
      setStep({ phase: "pending", hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("The claim transaction failed on chain. Your reward is still here, so you can try again.");
      }
      await refetch();
      if (currentAddress.current !== wallet) return;
      setClaimedHere((c) => ({ ...c, [symbol]: hash }));
      setStep(null);
    } catch (e) {
      setStep({ phase: "error", error: claimError(e) });
      // It may have been claimed already, e.g. from another tab.
      refetch();
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
