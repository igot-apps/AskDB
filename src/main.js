// Electron main process: window, local storage, and the bridge to the database.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const dataDir = () => app.getPath('userData');
const settingsFile = () => path.join(dataDir(), 'askdb-settings.json');
const historyDir = () => path.join(dataDir(), 'history');
const changeLog = () => path.join(dataDir(), 'changes.log');

const DEFAULTS = { apiKey: '', model: 'anthropic/claude-sonnet-5.5', connections: [], activeId: null, privacyAck: false };

function readSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}
function writeSettings(s) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
  return s;
}

// ---------- .env support ----------
// Looks for a .env file next to the app, in the project folder, or in Desktop\AskDB.
function readEnvFile() {
  const candidates = [
    path.join(path.dirname(process.execPath), '.env'),
    path.join(app.getAppPath(), '.env'),
    path.join(app.getPath('desktop'), 'AskDB', '.env'),
  ];
  for (const file of candidates) {
    try {
      const vars = {};
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
      }
      return vars;
    } catch { /* not found, try next */ }
  }
  return {};
}

const isPlaceholder = (v) => !v || /^(paste|your|<)/i.test(v);

// Copy values from .env into the app's saved settings (only real values, not placeholders).
function applyEnv() {
  const env = readEnvFile();
  const s = readSettings();
  let changed = false;
  // Only apply a .env value when it changed since last time, so choices made in the app stick.
  const last = s.envApplied || {};
  if (!isPlaceholder(env.OPENROUTER_API_KEY) && env.OPENROUTER_API_KEY !== last.key) { s.apiKey = env.OPENROUTER_API_KEY; last.key = s.apiKey; changed = true; }
  if (!isPlaceholder(env.OPENROUTER_MODEL) && env.OPENROUTER_MODEL !== last.model) { s.model = env.OPENROUTER_MODEL; last.model = s.model; changed = true; }
  s.envApplied = last;

  // Database from .env: only act when the link changed since last time.
  // An edited link updates the same saved database, so its read-only setting, name and history are kept.
  const url = env.DATABASE_URL;
  if (!isPlaceholder(url) && url !== last.dbUrl) {
    const existing = s.connections.find(c => c.cs === url);
    const previous = s.connections.find(c => c.id === last.dbId);
    if (existing) {
      last.dbId = existing.id;
    } else if (previous) {
      previous.cs = url;
      last.dbId = previous.id;
    } else {
      const name = isPlaceholder(env.DATABASE_NAME) ? 'My database' : env.DATABASE_NAME;
      const conn = { id: `db_${Date.now()}`, name, cs: url };
      s.connections.push(conn);
      if (!s.activeId) s.activeId = conn.id;
      last.dbId = conn.id;
    }
    last.dbUrl = url;
    changed = true;
  }
  if (changed) writeSettings(s);
}

// Wrap every handler so the UI always gets { ok, data } or { ok:false, error } in plain words.
function handle(name, fn) {
  ipcMain.handle(name, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (err) { return { ok: false, error: db.friendlyError(err) }; }
  });
}

handle('settings:get', () => readSettings());
handle('settings:save', (patch) => writeSettings({ ...readSettings(), ...patch }));

handle('conn:test', (cs) => db.testConnection(cs));
handle('conn:add', async ({ name, cs }) => {
  const info = await db.testConnection(cs);
  const s = readSettings();
  const conn = { id: `db_${Date.now()}`, name: (name || '').trim() || 'My database', cs: cs.trim() };
  s.connections.push(conn);
  s.activeId = conn.id;
  writeSettings(s);
  return { conn, info };
});
handle('conn:remove', async (id) => {
  const s = readSettings();
  s.connections = s.connections.filter(c => c.id !== id);
  if (s.activeId === id) { s.activeId = s.connections[0]?.id || null; await db.disconnect(); }
  try { fs.unlinkSync(path.join(historyDir(), `${id}.json`)); } catch {}
  return writeSettings(s);
});

handle('db:connect', async (id) => {
  const s = readSettings();
  const conn = s.connections.find(c => c.id === id);
  if (!conn) throw new Error('That database is no longer saved.');
  await db.connect(id, conn.cs);
  s.activeId = id; writeSettings(s);
  const tables = await db.getSchema();
  const full = db.schemaToText(tables, true);
  const small = full.length < 15000;
  return {
    tables: tables.map(t => ({ name: t.name, rows: t.rows, isView: t.isView })),
    schemaText: small ? full : db.schemaToText(tables, false),
    fullSchema: small,
  };
});
handle('conn:setReadOnly', (id, readOnly) => {
  const s = readSettings();
  const c = s.connections.find(x => x.id === id);
  if (c) c.readOnly = !!readOnly;
  return writeSettings(s);
});

// Read-only mode is enforced here too, not just in the AI instructions.
function assertWritable() {
  const s = readSettings();
  const c = s.connections.find(x => x.id === s.activeId);
  if (c && c.readOnly) throw new Error('This database is in read-only mode, so nothing was changed. Click "🔒 Read only" at the top to allow changes.');
}

handle('db:describe', (name) => db.describeTable(name));
handle('db:query', (sql) => db.runQuery(sql));
handle('db:propose', (sql) => { assertWritable(); return db.proposeChange(sql); });
handle('db:cancel', (id) => db.cancelChange(id));
handle('db:apply', async (id) => {
  assertWritable();
  const r = await db.applyChange(id);
  const s = readSettings();
  const conn = s.connections.find(c => c.id === s.activeId);
  fs.appendFileSync(changeLog(), `${new Date().toISOString()}\t${conn ? conn.name : '?'}\t${r.affected} row(s)\t${r.sql.replace(/\s+/g, ' ')}\n`);
  return r;
});

handle('history:get', (id) => {
  try { return JSON.parse(fs.readFileSync(path.join(historyDir(), `${id}.json`), 'utf8')); }
  catch { return []; }
});
handle('history:save', (id, items) => {
  fs.mkdirSync(historyDir(), { recursive: true });
  fs.writeFileSync(path.join(historyDir(), `${id}.json`), JSON.stringify(items.slice(-200)));
  return true;
});

handle('open:external', (url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
  return true;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 720, minHeight: 520,
    title: 'AskDB',
    backgroundColor: '#f7f7f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Links open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  try { applyEnv(); } catch { /* a bad .env should never stop the app */ }
  // Allow the microphone (for voice typing) and nothing else.
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb, details) =>
    cb(perm === 'media' && (!details.mediaTypes || details.mediaTypes.every(t => t === 'audio'))));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');
  createWindow();
});
app.on('window-all-closed', async () => { await db.disconnect(); app.quit(); });
