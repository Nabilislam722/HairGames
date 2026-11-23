import {
  createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useAccount, useBalance, useReadContract, useSendTransaction, useWriteContract } from "wagmi";
import { createPublicClient, createWalletClient, formatEther, http, parseAbi, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { estimateL1Fee } from "viem/op-stack";
import { hemi } from "@/lib/hemi";

// Game sessions: the player approves a temporary key once from their wallet, and games send their
// transactions with that key, so playing needs no wallet popups. The key is kept in this browser, holds
// a small ETH balance, and only counts as the player on contracts that check the session registry.
// Without VITE_SESSION_REGISTRY_CONTRACT the feature is off.

export const SESSION_REGISTRY = import.meta.env.VITE_SESSION_REGISTRY_CONTRACT;

export const SESSION_TOP_UPS = ["0.00005", "0.0002", "0.0005", "0.001"];
export const SESSION_DEFAULT_TOP_UP = "0.0005";
export const SESSION_DAYS = [1, 3, 7];

export const formatSessionEth = (wei) => Number(formatEther(wei)).toFixed(6).replace(/\.?0+$/, "");

export function formatTimeLeft(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${mins % 60}m`;
  return `${mins}m`;
}

const REGISTRY_ABI = parseAbi([
  "function openSession(address key, uint64 expiresAt) payable", // registers or renews the key and forwards msg.value to it
  "function closeSession()", // called by the key itself
  "function sessions(address key) view returns (address owner, uint64 expiresAt)",
]);

// One play: about 0.00001 ETH in game fees plus two transactions of gas.
export const PLAY_COST_WEI = parseEther("0.000013");

// Roughly how many plays a top-up covers, shown on every amount option.
export const playsFor = (eth) => Number(parseEther(eth) / PLAY_COST_WEI);
export const topUpLabel = (eth) => `${eth} ETH · ~${playsFor(eth)} plays`;
const TRANSFER_GAS = 21000n;

// Hemi charges an L1 data fee on top of gas, quoted by the OP Stack GasPriceOracle predeploy.
const chain = {
  ...hemi,
  contracts: { ...hemi.contracts, gasPriceOracle: { address: "0x420000000000000000000000000000000000000F" } },
};
const transport = http(hemi.rpcUrls.default.http[0]);
const publicClient = createPublicClient({ chain, transport });

const CHANGE_EVENT = "hairgames:session-key";
const storageKey = (owner) => `hairgames:session-key:${owner.toLowerCase()}`;

function loadKey(owner) {
  if (!owner) return null;
  try {
    return localStorage.getItem(storageKey(owner));
  } catch {
    return null;
  }
}

function saveKey(owner, privateKey) {
  localStorage.setItem(storageKey(owner), privateKey);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const sessionWallet = (account) => createWalletClient({ account, chain, transport });

function isRejection(error) {
  for (let e = error; e; e = e.cause) {
    if (e.name === "UserRejectedRequestError" || e.code === 4001) return true;
  }
  return false;
}

// Sends everything the key holds to `to`, holding back this transfer's own gas and L1 fee.
async function sweep(account, to) {
  const balance = await publicClient.getBalance({ address: account.address });
  const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
  let l1Fee;
  try {
    l1Fee = await estimateL1Fee(publicClient, { account, to, value: balance });
  } catch {
    l1Fee = parseEther("0.000001");
  }
  const reserve = TRANSFER_GAS * maxFeePerGas + (l1Fee * 3n) / 2n;
  if (balance <= reserve) return;
  const hash = await sessionWallet(account).sendTransaction({
    to,
    value: balance - reserve,
    gas: TRANSFER_GAS,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

const SessionContext = createContext(null);

// One session state for the whole app, so the navbar and pages always agree.
export function GameSessionProvider({ children }) {
  return createElement(SessionContext.Provider, { value: useSessionState() }, children);
}

export function useGameSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useGameSession needs a GameSessionProvider above it");
  return session;
}

function useSessionState() {
  const enabled = Boolean(SESSION_REGISTRY);
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [privateKey, setPrivateKey] = useState(() => loadKey(address));
  const [busy, setBusy] = useState(null); // start | fund | end
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const sync = () => setPrivateKey(loadKey(address));
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [address]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(tick);
  }, []);

  const account = useMemo(() => (privateKey ? privateKeyToAccount(privateKey) : null), [privateKey]);

  const { data: record, refetch: refetchRecord } = useReadContract({
    address: SESSION_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "sessions",
    args: [account?.address],
    query: { enabled: enabled && !!account, refetchInterval: 30000 },
  });
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: account?.address,
    query: { enabled: enabled && !!account, refetchInterval: 15000 },
  });

  // A new key gets new queries mid-action, so refresh through whatever the latest render holds.
  const refreshRef = useRef(null);
  refreshRef.current = () => Promise.all([refetchRecord(), refetchBalance()]);

  const [owner, expiresAt] = record ?? [];
  const ours = Boolean(owner && address && owner.toLowerCase() === address.toLowerCase());
  const expiresMs = ours ? Number(expiresAt) * 1000 : 0;
  const balance = balanceData?.value ?? 0n;
  const status = !ours ? "off" : now < expiresMs ? "active" : "expired";

  async function run(name, task) {
    setBusy(name);
    setError(null);
    try {
      await task();
      await refreshRef.current();
      setNow(Date.now());
    } catch (e) {
      if (!isRejection(e)) setError(e?.shortMessage ?? e?.message ?? "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  // Opens a session, or renews one with the same key so the player's history stays on one address.
  // The key is saved before it is funded, so a closed tab never strands the top-up.
  const start = ({ topUpEth, days }) =>
    run("start", async () => {
      const code = await publicClient.getCode({ address: SESSION_REGISTRY });
      if (!code) throw new Error("The session contract isn't deployed at the configured address.");
      let key = privateKey;
      if (!key) {
        key = generatePrivateKey();
        saveKey(address, key);
        setPrivateKey(key);
      }
      const hash = await writeContractAsync({
        address: SESSION_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "openSession",
        args: [privateKeyToAccount(key).address, BigInt(Math.floor(Date.now() / 1000) + days * 86400)],
        value: parseEther(topUpEth),
      });
      await publicClient.waitForTransactionReceipt({ hash });
    });

  const addFunds = (eth) =>
    run("fund", async () => {
      const hash = await sendTransactionAsync({ to: account.address, value: parseEther(eth) });
      await publicClient.waitForTransactionReceipt({ hash });
    });

  // The key closes its own session and returns what's left, so ending needs no wallet popup.
  const end = () =>
    run("end", async () => {
      if (status === "active" && balance > PLAY_COST_WEI / 4n) {
        const hash = await sessionWallet(account).writeContract({
          address: SESSION_REGISTRY,
          abi: REGISTRY_ABI,
          functionName: "closeSession",
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await sweep(account, address);
    });

  // For game contracts that accept session keys: sends with the key while a session is active and
  // funded, otherwise through the player's wallet as before.
  const writeContract = useCallback(
    (request) =>
      status === "active" && account && balance >= PLAY_COST_WEI
        ? sessionWallet(account).writeContract(request)
        : writeContractAsync(request),
    [status, account, balance, writeContractAsync],
  );

  return {
    enabled,
    status,
    busy,
    error,
    balance,
    playsLeft: Number(balance / PLAY_COST_WEI),
    expiresAt: expiresMs,
    now,
    start,
    addFunds,
    end,
    writeContract,
  };
}
