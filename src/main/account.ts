import type { Account, LoginResult, VmexPlan } from "../shared/types";
import { BRAND } from "./brand";
import { log } from "./logs";
import { replaceSource } from "./servers";
import { store } from "./store";

const COOKIE = "vmex_token";
let plansCache: VmexPlan[] = [];

class AuthError extends Error {}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ data: T; token?: string }> {
  const token = store.session().token;
  let res: Response;
  try {
    res = await fetch(`${BRAND.site}/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "VMEX-Desktop",
        ...(token ? { Cookie: `${COOKIE}=${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("Can't reach VMEX. Check your internet connection.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new AuthError(data.error || "Please log in again.");
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`));
  const newToken = cookie ? cookie.slice(COOKIE.length + 1).split(";")[0] : undefined;
  return { data, token: newToken };
}

type User = { name: string; email: string };

function finishLogin(user: User, token?: string) {
  store.setSession({ ...store.session(), token: token ?? store.session().token, name: user.name, email: user.email });
}

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const { data, token } = await api<{ otpRequired?: boolean; challengeId?: string; email?: string; user?: User }>(
      "/auth/login",
      { method: "POST", body: { email, password } }
    );
    if (data.otpRequired) return { ok: false, otpRequired: true, challengeId: data.challengeId, email: data.email ?? email };
    if (data.user) finishLogin(data.user, token);
    await sync().catch(() => undefined);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function verify(challengeId: string, code: string): Promise<LoginResult> {
  try {
    const { data, token } = await api<{ user: User }>("/auth/otp/verify", { method: "POST", body: { challengeId, code } });
    finishLogin(data.user, token);
    await sync().catch(() => undefined);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function resend(challengeId: string): Promise<LoginResult> {
  try {
    await api("/auth/otp/resend", { method: "POST", body: { challengeId } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

type ConfigService = {
  id: number;
  name: string;
  planName?: string | null;
  status?: string;
  usedBytes?: number;
  totalBytes?: number;
  expiresAt?: number | null;
  links?: string[];
};

/** Pull the customer's configs from their VMEX account into the server list. */
export async function sync(): Promise<Account> {
  if (!store.session().token) return getAccount();
  try {
    const { data } = await api<{ configs: ConfigService[] }>("/portal/configs");
    const services = data.configs ?? [];
    plansCache = services.map((s) => ({
      id: s.id,
      name: s.name,
      planName: s.planName ?? null,
      status: s.status ?? "active",
      usedBytes: s.usedBytes ?? 0,
      totalBytes: s.totalBytes ?? 0,
      expiresAt: s.expiresAt ?? null,
    }));
    const links = services.flatMap((s) => s.links ?? []);
    replaceSource("vmex", links);
    store.setSession({ ...store.session(), syncedAt: Date.now() });
    log("app", `VMEX account synced: ${links.length} configs`);
  } catch (e) {
    if (e instanceof AuthError) {
      await logout();
    } else {
      throw e;
    }
  }
  return getAccount();
}

export function getAccount(): Account {
  const s = store.session();
  if (!s.token) return { loggedIn: false };
  return { loggedIn: true, name: s.name, email: s.email, plans: plansCache, syncedAt: s.syncedAt };
}

export async function logout(): Promise<Account> {
  if (store.session().token) await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  store.setSession({});
  plansCache = [];
  replaceSource("vmex", []);
  return getAccount();
}
