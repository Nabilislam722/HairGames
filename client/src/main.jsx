import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { hemi } from "./lib/hemi";
import { http } from "wagmi";
import { Web3Provider } from "./lib/web3";

import "@rainbow-me/rainbowkit/styles.css";

const config = getDefaultConfig({
  appName: "Hemi App",
  projectId: "656b7d9e9b85101192392ace313ecef8",
  chains: [hemi],
  transports: {
    [hemi.id]: http("https://rpc.hemi.network/rpc"),
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: '#f97316',
          accentColorForeground: 'white',
          borderRadius: 'large',
          fontStack: 'rounded',
          overlayBlur: 'small',
        })}>
        <Web3Provider>
          <App />
        </Web3Provider>
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
);
