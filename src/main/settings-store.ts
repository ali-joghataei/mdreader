import fs from 'node:fs/promises';
import path from 'node:path';

import type { AppSettings } from '../shared/contracts';
import { defaultAppSettings, normalizeSettings } from '../shared/settings';

export const createSettingsStore = (getSettingsPath: () => string) => {
  let settingsCache: AppSettings | null = null;

  const readSettings = async (): Promise<AppSettings> => {
    if (settingsCache) {
      return settingsCache;
    }

    try {
      const content = await fs.readFile(getSettingsPath(), 'utf8');
      settingsCache = normalizeSettings(JSON.parse(content) as Partial<AppSettings>);
    } catch {
      settingsCache = { ...defaultAppSettings };
    }

    return settingsCache;
  };

  const writeSettings = async (settings: AppSettings) => {
    settingsCache = normalizeSettings(settings);
    await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
    await fs.writeFile(
      getSettingsPath(),
      `${JSON.stringify(settingsCache, null, 2)}\n`,
      'utf8',
    );

    return settingsCache;
  };

  return { readSettings, writeSettings };
};
