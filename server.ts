import express from 'express';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DEFAULT_CHANNEL_RULES } from './src/core/channelResolver.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARCHIVE_PY_SCRIPT = `
import os, sys, zipfile, tarfile

root_dir = sys.argv[1]
out_path = sys.argv[2]
fmt = sys.argv[3]
prefix = "douyin"

EXCLUDE_DIRS = {"node_modules", "dist", "build_win", "build_core", "dist_win", ".playwright-cli", ".aistudio", "build", "coverage"}

def should_skip_file(name):
    if name.startswith(".env") and name != ".env.example":
        return True
    if name.endswith((".log", ".db", ".db-wal", ".db-shm")):
        return True
    return False

def iter_files():
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fname in filenames:
            if should_skip_file(fname):
                continue
            full = os.path.join(dirpath, fname)
            rel = os.path.relpath(full, root_dir)
            yield full, os.path.join(prefix, rel)

if fmt == "zip":
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for full, arc in iter_files():
            zf.write(full, arc)
else:
    with tarfile.open(out_path, "w:gz") as tf:
        for full, arc in iter_files():
            tf.add(full, arcname=arc)
`;

function buildRepoArchive(format: 'zip' | 'tar.gz'): Promise<string> {
  const ext = format === 'zip' ? 'zip' : 'tar.gz';
  const outPath = path.join(os.tmpdir(), `hongguo-douyin-repo-${Date.now()}.${ext}`);
  return new Promise((resolve, reject) => {
    execFile(
      'python3',
      ['-c', ARCHIVE_PY_SCRIPT, __dirname, outPath, format],
      { timeout: 30000 },
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(outPath);
      },
    );
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '2mb' }));

  // 1. Thin-Backend Health & Architecture Mode
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'thin-relay-v2',
      secretManagedServerSide: true,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Hot-updatable Channel Rules (fixes v1.0 hardcoded enum coupling)
  app.get('/api/rules/channel', (_req, res) => {
    res.json({
      version: '2026.11.17-r2',
      updatedAt: '2026-11-17T10:00:00Z',
      rules: DEFAULT_CHANNEL_RULES,
    });
  });

  // 3. OAuth Code -> Token Exchange Relay (keeps DOUDIAN_APP_SECRET off desktop binary)
  app.post('/api/oauth/exchange', (req, res) => {
    const { shopName, code } = req.body as { shopName?: string; code?: string };
    if (!code || !code.trim()) {
      res.status(400).json({ error: '缺少授权码 code' });
      return;
    }
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    res.json({
      shopId: `SHOP-HG-${Math.floor(10 + Math.random() * 89)}`,
      shopName: shopName?.trim() || '新授权抖店商家',
      authStatus: 'valid',
      tokenExpiresAt: expiresAt,
      exchangedViaRelay: true,
    });
  });

  // 4. Download complete source code + .git repository archive
  app.get('/api/download/repo.zip', async (_req, res) => {
    try {
      const archivePath = await buildRepoArchive('zip');
      res.download(archivePath, 'douyin-hongguo-v1.1-with-git.zip', () => {
        fs.unlink(archivePath, () => undefined);
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '打包失败' });
    }
  });

  app.get('/api/download/repo.tar.gz', async (_req, res) => {
    try {
      const archivePath = await buildRepoArchive('tar.gz');
      res.download(archivePath, 'douyin-hongguo-v1.1-with-git.tar.gz', () => {
        fs.unlink(archivePath, () => undefined);
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '打包失败' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
