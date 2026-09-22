export type ViewMode = 'preview' | 'edit' | 'split';

export type ExportFormat = 'docx' | 'pdf' | 'html' | 'txt' | 'epub' | 'xlsx' | 'csv';
export type ExportDestination = 'file' | 'clipboard';

export type MenuCommand =
  | 'open'
  | 'save'
  | 'save-as'
  | 'settings'
  | 'zoom-in'
  | 'zoom-out'
  | 'reset-zoom'
  | `export:${ExportFormat}`
  | `copy-file:${ExportFormat}`;

export type MarkdownDocument = {
  filePath: string;
  content: string;
};

export type LinkedMarkdownDocument = MarkdownDocument & {
  hash: string | null;
};

export type DocumentState = {
  filePath: string | null;
  isDirty: boolean;
};

export type ThemeMode = 'auto' | 'light' | 'dark';

export type AppSettings = {
  fontFamily: string | null;
  customizeEditorFont: boolean;
  useEditorFont: boolean;
  editorFontFamily: string | null;
  themeMode: ThemeMode;
};

export type ExplorerEntry = {
  name: string;
  filePath: string;
  type: 'directory' | 'markdown';
};

export type ExplorerDirectory = {
  currentPath: string;
  parentPath: string | null;
  entries: ExplorerEntry[];
};

export type ExternalFileChangedEvent = {
  filePath: string;
  isDirty: boolean;
};

export const IPC_CHANNELS = {
  openMarkdownDialog: 'dialog:openMarkdown',
  readMarkdownFile: 'file:readMarkdown',
  openLinkedMarkdown: 'file:openLinkedMarkdown',
  saveMarkdownFile: 'file:saveMarkdown',
  saveMarkdownFileAs: 'dialog:saveMarkdownAs',
  documentStateChanged: 'document-state-changed',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  listSystemFonts: 'fonts:list',
  listExplorerDirectory: 'explorer:listDirectory',
  dirname: 'path:dirname',
  openDocument: 'open-document',
  menuCommand: 'menu-command',
  externalFileChanged: 'external-file-changed',
  externalFileChangeHandled: 'external-file-change-handled',
} as const;
