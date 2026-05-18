import './index.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import markdownItAbbr from 'markdown-it-abbr';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItContainer from 'markdown-it-container';
import markdownItDeflist from 'markdown-it-deflist';
import { full as markdownItEmoji } from 'markdown-it-emoji';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItMark from 'markdown-it-mark';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItTexmath from 'markdown-it-texmath';
import katex from 'katex';

type ViewMode = 'preview' | 'edit' | 'split';

type MarkdownDocument = {
  filePath: string;
  content: string;
};

type LinkedMarkdownDocument = MarkdownDocument & {
  hash: string | null;
};

type MenuCommand = 'open' | 'save' | 'save-as' | 'settings';

type AppSettings = {
  fontFamily: string | null;
};

const defaultFontStack =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const markdownParser = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (code, language) => {
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch {
        return '';
      }
    }

    return hljs.highlightAuto(code).value;
  },
})
  .use(markdownItAbbr)
  .use(markdownItAnchor, {
    permalink: markdownItAnchor.permalink.linkInsideHeader({
      symbol: '#',
      placement: 'after',
    }),
  })
  .use(markdownItContainer, 'info')
  .use(markdownItContainer, 'warning')
  .use(markdownItDeflist)
  .use(markdownItEmoji)
  .use(markdownItFootnote)
  .use(markdownItMark)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItTaskLists, { enabled: true, label: true })
  .use(markdownItTexmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: {
      throwOnError: false,
      output: 'html',
    },
  });

const blockDirectionSelector = [
  'p',
  'li',
  'blockquote',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'figcaption',
  'summary',
  'dd',
  'dt',
].join(',');

const rtlCharacterPattern = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const ltrCharacterPattern = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root is missing.');
}

app.innerHTML = `
  <div class="app-shell">
    <header class="toolbar">
      <div class="document-meta">
        <div class="file-name" id="fileName">Untitled</div>
        <div class="file-path" id="filePath">Open or drop a Markdown file</div>
      </div>
      <div class="dirty-badge" id="dirtyBadge" hidden>Unsaved</div>
      <div class="toolbar-actions">
        <button class="icon-button" id="openButton" title="Open Markdown file" aria-label="Open Markdown file">Open</button>
        <button class="icon-button" id="saveButton" title="Save" aria-label="Save">Save</button>
        <button class="icon-button" id="saveAsButton" title="Save as" aria-label="Save as">Save As</button>
        <button class="icon-button" id="settingsButton" title="Settings" aria-label="Settings">Settings</button>
      </div>
      <div class="mode-switch" role="tablist" aria-label="View mode">
        <button class="mode-button active" data-mode="preview" role="tab" aria-selected="true">Preview</button>
        <button class="mode-button" data-mode="edit" role="tab" aria-selected="false">Edit</button>
        <button class="mode-button" data-mode="split" role="tab" aria-selected="false">Split</button>
      </div>
    </header>
    <main class="workspace preview-mode" id="workspace">
      <section class="pane editor-pane" aria-label="Markdown editor">
        <div id="editor"></div>
      </section>
      <section class="pane preview-pane" aria-label="Markdown preview">
        <article class="markdown-body" id="preview"></article>
      </section>
      <div class="drop-overlay" id="dropOverlay">Drop Markdown file to open</div>
    </main>
    <div class="settings-modal" id="settingsModal" hidden>
      <div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <div class="settings-header">
          <h2 id="settingsTitle">Settings</h2>
          <button class="close-button" id="closeSettingsButton" title="Close settings" aria-label="Close settings">x</button>
        </div>
        <label class="settings-field" for="fontSelect">
          <span>Font</span>
          <select id="fontSelect">
            <option value="">System default</option>
          </select>
        </label>
        <div class="settings-preview" id="settingsPreview">
          # Markdown Preview
          The quick brown fox jumps over the lazy dog.
        </div>
        <div class="settings-actions">
          <button class="icon-button" id="resetFontButton">Use Default</button>
          <button class="icon-button primary-button" id="saveSettingsButton">Save</button>
        </div>
      </div>
    </div>
  </div>
`;

