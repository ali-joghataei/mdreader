// After npm run build: node scripts/test-local-links.cjs [sample.md]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow, ipcMain } = require('electron');
const calls = [];
let editorAvailable = true;
let editorFails = false;
const mockElectron = {
  app: { getApplicationNameForProtocol: () => editorAvailable ? 'Visual Studio Code' : '' },
  shell: {
    openExternal: async (url) => { if (editorFails) throw new Error('No handler'); calls.push(['editor', url]); },
    openPath: async (file) => { calls.push(['default', file]); return ''; },
  },
};
function loadTs(relative) {
  const Module = require('node:module');
  const file = path.join(__dirname, '..', relative);
  const module = new Module(file, moduleParent);
  module.filename = file;
  module.paths = Module._nodeModulePaths(path.dirname(file));
  const originalRequire = module.require.bind(module);
  module.require = (id) => id === 'electron' ? mockElectron : originalRequire(id);
  const output = require('typescript').transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: require('typescript').ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  module._compile(output, file);
  return module.exports;
}
const moduleParent = module;
const { getLocalLinkedTarget, readMarkdownFile, isMarkdownFile } = loadTs('src/main/markdown-files.ts');
const { openLinkedFile } = loadTs('src/main/open-linked-file.ts');
const sample = process.argv[2] || path.join(__dirname, '../README.md');
const content = fs.readFileSync(sample, 'utf8');
const markdown = new (require('markdown-it'))();
const links = markdown.parse(content, {}).flatMap((token) => token.children ?? [])
  .filter((token) => token.type === 'link_open').map((token) => token.attrGet('href'));
ipcMain.handle('settings:get', () => ({}));
ipcMain.handle('path:dirname', (_event, file) => path.dirname(file));
ipcMain.handle('explorer:listDirectory', (_event, dir) => ({ currentPath: dir, parentPath: null, entries: [] }));
ipcMain.handle('file:openLinkedMarkdown', async (_event, source, href) => {
  const target = getLocalLinkedTarget(source, href);
  assert.ok(target);
  if (target.line !== null || !isMarkdownFile(target.filePath)) {
    await openLinkedFile(target.filePath, target.line, target.column);
    return null;
  }
  return { ...await readMarkdownFile(target.filePath), hash: null };
});
app.whenReady().then(async () => {
  console.log('Registered editor:', app.getApplicationNameForProtocol('vscode://file/'));
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, '../dist-electron/preload.js'), offscreen: true, backgroundThrottling: false,
  } });
  const evaluate = (code) => win.webContents.executeJavaScript(code);
  try {
    for (const href of links) {
      const target = getLocalLinkedTarget(sample, href);
      if (target) assert.ok(fs.statSync(target.filePath).isFile(), href);
    }
    const absolute = path.resolve(sample);
    for (const href of [absolute + ':17:5', pathToFileURL(absolute).href + ':17:5', absolute + '#L17C5']) {
      assert.deepEqual(getLocalLinkedTarget(sample, href), { filePath: absolute, line: 17, column: 5 });
    }
    for (const href of ['javascript:alert(1)', 'data:text/html,test', 'vscode://file/test', 'unknown:foo']) {
      assert.equal(getLocalLinkedTarget(sample, href), null);
    }
    await openLinkedFile(absolute, 17, 5);
    assert.equal(calls.at(-1)[0], 'editor');
    assert.ok(calls.at(-1)[1].endsWith(':17:5'));
    if (process.platform === 'win32') assert.match(calls.at(-1)[1], /^vscode:\/\/file\/[a-z]:\//i);
    editorAvailable = false;
    await openLinkedFile(absolute, 17);
    assert.deepEqual(calls.at(-1), ['default', absolute]);
    editorAvailable = true; editorFails = true;
    await openLinkedFile(absolute, 17);
    assert.deepEqual(calls.at(-1), ['default', absolute]);
    editorFails = false;
    const before = calls.length;
    await assert.rejects(() => openLinkedFile(absolute + '.missing', 17));
    assert.equal(calls.length, before);
    await win.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
    win.webContents.send('open-document', { filePath: absolute, content: content +
      `\n[File URL](<${pathToFileURL(absolute).href}>)\n<a href="javascript:alert(1)">Unsafe</a>\n<a href="unknown:foo">Unknown</a>` });
    const hrefs = await evaluate(`Array.from(document.querySelectorAll('#preview a[href]'), a => a.getAttribute('href'))`);
    for (const href of links) assert.ok(hrefs.includes(href), `Link stripped: ${href}`);
    assert.ok(hrefs.includes(pathToFileURL(absolute).href));
    assert.ok(!hrefs.some((href) => /^(javascript|unknown):/.test(href)));
    const codeLink = links.find((href) => /\.cs:\d+$/.test(href));
    if (codeLink) {
      await evaluate(`Array.from(document.querySelectorAll('#preview a')).find(a => a.getAttribute('href') === ${JSON.stringify(codeLink)}).click()`);
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(calls.at(-1)[0], 'editor');
      assert.ok(calls.at(-1)[1].includes('.cs:'));
    }
    const mdLink = links.find((href) => href.endsWith('EVIDENCE-LEDGER.fa.md'));
    if (mdLink) {
      await evaluate(`Array.from(document.querySelectorAll('#preview a')).find(a => a.getAttribute('href') === ${JSON.stringify(mdLink)}).click()`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok((await evaluate('document.title')).includes('EVIDENCE-LEDGER.fa.md'));
    }
    console.log(`PASS: ${links.length} sample links, file URLs, line/column, blocked schemes, editor routing/fallback, missing files and preview clicks.`);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
