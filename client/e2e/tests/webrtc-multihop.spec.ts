import { Browser, BrowserContext, Page, expect, test } from "@playwright/test";

interface PeerBrowser { context: BrowserContext; page: Page; errors: string[]; diagnostics: string[]; }
type HarnessStatus = ReturnType<NonNullable<Window["__p2pHarness"]>["status"]>;

const active: PeerBrowser[] = [];

test.afterEach(async () => {
    for (const peer of active.splice(0)) {
        if (!peer.page.isClosed() && peer.page.url().includes("webrtcHarness.html")) {
            await withTimeout(
                peer.page.evaluate(() => window.__p2pHarness?.shutdown()),
                5_000,
                "WebRTC harness shutdown"
            );
        }
        await withTimeout(peer.context.close(), 5_000, "Playwright browser context close");
    }
});

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)), timeoutMs);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function openPeer(browser: Browser, name: string, application = false): Promise<PeerBrowser> {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    const diagnostics: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", async message => {
        if (message.type() === "error") diagnostics.push(`console:${message.text()}`);
        if (message.text().startsWith("[WebRTC diagnostics]") || message.text().startsWith("[WebRTC signaling]")) {
            const args = await Promise.all(message.args().map(arg => arg.jsonValue().catch(() => null)));
            diagnostics.push(JSON.stringify(args));
        }
    });
    page.on("requestfailed", request => diagnostics.push(`request:${request.url()} ${request.failure()?.errorText}`));
    const peer = { context, page, errors, diagnostics };
    active.push(peer);
    const path = application ? "/" : "/e2e/webrtcHarness.html";
    await page.goto(`${path}?name=${encodeURIComponent(name)}&server=${encodeURIComponent("ws://127.0.0.1:8080")}`, { timeout: 20_000 });
    if (!application) {
        try {
            await page.waitForFunction(() => window.__p2pHarnessReady === true, undefined, { timeout: 15_000 });
        } catch {
            const body = await page.locator("body").innerHTML().catch(() => "<no body>");
            throw new Error(`Harness ${name} did not initialize. pageErrors=${errors.join(" | ")} diagnostics=${diagnostics.join(" | ")} body=${body}`);
        }
    }
    return peer;
}

async function peerId(peer: PeerBrowser): Promise<string> {
    return peer.page.evaluate(() => window.__p2pHarness!.peerId);
}

async function connect(from: PeerBrowser, to: PeerBrowser): Promise<void> {
    await from.page.evaluate(id => window.__p2pHarness!.connect(id), await peerId(to));
}

async function status(peer: PeerBrowser): Promise<HarnessStatus> {
    return peer.page.evaluate(() => window.__p2pHarness!.status());
}

test("real three-peer and four-peer WebRTC routing preserves ciphertext and identity", async ({ browser }) => {
    const [a, b, c] = await Promise.all([
        openPeer(browser, "webrtc-A"), openPeer(browser, "webrtc-B"),
        openPeer(browser, "webrtc-C")
    ]);
    const aId = await peerId(a), bId = await peerId(b), cId = await peerId(c);
    await connect(a, b);
    await connect(b, c);
    await expect.poll(async () => (await status(a)).peers.filter(item => item.open).map(item => item.peerId)).toEqual([bId]);
    await expect.poll(async () => (await status(c)).peers.filter(item => item.open).map(item => item.peerId)).toEqual([bId]);

    const message = "actual WebRTC A to B to C";
    const result = await a.page.evaluate(({ id, text }) => window.__p2pHarness!.send(id, text), { id: cId, text: message });
    expect(result.status).toBe("delivered");
    const cStatus = await status(c);
    expect(cStatus.received).toHaveLength(1);
    const received = cStatus.received[0];
    expect(received).toMatchObject({ senderId: aId, transportPeerId: bId, plaintext: message });
    const bCapture = (await status(b)).routePackets.find(item => item.peerId === aId && item.direction === "received")?.packet;
    const bForward = (await status(b)).routePackets.find(item => item.peerId === cId && item.direction === "sent")?.packet;
    expect(bCapture?.type).toBe("ROUTE_MESSAGE");
    expect(bForward?.encryptedPayload).toBe(bCapture?.encryptedPayload);
    expect(bForward?.hopProofs?.[0]?.nextPeerId).toBe(cId);
    expect((await status(a)).peers.some(item => item.peerId === cId && item.open)).toBe(false);
    expect((await status(a)).statuses.some(item => item.messageId === result.messageId && item.status === "delivered")).toBe(true);
    const diagnostics = await a.page.evaluate(() => window.__p2pHarness!.diagnostics());
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
        connectionState: "connected",
        iceConnectionState: "connected",
        dataChannelState: "open"
    });
    expect(diagnostics[0].selectedCandidatePair?.localCandidateType).toMatch(/host|srflx|relay/);
    expect(diagnostics[0].selectedCandidatePair?.remoteCandidateType).toMatch(/host|srflx|relay/);
    console.log("WebRTC selected candidate pair:", diagnostics[0].selectedCandidatePair);

    for (const peer of [a, b, c]) {
        expect(peer.errors).toEqual([]);
    }
});