const fileNameElement = document.querySelector<HTMLDivElement>('#fileName');
const filePathElement = document.querySelector<HTMLDivElement>('#filePath');
const dirtyBadge = document.querySelector<HTMLDivElement>('#dirtyBadge');
const workspace = document.querySelector<HTMLElement>('#workspace');
const preview = document.querySelector<HTMLElement>('#preview');
const editorHost = document.querySelector<HTMLDivElement>('#editor');
const openButton = document.querySelector<HTMLButtonElement>('#openButton');
const saveButton = document.querySelector<HTMLButtonElement>('#saveButton');
const saveAsButton = document.querySelector<HTMLButtonElement>('#saveAsButton');
const settingsButton = document.querySelector<HTMLButtonElement>('#settingsButton');
const dropOverlay = document.querySelector<HTMLDivElement>('#dropOverlay');
const settingsModal = document.querySelector<HTMLDivElement>('#settingsModal');
const closeSettingsButton =
  document.querySelector<HTMLButtonElement>('#closeSettingsButton');
const fontSelect = document.querySelector<HTMLSelectElement>('#fontSelect');
const settingsPreview = document.querySelector<HTMLDivElement>('#settingsPreview');
const resetFontButton = document.querySelector<HTMLButtonElement>('#resetFontButton');
const saveSettingsButton =
  document.querySelector<HTMLButtonElement>('#saveSettingsButton');
const modeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.mode-button'),
);

if (
  !fileNameElement ||
  !filePathElement ||
  !dirtyBadge ||
  !workspace ||
  !preview ||
  !editorHost ||
  !openButton ||
  !saveButton ||
  !saveAsButton ||
  !settingsButton ||
  !dropOverlay ||
  !settingsModal ||
  !closeSettingsButton ||
  !fontSelect ||
  !settingsPreview ||
  !resetFontButton ||
  !saveSettingsButton
) {
  throw new Error('Required UI elements are missing.');
}

let currentFilePath: string | null = null;
let savedContent = '';
let currentContent = '';
let mode: ViewMode = 'preview';
let isApplyingDocument = false;
let appSettings: AppSettings = {
  fontFamily: null,
};
let fontsLoaded = false;

const editorTheme = new Compartment();
const editor = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: '',
    extensions: [
      basicSetup,
      markdown(),
      editorTheme.of(EditorView.theme({ '&': { height: '100%' } })),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || isApplyingDocument) {
          return;
        }

        currentContent = update.state.doc.toString();
        renderPreview();
        syncDocumentState();
      }),
    ],
  }),
});

const getBaseName = (filePath: string | null) => {
  if (!filePath) {
    return 'Untitled';
  }

  return filePath.split(/[\\/]/).pop() ?? filePath;
};

const isDirty = () => currentContent !== savedContent;

const toCssFontFamily = (fontFamily: string | null) => {
  if (!fontFamily) {
    return defaultFontStack;
  }

  return `"${fontFamily.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${defaultFontStack}`;
};

const applySettings = (settings: AppSettings) => {
  appSettings = {
    fontFamily: settings.fontFamily?.trim() || null,
  };
  document.documentElement.style.setProperty(
    '--reader-font-family',
    toCssFontFamily(appSettings.fontFamily),
  );
  fontSelect.value = appSettings.fontFamily ?? '';
  settingsPreview.style.fontFamily = toCssFontFamily(appSettings.fontFamily);
};

const syncDocumentState = () => {
  const dirty = isDirty();

  fileNameElement.textContent = getBaseName(currentFilePath);
  filePathElement.textContent = currentFilePath ?? 'Open or drop a Markdown file';
  dirtyBadge.hidden = !dirty;
  document.title = `${dirty ? '● ' : ''}${getBaseName(currentFilePath)} - MdReader`;

  window.mdReader.setDocumentState({
    filePath: currentFilePath,
    isDirty: dirty,
  });
};

const renderPreview = () => {
  const rawHtml = markdownParser.render(currentContent);
  preview.innerHTML = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['target', 'rel', 'class'],
  });

  applyPreviewDirection();

  preview.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) {
      return;
    }

    if (/^(https?:|mailto:)/i.test(href)) {
      link.target = '_blank';
      link.rel = 'noreferrer';
    }
  });
};

