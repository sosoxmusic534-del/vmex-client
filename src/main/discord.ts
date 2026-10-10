import { Client } from "@xhayper/discord-rpc";
import { BRAND } from "./brand";
import { log } from "./logs";

let client: Client | null = null;
let ready = false;
type Presence = { details: string; state?: string; start?: number };
let pending: Presence | null = null;

const configured = () => /^\d{15,}$/.test(BRAND.discordClientId);

async function ensure() {
  if (!configured()) return false;
  if (client && ready) return true;
  try {
    client?.destroy().catch(() => undefined);
    client = new Client({ clientId: BRAND.discordClientId, transport: { type: "ipc" } });
    client.on("ready", () => {
      ready = true;
      if (pending) void apply();
    });
    client.on("disconnected", () => {
      ready = false;
    });
    await client.login();
    return true;
  } catch {
    ready = false;
    client = null; // Discord not open — try again on the next update
    return false;
  }
}

async function apply() {
  if (!pending || !client?.user) return;
  try {
    await client.user.setActivity({
      details: pending.details.slice(0, 128),
      ...(pending.state ? { state: pending.state.slice(0, 128) } : {}),
      ...(pending.start ? { startTimestamp: pending.start } : {}),
      largeImageKey: BRAND.discordImageKey,
      largeImageText: `${BRAND.name} · Fast, private V2Ray`,
      buttons: [{ label: `Get ${BRAND.name}`, url: BRAND.site }],
    });
  } catch (e) {
    log("app", `Discord status failed: ${(e as Error).message}`, "warn");
  }
}

export async function showPresence(details: string, state?: string, start?: number) {
  pending = { details, state, start };
  if (await ensure()) await apply();
}

export async function clearPresence() {
  pending = null;
  try {
    await client?.user?.clearActivity();
  } catch {
    /* ignore */
  }
}

export async function stopPresence() {
  await clearPresence();
  try {
    await client?.destroy();
  } catch {
    /* ignore */
  }
  client = null;
  ready = false;
}
