import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Server, Settings, Subscription } from "../shared/types";

export const DEFAULT_SETTINGS: Settings = {
  mode: "proxy",
  routing: "global",
  selectedId: null,
  apps: [],
  remoteDns: "1.1.1.1",
  autoConnect: false,
  startWithWindows: false,
  closeToTray: true,
  discordStatus: true,
  mixedPort: 10808,
  allowLan: false,
  allowInsecure: true, // like NetMod / v2rayN "allowInsecure"
};

interface Session {
  token?: string;
  name?: string;
  email?: string;
  syncedAt?: number;
}

interface Data {
  servers: Server[];
  subs: Subscription[];
  settings: Settings;
  session: Session;
}

export const dataDir = () => app.getPath("userData");
const file = () => path.join(dataDir(), "vmex-data.json");

let data: Data | null = null;
let timer: NodeJS.Timeout | null = null;

function load(): Data {
  if (data) return data;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<Data>;
    data = {
      servers: Array.isArray(raw.servers) ? raw.servers : [],
      subs: Array.isArray(raw.subs) ? raw.subs : [],
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
      session: raw.session ?? {},
    };
  } catch {
    data = { servers: [], subs: [], settings: { ...DEFAULT_SETTINGS }, session: {} };
  }
  return data;
}

function save() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 200);
}

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!data) return;
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file());
}

export const store = {
  servers: () => load().servers,
  setServers(list: Server[]) {
    load().servers = list;
    save();
  },
  subs: () => load().subs,
  setSubs(list: Subscription[]) {
    load().subs = list;
    save();
  },
  settings: () => load().settings,
  setSettings(patch: Partial<Settings>) {
    const d = load();
    d.settings = { ...d.settings, ...patch };
    save();
    return d.settings;
  },
  session: () => load().session,
  setSession(s: Session) {
    load().session = s;
    save();
  },
};
