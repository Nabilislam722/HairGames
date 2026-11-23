import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Gift, Loader2, CheckCircle2, ExternalLink, Clock3, Plus, Wallet, TriangleAlert, RotateCw } from "lucide-react";
import { shortAddress } from "@/components/arena/AddressAvatar";
import { EXPLORER_URL } from "@/lib/activity";
import { useRewards, formatAmount, CLAIMING_OPEN } from "@/lib/rewards";
import "@/styles/hg.css";
import "@/styles/rewards.css";

// The card for a wallet's allocation in one token: how much it can claim, and the Claim button.
function ClaimCard({ reward, address, step, onClaim, onAddToWallet }) {
  const { token, state } = reward;
  const symbol = token.symbol;
  const eligible = state === "eligible";
  const amount = eligible ? reward.claimable : reward.claimed;
  const txHash = reward.claimTx || step?.hash;

  let label = `Claim ${formatAmount(reward.claimable, symbol)} ${symbol}`;
  if (step?.phase === "confirm") label = <><Loader2 size={14} className="spin" /> Confirm in wallet</>;
  else if (step?.phase === "pending") label = <><Loader2 size={14} className="spin" /> Claiming</>;
  else if (step?.phase === "error") label = "Try again";

  return (
    <article className={`rwc card ${state}`} style={{ "--c": token.color }}>
      <div className="rwc-top">
        <img src={token.logo} alt="" className="rwc-logo" width={44} height={44} />
        <div>
          <p className="rwc-kicker">{token.name}</p>
          <p className="rwc-token">{symbol}</p>
        </div>
        <span className={`rwc-pill ${state}`}>
          <CheckCircle2 size={11} /> {eligible ? "Eligible" : "Claimed"}
        </span>
      </div>

      <p className="rwc-lbl">{eligible ? "You can claim" : "You claimed"}</p>
      <p className="rwc-amt">{formatAmount(amount, symbol)}<small>{symbol}</small></p>

      <dl className="rwc-rows">
        <div><dt>Wallet</dt><dd>{shortAddress(address)}</dd></div>
        <div><dt>Total allocated</dt><dd>{formatAmount(reward.allocated, symbol)} {symbol}</dd></div>
        <div><dt>Already claimed</dt><dd>{formatAmount(reward.claimed, symbol)} {symbol}</dd></div>
        <div><dt>Network</dt><dd>Hemi</dd></div>
      </dl>

      {step?.phase === "error" && eligible && <p className="rwc-err" role="alert">{step.error}</p>}

      <div className="rwc-act" aria-live="polite">
        {eligible ? (
          <button
            type="button"
            className="btn btn-g btn-lg rwc-btn"
            onClick={() => onClaim(symbol)}
            disabled={step?.phase === "confirm" || step?.phase === "pending"}
          >
            {label}
          </button>
        ) : (
          <span className="btn btn-claimed btn-lg rwc-btn"><CheckCircle2 size={14} /> Claimed</span>
        )}
      </div>

      <p className="rwc-foot">
        {eligible && !txHash && "Sent straight to your wallet. You only pay the gas."}
        {txHash && (
          <a className="rwc-link" href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
            View transaction <ExternalLink size={11} />
          </a>
        )}
        {!eligible && (
          <button type="button" className="rwc-link" onClick={() => onAddToWallet(symbol)}>
            <Plus size={11} /> Add {symbol} to wallet
          </button>
        )}
      </p>
    </article>
  );
}

// The same card shell for everything that isn't an allocation: connect, loading, not eligible.
function StatusCard({ icon, title, text, children }) {
  return (
    <article className="rwc card rwc-status">
      <span className="rwc-badge" aria-hidden>{icon}</span>
      <h2 className="rwc-title">{title}</h2>
      <p className="rwc-text">{text}</p>
      {children}
    </article>
  );
}

export default function Rewards() {
  const { address, isConnected } = useAccount();
  const { rewards, status, steps, claim, addToWallet, retry } = useRewards(address);
  const allocations = rewards.filter(r => r.state !== "none");

  let cards;
  if (!isConnected || !address) {
    cards = (
      <StatusCard icon={<Wallet size={24} />} title="Check your eligibility" text="Connect your wallet to see if it has rewards to claim.">
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button type="button" className="btn btn-o btn-lg" onClick={openConnectModal}>
              <Wallet size={14} /> Connect wallet
            </button>
          )}
        </ConnectButton.Custom>
      </StatusCard>
    );
  } else if (!CLAIMING_OPEN) {
    cards = (
      <StatusCard
        icon={<Clock3 size={24} />}
        title="Claiming opens soon"
        text="Rewards are being allocated. Check back soon to see if your wallet is eligible."
      />
    );
  } else if (status === "loading") {
    cards = <StatusCard icon={<Loader2 size={24} className="spin" />} title="Checking your wallet" text="Looking up your allocation on Hemi." />;
  } else if (status === "error") {
    cards = (
      <StatusCard icon={<TriangleAlert size={24} />} title="Couldn't check your rewards" text="Hemi didn't answer. Try again in a moment.">
        <button type="button" className="btn btn-n" onClick={() => retry()}><RotateCw size={12} /> Try again</button>
      </StatusCard>
    );
  } else if (allocations.length === 0) {
    cards = (
      <StatusCard
        icon={<Gift size={24} />}
        title="Not eligible yet"
        text={`${shortAddress(address)} has no rewards to claim right now. Weekly event winners get HEMI, so check back after this week's event.`}
      />
    );
  } else {
    cards = allocations.map(r => (
      <ClaimCard key={r.token.symbol} reward={r} address={address} step={steps[r.token.symbol]} onClaim={claim} onAddToWallet={addToWallet} />
    ));
  }

  return (
    <div className="hg">
      <header className="rw-head">
        <p className="ph-eyebrow"><Gift size={13} /> Hairdrop</p>
        <h1 className="ph-title">Claim <em>rewards</em></h1>
        <p className="ph-sub">
          Weekly event prizes are paid in HEMI. If your wallet has an allocation, claim it here and it goes
          straight to your wallet on Hemi.
        </p>
      </header>
      <div className="rw-cards hg-stagger">{cards}</div>
    </div>
  );
}
