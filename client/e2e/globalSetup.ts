import { spawn, ChildProcess } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const stateFile = join(tmpdir(), `torrent-p2p-playwright-${process.pid}.json`);
const children: ChildProcess[] = [];

export default async function globalSetup(): Promise<void> {
    const serverDir = resolve(process.cwd(), "../server");
    children.push(spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "test-browser-services.ts"], {
        cwd: serverDir, stdio: "ignore", windowsHide: true,
        env: { ...process.env, RATE_LIMIT_ENABLED: "false" }
    }));
    children.push(spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
        cwd: process.cwd(), stdio: "ignore", windowsHide: true
    }));
    await writeFile(stateFile, JSON.stringify(children.map(child => child.pid).filter((pid): pid is number => !!pid)));

    try {
        await Promise.all([
            waitForUrl("http://127.0.0.1:8081/health", children[0]),
            waitForUrl("http://127.0.0.1:5173", children[1])
        ]);
    } catch (error) {
        for (const child of children) child.kill();
        throw error;
    }
}

async function waitForUrl(url: string, child: ChildProcess): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Service exited before becoming ready: ${url} (code ${child.exitCode})`);
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(500) });
            if (response.ok) return;
        } catch { /* Continue polling until the bounded startup deadline. */ }
        await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    }
    throw new Error(`Service did not become ready within 30 seconds: ${url}`);
}
