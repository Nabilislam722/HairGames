import crypto from "crypto";
import UserProfile from "../models/UserProfile.js";
import OAuthState from "../models/OAuthState.js";

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(bytes = 32) {
  return base64url(crypto.randomBytes(bytes));
}

async function findSocialEntry(walletLower, platform) {
  const profile = await UserProfile.findOne({ wallet: walletLower }, { social: 1 });
  return profile?.social?.find(s => s.platform === platform) ?? null;
}

// Replaces any existing handle for the platform, then records the new one.
// Two calls (not one combined update) because MongoDB rejects $pull and
// $push targeting the same array path in a single update document.
async function upsertSocialHandle(wallet, platform, handle) {
  const walletLower = wallet.toLowerCase();
  await UserProfile.findOneAndUpdate(
    { wallet: walletLower },
    { $pull: { social: { platform } } },
    { upsert: true }
  );
  await UserProfile.findOneAndUpdate(
    { wallet: walletLower },
    {
      $push: { social: { platform, handle, connectedAt: new Date() } },
      $set: { lastSyncedAt: new Date() },
    },
    { upsert: true }
  );
}

/**
 * GET /api/auth/twitter?wallet=0x...
 * Redirects to X's OAuth 2.0 + PKCE authorize screen. The wallet and PKCE
 * code_verifier are stashed in OAuthState under a random `state`, since
 * there's no session/cookie store to carry them to the callback otherwise.
 */
export const startTwitterAuth = async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).send("Missing wallet");

  const clientId = process.env.TWITTER_CLIENT_ID;
  const redirectUri = process.env.TWITTER_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    console.error("/api/auth/twitter error: TWITTER_CLIENT_ID/TWITTER_REDIRECT_URI not set");
    return res.status(500).send("X login is not configured");
  }

  const codeVerifier = randomToken(32);
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
  const state = randomToken(16);

  await OAuthState.create({ state, wallet: wallet.toLowerCase(), platform: "twitter", codeVerifier });

  const authUrl = new URL("https://x.com/i/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "users.read tweet.read");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  res.redirect(authUrl.toString());
};

/**
 * GET /api/auth/twitter/callback
 * Exchanges the code for a token, reads the handle from /2/users/me, stores
 * it, and bounces back to the frontend profile page.
 */
export const twitterCallback = async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5173";

  if (error || !code || !state) {
    return res.redirect(`${frontendUrl}/profile?social_error=twitter`);
  }

  try {
    const pending = await OAuthState.findOneAndDelete({ state, platform: "twitter" });
    if (!pending) return res.redirect(`${frontendUrl}/profile?social_error=twitter`);

    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    const redirectUri = process.env.TWITTER_REDIRECT_URI;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: pending.codeVerifier,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("/api/auth/twitter/callback token error:", tokenData);
      return res.redirect(`${frontendUrl}/profile?social_error=twitter`);
    }

    const meRes = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const meData = await meRes.json();
    const handle = meData?.data?.username;
    if (!meRes.ok || !handle) {
      console.error("/api/auth/twitter/callback profile error:", meData);
      return res.redirect(`${frontendUrl}/profile?social_error=twitter`);
    }

    await upsertSocialHandle(pending.wallet, "twitter", handle);
    return res.redirect(`${frontendUrl}/profile?social_connected=twitter`);
  } catch (err) {
    console.error("/api/auth/twitter/callback error:", err);
    return res.redirect(`${frontendUrl}/profile?social_error=twitter`);
  }
};

/**
 * GET /api/auth/discord?wallet=0x...
 * Standard OAuth2 authorization-code redirect (no PKCE needed — Discord's
 * flow uses a confidential client secret instead).
 */
export const startDiscordAuth = async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).send("Missing wallet");

  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    console.error("/api/auth/discord error: DISCORD_CLIENT_ID/DISCORD_REDIRECT_URI not set");
    return res.status(500).send("Discord login is not configured");
  }

  const state = randomToken(16);
  await OAuthState.create({ state, wallet: wallet.toLowerCase(), platform: "discord" });

  console.log("Discord OAuth redirect_uri sent:", redirectUri);

  const authUrl = new URL("https://discord.com/api/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "identify");
  authUrl.searchParams.set("state", state);

  res.redirect(authUrl.toString());
};

/**
 * GET /api/auth/discord/callback
 * Exchanges the code for a token, reads the username from /users/@me,
 * stores it, and bounces back to the frontend profile page.
 */
export const discordCallback = async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5173";

  if (error || !code || !state) {
    return res.redirect(`${frontendUrl}/profile?social_error=discord`);
  }

  try {
    const pending = await OAuthState.findOneAndDelete({ state, platform: "discord" });
    if (!pending) return res.redirect(`${frontendUrl}/profile?social_error=discord`);

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("/api/auth/discord/callback token error:", tokenData);
      return res.redirect(`${frontendUrl}/profile?social_error=discord`);
    }

    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const meData = await meRes.json();
    const handle = meData?.username;
    if (!meRes.ok || !handle) {
      console.error("/api/auth/discord/callback profile error:", meData);
      return res.redirect(`${frontendUrl}/profile?social_error=discord`);
    }

    await upsertSocialHandle(pending.wallet, "discord", handle);
    return res.redirect(`${frontendUrl}/profile?social_connected=discord`);
  } catch (err) {
    console.error("/api/auth/discord/callback error:", err);
    return res.redirect(`${frontendUrl}/profile?social_error=discord`);
  }
};

/**
 * GET /api/status/x?wallet=0x...
 * Tells the frontend whether this wallet already has an X handle on file —
 * `connected: true` means the Connect button should stay disabled.
 */
export const getTwitterStatus = async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "Missing wallet" });

  try {
    const entry = await findSocialEntry(wallet.toLowerCase(), "twitter");
    return res.json({ connected: Boolean(entry), handle: entry?.handle ?? null });
  } catch (err) {
    console.error("/api/status/x error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/status/discord?wallet=0x...
 * Same idea for Discord.
 */
export const getDiscordStatus = async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: "Missing wallet" });

  try {
    const entry = await findSocialEntry(wallet.toLowerCase(), "discord");
    return res.json({ connected: Boolean(entry), handle: entry?.handle ?? null });
  } catch (err) {
    console.error("/api/status/discord error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};