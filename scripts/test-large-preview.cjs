// Run after npm run build: node scripts/test-large-preview.cjs
const assert = require('node:assert/strict');
const path = require('node:path');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow, ipcMain } = require('electron');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let snapshot;
let reportedError;
ipcMain.handle('settings:get', () => ({}));
ipcMain.handle('path:dirname', (_event, file) => path.dirname(file));
ipcMain.handle('explorer:listDirectory', (_event, directory) => ({ currentPath: directory, parentPath: null, entries: [] }));
ipcMain.handle('document:export', (_event, document) => { snapshot = document; return { canceled: true, filePaths: [] }; });
ipcMain.handle('dialog:showError', (_event, title, message) => { reportedError = `${title}: ${message}`; });

app.whenReady().then(async () => {
  setTimeout(() => { console.error('Preview smoke test timed out'); app.exit(1); }, 90_000).unref();
  const win = new BrowserWindow({ show: false, width: 1180, height: 820, webPreferences: {
    preload: path.join(__dirname, '../dist-electron/preload.js'), backgroundThrottling: false, offscreen: true,
  } });
  const evaluate = (fn) => win.webContents.executeJavaScript(`(${fn.toString()})()`);
  const open = async (content) => {
    win.webContents.send('open-document', { filePath: path.join(__dirname, 'fixture.md'), content });
    await evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const waitFor = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      if (await predicate()) return;
      if (reportedError) throw new Error(reportedError);
      await pause(100);
    }
    throw new Error('Timed out waiting for preview');
  };
  try {
    await win.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
    console.log('Renderer loaded');
    await open('# Small document\n\nNormal paragraph.');
    assert.equal(await evaluate(() => document.querySelector('#preview').classList.contains('large-preview')), false);
    const content = '# Start\n\n' + Array.from({ length: 2400 }, (_, i) =>
      `## Section ${i}\n\nمتن فارسی برای بررسی اسکرول و جهت نمایش. ${'A long paragraph with **formatted text** and a [link](#start). '.repeat(8)}\n\n`,
    ).join('') + '\n## Last target\n\nUNIQUE-END-MARKER\n\n| Item | Value |\n| --- | --- |\n| Exported | 42 |\n\n```mermaid\ngraph TD\nA-->B\n```\n\n```mermaid\ngraph TD\nC-->D\n```';
    await open(content);
    console.log('Large document loaded:', content.length, 'characters');
    assert.equal(await evaluate(() => document.querySelector('#preview').classList.contains('large-preview')), true);
    await pause(300);
    assert.equal(await evaluate(() => document.querySelectorAll('.mermaid-diagram > svg').length), 0);
    assert.equal(await evaluate(() => getComputedStyle(document.querySelector('#preview > div')).contentVisibility), 'auto');
    const timing = await evaluate(async () => {
      const scroll = document.querySelector('.preview-scroll');
      const measure = async () => {
        const frames = [];
        let last = performance.now();
        for (let i = 0; i < 90; i++) {
          scroll.scrollTop = i * 120;
          await new Promise(requestAnimationFrame);
          const now = performance.now(); frames.push(now - last); last = now;
        }
        frames.sort((a, b) => a - b);
        return { median: Math.round(frames[45]), p95: Math.round(frames[85]) };
      };
      const optimized = await measure();
      document.querySelector('#preview').classList.remove('large-preview');
      const baseline = await measure();
      document.querySelector('#preview').classList.add('large-preview');
      return { optimized, baseline };
    });
    console.log('Scroll frame intervals (ms):', timing);
    await evaluate(() => {
      const input = document.querySelector('#previewSearchInput');
      input.value = 'UNIQUE-END-MARKER';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await evaluate(() => document.querySelectorAll('mark.preview-search-match').length), 1);
    await waitFor(() => evaluate(() => document.querySelectorAll('.mermaid-diagram > svg').length === 2));
    assert.equal(await evaluate(() => new Set(Array.from(document.querySelectorAll('.mermaid-diagram > svg'), (svg) => svg.id)).size), 2);
    await evaluate(() => document.querySelector('#tocList a').click());
    await waitFor(() => evaluate(() => document.querySelector('.preview-scroll').scrollTop < 100));
    // A fresh document leaves its diagrams unseen; export must still render them.
    await open(content);
    win.webContents.send('menu-command', 'export:html');
    await waitFor(() => Boolean(snapshot));
    assert.ok(snapshot.html.includes('<svg'));
    assert.ok(snapshot.html.includes('UNIQUE-END-MARKER'));
    assert.ok(!snapshot.html.includes('preview-deferred-block'));
    assert.ok(!snapshot.html.includes('data-mermaid-source'));
    assert.equal(snapshot.tables[0].name, 'Last target');
    assert.deepEqual(snapshot.tables[0].rows, [['Item', 'Value'], ['Exported', '42']]);
    await open('# Small again\n\nNormal paragraph.');
    assert.equal(await evaluate(() => document.querySelectorAll('.preview-deferred-block').length), 0);
    console.log('PASS: small/large switching, deferred diagrams, search, anchors, unique SVGs and complete export.');
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.error(await evaluate(() => ({
      scroll: document.querySelector('.preview-scroll').scrollTop,
      marker: document.querySelector('mark')?.getBoundingClientRect().toJSON(),
      diagrams: Array.from(document.querySelectorAll('.mermaid-diagram'), (diagram) => ({
        pending: diagram.hasAttribute('data-mermaid-source'), rect: diagram.getBoundingClientRect().toJSON(),
      })),
    })));
    app.exit(1);
  }
});
