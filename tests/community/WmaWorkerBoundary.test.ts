import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const worker = readFileSync(
  join(process.cwd(), 'src/vendor/wma-standard/wma-standard.worker.txt'),
  'utf8'
);

describe('WMA worker runtime boundary', () => {
  it('does not ship Node.js module loaders or host filesystem access', () => {
    expect(worker).not.toMatch(/\brequire\s*\(/);
    expect(worker).not.toMatch(/node:(?:fs|crypto|worker_threads)/);
    expect(worker).not.toContain('ENVIRONMENT_IS_NODE');
    expect(worker).not.toContain('readFileSync');
    expect(worker).not.toContain('writeFileSync');
  });
});
