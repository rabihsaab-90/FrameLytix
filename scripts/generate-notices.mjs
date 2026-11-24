#!/usr/bin/env node
// Generates THIRD_PARTY_NOTICES.md from the production dependency tree.
//
// Walks package.json "dependencies" and their transitive production dependencies
// using package-lock.json (entries flagged "dev": true are skipped), reads each
// installed package's licence metadata and licence/notice files, and writes a
// deterministic Markdown document. Electron is added explicitly because it is the
// runtime that the packaged application ships with.
//
// Usage: node scripts/generate-notices.mjs
// No dependencies beyond Node built-ins.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'THIRD_PARTY_NOTICES.md');
const NODE_MODULES_SEGMENT = 'node_modules/';

// Matches LICENSE, LICENCE, COPYING and NOTICE files (case-insensitive), with or without an extension,
// and variants such as LICENSE-MIT or LICENSE.txt.
const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.[a-z0-9]+)?$|^(licen[cs]e|copying|notice)[-_.].+$/i;

// Licence identifiers treated as permissive for the purpose of flagging packages for review.
const PERMISSIVE = new Set([
  'mit', 'mit-0', 'isc', 'bsd-2-clause', 'bsd-3-clause', 'bsd', '0bsd', 'apache-2.0', 'unlicense',
  'cc0-1.0', 'blueoak-1.0.0', 'python-2.0', 'ofl-1.1', 'zlib', 'bsl-1.0', 'cc-by-4.0'
]);

function readJson(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function readText(file) {
  return readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
}

function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function normaliseLicence(value) {
  if (typeof value === 'string') return value.trim() || 'UNKNOWN';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normaliseLicence(value.type ?? value.name ?? 'UNKNOWN');
  }
  if (Array.isArray(value) && value.length > 0) {
    return value.map((entry) => normaliseLicence(entry)).join(' OR ');
  }
  return 'UNKNOWN';
}

function isPermissive(expression) {
  if (!expression || expression === 'UNKNOWN') return false;
  const alternatives = expression.replace(/[()]/g, ' ').split(/\s+OR\s+/i);
  return alternatives.some((alternative) =>
    alternative.split(/\s+AND\s+/i).every((term) => {
      const identifier = term.trim().split(/\s+WITH\s+/i)[0].replace(/\+$/, '').toLowerCase();
      return PERMISSIVE.has(identifier);
    })
  );
}

function repositoryUrl(pkg) {
  const repository = pkg.repository;
  const raw = typeof repository === 'string' ? repository : repository?.url ?? pkg.homepage ?? '';
  return String(raw).trim().replace(/^git\+/, '').replace(/\.git$/, '');
}

// Used only when package.json has no licence field: identifies the licence from the
// licence text shipped with the package. Returns null when no known licence is recognised.
function inferLicenceFromText(text) {
  if (/SIL OPEN FONT LICENSE Version 1\.1/i.test(text)) return 'OFL-1.1';
  if (/Apache License,?\s+Version 2\.0/i.test(text)) return 'Apache-2.0';
  if (/Permission is hereby granted, free of charge, to any person obtaining/i.test(text)) return 'MIT';
  if (/Permission to use, copy, modify, and\/or distribute this software for any/i.test(text)) return 'ISC';
  return null;
}

function findLicenceFiles(packageDir) {
  if (!existsSync(packageDir)) return [];
  return readdirSync(packageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENCE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareText);
}

// Resolves a dependency name the way Node does: nearest nested node_modules first, then parents.
function resolveDependency(packages, fromKey, name) {
  let base = fromKey;
  for (;;) {
    const candidate = base ? `${base}/${NODE_MODULES_SEGMENT}${name}` : `${NODE_MODULES_SEGMENT}${name}`;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const index = base.lastIndexOf(`/${NODE_MODULES_SEGMENT}`);
    base = index === -1 ? '' : base.slice(0, index);
  }
}

