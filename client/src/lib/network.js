// Phone networks drop requests and idle connections, especially in in-app wallet browsers. These
// helpers (the same approach as Proof of Patience) keep a game's server calls going through.
import { useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// fetch with a timeout and retries. Network failures and 5xx answers are retried after a short
// pause; 4xx answers come straight back, since repeating them would not help.
export async function fetchWithRetry(url, options = {}, { retries = 3, timeoutMs = 12000, pauseMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (res.status >= 500) throw new Error(`Server returned ${res.status}`);
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError?.name === "AbortError") throw new Error("The server took too long to respond. Your connection may have dropped.");
  throw lastError;
}

// POSTs JSON with fetchWithRetry and returns the parsed reply, throwing the server's error message.
export async function postJson(path, body) {
  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// While `active`, pings the API every 15 s so mobile browsers keep the connection warm. Failures
// are ignored: this only exists to stop the socket from going idle.
export function useKeepAlive(active) {
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => {
      fetch(`${API_BASE}/api/ping?t=${Date.now()}`, { method: "HEAD", mode: "no-cors" }).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [active]);
}
