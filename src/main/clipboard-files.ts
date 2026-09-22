import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const getExportRoot = () => path.join(app.getPath('temp'), 'MdReader', 'ClipboardExports');
const exportDirectoryPattern = /^export-[a-zA-Z0-9]+$/;

export const removeClipboardExport = async (directory: string) => {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(getExportRoot()) || !exportDirectoryPattern.test(path.basename(resolved))) {
    throw new Error('Invalid clipboard export directory.');
  }
  await fs.rm(resolved, { recursive: true, force: true });
};

export const cleanupClipboardExports = async () => {
  try {
    const entries = await fs.readdir(getExportRoot(), { withFileTypes: true });
    await Promise.all(entries.filter((entry) => entry.isDirectory() && exportDirectoryPattern.test(entry.name))
      .map((entry) => removeClipboardExport(path.join(getExportRoot(), entry.name))));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Could not clean clipboard exports:', error);
  }
};

export const createClipboardExportDirectory = async () => {
  await fs.mkdir(getExportRoot(), { recursive: true });
  return fs.mkdtemp(path.join(getExportRoot(), 'export-'));
};

export const scheduleClipboardExportCleanup = (directory: string) => {
  setTimeout(() => {
    void removeClipboardExport(directory).catch((error) => console.warn('Could not remove clipboard export:', error));
  }, 60_000).unref();
};

// Windows needs a native FileDrop payload, not text containing the file paths.
// Read JSON over stdin so filenames are never interpreted as PowerShell code.
export const copyFilesToClipboard = async (filePaths: string[]) => {
  if (process.platform !== 'win32') throw new Error('Copy as File is currently supported on Windows only.');
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$paths = ConvertFrom-Json ([Console]::In.ReadToEnd())
$files = New-Object System.Collections.Specialized.StringCollection
foreach ($file in $paths) { [void]$files.Add([string]$file) }
$data = New-Object System.Windows.Forms.DataObject
$data.SetFileDropList($files)
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true, 10, 100)
`;
  await new Promise<void>((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'],
    });
    let errorOutput = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Copying the files to the clipboard timed out.')); }, 15_000);
    child.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(errorOutput || 'Could not copy files to the clipboard.'));
    });
    child.stdin.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.stdin.end(JSON.stringify(filePaths));
  });
};
