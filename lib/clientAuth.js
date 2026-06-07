"use client";
// Browser-side session token helpers. The token is a stateless HMAC
// bearer minted by /api/auth-login and stored in localStorage. There is
// no Supabase session anymore — this is the whole client auth surface.

const KEY = "irtutor_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function setToken(token) {
  try { window.localStorage.setItem(KEY, token); } catch {}
}

export function clearToken() {
  try { window.localStorage.removeItem(KEY); } catch {}
}

// fetch wrapper that attaches the bearer token. On a 401 it clears the
// token and reloads, dropping the user back to the PIN screen.
export async function authFetch(url, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.reload();
  }
  return res;
}
