import './index.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import {
  ArrowUp,
  Columns2,
  Eye,
  FileText,
  Folder,
  Maximize2,
  PanelLeft,
  Pencil,
  Settings,
  SlidersHorizontal,
  createIcons,
} from 'lucide';
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
import {
  createMermaidViewerHtml,
  initializeMermaidViewerWindow,
} from './renderer/mermaid-viewer';
import { appTemplate } from './renderer/app-template';
import { getAppElements } from './renderer/dom';
import { getTextDirection } from './renderer/text-direction';
import type {
  AppSettings,
  ExplorerDirectory,
  LinkedMarkdownDocument,
  MarkdownDocument,
  MenuCommand,
  ViewMode,
} from './shared/contracts';
import { defaultAppSettings, normalizeSettings } from './shared/settings';

const defaultFontStack =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const softCodeBlockLanguages = new Set(['', 'text', 'txt', 'plain', 'plaintext']);
const contentZoomMin = 0.7;
const contentZoomMax = 1.8;
const contentZoomStep = 0.1;
const previewBaseFontSize = 15;
const editorBaseFontSize = 14;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const isSoftCodeBlockLanguage = (language: string | undefined) =>
  softCodeBlockLanguages.has(language ?? '');

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

const defaultFenceRenderer = markdownParser.renderer.rules.fence;
markdownParser.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();

  if (language === 'mermaid') {
    const source = encodeURIComponent(token.content);
    return `<div class="mermaid-diagram" data-mermaid-source="${source}"></div>`;
  }

  if (isSoftCodeBlockLanguage(language)) {
    const languageClass = language ? ` class="language-${escapeHtml(language)}"` : '';
    return `<pre class="soft-code-block"><code${languageClass}>${escapeHtml(
      token.content,
    )}</code></pre>\n`;
  }

  if (defaultFenceRenderer) {
    return defaultFenceRenderer(tokens, index, options, env, self);
  }

  return self.renderToken(tokens, index, options);
};

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

let previewRenderSerial = 0;
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root is missing.');
}

app.innerHTML = appTemplate;
const lucideIcons = {
  ArrowUp,
  Columns2,
  Eye,
  FileText,
  Folder,
  Maximize2,
  PanelLeft,
  Pencil,
  Settings,
  SlidersHorizontal,
};

createIcons({ icons: lucideIcons });

const {
  fileNameElement,
  filePathElement,
  dirtyBadge,
  workspace,
  contentShell,
  sidebarToggleButton,
  sidebarPath,
  fileTree,
  editorPane,
  previewPane,
  preview,
  previewSearch,
  previewSearchInput,
  previewSearchCount,
  previewSearchPreviousButton,
  previewSearchNextButton,
  closePreviewSearchButton,
  editorHost,
  settingsButton,
  paneToolbarsToggleButton,
  dropOverlay,
  externalChangeModal,
  externalChangeMessage,
  keepExternalChangeButton,
  reloadExternalChangeButton,
  settingsModal,
  closeSettingsButton,
  fontSelect,
  customizeEditorFontCheckbox,
  useEditorFontCheckbox,
  editorFontSelect,
  themeSelect,
  settingsPreview,
  resetFontButton,
  saveSettingsButton,
  modeButtons,
  editorDirectionButtons,
  previewWidthButtons,
} = getAppElements();
let currentFilePath: string | null = null;
let savedContent = '';
let currentContent = '';
let mode: ViewMode = 'preview';
let isApplyingDocument = false;
let appSettings: AppSettings = { ...defaultAppSettings };
let fontsLoaded = false;
let fontsLoadingPromise: Promise<void> | null = null;
let explorerDirectoryPath: string | null = null;
let isSidebarOpen = false;
let editorDirection: 'ltr' | 'rtl' = 'ltr';
let previewWidthMode: 'reader' | 'wide' = 'reader';
let arePaneToolbarsVisible = true;
let contentZoom = 1;
let previewSearchMatches: HTMLElement[] = [];
let previewSearchIndex = -1;
let previewSearchRestoreFocus: HTMLElement | null = null;
let activeWorkspacePane: 'editor' | 'preview' = 'preview';
let dropOverlayHideTimer: number | null = null;

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