function collectProductionPackageKeys(lock, rootPackage) {
  const packages = lock.packages ?? {};
  const selected = new Set();
  const unresolved = [];
  const queue = [];

  for (const name of Object.keys(rootPackage.dependencies ?? {})) {
    const key = resolveDependency(packages, '', name);
    if (key) queue.push(key);
    else unresolved.push(name);
  }

  while (queue.length > 0) {
    const key = queue.shift();
    if (selected.has(key)) continue;
    const entry = packages[key];
    if (!entry || entry.dev) continue;
    selected.add(key);

    const dependencies = {
      ...(entry.dependencies ?? {}),
      ...(entry.optionalDependencies ?? {}),
      ...(entry.peerDependencies ?? {})
    };
    for (const name of Object.keys(dependencies)) {
      const childKey = resolveDependency(packages, key, name);
      if (childKey) {
        queue.push(childKey);
      } else if (!(entry.peerDependenciesMeta?.[name]?.optional || entry.optionalDependencies?.[name])) {
        unresolved.push(`${name} (required by ${key})`);
      }
    }
  }

  return { keys: [...selected], unresolved };
}

function buildRecord({ name, version, licence, repository, dir, licenceFiles, note }) {
  return {
    name,
    version,
    licence,
    repository,
    note,
    licenceTexts: licenceFiles.map((file) => ({ file, text: readText(path.join(dir, file)) }))
  };
}

function loadPackages() {
  const lock = readJson(path.join(ROOT, 'package-lock.json'));
  const rootPackage = readJson(path.join(ROOT, 'package.json'));
  if (!lock || !rootPackage) throw new Error('package.json and package-lock.json are required');

  const { keys, unresolved } = collectProductionPackageKeys(lock, rootPackage);
  if (unresolved.length > 0) {
    console.warn(`Warning: ${unresolved.length} dependency reference(s) could not be resolved in package-lock.json:`);
    for (const item of unresolved) console.warn(`  - ${item}`);
  }

  const records = new Map();
  for (const key of keys) {
    const entry = lock.packages[key];
    const dir = path.join(ROOT, key);
    const installed = readJson(path.join(dir, 'package.json')) ?? {};
    const name = entry.name ?? installed.name ?? key.slice(key.lastIndexOf(NODE_MODULES_SEGMENT) + NODE_MODULES_SEGMENT.length);
    const version = installed.version ?? entry.version ?? 'UNKNOWN';
    const id = `${name}@${version}`;
    if (records.has(id)) continue;

    const licenceFiles = findLicenceFiles(dir);
    let licence = normaliseLicence(installed.license ?? entry.license ?? installed.licenses);
    const notes = [];
    if (licence === 'UNKNOWN') {
      const inferred = licenceFiles
        .map((file) => inferLicenceFromText(readText(path.join(dir, file))))
        .find((value) => value !== null);
      if (inferred) {
        licence = inferred;
        notes.push(`The package metadata has no licence field. ${inferred} is inferred from the licence file shipped with the package; please confirm.`);
      }
    }
    if (licenceFiles.length === 0) {
      notes.push('No licence or notice file was found in the installed package. The licence field above is the only licence information available.');
    }
    records.set(id, buildRecord({
      name,
      version,
      licence,
      repository: repositoryUrl(installed) || (installed.homepage ?? ''),
      dir,
      licenceFiles,
      note: notes.join(' ')
    }));
  }

  // Electron is not a dependency in package.json (it is a build-time dependency that is
  // packaged into the application), so it is added explicitly.
  const electronDir = path.join(ROOT, 'node_modules', 'electron');
  const electronPackage = readJson(path.join(electronDir, 'package.json'));
  if (electronPackage) {
    const electronFiles = findLicenceFiles(electronDir);
    const electronRecord = buildRecord({
      name: 'Electron',
      version: electronPackage.version,
      licence: normaliseLicence(electronPackage.license ?? 'MIT'),
      repository: repositoryUrl(electronPackage) || 'https://github.com/electron/electron',
      dir: electronDir,
      licenceFiles: electronFiles,
      note: 'Electron bundles Chromium and Node.js. Their licence notices ship inside the Electron distribution, including LICENSES.chromium.html in the packaged application. Those notices are not reproduced here.'
    });
    records.set(`Electron@${electronPackage.version}`, electronRecord);
  } else {
    console.warn('Warning: node_modules/electron is not installed; the Electron entry was not added.');
  }

  return [...records.values()].sort((a, b) => compareText(a.name, b.name) || compareText(a.version, b.version));
}

