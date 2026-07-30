import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMMUNITY_FILES = ['main.js', 'manifest.json', 'styles.css'];

function fail(category, message) {
  throw new Error(`[${category}] ${message}`);
}

export function verifyCommunityRelease(repositoryRoot = process.cwd()) {
  const root = path.resolve(repositoryRoot);
  const sourceManifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'));
  const releaseDir = path.join(root, 'build', manifest.version, 'release');

  let entries;
  try {
    entries = readdirSync(releaseDir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail('packaging', `Cannot read release directory ${releaseDir}: ${message}`);
  }

  const observed = entries.map((entry) => entry.name).sort();
  const expected = [...COMMUNITY_FILES].sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    fail(
      'packaging',
      `Expected exactly ${expected.join(', ')}; found ${observed.join(', ') || '(empty)'}.`
    );
  }

  for (const name of expected) {
    const entry = entries.find((candidate) => candidate.name === name);
    const filePath = path.join(releaseDir, name);
    if (!entry?.isFile() || statSync(filePath).size === 0) {
      fail('packaging', `Expected regular non-empty file: ${filePath}.`);
    }
  }

  const builtManifestPath = path.join(releaseDir, 'manifest.json');
  if (!readFileSync(sourceManifestPath).equals(readFileSync(builtManifestPath))) {
    fail('metadata', `Built manifest does not match repository manifest: ${builtManifestPath}.`);
  }

  const mainPath = path.join(releaseDir, 'main.js');
  if (/[#@]\s*sourceMappingURL\s*=/.test(readFileSync(mainPath, 'utf8'))) {
    fail('packaging', `main.js contains a sourceMappingURL reference: ${mainPath}.`);
  }

  return { version: manifest.version, releaseDir };
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = verifyCommunityRelease(process.argv[2] ?? process.cwd());
    process.stdout.write(`Verified Community release ${result.version}: ${result.releaseDir}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
