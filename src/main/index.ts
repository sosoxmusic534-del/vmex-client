import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import path from "node:path";
import type { Settings, Status } from "../shared/types";
import * as account from "./account";
import { BRAND } from "./brand";
import { coreDir, coreVersions, engine } from "./core";
import { clearPresence, showPresence, stopPresence } from "./discord";
import { clearLogs, listLogs, log, logEvents } from "./logs";
import {
  addSubscription, ensureSelection, importText, pingServers, refreshSubscriptions,
  removeServers, removeSubscription, renameServer, serverEvents,
} from "./servers";
import { dataDir, flush, store } from "./store";
import { clearStaleProxy, isAdmin, listProcesses, relaunchAsAdmin } from "./system";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

const iconPath = () =>
  app.isPackaged ? path.join(process.resourcesPath, "icon.png") : path.join(app.getAppPath(), "resources", "icon.png");

function send(channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function showWindow(page?: string) {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (page) send("navigate", page);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 660,
    frame: false,
    show: false,
    backgroundColor: "#05070d",
    icon: iconPath(),
    title: BRAND.name,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => {
    if (!process.argv.includes("--hidden")) win?.show();
  });

  win.on("close", (e) => {
    if (!quitting && store.settings().closeToTray) {
      e.preventDefault();
      win?.hide();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

/* ---------------- Tray ---------------- */
function updateTray(status: Status = engine.status) {
  if (!tray) return;
  const connected = status.state === "connected";
  tray.setToolTip(connected ? `${BRAND.name} · Connected to ${status.serverName}` : `${BRAND.name} · Not connected`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: connected ? `Connected · ${status.serverName}` : "Not connected", enabled: false },
      { type: "separator" },
      connected
        ? { label: "Disconnect", click: () => void engine.stop() }
        : { label: "Connect", click: () => void connect().catch(() => undefined) },
      { label: `Open ${BRAND.name}`, click: () => showWindow() },
      { type: "separator" },
      { label: "Quit", click: () => quit() },
    ])
  );
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath());
  tray = new Tray(img.isEmpty() ? img : img.resize({ width: 16, height: 16 }));
  tray.on("click", () => showWindow());
  updateTray();
}

function updateDiscordStatus(s: Status = engine.status) {
  const settings = store.settings();
  if (!settings.discordStatus) {
    void clearPresence();
    return;
  }

  if (s.state === "connected" && s.since) {
    const modeLabel = s.mode === "proxy" ? "Proxy" : s.mode === "tun" ? "Whole PC" : "App mode";
    void showPresence(`Connected to ${BRAND.name} V2Ray`, `${s.serverName ?? "Server"} · ${modeLabel}`, s.since);
    return;
  }

  void showPresence("Idle");
}

/* ---------------- Connect ---------------- */
async function connect(): Promise<Status> {
  const settings = store.settings();
  ensureSelection();
  const server = store.servers().find((s) => s.id === store.settings().selectedId);
  if (!server) throw new Error("Add or import a server first.");
  if (!coreVersions().ready) throw new Error(`Xray (vmex-core.exe) is missing in ${coreDir()}. Run "npm run fetch-core" or reinstall VMEX.`);
  return engine.start(server, settings);
}

engine.on("status", (s: Status) => {
  send("status", s);
  updateTray(s);
  updateDiscordStatus(s);
});
engine.on("traffic", (t) => send("traffic", t));
engine.on("delay", ({ serverId, ms }: { serverId: string; ms: number }) => {
  store.setServers(store.servers().map((s) => (s.id === serverId ? { ...s, ping: ms, pingAt: Date.now() } : s)));
  send("servers", store.servers());
});
logEvents.on("line", (l) => send("log", l));
serverEvents.on("changed", (list) => send("servers", list));

/* ---------------- IPC ---------------- */
function handle<T>(channel: string, fn: (...args: any[]) => T | Promise<T>) {
  ipcMain.handle(channel, (_e, ...args) => fn(...args));
}