const getTextDirection = (text: string) => {
  let rtlCount = 0;
  let ltrCount = 0;
  const sample = text.replace(/https?:\/\/\S+|\S+@\S+/g, '').slice(0, 400);
  let firstStrongDirection: 'rtl' | 'ltr' | null = null;

  for (const character of sample) {
    if (rtlCharacterPattern.test(character)) {
      rtlCount += 1;
      firstStrongDirection ??= 'rtl';
      continue;
    }

    if (ltrCharacterPattern.test(character)) {
      ltrCount += 1;
      firstStrongDirection ??= 'ltr';
    }
  }

  if (rtlCount === 0 && ltrCount === 0) {
    return null;
  }

  if (rtlCount >= 2 && (firstStrongDirection === 'rtl' || ltrCount <= rtlCount * 4)) {
    return 'rtl';
  }

  if (ltrCount > rtlCount) {
    return 'ltr';
  }

  return null;
};

const getDirectionalText = (element: HTMLElement) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('pre, code, kbd, samp')) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textParts: string[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    textParts.push(currentNode.textContent ?? '');
    currentNode = walker.nextNode();
  }

  return textParts.join(' ');
};

const applyPreviewDirection = () => {
  preview.querySelectorAll<HTMLElement>('pre, code, kbd, samp').forEach((element) => {
    element.dir = 'ltr';
  });

  preview.querySelectorAll<HTMLElement>(blockDirectionSelector).forEach((element) => {
    if (element.closest('pre, code, kbd, samp')) {
      return;
    }

    const direction = getTextDirection(getDirectionalText(element));
    if (direction) {
      element.dir = direction;
      element.classList.toggle('rtl-block', direction === 'rtl');
      element.classList.toggle('ltr-block', direction === 'ltr');
      return;
    }

    element.removeAttribute('dir');
    element.classList.remove('rtl-block', 'ltr-block');
  });

  preview.querySelectorAll<HTMLElement>('ul, ol').forEach((list) => {
    const directItems = Array.from(list.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI',
    );
    const rtlItems = directItems.filter((item) => item.dir === 'rtl').length;
    const ltrItems = directItems.filter((item) => item.dir === 'ltr').length;

    if (rtlItems > ltrItems) {
      list.dir = 'rtl';
      return;
    }

    if (ltrItems > rtlItems) {
      list.dir = 'ltr';
      return;
    }

    list.removeAttribute('dir');
  });
};

const setEditorContent = (content: string) => {
  isApplyingDocument = true;
  editor.dispatch({
    changes: {
      from: 0,
      to: editor.state.doc.length,
      insert: content,
    },
  });
  isApplyingDocument = false;
};

const openDocument = (document: MarkdownDocument) => {
  currentFilePath = document.filePath;
  savedContent = document.content;
  currentContent = document.content;
  setEditorContent(document.content);
  renderPreview();
  syncDocumentState();
  setMode('preview');
};

const scrollToHash = (hash: string | null) => {
  if (!hash) {
    return;
  }

  document.getElementById(hash)?.scrollIntoView({ block: 'start' });
};

const openLinkedDocument = (document: LinkedMarkdownDocument) => {
  openDocument(document);
  window.requestAnimationFrame(() => scrollToHash(document.hash));
};

const openMarkdownLink = async (href: string) => {
  if (href.startsWith('#')) {
    scrollToHash(decodeURIComponent(href.slice(1)));
    return;
  }

  if (!currentFilePath) {
    window.location.href = href;
    return;
  }

  const document = await window.mdReader.openLinkedMarkdown(currentFilePath, href);
  if (document) {
    openLinkedDocument(document);
  }
};

const openFromDialog = async () => {
  const document = await window.mdReader.openMarkdownDialog();
  if (document) {
    openDocument(document);
  }
};

const save = async () => {
  if (!currentFilePath) {
    await saveAs();
    return;
  }

  const document = await window.mdReader.saveMarkdownFile(
    currentFilePath,
    currentContent,
  );
  savedContent = document.content;
  currentFilePath = document.filePath;
  syncDocumentState();
};

const saveAs = async () => {
  const document = await window.mdReader.saveMarkdownFileAs(
    currentContent,
    currentFilePath ?? undefined,
  );

  if (document) {
    savedContent = document.content;
    currentFilePath = document.filePath;
    syncDocumentState();
  }
};