const clearPreviewSearchHighlights = () => {
  preview.querySelectorAll('mark.preview-search-match').forEach((mark) => {
    const text = document.createTextNode(mark.textContent ?? '');
    mark.replaceWith(text);
    text.parentElement?.normalize();
  });

  previewSearchMatches = [];
  previewSearchIndex = -1;
};

const updatePreviewSearchCount = () => {
  if (previewSearchMatches.length === 0) {
    previewSearchCount.textContent = '0/0';
    previewSearchPreviousButton.disabled = true;
    previewSearchNextButton.disabled = true;
    return;
  }

  previewSearchCount.textContent = `${previewSearchIndex + 1}/${previewSearchMatches.length}`;
  previewSearchPreviousButton.disabled = false;
  previewSearchNextButton.disabled = false;
};

const getPreviewSearchTextNodes = () => {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest('script, style, textarea, input, select, button, svg')
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      return node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    nodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  return nodes;
};

const selectPreviewSearchMatch = (index: number) => {
  if (previewSearchMatches.length === 0) {
    previewSearchIndex = -1;
    updatePreviewSearchCount();
    return;
  }

  previewSearchMatches[previewSearchIndex]?.classList.remove('current');
  previewSearchIndex =
    (index + previewSearchMatches.length) % previewSearchMatches.length;
  const match = previewSearchMatches[previewSearchIndex];
  match.classList.add('current');
  match.scrollIntoView({ block: 'center', inline: 'nearest' });
  updatePreviewSearchCount();
};

const updatePreviewSearch = () => {
  const query = previewSearchInput.value.trim();
  clearPreviewSearchHighlights();

  if (!query) {
    updatePreviewSearchCount();
    return;
  }

  const lowerQuery = query.toLocaleLowerCase();
  getPreviewSearchTextNodes().forEach((node) => {
    const text = node.textContent ?? '';
    const lowerText = text.toLocaleLowerCase();
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let matchIndex = lowerText.indexOf(lowerQuery);

    while (matchIndex >= 0) {
      if (matchIndex > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, matchIndex)));
      }

      const mark = document.createElement('mark');
      mark.className = 'preview-search-match';
      mark.textContent = text.slice(matchIndex, matchIndex + query.length);
      fragment.append(mark);
      previewSearchMatches.push(mark);
      lastIndex = matchIndex + query.length;
      matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
    }

    if (lastIndex > 0) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
      node.replaceWith(fragment);
    }
  });

  selectPreviewSearchMatch(0);
};

const openPreviewSearch = () => {
  if (previewSearch.hidden) {
    previewSearchRestoreFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previewSearch.hidden = false;
  }

  previewSearchInput.focus();
  previewSearchInput.select();
  updatePreviewSearch();
};

const closePreviewSearch = () => {
  previewSearch.hidden = true;
  clearPreviewSearchHighlights();
  updatePreviewSearchCount();
  previewSearchRestoreFocus?.focus();
  previewSearchRestoreFocus = null;
};

const setActiveWorkspacePane = (pane: 'editor' | 'preview') => {
  activeWorkspacePane = pane;
};

const isPreviewSearchContext = () => {
  if (mode === 'edit') {
    return false;
  }

  if (mode === 'preview') {
    return true;
  }

  const active = document.activeElement;
  if (active instanceof Node && previewPane.contains(active)) {
    return true;
  }

  return activeWorkspacePane === 'preview';
};

const toCssFontFamily = (fontFamily: string | null) => {
  if (!fontFamily) {
    return defaultFontStack;
  }

  return `"${fontFamily.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${defaultFontStack}`;
};

