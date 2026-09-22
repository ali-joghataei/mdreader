const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { build } = require('esbuild');

// Run with -NativeClipboard to verify Windows FileDrop and the real 60-second timer.
// This mode writes the clipboard; the PowerShell caller should preserve/restore it.
const native = process.argv.includes('-NativeClipboard');
const powershell = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from("$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); " + script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8' });

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mdreader-export-test-'));
  try {
    let savePath = path.join(temp, 'saved.txt');
    let saveCalls = 0;
    const electron = {
      app: { getPath: () => temp },
      dialog: {
        showSaveDialog: async () => { saveCalls++; return { canceled: !savePath, filePath: savePath }; },
        showOpenDialog: async () => ({ canceled: false, filePaths: [temp] }),
      },
    };
    const bundle = await build({ stdin: { contents: 'export * from "./src/export"; export * from "./src/main/clipboard-files";', resolveDir: path.resolve(__dirname, '..') }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
    const loaded = new Module(path.join(__dirname, 'clipboard-test-bundle.cjs'), module);
    loaded.filename = loaded.id;
    loaded.paths = module.paths;
    loaded.require = (name) => name === 'electron' ? electron : require(name);
    loaded._compile(bundle.outputFiles[0].text, loaded.filename);
    const api = loaded.exports;
    const document = { format: 'txt', title: 'گزارش $test', sourceFilePath: null, html: '<p>Hello</p>', css: '', plainText: 'Hello\n', tables: [] };
    const saved = await api.exportDocument(null, document);
    assert.deepEqual(saved.filePaths, [savePath]);
    assert.equal(await fs.readFile(savePath, 'utf8'), 'Hello\n');
    savePath = null;
    assert.equal((await api.exportDocument(null, document)).canceled, true);
    await assert.rejects(api.exportDocument(null, { ...document, format: 'csv', destination: 'clipboard' }), /does not contain any tables/);
    await assert.rejects(api.removeClipboardExport(temp), /Invalid clipboard export directory/);
    const stale = await api.createClipboardExportDirectory();
    await fs.writeFile(path.join(stale, 'stale.txt'), 'old');
    await api.cleanupClipboardExports();
    await assert.rejects(fs.stat(stale), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(temp, 'saved.txt'), 'utf8'), 'Hello\n');

    if (native) {
      const clipboardFiles = () => JSON.parse(powershell('Add-Type -AssemblyName System.Windows.Forms; ConvertTo-Json -Compress -InputObject @([System.Windows.Forms.Clipboard]::GetFileDropList())').trim());
      const copied = await api.exportDocument(null, { ...document, destination: 'clipboard' });
      assert.equal(saveCalls, 2, 'Clipboard export must not show a save dialog');
      assert.deepEqual(clipboardFiles(), copied.filePaths);
      assert.equal(await fs.readFile(copied.filePaths[0], 'utf8'), 'Hello\n');
      const csv = await api.exportDocument(null, { ...document, format: 'csv', destination: 'clipboard', tables: [
        { name: 'اول', rows: [['Name', 'Value'], ['a,b', '"quoted"']] },
        { name: 'دوم', rows: [['second']] },
      ] });
      assert.equal(csv.filePaths.length, 2);
      assert.deepEqual(clipboardFiles(), csv.filePaths);
      assert.match(await fs.readFile(csv.filePaths[0], 'utf8'), /"a,b","""quoted"""/);
      console.log('PASS: native Windows FileDrop, Unicode paths, multiple CSV files, save/cancel and startup cleanup.');
      if (!process.argv.includes('-SkipExpiration')) {
        console.log('Waiting for expiration.');
        await new Promise((resolve) => setTimeout(resolve, 61_000));
        for (const file of [...copied.filePaths, ...csv.filePaths]) await assert.rejects(fs.stat(file), { code: 'ENOENT' });
        console.log('PASS: clipboard export files deleted after one minute.');
      }
    } else {
      console.log('PASS: save/cancel, missing-table validation, safe cleanup boundaries and startup cleanup.');
    }
  } finally {
    // mkdtemp above creates this dedicated test directory, never a workspace/user directory.
    if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('mdreader-export-test-')) await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
