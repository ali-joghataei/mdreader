import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

export const listSystemFonts = async () => {
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
