import fs from 'fs/promises';

export async function loadPrompt(promptPath) {
  return fs.readFile(promptPath, 'utf8');
}