const ensureSelectOption = (
  select: HTMLSelectElement,
  value: string | null,
  label = value,
) => {
  if (!value || Array.from(select.options).some((option) => option.value === value)) {
    return;
  }

  select.add(new Option(label ?? value, value));
};

const setFontControlsLoading = (isLoading: boolean) => {
  fontSelect.disabled = isLoading;
  fontSelect.classList.toggle('is-loading', isLoading);
  fontSelect.ariaBusy = String(isLoading);
  useEditorFontCheckbox.disabled = !customizeEditorFontCheckbox.checked;
  editorFontSelect.classList.toggle('is-loading', isLoading);
  editorFontSelect.ariaBusy = String(isLoading);
  editorFontSelect.disabled =
    isLoading || !customizeEditorFontCheckbox.checked || !useEditorFontCheckbox.checked;
};

const getEffectiveTheme = (themeMode: AppSettings['themeMode']) => {
  if (themeMode === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return themeMode;
};

const loadMermaid = async () => {
  mermaidPromise ??= import('mermaid').then((module) => module.default);
  return mermaidPromise;
};

const initializeMermaid = async () => {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    theme: getEffectiveTheme(appSettings.themeMode) === 'dark' ? 'dark' : 'default',
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
    },
  });

  return mermaid;
};

const showMermaidError = (
  container: HTMLElement,
  source: string,
  error: unknown,
) => {
  const title = document.createElement('strong');
  title.textContent = 'Could not render Mermaid diagram';

  const message = document.createElement('p');
  message.textContent = error instanceof Error ? error.message : String(error);

  const code = document.createElement('code');
  code.textContent = source;

  const pre = document.createElement('pre');
  pre.append(code);

  container.classList.add('mermaid-error');
  container.replaceChildren(title, message, pre);
};

const openMermaidViewer = (diagram: HTMLElement) => {
  const svg = diagram.querySelector<SVGSVGElement>('svg');
  if (!svg) {
    return;
  }

  const viewerSvg = svg.cloneNode(true) as SVGSVGElement;
  if (!viewerSvg.getAttribute('width') || !viewerSvg.getAttribute('height')) {
    try {
      const bounds = svg.getBBox();
      if (bounds.width > 0 && bounds.height > 0) {
        viewerSvg.setAttribute('width', String(Math.ceil(bounds.width)));
        viewerSvg.setAttribute('height', String(Math.ceil(bounds.height)));
      }
    } catch {
      // Some SVGs cannot report a bbox while styles are settling; keep Mermaid's markup.
    }
  }

  const viewerWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!viewerWindow) {
    return;
  }

  viewerWindow.document.open();
  viewerWindow.document.write(
    createMermaidViewerHtml(
      viewerSvg.outerHTML,
      getEffectiveTheme(appSettings.themeMode),
    ),
  );
  viewerWindow.document.close();
  initializeMermaidViewerWindow(viewerWindow);
};

const addMermaidViewerButton = (diagram: HTMLElement) => {
  const button = document.createElement('button');
  button.className = 'mermaid-open-button icon-button icon-only-button';
  button.type = 'button';
  button.title = 'Open diagram viewer';
  button.setAttribute('aria-label', 'Open diagram viewer');
  button.innerHTML = '<i data-lucide="maximize-2"></i>';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openMermaidViewer(diagram);
  });

  diagram.append(button);
  createIcons({ icons: lucideIcons });
};