function registerIpc() {
  handle("app:info", () => ({ version: app.getVersion(), cores: coreVersions(), dataDir: dataDir(), site: BRAND.site }));
  ipcMain.on("app:minimize", () => win?.minimize());
  ipcMain.on("app:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on("app:close", () => win?.close());
  ipcMain.on("app:openExternal", (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  ipcMain.on("app:openDataDir", () => void shell.openPath(dataDir()));

  handle("servers:list", () => store.servers());
  handle("servers:import", (text: string) => importText(String(text ?? "")));
  handle("servers:remove", (ids: string[]) => removeServers(ids));
  handle("servers:rename", (id: string, name: string) => renameServer(id, name));
  handle("servers:select", async (id: string) => {
    store.setSettings({ selectedId: id });
    if (engine.status.state === "connected") await connect();
  });
  handle("servers:ping", (ids?: string[]) => pingServers(ids));

  handle("subs:list", () => store.subs());
  handle("subs:add", async (name: string, url: string) => {
    const sub = addSubscription(name, url);
    await refreshSubscriptions(sub.id);
    return store.subs().find((s) => s.id === sub.id);
  });
  handle("subs:remove", (id: string) => removeSubscription(id));
  handle("subs:refresh", (id?: string) => refreshSubscriptions(id));

  handle("settings:get", () => store.settings());
  handle("settings:set", (patch: Partial<Settings>) => {
    const next = store.setSettings(patch);
    if ("startWithWindows" in patch) {
      app.setLoginItemSettings({ openAtLogin: next.startWithWindows, args: ["--hidden"] });
    }
    if ("discordStatus" in patch) {
      if (next.discordStatus) {
        void updateDiscordStatus();
      } else {
        void clearPresence();
      }
    }
    return next;
  });

  handle("vpn:connect", connect);
  handle("vpn:disconnect", () => engine.stop());
  handle("vpn:status", () => ({ ...engine.status, isAdmin: isAdmin() }));
  handle("vpn:relaunchAsAdmin", async () => {
    await engine.stop();
    if (await relaunchAsAdmin()) quit();
  });

  handle("system:processes", listProcesses);
  handle("system:pickExe", async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: "Choose an app",
      filters: [{ name: "Programs", extensions: ["exe"] }],
      properties: ["openFile"],
    });
    return r.canceled || !r.filePaths[0] ? null : path.basename(r.filePaths[0]);
  });

  handle("account:get", account.getAccount);
  handle("account:login", account.login);
  handle("account:verify", account.verify);
  handle("account:resend", account.resend);
  handle("account:sync", account.sync);
  handle("account:logout", account.logout);

  handle("logs:list", listLogs);
  handle("logs:clear", clearLogs);
}

/* ---------------- Lifecycle ---------------- */
async function quit() {
  quitting = true;
  await engine.stop().catch(() => undefined);
  await stopPresence();
  flush();
  tray?.destroy();
  app.exit(0);
}

app.on("before-quit", (e) => {
  if (!quitting) {
    e.preventDefault();
    void quit();
  }
});

process.on("exit", () => engine.killNow());

app.whenReady().then(async () => {
  app.setAppUserModelId("net.vmex.client");
  registerIpc();
  createWindow();
  createTray();

  if (store.settings().discordStatus) void showPresence("Idle");

  await clearStaleProxy(store.settings().mixedPort);
  log("app", `${BRAND.name} ${app.getVersion()} started${isAdmin() ? " (administrator)" : ""}`);
  log("app", `Engines: ${coreDir()}`);

  if (account.getAccount().loggedIn) void account.sync().catch(() => undefined);
  if (store.subs().length) void refreshSubscriptions().catch(() => undefined);

  if (store.settings().autoConnect) {
    setTimeout(() => void connect().catch((e) => log("app", `Auto-connect failed: ${e.message}`, "warn")), 1500);
  }
});

app.on("window-all-closed", () => {
  /* keep running in the tray */
});
