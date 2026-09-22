import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { app, shell } from 'electron';

export const openLinkedFile = async (filePath: string, line: number | null, column = 1) => {
  if (!(await fs.stat(filePath)).isFile()) {
    throw new Error(`Linked path is not a file: ${filePath}`);
  }

  if (line !== null) {
    // Encode path characters (#, ?, spaces, Unicode), but preserve drive/path
    // separators. The file and location are data, never a shell command.
    const fileUrl = pathToFileURL(filePath);
    const editorPath = fileUrl.host
      ? `//${fileUrl.host}${fileUrl.pathname}`
      : fileUrl.pathname.replace(/^\/(?=[a-z]:\/)/i, '');
    const editorUrl = `vscode://file${editorPath.startsWith('/') ? '' : '/'}${editorPath}:${line}:${column}`;
    try {
      if (app.getApplicationNameForProtocol(editorUrl)) {
        await shell.openExternal(editorUrl);
        return;
      }
    } catch {
      // Missing/broken editor registration: still open the file normally.
    }
  }

  const error = await shell.openPath(filePath);
  if (error) throw new Error(error);
};
