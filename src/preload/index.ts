import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { VmexApi } from "../shared/types";

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

function listen<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const handler = (_e: IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

const api: VmexApi = {
  app: {
    info: () => invoke("app:info"),
    minimize: () => ipcRenderer.send("app:minimize"),
    maximize: () => ipcRenderer.send("app:maximize"),
    close: () => ipcRenderer.send("app:close"),
    openExternal: (url) => ipcRenderer.send("app:openExternal", url),
    openDataDir: () => ipcRenderer.send("app:openDataDir"),
  },
  servers: {
    list: () => invoke("servers:list"),
    import: (text) => invoke("servers:import", text),
    remove: (ids) => invoke("servers:remove", ids),
    rename: (id, name) => invoke("servers:rename", id, name),
    select: (id) => invoke("servers:select", id),
    ping: (ids) => invoke("servers:ping", ids),
  },
  subs: {
    list: () => invoke("subs:list"),
    add: (name, url) => invoke("subs:add", name, url),
    remove: (id) => invoke("subs:remove", id),
    refresh: (id) => invoke("subs:refresh", id),
  },
  settings: {
    get: () => invoke("settings:get"),
    set: (patch) => invoke("settings:set", patch),
  },
  vpn: {
    connect: () => invoke("vpn:connect"),
    disconnect: () => invoke("vpn:disconnect"),
    status: () => invoke("vpn:status"),
    relaunchAsAdmin: () => invoke("vpn:relaunchAsAdmin"),
  },
  system: {
    processes: () => invoke("system:processes"),
    pickExe: () => invoke("system:pickExe"),
  },
  account: {
    get: () => invoke("account:get"),
    login: (email, password) => invoke("account:login", email, password),
    verify: (challengeId, code) => invoke("account:verify", challengeId, code),
    resend: (challengeId) => invoke("account:resend", challengeId),
    sync: () => invoke("account:sync"),
    logout: () => invoke("account:logout"),
  },
  logs: {
    list: () => invoke("logs:list"),
    clear: () => invoke("logs:clear"),
  },
  on: {
    status: listen("status"),
    traffic: listen("traffic"),
    log: listen("log"),
    servers: listen("servers"),
    navigate: listen("navigate"),
  },
};

contextBridge.exposeInMainWorld("vmex", api);