test("real four-peer WebRTC forwarding uses both intermediate data channels", async ({ browser }) => {
    const a = await openPeer(browser, "four-A");
    const b = await openPeer(browser, "four-B");
    const c = await openPeer(browser, "four-C");
    const d = await openPeer(browser, "four-D");
    const aId = await peerId(a), bId = await peerId(b), cId = await peerId(c), dId = await peerId(d);
    await connect(a, b);
    await connect(b, c);
    await connect(c, d);
    const message = "actual WebRTC A to B to C to D";
    const result = await a.page.evaluate(({ id, text }) => window.__p2pHarness!.send(id, text), { id: dId, text: message });
    expect(result.status).toBe("delivered");
    const dStatus = await withTimeout(status(d), 5_000, "read four-peer destination state after acknowledgement");
    expect(dStatus.received).toHaveLength(1);
    expect(dStatus.received[0]).toMatchObject({ senderId: aId, transportPeerId: cId, plaintext: message });
    const bStatus = await withTimeout(status(b), 5_000, "read relay B channel capture");
    const cStatus = await withTimeout(status(c), 5_000, "read relay C channel capture");
    const aStatus = await withTimeout(status(a), 5_000, "read origin direct-link state");
    expect(bStatus.routePackets.some(item => item.direction === "sent" && item.peerId === cId)).toBe(true);
    expect(cStatus.routePackets.some(item => item.direction === "sent" && item.peerId === dId)).toBe(true);
    expect(aStatus.peers.some(item => item.peerId === dId && item.open)).toBe(false);
    for (const peer of [a, b, c, d]) expect(peer.errors).toEqual([]);
});

test("real WebRTC duplicate paths deliver once and reject exhausted-hop forwarding", async ({ browser }) => {
    const [a, b, c, d] = await Promise.all([
        openPeer(browser, "diamond-A"), openPeer(browser, "diamond-B"),
        openPeer(browser, "diamond-C"), openPeer(browser, "diamond-D")
    ]);
    const aId = await peerId(a), bId = await peerId(b), cId = await peerId(c), dId = await peerId(d);
    await connect(a, b); await connect(a, d); await connect(b, c); await connect(d, c);
    const result = await a.page.evaluate(id => window.__p2pHarness!.send(id, "multi-path duplicate"), cId);
    expect(result.status).toBe("delivered");
    await expect.poll(async () => (await status(c)).received.length).toBe(1);
    const aPackets = (await status(a)).routePackets;
    const firstHop = aPackets.find(item => item.direction === "sent" && item.packet?.type === "ROUTE_MESSAGE")?.peerId;
    const alternate = firstHop === bId ? dId : bId;
    const original = aPackets.find(item => item.direction === "sent" && item.packet?.type === "ROUTE_MESSAGE")?.packet;
    expect(original).toBeTruthy();
    await a.page.evaluate(({ peer, packet }) => window.__p2pHarness!.replayRoute(peer, packet), { peer: alternate, packet: original });
    await expect.poll(async () => (await status(c)).routePackets.filter(item => item.peerId === bId || item.peerId === dId).length).toBeGreaterThan(1);
    await expect.poll(async () => (await status(c)).received.length).toBe(1);

    // A hop budget of one allows A to reach its relay but not the next relay/destination.
    const bounded = await a.page.evaluate(id => window.__p2pHarness!.send(id, "bounded route", 1), cId);
    expect(bounded.status).toBe("hop_limit_exceeded");
});

