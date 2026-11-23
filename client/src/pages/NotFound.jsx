import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import "@/styles/hg.css";

export default function NotFound() {
  return (
    <div className="hg">
      <div className="conn">
        <p className="ph-title" style={{ fontSize: "clamp(72px, 14vw, 160px)", color: "var(--hg-orange)", textShadow: "0 0 50px rgba(255,107,26,0.45)" }}>
          404
        </p>
        <div className="conn-txt">
          <h1 className="conn-title">Page not found</h1>
          <p className="conn-sub">This page doesn't exist or has moved. Head back and pick a game.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/dashboard" className="btn btn-o btn-lg">Go to dashboard <ArrowRight size={13} /></Link>
          <Link href="/" className="btn btn-glass btn-lg">Home</Link>
        </div>
      </div>
    </div>
  );
}
