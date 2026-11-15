#!/usr/bin/env node
// Capture genuine browser WebGL frames after the game verifies its own scene pixels.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = resolve(fileURLToPath(new URL('../game/', import.meta.url)));
const shots = ['briefing', 'buy', 'live'];
const output = resolve(process.argv[2] || join(root, '../screenshots'));
const chromePath = process.env.CHROME_BIN || [
  '/opt/chrome-for-testing/chrome-linux64/chrome',
  '/root/.hermes/tools/chromium-1208/chrome-linux64/chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(Boolean);
if (!chromePath || !existsSync(chromePath)) throw new Error('Chrome not found; set CHROME_BIN to a desktop Chrome executable');
const profile = await mkdtemp(join(tmpdir(), 'neon-breach-chrome-'));
const staging = await mkdtemp(join(tmpdir(), 'neon-breach-captures-'));
let browser, server;

function send(ws, id, method, params = {}) {
  ws.send(JSON.stringify({ id, method, params }));
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let next = 0;
  const waiting = new Map();
  ws.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    if (!packet.id) return;
    const callback = waiting.get(packet.id);
    if (!callback) return;
    waiting.delete(packet.id);
    packet.error ? callback.reject(new Error(packet.error.message)) : callback.resolve(packet.result);
  });
  return { ws, command(method, params) {
    const id = ++next;
    return new Promise((resolveCommand, reject) => {
      waiting.set(id, { resolve: resolveCommand, reject });
      send(ws, id, method, params);
    });
  } };
}
async function waitFor(predicate, label, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function imageFacts(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Chrome did not return a JPEG');
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) continue;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++], length = bytes.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error('JPEG dimensions are missing');
}

try {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(`${root}/`)) throw new Error('path outside game/');
      const data = await readFile(file);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': `${mime}; charset=utf-8`, 'cache-control': 'no-store' });
      response.end(data);
    } catch { response.writeHead(404).end('not found'); }
  });
  await new Promise((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  browser = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
    '--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1200,675', 'about:blank',
  ], { stdio: 'ignore' });
  const activePort = join(profile, 'DevToolsActivePort');
  const endpoint = await waitFor(async () => {
    try { return (await readFile(activePort, 'utf8')).trim().split('\n')[0]; } catch { return null; }
  }, 'Chrome DevTools startup');
  const targets = await fetch(`http://127.0.0.1:${endpoint}/json`).then(response => response.json());
  const page = await connect(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  page.ws.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    if (packet.method === 'Runtime.exceptionThrown') console.error('Browser exception:', packet.params.exceptionDetails.text);
    if (packet.method === 'Log.entryAdded' && packet.params.entry.level === 'error') console.error('Browser log:', packet.params.entry.text);
  });
  await page.command('Page.enable');
  await page.command('Runtime.enable');
  await page.command('Log.enable');
  await page.command('Emulation.setDeviceMetricsOverride', { width: 1200, height: 675, deviceScaleFactor: 1, mobile: false });
  for (const shot of shots) {
    await page.command('Page.navigate', { url: `http://127.0.0.1:${port}/?shot=${shot}` });
    const readiness = await waitFor(async () => {
      const result = await page.command('Runtime.evaluate', { expression: 'window.__renderStatus && ({ ...window.__renderStatus, audit: window.__gameAudit?.() })', returnByValue: true });
      return result.result.value?.ready ? result.result.value : null;
    }, `${shot} WebGL render and pixel diversity`);
    const expectedPhase = { briefing: 'briefing', buy: 'buy', live: 'live' }[shot];
    if (readiness.audit?.phase !== expectedPhase || readiness.audit.result || readiness.audit.blue || readiness.audit.red) {
      throw new Error(`${shot}: capture entered an unexpected match state: ${JSON.stringify(readiness.audit)}`);
    }
    if (!readiness.pixels?.visible || readiness.triangles < 1 || readiness.calls < 1) throw new Error(`${shot}: no scene pixels: ${JSON.stringify(readiness)}`);
    let jpg, facts;
    for (const quality of [95, 90, 85, 80]) {
      const screenshot = await page.command('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false, fromSurface: true });
      jpg = Buffer.from(screenshot.data, 'base64');
      facts = imageFacts(jpg);
      if (jpg.length <= 262144) break;
    }
    if (facts.width < 480 || facts.height < 480 || Math.max(facts.width, facts.height) > 1280) throw new Error(`${shot}: invalid dimensions ${facts.width}x${facts.height}`);
    const file = join(staging, `${shot}.jpg`);
    await writeFile(file, jpg);
    console.log(`${file}: ${facts.width}x${facts.height}, ${jpg.length} bytes, ${readiness.pixels.colors} scene colors, ${readiness.triangles} triangles`);
  }
  await mkdir(output, { recursive: true });
  // Replace the three managed captures only after every browser render passes validation.
  for (const shot of shots) {
    for (const extension of ['jpg', 'png']) {
      const stale = join(output, `${shot}.${extension}`);
      try { await rm(stale); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await rename(join(staging, `${shot}.jpg`), join(output, `${shot}.jpg`));
  }
  for (const old of await readdir(output)) {
    if (['briefing', 'buy', 'live'].includes(old.replace(/\.(?:png|jpe?g)$/i, '')) && /\.(?:png|jpe?g)$/i.test(old)) continue;
    if (/^(?:1-start|2-play|3-end)\.(?:png|jpe?g)$/i.test(old)) await rm(join(output, old));
  }
  page.ws.close();
} finally {
  if (browser && browser.exitCode === null) browser.kill('SIGTERM');
  if (server?.listening) await new Promise(resolveClose => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true });
  await rm(staging, { recursive: true, force: true });
}
