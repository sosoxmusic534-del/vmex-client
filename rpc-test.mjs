import { Client } from "@xhayper/discord-rpc";

const c = new Client({ clientId: "1557445122776502302" });
c.on("ready", async () => {
  console.log("Connected as:", c.user?.username);
  await c.user?.setActivity({ details: "Testing", state: "VMEX", startTimestamp: Date.now(), largeImageKey: "vmex" });
  console.log("Activity set. Check your Discord profile. Ctrl+C to stop.");
});
c.login().catch((e) => console.error("Failed:", e.message));