import fs from 'node:fs/promises';
import path from 'node:path';

import type { ExplorerEntry } from '../shared/contracts';
import { isMarkdownFile } from './markdown-files';

export const listExplorerDirectory = async (directoryPath: string) => {
  const resolvedPath = path.resolve(directoryPath);
  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  const filteredEntries: ExplorerEntry[] = entries
    .filter((entry) => entry.isDirectory() || isMarkdownFile(entry.name))
    .map((entry) => ({
      name: entry.name,
      filePath: path.join(resolvedPath, entry.name),
      type: entry.isDirectory() ? 'directory' : 'markdown',
    }));

  filteredEntries.sort((first, second) => {
    if (first.type !== second.type) {
      return first.type === 'directory' ? -1 : 1;
    }

    return first.name.localeCompare(second.name);
  });

  return {
    currentPath: resolvedPath,
    parentPath: path.dirname(resolvedPath) === resolvedPath ? null : path.dirname(resolvedPath),
    entries: filteredEntries,
  };
};
