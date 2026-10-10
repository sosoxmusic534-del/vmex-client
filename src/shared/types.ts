/* Types shared by the main process, preload and the UI. */

export type Protocol = "vless" | "vmess" | "trojan" | "shadowsocks";

export interface Server {
  id: string;
  name: string;
  protocol: Protocol;
  address: string;
  port: number;
  /** Original share link (vless://, vmess://, trojan://, ss://) */
  link: string;
  /** "manual", "vmex" or a subscription id */
  source: string;
  /** Short transport label for the UI, e.g. "WS · TLS" */
  transport: string;
  addedAt: number;
  ping?: number | null;
  pingAt?: number;
}

export interface Subscription {
  id: string;
  name: string;
  url: string;
  updatedAt?: number;
  count?: number;
  error?: string;
}

/** proxy = system proxy (no admin) · tun = whole PC · apps = only chosen apps (Netch style) */
export type Mode = "proxy" | "tun" | "apps";
export type Routing = "global" | "smart" | "bypass-lan";

export interface Settings {
  mode: Mode;
  routing: Routing;
  selectedId: string | null;
  apps: string[];
  remoteDns: string;
  autoConnect: boolean;
  startWithWindows: boolean;
  closeToTray: boolean;
  discordStatus: boolean;
  mixedPort: number;
  allowLan: boolean;
  /** Accept servers whose TLS certificate is wrong or self-signed (like NetMod does) */
  allowInsecure: boolean;
}

export type ConnState = "idle" | "connecting" | "connected" | "disconnecting" | "error";

export interface Status {
  state: ConnState;
  mode: Mode;
  serverId: string | null;
  serverName: string | null;
  since: number | null;
  error: string | null;
  isAdmin: boolean;
}

export interface Traffic {
  up: number;
  down: number;
  totalUp: number;
  totalDown: number;
}

export interface LogLine {
  t: number;
  src: "core" | "tun" | "app";
  level: "info" | "warn" | "error";
  text: string;
}

export interface ImportResult {
  added: number;
  skipped: number;
  errors: string[];
}

export interface VmexPlan {
  id: number;
  name: string;
  planName: string | null;
  status: string;
  usedBytes: number;
  totalBytes: number;
  expiresAt: number | null;
}

export interface Account {
  loggedIn: boolean;
  name?: string;
  email?: string;
  plans?: VmexPlan[];
  syncedAt?: number;
}

export interface LoginResult {
  ok: boolean;
  otpRequired?: boolean;
  challengeId?: string;
  email?: string;
  error?: string;
}

export interface ProcessInfo {
  name: string;
  count: number;
}

export interface AppInfo {
  version: string;
  cores: { xray: string | null; singbox: string | null; ready: boolean };
  dataDir: string;
  site: string;
}

/** API exposed to the UI by the preload script (window.vmex). */
export interface VmexApi {
  app: {
    info(): Promise<AppInfo>;
    minimize(): void;
    maximize(): void;
    close(): void;
    openExternal(url: string): void;
    openDataDir(): void;
  };
  servers: {
    list(): Promise<Server[]>;
    import(text: string): Promise<ImportResult>;
    remove(ids: string[]): Promise<void>;
    rename(id: string, name: string): Promise<void>;
    select(id: string): Promise<void>;
    ping(ids?: string[]): Promise<Record<string, number | null>>;
  };
  subs: {
    list(): Promise<Subscription[]>;
    add(name: string, url: string): Promise<Subscription>;
    remove(id: string): Promise<void>;
    refresh(id?: string): Promise<Subscription[]>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
  vpn: {
    connect(): Promise<Status>;
    disconnect(): Promise<Status>;
    status(): Promise<Status>;
    relaunchAsAdmin(): Promise<void>;
  };
  system: {
    processes(): Promise<ProcessInfo[]>;
    pickExe(): Promise<string | null>;
  };
  account: {
    get(): Promise<Account>;
    login(email: string, password: string): Promise<LoginResult>;
    verify(challengeId: string, code: string): Promise<LoginResult>;
    resend(challengeId: string): Promise<LoginResult>;
    sync(): Promise<Account>;
    logout(): Promise<Account>;
  };
  logs: {
    list(): Promise<LogLine[]>;
    clear(): Promise<void>;
  };
  on: {
    status(cb: (s: Status) => void): () => void;
    traffic(cb: (t: Traffic) => void): () => void;
    log(cb: (l: LogLine) => void): () => void;
    servers(cb: (s: Server[]) => void): () => void;
    navigate(cb: (page: string) => void): () => void;
  };
}