function fenceFor(text) {
  const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

function renderMarkdown(records) {
  const lines = [];
  lines.push('# Third-party notices', '');
  lines.push(
    'FrameLytix is released under the MIT License (see [LICENSE](LICENSE)). The desktop application is built on the ' +
    'open-source packages listed below, which are bundled with it. Each package is listed with its version and licence, ' +
    'followed by the full text of the licence or notice file shipped with that package. Development-only tools are not ' +
    'bundled with the application and are not listed.',
    ''
  );
  lines.push(
    'The fonts `@fontsource/inter` and `@fontsource/jetbrains-mono` are licensed under the SIL Open Font License 1.1 ' +
    '(OFL-1.1). Their licence texts are included below. Electron is included as the runtime for the packaged application. ' +
    'Electron bundles Chromium and Node.js, whose notices ship inside the Electron distribution, including ' +
    '`LICENSES.chromium.html` in the packaged application.',
    ''
  );
  lines.push(
    'This file is generated by `node scripts/generate-notices.mjs` from `package.json` and `package-lock.json`. ' +
    'Regenerate it after changing production dependencies rather than editing it by hand.',
    ''
  );

  lines.push('## Summary', '');
  lines.push('| Package | Version | Licence |', '| --- | --- | --- |');
  for (const record of records) {
    lines.push(`| ${escapeCell(record.name)} | ${escapeCell(record.version)} | ${escapeCell(record.licence)} |`);
  }
  lines.push('');

  lines.push('## Licence texts', '');
  for (const record of records) {
    lines.push(`### ${record.name} ${record.version}`, '');
    lines.push(`- **Licence:** ${record.licence}`);
    lines.push(`- **Repository or homepage:** ${record.repository || 'not stated in package metadata'}`);
    lines.push(`- **Licence file(s):** ${record.licenceTexts.length > 0 ? record.licenceTexts.map((item) => item.file).join(', ') : 'none shipped'}`);
    lines.push('');
    if (record.note) lines.push(record.note, '');
    for (const { file, text } of record.licenceTexts) {
      const fence = fenceFor(text);
      lines.push(`Source: \`${file}\``, '');
      lines.push(`${fence}text`, text, fence, '');
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function reportCounts(records) {
  const counts = new Map();
  for (const record of records) counts.set(record.licence, (counts.get(record.licence) ?? 0) + 1);
  console.log(`Packages: ${records.length}`);
  console.log('Packages per licence type:');
  for (const [licence, count] of [...counts.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))) {
    console.log(`  ${String(count).padStart(4)}  ${licence}`);
  }

  const flagged = records.filter((record) => !isPermissive(record.licence));
  if (flagged.length === 0) {
    console.log('No non-permissive licences found.');
  } else {
    console.log(`Flagged for review (not recognised as permissive): ${flagged.length}`);
    for (const record of flagged) console.log(`  - ${record.name}@${record.version}: ${record.licence}`);
  }
  const noFile = records.filter((record) => record.licenceTexts.length === 0);
  if (noFile.length > 0) {
    console.log(`Packages with no licence file shipped: ${noFile.length}`);
    for (const record of noFile) console.log(`  - ${record.name}@${record.version}`);
  }
}

const records = loadPackages();
writeFileSync(OUTPUT, renderMarkdown(records), 'utf8');
console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
reportCounts(records);
