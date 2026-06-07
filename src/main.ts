import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

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

type LinkedMarkdownDocument = {
  filePath: string;
  content: string;
  hash: string | null;
};

type ExplorerEntry = {
  name: string;
  filePath: string;
  type: 'directory' | 'markdown';
};

const markdownExtensions = new Set(['.md', '.markdown', '.mdown', '.mkd']);
let mainWindow: BrowserWindow | null = null;
let documentState: DocumentState = {
  filePath: null,
  isDirty: false,
};
let settingsCache: AppSettings | null = null;
const execFileAsync = promisify(execFile);

const isMarkdownFile = (filePath: string) =>
  markdownExtensions.has(path.extname(filePath).toLowerCase());

const getLaunchFilePath = () => {
  const candidate = process.argv.find((arg) => {
    if (arg.startsWith('-')) {
      return false;
    }

    return path.isAbsolute(arg) && isMarkdownFile(arg);
  });

  return candidate ?? null;
};

const readMarkdownFile = async (filePath: string) => {
  if (!isMarkdownFile(filePath)) {
    throw new Error('Only Markdown files can be opened.');
  }

  const content = await fs.readFile(filePath, 'utf8');
  return {
    filePath,
    content,
  };
};

const getLocalLinkedMarkdownPath = (sourceFilePath: string, href: string) => {
  const trimmedHref = href.trim();
  if (!trimmedHref || trimmedHref.startsWith('#')) {
    return null;
  }

  if (/^(https?:|mailto:)/i.test(trimmedHref)) {
    return null;
  }

  if (/^file:/i.test(trimmedHref)) {
    return fileURLToPath(trimmedHref);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmedHref)) {
    return null;
  }

  const pathPart = trimmedHref.split('#', 1)[0];
  return path.resolve(path.dirname(sourceFilePath), decodeURIComponent(pathPart));
};

const getLinkHash = (href: string) => {
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) {
    return null;
  }

  return decodeURIComponent(href.slice(hashIndex + 1));
};

const getSettingsPath = () => path.join(app.getPath('userData'), 'settings.json');

const readSettings = async (): Promise<AppSettings> => {
  if (settingsCache) {
    return settingsCache;
  }

  try {
    const content = await fs.readFile(getSettingsPath(), 'utf8');
    const parsed = JSON.parse(content) as Partial<AppSettings>;
    settingsCache = {
      fontFamily:
        typeof parsed.fontFamily === 'string' && parsed.fontFamily.trim()
          ? parsed.fontFamily
          : null,
      customizeEditorFont: parsed.customizeEditorFont === true,
      useEditorFont: parsed.useEditorFont === true,
      editorFontFamily:
        typeof parsed.editorFontFamily === 'string' && parsed.editorFontFamily.trim()
          ? parsed.editorFontFamily
          : null,
      themeMode:
        parsed.themeMode === 'light' || parsed.themeMode === 'dark'
          ? parsed.themeMode
          : 'auto',
    };
  } catch {
    settingsCache = {
      fontFamily: null,
      customizeEditorFont: false,
      useEditorFont: false,
      editorFontFamily: null,
      themeMode: 'auto',
    };
  }

  return settingsCache;
};

const writeSettings = async (settings: AppSettings) => {
  settingsCache = {
    fontFamily: settings.fontFamily?.trim() || null,
    customizeEditorFont: settings.customizeEditorFont === true,
    useEditorFont: settings.useEditorFont === true,
    editorFontFamily: settings.editorFontFamily?.trim() || null,
    themeMode:
      settings.themeMode === 'light' || settings.themeMode === 'dark'
        ? settings.themeMode
        : 'auto',
  };
  await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
  await fs.writeFile(
    getSettingsPath(),
    `${JSON.stringify(settingsCache, null, 2)}\n`,
    'utf8',
  );

  return settingsCache;
};

const normalizeFontName = (fontName: string) =>
  fontName
    .replace(/\s+\((?:OpenType|TrueType|Type 1|Raster|Vector)\)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const uniqueSortedFonts = (fonts: string[]) =>
  Array.from(new Set(fonts.map(normalizeFontName).filter(Boolean))).sort(
    (first, second) => first.localeCompare(second),
  );

const listWindowsFonts = async () => {
  const command = [
    "$paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', 'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')",
    'foreach ($path in $paths) {',
    '  if (Test-Path $path) {',
    '    (Get-ItemProperty -Path $path).PSObject.Properties |',
    "      Where-Object { $_.Name -notlike 'PS*' } |",
    '      ForEach-Object { $_.Name }',
    '  }',
    '}',
  ].join('\n');

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    command,
  ]);

  return uniqueSortedFonts(stdout.split(/\r?\n/));
};

