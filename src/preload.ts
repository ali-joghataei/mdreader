import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  IPC_CHANNELS,
  type AppSettings,
  type DocumentState,
  type ExplorerDirectory,
  type ExportFormat,
  type ExportDestination,
  type ExternalFileChangedEvent,
  type LinkedMarkdownDocument,
  type MarkdownDocument,
  type MenuCommand,
} from './shared/contracts';

type ExportTable = {
  name: string;
  rows: string[][];
};

type ExportDocument = {
  format: ExportFormat;
  destination?: ExportDestination;
  title: string;
  sourceFilePath: string | null;
  html: string;
  css: string;
  plainText: string;
  tables: ExportTable[];
};

type ExportResult = {
  canceled: boolean;
  filePaths: string[];
};

const api = {
  openMarkdownDialog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.openMarkdownDialog) as Promise<MarkdownDocument | null>,
  readMarkdownFile: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.readMarkdownFile, filePath) as Promise<MarkdownDocument>,
  openLinkedMarkdown: (sourceFilePath: string, href: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.openLinkedMarkdown,
      sourceFilePath,
      href,
    ) as Promise<LinkedMarkdownDocument | null>,
  saveMarkdownFile: (filePath: string, content: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.saveMarkdownFile,
      filePath,
      content,
    ) as Promise<MarkdownDocument>,
  saveMarkdownFileAs: (content: string, suggestedPath?: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.saveMarkdownFileAs,
      content,
      suggestedPath,
    ) as Promise<MarkdownDocument | null>,
  exportDocument: (document: ExportDocument) =>
    ipcRenderer.invoke('document:export', document) as Promise<ExportResult>,
  showErrorMessage: (title: string, message: string) =>
    ipcRenderer.invoke('dialog:showError', title, message) as Promise<void>,
  setDocumentState: (state: DocumentState) => {
    ipcRenderer.send(IPC_CHANNELS.documentStateChanged, state);
  },
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings) as Promise<AppSettings>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveSettings, settings) as Promise<AppSettings>,
  listSystemFonts: () => ipcRenderer.invoke(IPC_CHANNELS.listSystemFonts) as Promise<string[]>,
  listExplorerDirectory: (directoryPath: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.listExplorerDirectory,
      directoryPath,
    ) as Promise<ExplorerDirectory>,
  dirname: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.dirname, filePath) as Promise<string>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  onOpenDocument: (callback: (document: MarkdownDocument) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, document: MarkdownDocument) =>
      callback(document);
    ipcRenderer.on(IPC_CHANNELS.openDocument, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.openDocument, listener);
  },
  onMenuCommand: (callback: (command: MenuCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: MenuCommand) =>
      callback(command);
    ipcRenderer.on(IPC_CHANNELS.menuCommand, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.menuCommand, listener);
  },
  onExternalFileChanged: (callback: (event: ExternalFileChangedEvent) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: ExternalFileChangedEvent,
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.externalFileChanged, listener);
    return () => ipcRenderer.off(IPC_CHANNELS.externalFileChanged, listener);
  },
  acknowledgeExternalFileChange: (action: 'reload' | 'keep') => {
    ipcRenderer.send(IPC_CHANNELS.externalFileChangeHandled, action);
  },
};

contextBridge.exposeInMainWorld('mdReader', api);

declare global {
  interface Window {
    mdReader: typeof api;
  }
}
