import {
  createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useAccount, useBalance, useReadContracts, useSendTransaction, useWriteContract } from "wagmi";
import {
  createPublicClient, createWalletClient, formatEther, http, parseAbi, parseEther, parseSignature,
  signatureToCompactSignature,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { estimateL1Fee } from "viem/op-stack";
import { hemi } from "@/lib/hemi";

// Game sessions: the player approves a temporary key once from their wallet, and games send their
// transactions with that key, so playing needs no wallet popups. The key is kept in this browser, holds
// a small ETH balance, and only counts as the player on contracts that ask the session registry
// (HairGamesSessionRegistry: the hub does, token and NFT contracts don't).
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
  // Registers or renews the key and forwards msg.value to it. (r, vs) is the key's compact signature
  // over SessionConsent(owner, key, expiresAt), so nobody can tie a key they don't hold to their wallet.
  "function openSession(address key, uint40 expiresAt, bytes32 r, bytes32 vs) payable",
  "function closeSession()", // called by the key itself
  "function sessions(address key) view returns (address owner, uint40 expiresAt, uint32 epoch)",
  // The wallet a key plays for right now, or zero once its session expired, was closed or revoked.
  "function ownerOf(address key) view returns (address)",
]);
const CONSENT_TYPES = {
  SessionConsent: [
    { name: "owner", type: "address" },
    { name: "key", type: "address" },
    { name: "expiresAt", type: "uint40" },
  ],
};

// One play: a run's start and save (the 0.000004 ETH save fee plus gas) and about two minutes of
// checkpoints, about 0.000011 ETH at November 2026 prices, with room for a busier network.
export const PLAY_COST_WEI = parseEther("0.000013");
// Below this a finished session's key isn't worth sending back: the transfer would cost about as much.
const RETURN_MIN_WEI = parseEther("0.000002");

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
const PLAY_WITH_KEY = "hairgames:play-with";

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

/** The address of the session key this browser keeps for `owner`, or null. */
export function sessionKeyAddress(owner) {
  const key = loadKey(owner);
  return key ? privateKeyToAccount(key).address : null;
}

function loadPlayWith() {
  try {
    return localStorage.getItem(PLAY_WITH_KEY) === "wallet" ? "wallet" : "session";
  } catch {
    return "session";
  }
}

const sessionWallet = (account) => createWalletClient({ account, chain, transport });

// The key's transactions go out one at a time, with nonces counted here: a checkpoint sent while a save
// is going out can't take its nonce. After a failed send the count is read from the chain again.
const senders = new Map();
function keySender(account) {
  let sender = senders.get(account.address);
  if (sender) return sender;
  let queue = Promise.resolve();
  let nonce = null;
  sender = (send) => {
    const job = queue.then(async () => {
      nonce ??= await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
      try {
        const hash = await send(sessionWallet(account), nonce);
        nonce += 1;
        return hash;
      } catch (error) {
        nonce = null;
        throw error;
      }
    });
    queue = job.catch(() => {});
    return job;
  };
  senders.set(account.address, sender);
  return sender;
}

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
  const hash = await keySender(account)((wallet, nonce) =>
    wallet.sendTransaction({ to, value: balance - reserve, gas: TRANSFER_GAS, maxFeePerGas, maxPriorityFeePerGas, nonce }),
  );
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
  const [busy, setBusy] = useState(null); // start | fund | end | return
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [playWith, setPlayWithState] = useState(loadPlayWith);

  useEffect(() => {
    const sync = () => {
      setPrivateKey(loadKey(address));
      setPlayWithState(loadPlayWith());
    };
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

  const { data: reads, refetch: refetchRecord } = useReadContracts({
    contracts: [
      { address: SESSION_REGISTRY, abi: REGISTRY_ABI, functionName: "ownerOf", args: [account?.address] },
      { address: SESSION_REGISTRY, abi: REGISTRY_ABI, functionName: "sessions", args: [account?.address] },
    ],
    query: { enabled: enabled && !!account, refetchInterval: 30000 },
  });
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address: account?.address,
    query: { enabled: enabled && !!account, refetchInterval: 15000 },
  });

  // A new key gets new queries mid-action, so refresh through whatever the latest render holds.
  const refreshRef = useRef(null);
  refreshRef.current = () => Promise.all([refetchRecord(), refetchBalance()]);

  const same = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
  const liveOwner = reads?.[0]?.result;
  const [owner, expiresAt] = reads?.[1]?.result ?? [];
  const ours = same(owner, address);
  const expiresMs = ours ? Number(expiresAt) * 1000 : 0;
  const balance = balanceData?.value ?? 0n;
  // Expired, closed, or revoked from another device all end the session: the registry stops naming the
  // wallet as the key's player.
  const status = !ours ? "off" : same(liveOwner, address) && now < expiresMs ? "active" : "expired";

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
      const keyAccount = privateKeyToAccount(key);
      const expires = Math.floor(Date.now() / 1000) + days * 86400;
      const consent = await keyAccount.signTypedData({
        domain: { name: "HairGames SessionRegistry", version: "1", chainId: hemi.id, verifyingContract: SESSION_REGISTRY },
        types: CONSENT_TYPES,
        primaryType: "SessionConsent",
        message: { owner: address, key: keyAccount.address, expiresAt: expires },
      });
      const { r, yParityAndS } = signatureToCompactSignature(parseSignature(consent));
      const hash = await writeContractAsync({
        address: SESSION_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "openSession",
        args: [keyAccount.address, expires, r, yParityAndS],
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
        const hash = await keySender(account)((wallet, nonce) =>
          wallet.writeContract({ address: SESSION_REGISTRY, abi: REGISTRY_ABI, functionName: "closeSession", nonce }),
        );
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await sweep(account, address);
    });

  // A session that ended on its own (expired, or revoked from another device) leaves its ETH on the key:
  // send it back to the wallet, once per key and page load. The key pays for the transfer itself.
  const returned = useRef(new Set());
  useEffect(() => {
    if (!enabled || status !== "expired" || busy || !account || !address || balance < RETURN_MIN_WEI) return;
    if (returned.current.has(account.address)) return;
    returned.current.add(account.address);
    run("return", () => sweep(account, address));
  });

  const setPlayWith = useCallback((value) => {
    localStorage.setItem(PLAY_WITH_KEY, value);
    setPlayWithState(value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  // Whether games send with the key: the player hasn't chosen their wallet, and the session is live
  // with enough for a play.
  const usesKey = enabled && playWith === "session" && status === "active" && balance >= PLAY_COST_WEI;

  // Sends a contract call with the session key (no popup). `request` is a viem writeContract request.
  const keyWrite = useCallback(
    (request) => keySender(account)((wallet, nonce) => wallet.writeContract({ ...request, nonce })),
    [account],
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
    playWith,
    setPlayWith,
    usesKey,
    keyWrite,
    refresh: () => refreshRef.current(),
  };
}
