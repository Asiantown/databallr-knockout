// Tripo text-to-3D asset generator. BUILD-TIME ONLY — never bundled, never
// shipped. Reads TRIPO_API_KEY from .env (gitignored). Generates a textured GLB
// and writes it to public/models/<name>.glb, which IS committed. The API key
// never reaches the browser.
//
// Usage: node scripts/assetgen/tripo.mjs <name> "<prompt>" [faceLimit]
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// --- load .env (no dependency) ---------------------------------------------
function loadEnv() {
  const env = {};
  const raw = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const { TRIPO_API_KEY } = loadEnv();
if (!TRIPO_API_KEY) { console.error('No TRIPO_API_KEY in .env'); process.exit(1); }

const API = 'https://api.tripo3d.ai/v2/openapi';
const H = { Authorization: `Bearer ${TRIPO_API_KEY}` };

const [, , name, prompt, faceLimit = '12000'] = process.argv;
if (!name || !prompt) {
  console.error('Usage: node tripo.mjs <name> "<prompt>" [faceLimit]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createTask() {
  const body = {
    type: 'text_to_model',
    prompt,
    model_version: 'v2.5-20250123',
    texture: true,
    pbr: true,
    face_limit: Number(faceLimit),
    texture_quality: 'detailed',
  };
  const res = await fetch(`${API}/task`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`create failed: ${JSON.stringify(json)}`);
  return json.data.task_id;
}

async function poll(taskId) {
  for (let i = 0; i < 120; i += 1) {
    const res = await fetch(`${API}/task/${taskId}`, { headers: H });
    const json = await res.json();
    if (json.code !== 0) throw new Error(`poll failed: ${JSON.stringify(json)}`);
    const d = json.data;
    process.stdout.write(`\r[${name}] ${d.status} ${d.progress ?? 0}%   `);
    if (d.status === 'success') { process.stdout.write('\n'); return d; }
    if (d.status === 'failed' || d.status === 'cancelled' || d.status === 'banned') {
      throw new Error(`task ${d.status}: ${JSON.stringify(d)}`);
    }
    await sleep(4000);
  }
  throw new Error('timed out');
}

async function download(url, outPath) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  return buf.length;
}

(async () => {
  const outDir = join(ROOT, 'public', 'models');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${name}.glb`);
  if (existsSync(outPath) && process.env.FORCE !== '1') {
    console.log(`[${name}] exists, skipping (FORCE=1 to regen)`);
    return;
  }
  console.log(`[${name}] prompt: ${prompt}`);
  const taskId = await createTask();
  console.log(`[${name}] task ${taskId}`);
  const d = await poll(taskId);
  const modelUrl = d.output?.pbr_model || d.output?.model || d.result?.pbr_model?.url || d.result?.model?.url;
  if (!modelUrl) throw new Error(`no model url in output: ${JSON.stringify(d.output || d.result)}`);
  const bytes = await download(modelUrl, outPath);
  console.log(`[${name}] saved ${outPath} (${(bytes / 1e6).toFixed(2)} MB)`);
})().catch((e) => { console.error(`\n[${name}] ERROR`, e.message); process.exit(1); });