test("real channel loss produces explicit routing failures and a closed relay tab times out", async ({ browser }) => {
    const [a, b, c] = await Promise.all([
        openPeer(browser, "failure-A"), openPeer(browser, "failure-B"), openPeer(browser, "failure-C")
    ]);
    const aId = await peerId(a), bId = await peerId(b), cId = await peerId(c);
    await connect(a, b); await connect(b, c);

    await b.page.evaluate(({ from, next }) => window.__p2pHarness!.installDisconnectOnRoute(from, next), { from: aId, next: cId });
    const duringForward = await a.page.evaluate(id => window.__p2pHarness!.send(id, "relay link drops"), cId);
    expect(duringForward.status).toBe("unreachable");

    // Use a fresh topology because the preceding link was intentionally closed.
    const [a2, b2, c2] = await Promise.all([
        openPeer(browser, "closure-A"), openPeer(browser, "closure-B"), openPeer(browser, "closure-C")
    ]);
    const b2Id = await peerId(b2), c2Id = await peerId(c2);
    await connect(a2, b2);
    await connect(b2, c2);
    await b2.context.close();
    await expect.poll(async () => (await status(a2)).peers.find(item => item.peerId === b2Id)?.open ?? false).toBe(false);
    const closedRelayResult = await a2.page.evaluate(id => window.__p2pHarness!.send(id, "relay tab closed", 8), c2Id);
    expect(closedRelayResult.status).toBe("unreachable");
    expect((await status(a2)).statuses.some(item => item.messageId === closedRelayResult.messageId && item.status === "unreachable")).toBe(true);
    expect(a2.errors).toEqual([]);
});

test("application UI direct-chat regression uses independent browser identities and real WebRTC", async ({ browser }) => {
    const [a, b] = await Promise.all([
        openPeer(browser, "ui-direct-A", true), openPeer(browser, "ui-direct-B", true)
    ]);
    for (const peer of [a, b]) {
        await peer.page.locator("#me").fill(peer === a ? "ui-direct-A" : "ui-direct-B");
        await peer.page.locator("#loginBtn").click();
        await expect(peer.page.locator("#loginSuccessMessage")).toContainText("Login successful");
    }
    await expect.poll(async () => a.page.locator("#userList option").count()).toBe(1);
    await expect.poll(async () => b.page.locator("#userList option").count()).toBe(1);
    await a.page.locator("#userList").selectOption({ index: 0 });
    await a.page.locator("#connectSelected").click();
    try {
        await expect.poll(async () => a.page.locator("#connectedPeers li").count()).toBe(1);
    } catch (error) {
        throw new Error(`App UI connection did not open. A diagnostics=${a.diagnostics.join(" | ")} B diagnostics=${b.diagnostics.join(" | ")} cause=${String(error)}`);
    }
    await a.page.locator("#msg").fill("real application UI direct message");
    await a.page.locator("#sendBtn").click();
    await expect(a.page.locator("#chatWindow")).toContainText("Me (delivered): real application UI direct message");
    await expect(b.page.locator("#chatWindow")).toContainText("ui-direct-A: real application UI direct message");
    await expect(b.page.locator("#chatWindow div")).toHaveCount(1);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
});