const renderMermaidDiagrams = async (renderSerial: number) => {
  const diagrams = Array.from(
    preview.querySelectorAll<HTMLElement>('.mermaid-diagram[data-mermaid-source]'),
  );

  if (diagrams.length === 0) {
    return;
  }

  const mermaid = await initializeMermaid();

  if (renderSerial !== previewRenderSerial) {
    return;
  }

  for (const [index, diagram] of diagrams.entries()) {
    if (renderSerial !== previewRenderSerial) {
      return;
    }

    const encodedSource = diagram.dataset.mermaidSource;
    if (!encodedSource) {
      continue;
    }

    const source = decodeURIComponent(encodedSource);
    diagram.classList.add('is-loading');
    diagram.textContent = 'Rendering diagram...';

    try {
      const { svg, bindFunctions } = await mermaid.render(
        `mermaid-${renderSerial}-${index}`,
        source,
      );

      if (renderSerial !== previewRenderSerial) {
        return;
      }

      diagram.classList.remove('is-loading', 'mermaid-error');
      diagram.removeAttribute('data-mermaid-source');
      diagram.innerHTML = DOMPurify.sanitize(svg);
      bindFunctions?.(diagram);
      addMermaidViewerButton(diagram);
    } catch (error) {
      if (renderSerial !== previewRenderSerial) {
        return;
      }

      diagram.classList.remove('is-loading');
      showMermaidError(diagram, source, error);
    }
  }
};

