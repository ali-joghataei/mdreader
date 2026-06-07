import { contextBridge, ipcRenderer, webUtils } from 'electron';

type MenuCommand = 'open' | 'save' | 'save-as' | 'settings';

type MarkdownDocument = {
  filePath: string;
  content: string;
};

type LinkedMarkdownDocument = MarkdownDocument & {
  hash: string | null;
};

type DocumentState = {
  filePath: string | null;
  isDirty: boolean;
};

type AppSettings = {
  fontFamily: string | null;
  customizeEditorFont: boolean;
  useEditorFont: boolean;
  editorFontFamily: string | null;
  themeMode: 'auto' | 'light' | 'dark';
};

type ExplorerDirectory = {
  currentPath: string;
  parentPath: string | null;
  entries: Array<{
    name: string;
    filePath: string;
    type: 'directory' | 'markdown';
  }>;
};

type ExternalFileChangedEvent = {
  filePath: string;
  isDirty: boolean;
};

const api = {
  openMarkdownDialog: () =>
    ipcRenderer.invoke('dialog:openMarkdown') as Promise<MarkdownDocument | null>,
  readMarkdownFile: (filePath: string) =>
    ipcRenderer.invoke('file:readMarkdown', filePath) as Promise<MarkdownDocument>,
  openLinkedMarkdown: (sourceFilePath: string, href: string) =>
    ipcRenderer.invoke(
      'file:openLinkedMarkdown',
      sourceFilePath,
      href,
    ) as Promise<LinkedMarkdownDocument | null>,
  saveMarkdownFile: (filePath: string, content: string) =>
    ipcRenderer.invoke(
      'file:saveMarkdown',
      filePath,
      content,
    ) as Promise<MarkdownDocument>,
  saveMarkdownFileAs: (content: string, suggestedPath?: string) =>
    ipcRenderer.invoke(
      'dialog:saveMarkdownAs',
      content,
      suggestedPath,
    ) as Promise<MarkdownDocument | null>,
  setDocumentState: (state: DocumentState) => {
    ipcRenderer.send('document-state-changed', state);
  },
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke('settings:save', settings) as Promise<AppSettings>,
  listSystemFonts: () => ipcRenderer.invoke('fonts:list') as Promise<string[]>,
  listExplorerDirectory: (directoryPath: string) =>
    ipcRenderer.invoke(
      'explorer:listDirectory',
      directoryPath,
    ) as Promise<ExplorerDirectory>,
  dirname: (filePath: string) => ipcRenderer.invoke('path:dirname', filePath) as Promise<string>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onOpenDocument: (callback: (document: MarkdownDocument) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, document: MarkdownDocument) =>
      callback(document);
    ipcRenderer.on('open-document', listener);
    return () => ipcRenderer.off('open-document', listener);
  },
  onMenuCommand: (callback: (command: MenuCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: MenuCommand) =>
      callback(command);
    ipcRenderer.on('menu-command', listener);
    return () => ipcRenderer.off('menu-command', listener);
  },
  onExternalFileChanged: (callback: (event: ExternalFileChangedEvent) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: ExternalFileChangedEvent,
    ) => callback(payload);
    ipcRenderer.on('external-file-changed', listener);
    return () => ipcRenderer.off('external-file-changed', listener);
  },
  acknowledgeExternalFileChange: (action: 'reload' | 'keep') => {
    ipcRenderer.send('external-file-change-handled', action);
  },
};

contextBridge.exposeInMainWorld('mdReader', api);

declare global {
  interface Window {
    mdReader: typeof api;
  }
}
