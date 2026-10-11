import fs from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = path.join(process.cwd(), 'lib', 'i18n', 'locales');
const SOURCE_LOCALE = 'en-US.json';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatPath(keyPath) {
  return keyPath || '<root>';
}

function collectLeafKeys(value, fileName, keyPath = '', keys = new Set()) {
  if (Array.isArray(value)) {
    throw new Error(
      `${fileName} has an array at "${formatPath(keyPath)}". Locale values must not be arrays.`,
    );
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      throw new Error(
        `${fileName} has an empty object at "${formatPath(keyPath)}". Locale objects must not be empty.`,
      );
    }

    for (const [key, child] of entries) {
      const nextPath = keyPath ? `${keyPath}.${key}` : key;
      collectLeafKeys(child, fileName, nextPath, keys);
    }

    return keys;
  }

  if (!keyPath) {
    throw new Error(`${fileName} must contain a JSON object at the root.`);
  }

  keys.add(keyPath);
  return keys;
}

function readLocaleKeys(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const fileName = path.basename(filePath);

  if (!isPlainObject(parsed)) {
    throw new Error(`${fileName} must contain a JSON object at the root.`);
  }

  return [...collectLeafKeys(parsed, fileName)].sort();
}

// Vietnamese copy is shown to Vietnamese users, so CJK text there is a bug. Language-name
// keys (settings.lang_*) are written in their own script and are exempt.
const CJK =
  /[\p{Ideographic}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}]/u;
const VI_FILES = [
  path.join(LOCALES_DIR, 'vi-VN.json'),
  path.join(process.cwd(), 'lib', 'i18n', 'workbench-locales', 'vi-VN.json'),
];

function cjkKeys(value, keyPath = '', found = []) {
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      cjkKeys(child, keyPath ? `${keyPath}.${key}` : key, found);
    }
  } else if (typeof value === 'string' && CJK.test(value) && !/^settings\.lang_/.test(keyPath)) {
    found.push(keyPath);
  }
  return found;
}

function checkVietnameseCjk() {
  const found = VI_FILES.flatMap((file) =>
    cjkKeys(JSON.parse(fs.readFileSync(file, 'utf8'))).map(
      (key) => `${path.relative(process.cwd(), file)}: ${key}`,
    ),
  );
  if (found.length === 0) return;

  console.error('Vietnamese locale copy contains CJK text:');
  for (const entry of found) {
    console.error(`  - ${entry}`);
  }
  process.exit(1);
}

function main() {
  checkVietnameseCjk();

  const localeFiles = fs
    .readdirSync(LOCALES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (!localeFiles.includes(SOURCE_LOCALE)) {
    throw new Error(`Missing source locale: ${SOURCE_LOCALE}`);
  }

  const sourceKeys = new Set(readLocaleKeys(path.join(LOCALES_DIR, SOURCE_LOCALE)));
  const reports = [];

  for (const localeFile of localeFiles) {
    if (localeFile === SOURCE_LOCALE) continue;

    const localeKeys = new Set(readLocaleKeys(path.join(LOCALES_DIR, localeFile)));
    const missing = [...sourceKeys].filter((key) => !localeKeys.has(key)).sort();
    const extra = [...localeKeys].filter((key) => !sourceKeys.has(key)).sort();

    if (missing.length > 0 || extra.length > 0) {
      reports.push({ file: localeFile, missing, extra });
    }
  }

  if (reports.length === 0) {
    console.log(
      `i18n key alignment check passed (${localeFiles.length} locale files, source: ${SOURCE_LOCALE}).`,
    );
    return;
  }

  console.error(`i18n key alignment check failed against ${SOURCE_LOCALE}:`);

  for (const report of reports) {
    console.error(`\n- ${report.file}`);

    if (report.missing.length > 0) {
      console.error(`  Missing keys (${report.missing.length}):`);
      for (const key of report.missing) {
        console.error(`    - ${key}`);
      }
    }

    if (report.extra.length > 0) {
      console.error(`  Extra keys (${report.extra.length}):`);
      for (const key of report.extra) {
        console.error(`    - ${key}`);
      }
    }
  }

  process.exit(1);
}

main();