const applySettings = (settings: AppSettings) => {
  appSettings = normalizeSettings(settings);
  const readerFontFamily = toCssFontFamily(appSettings.fontFamily);
  const editorFontFamily = appSettings.useEditorFont
    ? toCssFontFamily(appSettings.editorFontFamily)
    : readerFontFamily;
  document.documentElement.style.setProperty(
    '--reader-font-family',
    readerFontFamily,
  );
  document.documentElement.style.setProperty(
    '--editor-font-family',
    editorFontFamily,
  );
  document.documentElement.dataset.editorFontEnabled = String(
    appSettings.customizeEditorFont,
  );
  document.documentElement.dataset.theme = getEffectiveTheme(appSettings.themeMode);
  fontSelect.value = appSettings.fontFamily ?? '';
  editorFontSelect.value = appSettings.editorFontFamily ?? '';
  customizeEditorFontCheckbox.checked = appSettings.customizeEditorFont;
  useEditorFontCheckbox.checked = appSettings.useEditorFont;
  useEditorFontCheckbox.disabled = !appSettings.customizeEditorFont;
  editorFontSelect.disabled = !appSettings.customizeEditorFont || !appSettings.useEditorFont;
  themeSelect.value = appSettings.themeMode;
  settingsPreview.style.fontFamily = readerFontFamily;
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
  const renderSerial = ++previewRenderSerial;
  const rawHtml = markdownParser.render(currentContent);
  preview.innerHTML = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['target', 'rel', 'class', 'data-mermaid-source'],
  });

  applyPreviewDirection();
  void renderMermaidDiagrams(renderSerial).catch(showOpenError);

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

  if (!previewSearch.hidden) {
    updatePreviewSearch();
  }
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
  preview.querySelectorAll<HTMLElement>('pre.soft-code-block').forEach((pre) => {
    const direction = getTextDirection(pre.textContent ?? '') ?? 'auto';
    pre.dir = direction;
    pre.classList.toggle('rtl-block', direction === 'rtl');
    pre.classList.toggle('ltr-block', direction === 'ltr');

    pre.querySelectorAll<HTMLElement>('code').forEach((code) => {
      code.dir = direction;
    });
  });

  preview
    .querySelectorAll<HTMLElement>(
      'pre:not(.soft-code-block), pre:not(.soft-code-block) code, kbd, samp',
    )
    .forEach((element) => {
      element.dir = 'ltr';
    });

  preview.querySelectorAll<HTMLElement>('code:not(pre code)').forEach((element) => {
    const direction = getTextDirection(element.textContent ?? '') ?? 'ltr';
    element.dir = direction;
    element.classList.toggle('rtl-inline-code', direction === 'rtl');
    element.classList.toggle('ltr-inline-code', direction === 'ltr');
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

  preview.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    const headerCells = Array.from(table.querySelectorAll<HTMLElement>('thead th'));

    if (headerCells.length > 0 && headerCells.every((cell) => cell.dir === 'rtl')) {
      table.dir = 'rtl';
      return;
    }

    table.removeAttribute('dir');
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
  void setExplorerToCurrentFile().catch(showOpenError);
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

const closeExternalChangeModal = () => {
  externalChangeModal.hidden = true;
};

const openExternalChangeModal = (filePath: string, hasUnsavedChanges: boolean) => {
  const fileName = getBaseName(filePath);
  externalChangeMessage.textContent = hasUnsavedChanges
    ? `${fileName} was modified outside MdReader. Reloading will replace the file in MdReader and discard your unsaved changes. Do you want to reload from disk?`
    : `${fileName} was modified outside MdReader. Do you want to reload the file from disk?`;
  externalChangeModal.hidden = false;
  keepExternalChangeButton.focus();
};

const keepExternalDocument = () => {
  closeExternalChangeModal();
  window.mdReader.acknowledgeExternalFileChange('keep');
};

const reloadExternalDocument = async () => {
  if (!currentFilePath) {
    keepExternalDocument();
    return;
  }

  closeExternalChangeModal();
  window.mdReader.acknowledgeExternalFileChange('reload');

  const document = await window.mdReader.readMarkdownFile(currentFilePath);
  openDocument(document);
};

const handleExternalFileChanged = ({
  filePath,
}: {
  filePath: string;
  isDirty: boolean;
}) => {
  if (!currentFilePath || filePath !== currentFilePath || !externalChangeModal.hidden) {
    return;
  }

  openExternalChangeModal(filePath, isDirty());
};

const loadFonts = async () => {
  if (fontsLoaded) {
    return;
  }

  if (!fontsLoadingPromise) {
    setFontControlsLoading(true);
    fontsLoadingPromise = (async () => {
      const fonts = await window.mdReader.listSystemFonts();
      const selectedFont = appSettings.fontFamily;
      const selectedEditorFont = appSettings.editorFontFamily;
      fontSelect.replaceChildren(new Option('System default', ''));
      editorFontSelect.replaceChildren(new Option('Same as preview', ''));

      fonts.forEach((font) => {
        const option = new Option(font, font);
        option.style.fontFamily = toCssFontFamily(font);
        fontSelect.add(option);
        const editorOption = new Option(font, font);
        editorOption.style.fontFamily = toCssFontFamily(font);
        editorFontSelect.add(editorOption);
      });

      if (selectedFont && !fonts.includes(selectedFont)) {
        fontSelect.add(new Option(`${selectedFont} (missing)`, selectedFont));
      }

      if (selectedEditorFont && !fonts.includes(selectedEditorFont)) {
        editorFontSelect.add(new Option(`${selectedEditorFont} (missing)`, selectedEditorFont));
      }

      fontSelect.value = selectedFont ?? '';
      editorFontSelect.value = selectedEditorFont ?? '';
      fontsLoaded = true;
    })().finally(() => {
      fontsLoadingPromise = null;
      setFontControlsLoading(false);
    });
  }

  await fontsLoadingPromise;
};

const openSettings = () => {
  ensureSelectOption(fontSelect, appSettings.fontFamily);
  ensureSelectOption(editorFontSelect, appSettings.editorFontFamily);
  fontSelect.value = appSettings.fontFamily ?? '';
  editorFontSelect.value = appSettings.editorFontFamily ?? '';
  customizeEditorFontCheckbox.checked = appSettings.customizeEditorFont;
  useEditorFontCheckbox.checked = appSettings.useEditorFont;
  themeSelect.value = appSettings.themeMode;
  settingsPreview.style.fontFamily = toCssFontFamily(fontSelect.value || null);
  setFontControlsLoading(!fontsLoaded);
  settingsModal.hidden = false;
  closeSettingsButton.focus();
  window.requestAnimationFrame(() => {
    void loadFonts().catch(showOpenError);
  });
};

const closeSettings = () => {
  settingsModal.hidden = true;
};

const saveSettings = async () => {
  const settings = await window.mdReader.saveSettings({
    fontFamily: fontSelect.value || null,
    customizeEditorFont: customizeEditorFontCheckbox.checked,
    useEditorFont: useEditorFontCheckbox.checked,
    editorFontFamily: editorFontSelect.value || null,
    themeMode: themeSelect.value as AppSettings['themeMode'],
  });
  applySettings(settings);
  closeSettings();
};

const appendFileTreeItemContent = (
  button: HTMLButtonElement,
  iconName: 'arrow-up' | 'file-text' | 'folder',
  name: string,
) => {
  const icon = document.createElement('i');
  icon.className = 'file-tree-icon';
  icon.dataset.lucide = iconName;

  const label = document.createElement('span');
  label.className = 'file-tree-label';
  label.textContent = name;

  button.append(icon, label);
};

const renderFileTree = (directory: ExplorerDirectory) => {
  explorerDirectoryPath = directory.currentPath;
  sidebarPath.textContent = directory.currentPath;
  fileTree.replaceChildren();

  if (directory.parentPath) {
    const parentButton = document.createElement('button');
    parentButton.className = 'file-tree-item parent-item';
    parentButton.type = 'button';
    appendFileTreeItemContent(parentButton, 'arrow-up', '..');
    parentButton.addEventListener('click', () => {
      void loadExplorerDirectory(directory.parentPath).catch(showOpenError);
    });
    fileTree.append(parentButton);
  }

  directory.entries.forEach((entry) => {
    const button = document.createElement('button');
    button.className = `file-tree-item ${entry.type}-item`;
    button.type = 'button';
    appendFileTreeItemContent(
      button,
      entry.type === 'directory' ? 'folder' : 'file-text',
      entry.name,
    );
    button.title = entry.filePath;
    button.classList.toggle('active', entry.filePath === currentFilePath);
    button.addEventListener('click', () => {
      if (entry.type === 'directory') {
        void loadExplorerDirectory(entry.filePath).catch(showOpenError);
        return;
      }

      void window.mdReader.readMarkdownFile(entry.filePath).then(openDocument).catch(showOpenError);
    });
    fileTree.append(button);
  });

  createIcons({ icons: lucideIcons });
};

const loadExplorerDirectory = async (directoryPath: string | null) => {
  if (!directoryPath) {
    sidebarPath.textContent = 'No file open';
    fileTree.replaceChildren();
    return;
  }

  const directory = await window.mdReader.listExplorerDirectory(directoryPath);
  renderFileTree(directory);
};

const setExplorerToCurrentFile = async () => {
  if (!currentFilePath) {
    await loadExplorerDirectory(explorerDirectoryPath);
    return;
  }

  const directoryPath = await window.mdReader.dirname(currentFilePath);
  await loadExplorerDirectory(directoryPath);
};

const setSidebarOpen = (isOpen: boolean) => {
  isSidebarOpen = isOpen;
  contentShell.classList.toggle('sidebar-open', isSidebarOpen);
  sidebarToggleButton.setAttribute('aria-expanded', String(isSidebarOpen));
};

const setEditorDirection = (direction: 'ltr' | 'rtl') => {
  editorDirection = direction;
  editorHost.classList.toggle('editor-rtl', editorDirection === 'rtl');
  editorDirectionButtons.forEach((button) => {
    const isActive = button.dataset.editorDirection === editorDirection;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
};

const setPreviewWidthMode = (widthMode: 'reader' | 'wide') => {
  previewWidthMode = widthMode;
  previewPane.classList.toggle('preview-width-wide', previewWidthMode === 'wide');
  previewWidthButtons.forEach((button) => {
    const isActive = button.dataset.previewWidth === previewWidthMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
};

const setPaneToolbarsVisible = (isVisible: boolean) => {
  arePaneToolbarsVisible = isVisible;
  workspace.classList.toggle('pane-toolbars-hidden', !arePaneToolbarsVisible);
  paneToolbarsToggleButton.setAttribute('aria-pressed', String(arePaneToolbarsVisible));
  paneToolbarsToggleButton.classList.toggle('active', arePaneToolbarsVisible);
};

const clampContentZoom = (zoom: number) =>
  Math.min(contentZoomMax, Math.max(contentZoomMin, Number(zoom.toFixed(2))));

const setContentZoom = (zoom: number) => {
  contentZoom = clampContentZoom(zoom);
  workspace.style.setProperty('--content-zoom', String(contentZoom));
  workspace.style.setProperty(
    '--preview-content-font-size',
    `${previewBaseFontSize * contentZoom}px`,
  );
  workspace.style.setProperty(
    '--editor-content-font-size',
    `${editorBaseFontSize * contentZoom}px`,
  );
};

const stepContentZoom = (direction: 1 | -1) => {
  setContentZoom(contentZoom + direction * contentZoomStep);
};

const resetContentZoom = () => {
  setContentZoom(1);
};

function setMode(nextMode: ViewMode) {
  mode = nextMode;

  if (mode === 'edit' && !previewSearch.hidden) {
    closePreviewSearch();
  }

  if (mode === 'edit') {
    setActiveWorkspacePane('editor');
  } else if (mode === 'preview') {
    setActiveWorkspacePane('preview');
  }

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

settingsButton.addEventListener('click', () => {
  openSettings();
});

paneToolbarsToggleButton.addEventListener('click', () => {
  setPaneToolbarsVisible(!arePaneToolbarsVisible);
});

closeSettingsButton.addEventListener('click', closeSettings);

settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    closeSettings();
  }
});

keepExternalChangeButton.addEventListener('click', keepExternalDocument);

reloadExternalChangeButton.addEventListener('click', () => {
  void reloadExternalDocument().catch(showOpenError);
});

previewSearchInput.addEventListener('input', updatePreviewSearch);

previewSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    selectPreviewSearchMatch(
      previewSearchIndex + (event.shiftKey ? -1 : 1),
    );
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closePreviewSearch();
  }
});

previewSearchPreviousButton.addEventListener('click', () => {
  selectPreviewSearchMatch(previewSearchIndex - 1);
  previewSearchInput.focus();
});

previewSearchNextButton.addEventListener('click', () => {
  selectPreviewSearchMatch(previewSearchIndex + 1);
  previewSearchInput.focus();
});

closePreviewSearchButton.addEventListener('click', closePreviewSearch);

fontSelect.addEventListener('change', () => {
  settingsPreview.style.fontFamily = toCssFontFamily(fontSelect.value || null);
});

customizeEditorFontCheckbox.addEventListener('change', () => {
  setFontControlsLoading(fontsLoadingPromise !== null && !fontsLoaded);
});

useEditorFontCheckbox.addEventListener('change', () => {
  setFontControlsLoading(fontsLoadingPromise !== null && !fontsLoaded);
});

resetFontButton.addEventListener('click', () => {
  fontSelect.value = '';
  customizeEditorFontCheckbox.checked = false;
  useEditorFontCheckbox.checked = false;
  useEditorFontCheckbox.disabled = true;
  editorFontSelect.value = '';
  editorFontSelect.disabled = true;
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

editorPane.addEventListener('mousedown', () => {
  setActiveWorkspacePane('editor');
});

editorPane.addEventListener('focusin', () => {
  setActiveWorkspacePane('editor');
});

previewPane.addEventListener('mousedown', () => {
  setActiveWorkspacePane('preview');
});

previewPane.addEventListener('focusin', () => {
  setActiveWorkspacePane('preview');
});

const handleContentZoomShortcut = (event: KeyboardEvent) => {
  if (!event.ctrlKey && !event.metaKey) {
    return false;
  }

  if (event.code === 'Equal' || event.code === 'NumpadAdd') {
    event.preventDefault();
    stepContentZoom(1);
    return true;
  }

  if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    event.preventDefault();
    stepContentZoom(-1);
    return true;
  }

  if (event.code === 'Digit0' || event.code === 'Numpad0') {
    event.preventDefault();
    resetContentZoom();
    return true;
  }

  return false;
};

window.addEventListener('keydown', (event) => {
  if (handleContentZoomShortcut(event)) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyF') {
    if (!settingsModal.hidden || !externalChangeModal.hidden) {
      return;
    }

    if (!isPreviewSearchContext()) {
      return;
    }

    event.preventDefault();
    openPreviewSearch();
    return;
  }

  if (event.key === 'Escape' && !settingsModal.hidden) {
    closeSettings();
    return;
  }

  if (event.key === 'Escape' && !externalChangeModal.hidden) {
    event.preventDefault();
    keepExternalDocument();
    return;
  }

  if (event.key === 'Escape' && !previewSearch.hidden) {
    closePreviewSearch();
  }
});

window.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    stepContentZoom(event.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setMode(button.dataset.mode as ViewMode);
  });
});

editorDirectionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setEditorDirection(button.dataset.editorDirection as 'ltr' | 'rtl');
  });
});

previewWidthButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setPreviewWidthMode(button.dataset.previewWidth as 'reader' | 'wide');
  });
});

sidebarToggleButton.addEventListener('click', () => {
  setSidebarOpen(!isSidebarOpen);
  if (isSidebarOpen && !explorerDirectoryPath) {
    void setExplorerToCurrentFile().catch(showOpenError);
  }
});

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (appSettings.themeMode === 'auto') {
      document.documentElement.dataset.theme = getEffectiveTheme('auto');
    }
  });

const hideDropOverlay = () => {
  if (dropOverlayHideTimer !== null) {
    window.clearTimeout(dropOverlayHideTimer);
    dropOverlayHideTimer = null;
  }

  dropOverlay.classList.remove('visible');
};

const keepDropOverlayVisible = () => {
  dropOverlay.classList.add('visible');

  if (dropOverlayHideTimer !== null) {
    window.clearTimeout(dropOverlayHideTimer);
  }

  dropOverlayHideTimer = window.setTimeout(hideDropOverlay, 250);
};

const hasDraggedFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

const isOutsideViewport = (event: DragEvent) =>
  event.clientX <= 0 ||
  event.clientY <= 0 ||
  event.clientX >= window.innerWidth ||
  event.clientY >= window.innerHeight;

window.addEventListener('dragenter', (event) => {
  if (!hasDraggedFiles(event)) {
    return;
  }

  event.preventDefault();
  keepDropOverlayVisible();
});

window.addEventListener('dragover', (event) => {
  if (!hasDraggedFiles(event)) {
    return;
  }

  event.preventDefault();
  keepDropOverlayVisible();
});

window.addEventListener('dragleave', (event) => {
  if (
    !event.relatedTarget ||
    event.target === document.body ||
    event.target === document.documentElement ||
    isOutsideViewport(event)
  ) {
    hideDropOverlay();
  }
});

window.addEventListener('mouseout', (event) => {
  if (!event.relatedTarget) {
    hideDropOverlay();
  }
});

window.addEventListener('dragend', hideDropOverlay);
window.addEventListener('blur', hideDropOverlay);

window.addEventListener('drop', (event) => {
  event.preventDefault();
  hideDropOverlay();

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
window.mdReader.onExternalFileChanged(handleExternalFileChanged);
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
    openSettings();
  }

  if (command === 'zoom-in') {
    stepContentZoom(1);
  }

  if (command === 'zoom-out') {
    stepContentZoom(-1);
  }

  if (command === 'reset-zoom') {
    resetContentZoom();
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
