# VMEX Desktop

A Windows VPN client for VMEX, in the style of Netch:

- **Any V2Ray config, no login needed.** Paste `vless://`, `vmess://`, `trojan://` or `ss://` links, or add a subscription URL.
- **Optional VMEX login.** Sign in and your plans and configs appear automatically, with data used and days left.
- **Three modes:**
  - **Proxy**: sets the Windows system proxy. Browsers and most apps. No admin needed.
  - **Whole PC**: a TUN adapter, so every app and game goes through VMEX (TCP and UDP). Needs admin.
  - **Apps only**: like Netch's process mode. Only the programs you pick (games, Discord...) use VMEX; everything else stays direct. Needs admin.
- **Smart routing**: keeps Sri Lankan `.lk` sites and your local network direct.
- **Live speed chart**, ping test, session data, tray icon, auto-connect, start with Windows.
- **Discord status**: shows "Playing VMEX" while connected.

## How it works

```
Your apps ──► sing-box (vmex-tun.exe) ──► Xray (vmex-core.exe) ──► V2Ray server
              system proxy / TUN / per-app       VLESS · VMess · Trojan · SS
              routing, DNS, live stats           Reality · WS · gRPC · XHTTP
```

- **Xray** does the encrypted connection, so every 3x-ui config works (including XHTTP and TCP-HTTP header tricks).
- **sing-box** provides the system proxy port or the TUN adapter, per-app rules and the live speed numbers.

## Project layout

```
src/
  main/        Electron main process (engines, tray, IPC)
    core.ts       starts/stops the two engines, live traffic
    config.ts     builds the Xray + sing-box configs
    links.ts      parses share links and subscriptions
    servers.ts    server list, subscriptions, ping
    account.ts    optional VMEX login + config sync
    system.ts     admin check, system proxy, process list
    discord.ts    "Playing VMEX" Discord status
    brand.ts      site URL, Discord app ID  <- edit this
  preload/     safe bridge between UI and main process
  renderer/    React UI (pages, components, styles)
  shared/      types used by both sides
scripts/fetch-core.mjs   downloads Xray + sing-box
resources/               app icon + engines (core/)
```

## Set up (Windows)

Needs **Node.js 20+** (nodejs.org).

```powershell
cd vmex-client
npm install
npm run fetch-core      # downloads Xray + sing-box into resources\core
npm run dev             # opens the app with live reload
```

Before building, edit `src/main/brand.ts`:

- `site`: your VMEX website.
- `discordClientId`: your Discord Application ID (for "Playing VMEX").

## Build the installer

```powershell
npm run dist
```

You get, in `release\`:

- `VMEX-1.0.0-x64.exe`: the installer.
- `VMEX-Portable-1.0.0.exe`: a single portable exe.

Test **Whole PC** and **Apps only** mode by right-clicking VMEX and choosing **Run as administrator**, or use the **Restart as admin** button in the app.

## Notes

- **Data is saved in** `%APPDATA%\VMEX\vmex-data.json` (servers, settings, login session; no passwords).
- **Logs** are in the app's Logs page. Copy them when asking for support.
- **If the internet stops after a crash,** open VMEX once (it turns the proxy off automatically), or switch off **Windows Settings → Network → Proxy**.
- **Licences:** Xray-core is MPL-2.0 and sing-box is GPL-3.0. Their licence files are shipped in `resources/core`. If you redistribute sing-box, link to its source code (github.com/SagerNet/sing-box) on your download page.
