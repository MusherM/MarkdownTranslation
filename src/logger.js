import fs from 'fs/promises';
import path from 'path';

function nowIso() {
  return new Date().toISOString();
}

async function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export function createLogger(logPath = 'log.txt') {
  const resolvedPath = path.resolve(process.cwd(), logPath);

  const write = async (entry) => {
    await ensureDir(resolvedPath);
    await fs.appendFile(resolvedPath, `${entry}\n`, 'utf8');
  };

  const log = async (level, message, data) => {
    const payload = {
      timestamp: nowIso(),
      level,
      message,
      data
    };
    await write(JSON.stringify(payload));
  };

  return {
    path: resolvedPath,
    info: (message, data) => log('info', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, data) => log('error', message, data)
  };
}
