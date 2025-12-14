import { App } from 'obsidian';
import { PathUtils } from '../../src/utils/PathUtils';

describe('PathUtils', () => {
  beforeEach(() => {
    // Reset cached plugin dir between tests
    (PathUtils as unknown as { cachedPluginDir: string | null }).cachedPluginDir = null;
  });

  it('resolves plugin dir from manifest without using hardcoded .obsidian path', () => {
    const app = new App() as unknown as App & {
      plugins: { manifests: Record<string, { dir: string }> };
    };
    (app as any).plugins = {
      manifests: {
        'ai-transcriber': { dir: '/vault/custom/plugins/ai-transcriber' }
      }
    };

    const dir = PathUtils.getPluginDir(app);
    expect(dir).toBe('/vault/custom/plugins/ai-transcriber');
  });

  it('returns plugin file path under resolved directory', () => {
    const app = new App() as unknown as App & {
      plugins: { manifests: Record<string, { dir: string }> };
    };
    (app as any).plugins = {
      manifests: {
        'ai-transcriber': { dir: '/vault/custom/plugins/ai-transcriber' }
      }
    };

    const filePath = PathUtils.getPluginFilePath(app, 'config.json');
    expect(filePath).toBe('/vault/custom/plugins/ai-transcriber/config.json');
  });

  it('normalizes user paths by trimming and collapsing separators', () => {
    expect(PathUtils.normalizeUserPath('  //foo//bar//  ')).toBe('/foo/bar');
    expect(PathUtils.normalizeUserPath('   ')).toBe('');
    expect(PathUtils.normalizeUserPath(undefined)).toBe('');
  });
});
