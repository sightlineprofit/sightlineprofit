/**
 * Supabase PKCE stores the code verifier in auth storage (default: localStorage).
 * www.sightlineprofit.com and sightlineprofit.com are different origins, so a
 * callback that crosses apex/www loses the verifier → "OAuth state has expired".
 * Mirror auth keys to a site-wide cookie on production.
 */
import type { SupportedStorage } from "@supabase/supabase-js";

const COOKIE_MAX_AGE_SEC = 60 * 15; // 15 minutes — covers slow Google consent screens

function productionCookieDomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host === "sightlineprofit.com" || host === "www.sightlineprofit.com") {
    return ".sightlineprofit.com";
  }
  return null;
}

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string, domain: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    `Domain=${domain}`,
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
    "SameSite=Lax",
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}

function deleteCookie(name: string, domain: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = [
    `${encodeURIComponent(name)}=`,
    "Path=/",
    `Domain=${domain}`,
    "Max-Age=0",
    "SameSite=Lax",
    secure,
  ].join("; ");
}

function mirrorKey(key: string): boolean {
  return key.includes("-auth-token") || key.includes("code-verifier") || key.includes("code-challenge");
}

export function createAuthStorage(): SupportedStorage {
  const cookieDomain = productionCookieDomain();

  if (!cookieDomain || typeof window === "undefined") {
    return localStorage;
  }

  return {
    getItem(key: string): string | null {
      const fromLocal = localStorage.getItem(key);
      if (fromLocal) return fromLocal;
      if (!mirrorKey(key)) return null;
      return readCookie(key);
    },
    setItem(key: string, value: string) {
      localStorage.setItem(key, value);
      if (mirrorKey(key)) {
        writeCookie(key, value, cookieDomain);
      }
    },
    removeItem(key: string) {
      localStorage.removeItem(key);
      if (mirrorKey(key)) {
        deleteCookie(key, cookieDomain);
      }
    },
  };
}
