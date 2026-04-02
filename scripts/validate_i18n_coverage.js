import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const translationsPath = path.join(root, 'src', 'i18n', 'translations.ts');
const srcPath = path.join(root, 'src');

const translationsSource = fs.readFileSync(translationsPath, 'utf8');

const extractLocaleBlock = (locale) => {
  const localeAnchor = locale === 'en' ? 'en: {' : "'zh-CN': {";
  const start = translationsSource.indexOf(localeAnchor);
  if (start === -1) {
    throw new Error(`Locale block not found for ${locale}`);
  }
  const blockStart = translationsSource.indexOf('{', start);
  let depth = 0;
  let end = blockStart;
  for (let i = blockStart; i < translationsSource.length; i += 1) {
    const char = translationsSource[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  return translationsSource.slice(blockStart + 1, end);
};

const extractKeys = (block) => {
  const keyRegex = /'([^']+)':/g;
  const keys = new Set();
  let match = keyRegex.exec(block);
  while (match) {
    keys.add(match[1]);
    match = keyRegex.exec(block);
  }
  return keys;
};

const extractUsedKeys = (directory) => {
  const keys = new Set();
  const walk = (currentPath) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.tsx')) {
        continue;
      }
      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      if (!fileContent.includes('useI18n')) {
        continue;
      }
      const keyRegex = /\bt\(\s*['"]([^'"]+)['"]\s*\)/g;
      let match = keyRegex.exec(fileContent);
      while (match) {
        keys.add(match[1]);
        match = keyRegex.exec(fileContent);
      }
    }
  };
  walk(directory);
  return keys;
};

const enKeys = extractKeys(extractLocaleBlock('en'));
const zhKeys = extractKeys(extractLocaleBlock('zh-CN'));
const usedKeys = extractUsedKeys(srcPath);

const missingFromZh = [...enKeys].filter((key) => !zhKeys.has(key));
const missingFromEn = [...zhKeys].filter((key) => !enKeys.has(key));
const missingFromBothLocales = [...usedKeys].filter((key) => !enKeys.has(key) || !zhKeys.has(key));

if (missingFromZh.length || missingFromEn.length || missingFromBothLocales.length) {
  if (missingFromZh.length) {
    console.error('Missing zh-CN keys:', missingFromZh);
  }
  if (missingFromEn.length) {
    console.error('Missing en keys:', missingFromEn);
  }
  if (missingFromBothLocales.length) {
    console.error('Used in code but not fully translated:', missingFromBothLocales);
  }
  process.exit(1);
}

console.log(`i18n coverage validated. ${usedKeys.size} used keys are covered in en and zh-CN.`);
