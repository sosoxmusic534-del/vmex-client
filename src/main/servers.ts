import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { ImportResult, Server, Subscription } from "../shared/types";
import { extractLinks, toServer } from "./links";
import { log } from "./logs";
import { store } from "./store";
import { tcpPing } from "./system";

export const serverEvents = new EventEmitter();
const changed = () => serverEvents.emit("changed", store.servers());

/** Replace all servers from one source (a subscription or the VMEX account) with a new list. */
export function replaceSource(source: string, links: string[]): ImportResult {
  const keep = store.servers().filter((s) => s.source !== source);
  const seen = new Set(keep.map((s) => s.id));
  const result: ImportResult = { added: 0, skipped: 0, errors: [] };
  const fresh: Server[] = [];
  for (const link of links) {
    try {
      const s = toServer(link, source);
      if (seen.has(s.id)) {
        result.skipped++;
        continue;
      }
      seen.add(s.id);
      fresh.push(s);
      result.added++;
    } catch (e) {
      result.errors.push((e as Error).message);
    }
  }
  store.setServers([...keep, ...fresh]);
  ensureSelection();
  changed();
  return result;
}

export function importText(text: string): ImportResult {
  const links = extractLinks(text);
  const result: ImportResult = { added: 0, skipped: 0, errors: [] };
  if (!links.length) {
    result.errors.push("No V2Ray links found. Paste links starting with vless://, vmess://, trojan:// or ss://");
    return result;
  }
  const list = [...store.servers()];
  const ids = new Set(list.map((s) => s.id));
  for (const link of links) {
    try {
      const s = toServer(link, "manual");
      if (ids.has(s.id)) {
        result.skipped++;
        continue;
      }
      ids.add(s.id);
      list.push(s);
      result.added++;
    } catch (e) {
      result.errors.push((e as Error).message);
    }
  }
  store.setServers(list);
  ensureSelection();
  changed();
  return result;
}

export function removeServers(ids: string[]) {
  const set = new Set(ids);
  store.setServers(store.servers().filter((s) => !set.has(s.id)));
  if (store.settings().selectedId && set.has(store.settings().selectedId!)) {
    store.setSettings({ selectedId: null });
    ensureSelection();
  }
  changed();
}

export function renameServer(id: string, name: string) {
  store.setServers(store.servers().map((s) => (s.id === id ? { ...s, name: name.trim().slice(0, 80) || s.name } : s)));
  changed();
}

export function ensureSelection() {
  const { selectedId } = store.settings();
  const list = store.servers();
  if (!list.length) return;
  if (!selectedId || !list.some((s) => s.id === selectedId)) store.setSettings({ selectedId: list[0].id });
}

export async function pingServers(ids?: string[]): Promise<Record<string, number | null>> {
  const targets = store.servers().filter((s) => !ids || ids.includes(s.id));
  const out: Record<string, number | null> = {};
  let i = 0;
  const worker = async () => {
    while (i < targets.length) {
      const s = targets[i++];
      out[s.id] = await tcpPing(s.address, s.port);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, targets.length) }, worker));
  const now = Date.now();
  store.setServers(store.servers().map((s) => (s.id in out ? { ...s, ping: out[s.id], pingAt: now } : s)));
  changed();
  return out;
}

/* ---------------- Subscriptions ---------------- */
export function addSubscription(name: string, url: string): Subscription {
  if (!/^https?:\/\//i.test(url.trim())) throw new Error("Enter a valid http(s) subscription link.");
  const sub: Subscription = { id: `sub-${crypto.randomBytes(4).toString("hex")}`, name: name.trim() || "Subscription", url: url.trim() };
  store.setSubs([...store.subs(), sub]);
  return sub;
}

export function removeSubscription(id: string) {
  store.setSubs(store.subs().filter((s) => s.id !== id));
  store.setServers(store.servers().filter((s) => s.source !== id));
  ensureSelection();
  changed();
}

export async function refreshSubscriptions(id?: string): Promise<Subscription[]> {
  const subs = store.subs();
  for (const sub of subs.filter((s) => !id || s.id === id)) {
    try {
      const res = await fetch(sub.url, {
        headers: { "User-Agent": "v2rayN/7.0 VMEX" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const links = extractLinks(await res.text());
      if (!links.length) throw new Error("No servers found in this subscription");
      const r = replaceSource(sub.id, links);
      sub.count = r.added + r.skipped;
      sub.updatedAt = Date.now();
      sub.error = undefined;
      log("app", `Subscription "${sub.name}" updated: ${sub.count} servers`);
    } catch (e) {
      sub.error = (e as Error).message;
      log("app", `Subscription "${sub.name}" failed: ${sub.error}`, "warn");
    }
  }
  store.setSubs([...subs]);
  return store.subs();
}
