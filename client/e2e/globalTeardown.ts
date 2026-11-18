import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default async function globalTeardown(): Promise<void> {
    const stateFile = join(tmpdir(), `torrent-p2p-playwright-${process.pid}.json`);
    let processIds: number[] = [];
    try { processIds = JSON.parse(await readFile(stateFile, "utf8")) as number[]; }
    catch { return; }
    try {
        for (const processId of processIds) {
            try { process.kill(processId, "SIGTERM"); } catch { /* Already stopped. */ }
        }
        await Promise.race([
            Promise.all(processIds.map(waitForExit)),
            new Promise<void>(resolve => setTimeout(resolve, 5_000))
        ]);
        for (const processId of processIds) {
            try { process.kill(processId, "SIGKILL"); } catch { /* Already stopped. */ }
        }
    } finally {
        await unlink(stateFile).catch(() => undefined);
    }
}

async function waitForExit(processId: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        try { process.kill(processId, 0); } catch { return; }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}
