import { create } from "zustand";
import type {
  Account, AppInfo, LogLine, Server, Settings, Status, Subscription, Traffic,
} from "../../../shared/types";
import { errText } from "./format";

export type Page = "home" | "servers" | "apps" | "account" | "logs" | "settings";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "bad";
}

const HISTORY = 60;
const empty = () => Array.from({ length: HISTORY }, () => 0);

interface State {
  ready: boolean;
  page: Page;
  info: AppInfo | null;
  status: Status;
  traffic: Traffic;
  downHistory: number[];
  upHistory: number[];
  servers: Server[];
  subs: Subscription[];
  settings: Settings | null;
  account: Account;
  logs: LogLine[];
  toasts: Toast[];
  busy: boolean;

  init(): Promise<void>;
  go(page: Page): void;
  toast(text: string, tone?: Toast["tone"]): void;
  dismiss(id: number): void;
  toggle(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<void>;
  select(id: string): Promise<void>;
  refreshServers(): Promise<void>;
  refreshSubs(): Promise<void>;
  setAccount(a: Account): void;
}

let toastId = 0;
let started = false; // React StrictMode runs effects twice in dev; listeners must be added once

export const useApp = create<State>((set, get) => ({
  ready: false,
  page: "home",
  info: null,
  status: { state: "idle", mode: "proxy", serverId: null, serverName: null, since: null, error: null, isAdmin: false },
  traffic: { up: 0, down: 0, totalUp: 0, totalDown: 0 },
  downHistory: empty(),
  upHistory: empty(),
  servers: [],
  subs: [],
  settings: null,
  account: { loggedIn: false },
  logs: [],
  toasts: [],
  busy: false,

  async init() {
    if (started) return;
    started = true;
    const api = window.vmex;
    const [info, status, servers, subs, settings, account, logs] = await Promise.all([
      api.app.info(), api.vpn.status(), api.servers.list(), api.subs.list(),
      api.settings.get(), api.account.get(), api.logs.list(),
    ]);
    set({ info, status, servers, subs, settings, account, logs, ready: true });

    api.on.status((s) => {
      const prev = get().status;
      set({ status: s });
      if (s.error && s.error !== prev.error && (s.state === "error" || s.state === "connected")) get().toast(s.error, "bad");
      if (s.state === "connected" && prev.state !== "connected") {
        set({ downHistory: empty(), upHistory: empty() });
      }
    });
    api.on.traffic((t) => {
      const { downHistory, upHistory } = get();
      set({
        traffic: t,
        downHistory: [...downHistory.slice(1), t.down],
        upHistory: [...upHistory.slice(1), t.up],
      });
    });
    api.on.log((l) => set({ logs: [...get().logs.slice(-599), l] }));
    api.on.servers((list) => set({ servers: list }));
    api.on.navigate((p) => set({ page: p as Page }));
  },

  go: (page) => set({ page }),

  toast(text, tone = "info") {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  async toggle() {
    const s = get().status.state;
    if (s === "connected") return get().disconnect();
    if (s === "idle" || s === "error") return get().connect();
  },

  async connect() {
    set({ busy: true });
    try {
      await window.vmex.vpn.connect();
    } catch (e) {
      get().toast(errText(e), "bad");
    } finally {
      set({ busy: false });
    }
  },

  async disconnect() {
    set({ busy: true });
    try {
      await window.vmex.vpn.disconnect();
    } finally {
      set({ busy: false });
    }
  },

  async setSettings(patch) {
    const settings = await window.vmex.settings.set(patch);
    set({ settings });
  },

  async select(id) {
    set({ settings: { ...get().settings!, selectedId: id } });
    try {
      await window.vmex.servers.select(id);
    } catch (e) {
      get().toast(errText(e), "bad");
    }
  },

  async refreshServers() {
    set({ servers: await window.vmex.servers.list() });
  },
  async refreshSubs() {
    set({ subs: await window.vmex.subs.list() });
  },
  setAccount: (account) => set({ account }),
}));

export const selectedServer = (s: State) => s.servers.find((x) => x.id === s.settings?.selectedId) ?? null;