const collectFontNames = (value: unknown, fonts: string[]) => {
  if (!value || typeof value !== 'object') {
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (
      (key === 'family' || key === '_name') &&
      typeof entry === 'string' &&
      entry.trim()
    ) {
      fonts.push(entry);
    }

    if (Array.isArray(entry)) {
      entry.forEach((item) => collectFontNames(item, fonts));
      return;
    }

    collectFontNames(entry, fonts);
  });
};

const listMacFonts = async () => {
  const { stdout } = await execFileAsync('system_profiler', [
    'SPFontsDataType',
    '-json',
  ]);
  const fonts: string[] = [];
  collectFontNames(JSON.parse(stdout), fonts);
  return uniqueSortedFonts(fonts);
};

const listLinuxFonts = async () => {
  const { stdout } = await execFileAsync('fc-list', [':', 'family']);
  const fonts = stdout
    .split(/\r?\n/)
    .flatMap((line) => line.split(','))
    .map((font) => font.trim());

  return uniqueSortedFonts(fonts);
};

const listSystemFonts = async () => {
  if (process.platform === 'win32') {
    return listWindowsFonts();
  }

  if (process.platform === 'darwin') {
    return listMacFonts();
  }

  if (process.platform === 'linux') {
    return listLinuxFonts();
  }

  return [];
};

const listExplorerDirectory = async (directoryPath: string) => {
  const resolvedPath = path.resolve(directoryPath);
  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  const filteredEntries: ExplorerEntry[] = entries
    .filter((entry) => entry.isDirectory() || isMarkdownFile(entry.name))
    .map((entry) => ({
      name: entry.name,
      filePath: path.join(resolvedPath, entry.name),
      type: entry.isDirectory() ? 'directory' : 'markdown',
    }));

  filteredEntries.sort((first, second) => {
    if (first.type !== second.type) {
      return first.type === 'directory' ? -1 : 1;
    }

    return first.name.localeCompare(second.name);
  });

  return {
    currentPath: resolvedPath,
    parentPath: path.dirname(resolvedPath) === resolvedPath ? null : path.dirname(resolvedPath),
    entries: filteredEntries,
  };
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

const sendMenuCommand = (command: 'open' | 'save' | 'save-as' | 'settings') => {
  mainWindow?.webContents.send('menu-command', command);
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
          label: 'Toggle Developer Tools',
          accelerator:
            process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
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

  mainWindow.webContents.once('did-finish-load', async () => {
    if (!initialFilePath) {
      updateWindowTitle();
      return;
    }

    try {
      const document = await readMarkdownFile(initialFilePath);
      mainWindow?.webContents.send('open-document', document);
      documentState = {
        filePath: document.filePath,
        isDirty: false,
      };
      updateWindowTitle();
    } catch (error) {
      dialog.showErrorBox(
        'Could not open Markdown file',
        error instanceof Error ? error.message : String(error),
      );
    }
  });
};

ipcMain.handle('dialog:openMarkdown', async () => {
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

ipcMain.handle('file:readMarkdown', async (_event, filePath: string) =>
  readMarkdownFile(filePath),
);

ipcMain.handle(
  'file:openLinkedMarkdown',
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
  'file:saveMarkdown',
  async (_event, filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf8');
    return {
      filePath,
      content,
    };
  },
);

ipcMain.handle(
  'dialog:saveMarkdownAs',
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

    await fs.writeFile(result.filePath, content, 'utf8');
    return {
      filePath: result.filePath,
      content,
    };
  },
);

ipcMain.handle('settings:get', () => readSettings());

ipcMain.handle('settings:save', (_event, settings: AppSettings) =>
  writeSettings(settings),
);

ipcMain.handle('fonts:list', async () => {
  return listSystemFonts();
});

ipcMain.handle('explorer:listDirectory', async (_event, directoryPath: string) =>
  listExplorerDirectory(directoryPath),
);

ipcMain.handle('path:dirname', (_event, filePath: string) => path.dirname(filePath));

ipcMain.on('document-state-changed', (_event, state: DocumentState) => {
  documentState = state;
  updateWindowTitle();
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
