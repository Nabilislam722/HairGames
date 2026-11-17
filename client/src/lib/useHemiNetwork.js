import { useCallback, useEffect, useRef } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { hemi } from "@/lib/hemi";

/**
 * Keeps the wallet on Hemi. When a connected wallet is on another network, it asks the wallet to
 * switch (adding Hemi if the wallet doesn't know it), once per wrong network so a declined prompt
 * doesn't keep coming back. `ensureHemi()` switches right before a transaction, so nothing is ever
 * sent on the wrong network.
 */
export function useHemiNetwork() {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const asked = useRef(null);
  const onHemi = chainId === hemi.id;

  useEffect(() => {
    if (!isConnected || !chainId || onHemi) {
      if (onHemi) asked.current = null;
      return;
    }
    if (asked.current === chainId) return;
    asked.current = chainId;
    switchChainAsync({ chainId: hemi.id }).catch(() => {});
  }, [isConnected, chainId, onHemi, switchChainAsync]);

  const ensureHemi = useCallback(async () => {
    if (chainId !== hemi.id) await switchChainAsync({ chainId: hemi.id });
  }, [chainId, switchChainAsync]);

  return { onHemi, ensureHemi };
}
