import { defineChain } from 'viem';


export const hemi = defineChain({
  id: 0xa867,
  name: "Hemi Network",
  network: "hemi",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    // VITE_HEMI_RPC_URL points the site at another RPC (e.g. a local test chain).
    default: { http: [import.meta.env.VITE_HEMI_RPC_URL || "https://rpc.hemi.network/rpc"] },
  },
});
