import { ConnectButton } from "@rainbow-me/rainbowkit";
import { MdOutlineWallet } from "react-icons/md";
import logoUrl from "@/assets/images/hairgames-logo.webp";

// Asks the player to connect a wallet. `compact` is an inline card for pages that still work without one.
export function ConnectPrompt({ title = "Connect to play", text, compact = false, children }) {
  return (
    <div className={`conn${compact ? " compact" : ""}`}>
      {!compact && <img src={logoUrl} alt="HairGames" className="conn-logo" />}
      <div className="conn-txt">
        <h2 className="conn-title">{title}</h2>
        {text && <p className="conn-sub">{text}</p>}
      </div>
      <ConnectButton.Custom>
        {({ openConnectModal }) => (
          <button type="button" onClick={openConnectModal} className={`btn btn-o${compact ? "" : " btn-lg"}`}>
            <MdOutlineWallet size={15} /> Connect Wallet
          </button>
        )}
      </ConnectButton.Custom>
      {children}
    </div>
  );
}
