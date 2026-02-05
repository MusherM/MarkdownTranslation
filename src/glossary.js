import fs from 'fs/promises';
import { parse } from 'jsonc-parser';

async function readJsoncFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = parse(raw);
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Glossary must be a JSON object: ${filePath}`);
  }
  return data;
}

export async function loadGlossary(config) {
  let glossary = {};

  if (config.glossary_path) {
    const fileGlossary = await readJsoncFile(config.glossary_path);
    glossary = { ...glossary, ...fileGlossary };
  }

  if (config.glossary && typeof config.glossary === 'object') {
    glossary = { ...glossary, ...config.glossary };
  }

  const normalized = {};
  for (const [key, value] of Object.entries(glossary)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (value !== null && value !== undefined) {
      normalized[key] = String(value);
    }
  }

  return normalized;
}
