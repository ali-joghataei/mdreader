import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { watch, type FSWatcher } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type AppSettings,
  type DocumentState,
  type LinkedMarkdownDocument,
  type MenuCommand,
} from './shared/contracts';
import { listExplorerDirectory } from './main/explorer';
import {
  getLinkHash,
  getLocalLinkedMarkdownPath,
  isMarkdownFile,
  readMarkdownFile,
} from './main/markdown-files';
import { createSettingsStore } from './main/settings-store';
import { listSystemFonts } from './main/system-fonts';
let mainWindow: BrowserWindow | null = null;
let documentState: DocumentState = {
  filePath: null,
  isDirty: false,
};
let fileWatcher: FSWatcher | null = null;
let watchedFilePath: string | null = null;
let externalChangePending = false;
let suppressWatchUntil = 0;
let watchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const getLaunchFilePath = () => {
  const candidate = process.argv.find((arg) => {
    if (arg.startsWith('-')) {
      return false;
    }

    return path.isAbsolute(arg) && isMarkdownFile(arg);
  });

  return candidate ?? null;
};

const getSettingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const { readSettings, writeSettings } = createSettingsStore(getSettingsPath);

const suppressFileWatch = (durationMs = 750) => {
  suppressWatchUntil = Date.now() + durationMs;
};

const stopFileWatcher = () => {
  if (watchDebounceTimer) {
    clearTimeout(watchDebounceTimer);
    watchDebounceTimer = null;
  }

  fileWatcher?.close();
  fileWatcher = null;
  watchedFilePath = null;
  externalChangePending = false;
};

const notifyExternalFileChanged = () => {
  if (!mainWindow || !documentState.filePath) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.externalFileChanged, {
    filePath: documentState.filePath,
    isDirty: documentState.isDirty,
  });
  externalChangePending = false;
};

const markExternalFileChanged = () => {
  if (!documentState.filePath) {
    return;
  }

  externalChangePending = true;

  if (mainWindow?.isFocused()) {
    notifyExternalFileChanged();
  }
};

const startFileWatcher = (filePath: string | null) => {
  if (filePath === watchedFilePath) {
    return;
  }

  stopFileWatcher();

  if (!filePath) {
    return;
  }

  watchedFilePath = filePath;

  try {
    fileWatcher = watch(filePath, { persistent: false }, (eventType) => {
      if (eventType !== 'change') {
        return;
      }

      if (Date.now() < suppressWatchUntil) {
        return;
      }

      if (watchDebounceTimer) {
        clearTimeout(watchDebounceTimer);
      }

      watchDebounceTimer = setTimeout(() => {
        watchDebounceTimer = null;
        markExternalFileChanged();
      }, 200);
    });
  } catch {
    stopFileWatcher();
  }
};

const promptExternalFileChangeOnFocus = () => {
  if (!externalChangePending) {
    return;
  }

  notifyExternalFileChanged();
};

const updateWindowTitle = () => {
  if (!mainWindow) {
    return;
  }

  const fileName = documentState.filePath
    ? path.basename(documentState.filePath)
    : 'Untitled';
  const dirtyPrefix = documentState.isDirty ? '● ' : '';

  mainWindow.setTitle(`${dirtyPrefix}${fileName} - MdReader`);
  mainWindow.setDocumentEdited(documentState.isDirty);
};

const sendMenuCommand = (command: MenuCommand) => {
  mainWindow?.webContents.send(IPC_CHANNELS.menuCommand, command);
};

const buildMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuCommand('open'),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuCommand('save'),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuCommand('save-as'),
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendMenuCommand('settings'),
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        {
          role: 'toggleDevTools',
          accelerator:
            process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createWindow = (initialFilePath: string | null) => {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: 'MdReader',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  mainWindow.on('focus', promptExternalFileChangeOnFocus);

  mainWindow.webContents.once('did-finish-load', async () => {
    if (!initialFilePath) {
      updateWindowTitle();
      return;
    }

    try {
      const document = await readMarkdownFile(initialFilePath);
      mainWindow?.webContents.send(IPC_CHANNELS.openDocument, document);
      documentState = {
        filePath: document.filePath,
        isDirty: false,
      };
      startFileWatcher(document.filePath);
      updateWindowTitle();
    } catch (error) {
      dialog.showErrorBox(
        'Could not open Markdown file',
        error instanceof Error ? error.message : String(error),
      );
    }
  });
};

ipcMain.handle(IPC_CHANNELS.openMarkdownDialog, async () => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Markdown File',
    properties: ['openFile'],
    filters: [
      {
        name: 'Markdown',
        extensions: ['md', 'markdown', 'mdown', 'mkd'],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return readMarkdownFile(result.filePaths[0]);
});

ipcMain.handle(IPC_CHANNELS.readMarkdownFile, async (_event, filePath: string) =>
  readMarkdownFile(filePath),
);

ipcMain.handle(
  IPC_CHANNELS.openLinkedMarkdown,
  async (_event, sourceFilePath: string, href: string): Promise<LinkedMarkdownDocument | null> => {
    if (/^(https?:|mailto:)/i.test(href)) {
      await shell.openExternal(href);
      return null;
    }

    if (href.startsWith('#')) {
      const document = await readMarkdownFile(sourceFilePath);
      return {
        ...document,
        hash: getLinkHash(href),
      };
    }

    const linkedFilePath = getLocalLinkedMarkdownPath(sourceFilePath, href);
    if (!linkedFilePath) {
      throw new Error(`Unsupported link: ${href}`);
    }

    const document = await readMarkdownFile(linkedFilePath);
    return {
      ...document,
      hash: getLinkHash(href),
    };
  },
);

ipcMain.handle(
  IPC_CHANNELS.saveMarkdownFile,
  async (_event, filePath: string, content: string) => {
    suppressFileWatch();
    await fs.writeFile(filePath, content, 'utf8');
    return {
      filePath,
      content,
    };
  },
);

ipcMain.handle(
  IPC_CHANNELS.saveMarkdownFileAs,
  async (_event, content: string, suggestedPath?: string) => {
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Markdown File',
      defaultPath: suggestedPath ?? 'Untitled.md',
      filters: [
        {
          name: 'Markdown',
          extensions: ['md'],
        },
      ],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    suppressFileWatch();
    await fs.writeFile(result.filePath, content, 'utf8');
    return {
      filePath: result.filePath,
      content,
    };
  },
);

ipcMain.on(IPC_CHANNELS.externalFileChangeHandled, (_event, action: 'reload' | 'keep') => {
  externalChangePending = false;

  if (action === 'keep') {
    suppressFileWatch();
  }
});

ipcMain.handle(IPC_CHANNELS.getSettings, () => readSettings());

ipcMain.handle(IPC_CHANNELS.saveSettings, (_event, settings: AppSettings) =>
  writeSettings(settings),
);

ipcMain.handle(IPC_CHANNELS.listSystemFonts, async () => {
  return listSystemFonts();
});

ipcMain.handle(IPC_CHANNELS.listExplorerDirectory, async (_event, directoryPath: string) =>
  listExplorerDirectory(directoryPath),
);

ipcMain.handle(IPC_CHANNELS.dirname, (_event, filePath: string) => path.dirname(filePath));

ipcMain.on(IPC_CHANNELS.documentStateChanged, (_event, state: DocumentState) => {
  documentState = state;
  updateWindowTitle();

  if (state.filePath !== watchedFilePath) {
    startFileWatcher(state.filePath);
  }
});

app.whenReady().then(() => {
  buildMenu();
  createWindow(getLaunchFilePath());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(null);
  }
});