const loadFonts = async () => {
  if (fontsLoaded) {
    return;
  }

  const fonts = await window.mdReader.listSystemFonts();
  const selectedFont = appSettings.fontFamily;
  fontSelect.replaceChildren(new Option('System default', ''));

  fonts.forEach((font) => {
    const option = new Option(font, font);
    option.style.fontFamily = toCssFontFamily(font);
    fontSelect.add(option);
  });

  if (selectedFont && !fonts.includes(selectedFont)) {
    fontSelect.add(new Option(`${selectedFont} (missing)`, selectedFont));
  }

  fontSelect.value = selectedFont ?? '';
  fontsLoaded = true;
};

const openSettings = async () => {
  await loadFonts();
  fontSelect.value = appSettings.fontFamily ?? '';
  settingsPreview.style.fontFamily = toCssFontFamily(fontSelect.value || null);
  settingsModal.hidden = false;
  fontSelect.focus();
};

const closeSettings = () => {
  settingsModal.hidden = true;
};

const saveSettings = async () => {
  const settings = await window.mdReader.saveSettings({
    fontFamily: fontSelect.value || null,
  });
  applySettings(settings);
  closeSettings();
};

function setMode(nextMode: ViewMode) {
  mode = nextMode;
  workspace.classList.toggle('preview-mode', mode === 'preview');
  workspace.classList.toggle('edit-mode', mode === 'edit');
  workspace.classList.toggle('split-mode', mode === 'split');

  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
}

const showOpenError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  preview.innerHTML = `<div class="empty-state"><h1>Could not open file</h1><p>${DOMPurify.sanitize(
    message,
  )}</p></div>`;
};

openButton.addEventListener('click', () => {
  void openFromDialog().catch(showOpenError);
});

saveButton.addEventListener('click', () => {
  void save().catch(showOpenError);
});

saveAsButton.addEventListener('click', () => {
  void saveAs().catch(showOpenError);
});

settingsButton.addEventListener('click', () => {
  void openSettings().catch(showOpenError);
});

closeSettingsButton.addEventListener('click', closeSettings);

settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    closeSettings();
  }
});

fontSelect.addEventListener('change', () => {
  settingsPreview.style.fontFamily = toCssFontFamily(fontSelect.value || null);
});

resetFontButton.addEventListener('click', () => {
  fontSelect.value = '';
  settingsPreview.style.fontFamily = toCssFontFamily(null);
});

saveSettingsButton.addEventListener('click', () => {
  void saveSettings().catch(showOpenError);
});

preview.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
  const href = link?.getAttribute('href');
  if (!href || event.defaultPrevented) {
    return;
  }

  event.preventDefault();
  void openMarkdownLink(href).catch(showOpenError);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settingsModal.hidden) {
    closeSettings();
  }
});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setMode(button.dataset.mode as ViewMode);
  });
});

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropOverlay.classList.add('visible');
});

window.addEventListener('dragleave', (event) => {
  if (event.target === document.body || event.target === document.documentElement) {
    dropOverlay.classList.remove('visible');
  }
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  dropOverlay.classList.remove('visible');

  const file = event.dataTransfer?.files[0];
  if (!file) {
    return;
  }

  const filePath = window.mdReader.getPathForFile(file);
  if (!filePath) {
    showOpenError(new Error('The dropped file path could not be resolved.'));
    return;
  }

  void window.mdReader.readMarkdownFile(filePath).then(openDocument).catch(showOpenError);
});

window.mdReader.onOpenDocument(openDocument);
window.mdReader.onMenuCommand((command: MenuCommand) => {
  if (command === 'open') {
    void openFromDialog().catch(showOpenError);
  }

  if (command === 'save') {
    void save().catch(showOpenError);
  }

  if (command === 'save-as') {
    void saveAs().catch(showOpenError);
  }

  if (command === 'settings') {
    void openSettings().catch(showOpenError);
  }
});

preview.innerHTML = `
  <div class="empty-state">
    <h1>MdReader</h1>
    <p>Open or drop a Markdown file.</p>
  </div>
`;
void window.mdReader
  .getSettings()
  .then(applySettings)
  .catch(showOpenError)
  .finally(syncDocumentState);
