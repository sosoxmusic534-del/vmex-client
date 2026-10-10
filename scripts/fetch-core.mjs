// Downloads the two engines VMEX uses into resources/core:
//   vmex-core.exe  = Xray-core  (talks to the V2Ray server: VLESS, VMess, Trojan, Shadowsocks)
//   vmex-tun.exe   = sing-box   (TUN for the whole PC + per-app routing + live speed stats)
// Run once on Windows:  npm run fetch-core
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.join(root, "resources", "core");
const SINGBOX_SERIES = process.env.SINGBOX_SERIES || "1.12."; // config format is written for 1.12.x
const headers = { "User-Agent": "vmex-fetch-core", Accept: "application/vnd.github+json" };

async function releases(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=40`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${repo}: ${res.status}`);
  return (await res.json()).filter((r) => !r.prerelease && !r.draft);
}

async function download(url, file) {
  process.stdout.write(`  downloading ${path.basename(file)} ... `);
  const res = await fetch(url, { headers: { "User-Agent": "vmex-fetch-core" } });
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
}

function unzip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let r = spawnSync("tar", ["-xf", zip, "-C", dest], { stdio: "inherit" });
  if (r.status !== 0 && process.platform === "win32") {
    r = spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -Path '${zip}' -DestinationPath '${dest}'`], { stdio: "inherit" });
  }
  if (r.status !== 0) throw new Error(`could not extract ${zip}`);
}

function find(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = find(p, name);
      if (hit) return hit;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) return p;
  }
  return null;
}

async function main() {
  fs.mkdirSync(coreDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vmex-core-"));

  // ---- Xray ----
  const xray = (await releases("XTLS/Xray-core"))[0];
  const xrayAsset = xray.assets.find((a) => a.name === "Xray-windows-64.zip");
  if (!xrayAsset) throw new Error("Xray-windows-64.zip not found in the latest release");
  console.log(`Xray ${xray.tag_name}`);
  const xrayZip = path.join(tmp, "xray.zip");
  await download(xrayAsset.browser_download_url, xrayZip);
  unzip(xrayZip, path.join(tmp, "xray"));
  fs.copyFileSync(find(path.join(tmp, "xray"), "xray.exe"), path.join(coreDir, "vmex-core.exe"));
  const xrayLicense = find(path.join(tmp, "xray"), "LICENSE");
  if (xrayLicense) fs.copyFileSync(xrayLicense, path.join(coreDir, "LICENSE-xray.txt"));

  // ---- sing-box ----
  const all = await releases("SagerNet/sing-box");
  const sb = all.find((r) => r.tag_name.replace(/^v/, "").startsWith(SINGBOX_SERIES)) || all[0];
  const sbAsset = sb.assets.find((a) => /windows-amd64\.zip$/.test(a.name) && !/legacy/.test(a.name));
  if (!sbAsset) throw new Error("sing-box windows-amd64 zip not found");
  console.log(`sing-box ${sb.tag_name}`);
  const sbZip = path.join(tmp, "sing-box.zip");
  await download(sbAsset.browser_download_url, sbZip);
  unzip(sbZip, path.join(tmp, "sb"));
  fs.copyFileSync(find(path.join(tmp, "sb"), "sing-box.exe"), path.join(coreDir, "vmex-tun.exe"));
  const sbLicense = find(path.join(tmp, "sb"), "LICENSE");
  if (sbLicense) fs.copyFileSync(sbLicense, path.join(coreDir, "LICENSE-sing-box.txt"));
  for (const extra of ["libcronet.dll"]) {
    const p = find(path.join(tmp, "sb"), extra);
    if (p) fs.copyFileSync(p, path.join(coreDir, extra));
  }

  fs.writeFileSync(
    path.join(coreDir, "versions.json"),
    JSON.stringify({ xray: xray.tag_name, singbox: sb.tag_name }, null, 2)
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nDone. Engines are in ${coreDir}`);
}

main().catch((e) => {
  console.error(`\nfetch-core failed: ${e.message}`);
  process.exit(1);
});
