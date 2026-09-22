import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ExportDestination } from './shared/contracts';
import { copyFilesToClipboard, createClipboardExportDirectory, removeClipboardExport, scheduleClipboardExportCleanup } from './main/clipboard-files';

// html-to-docx does not publish TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HTMLtoDOCX = require('html-to-docx') as (
  html: string,
  header?: string | null,
  options?: Record<string, unknown>,
) => Promise<Buffer>;

export type ExportFormat = 'docx' | 'pdf' | 'html' | 'txt' | 'epub' | 'xlsx' | 'csv';

export type ExportTable = {
  name: string;
  rows: string[][];
};

export type ExportDocument = {
  format: ExportFormat;
  destination?: ExportDestination;
  title: string;
  sourceFilePath: string | null;
  html: string;
  css: string;
  plainText: string;
  tables: ExportTable[];
};

export type ExportResult = {
  canceled: boolean;
  filePaths: string[];
};

const extensionByFormat: Record<Exclude<ExportFormat, 'csv'>, string> = {
  docx: 'docx',
  pdf: 'pdf',
  html: 'html',
  txt: 'txt',
  epub: 'epub',
  xlsx: 'xlsx',
};

const labelByFormat: Record<Exclude<ExportFormat, 'csv'>, string> = {
  docx: 'Word Document',
  pdf: 'PDF Document',
  html: 'HTML Document',
  txt: 'Plain Text',
  epub: 'EPUB eBook',
  xlsx: 'Excel Workbook',
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeBaseName = (value: string) => {
  const cleaned = value
    .split('')
    .map((character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character,
    )
    .join('')
    .trim();
  return cleaned || 'Untitled';
};

const suggestedBasePath = (document: ExportDocument) => {
  if (document.sourceFilePath) {
    return path.join(
      path.dirname(document.sourceFilePath),
      path.basename(document.sourceFilePath, path.extname(document.sourceFilePath)),
    );
  }

  return safeBaseName(document.title);
};

const mimeForExtension = (extension: string) => {
  const mimes: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  };
  return mimes[extension.toLowerCase()] ?? 'application/octet-stream';
};

const embedLocalImages = async (html: string, sourceFilePath: string | null) => {
  const matches = Array.from(html.matchAll(/(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*>)/gi));
  let result = html;

  for (const match of matches) {
    const source = match[2].trim();
    if (!source || /^(?:data:|https?:|blob:)/i.test(source)) {
      continue;
    }

    try {
      const imagePath = source.startsWith('file:')
        ? fileURLToPath(source)
        : sourceFilePath
          ? path.resolve(path.dirname(sourceFilePath), decodeURIComponent(source.split(/[?#]/, 1)[0]))
          : null;
      if (!imagePath) {
        continue;
      }
      const data = await fs.readFile(imagePath);
      const mime = mimeForExtension(path.extname(imagePath).slice(1));
      const replacement = `${match[1]}data:${mime};base64,${data.toString('base64')}${match[3]}`;
      result = result.replace(match[0], replacement);
    } catch {
      // Keep the original source if an image cannot be read.
    }
  }

  return result;
};

const createHtmlDocument = (document: ExportDocument, bodyHtml: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(document.title)}</title>
  <style>
    :root { color-scheme: light; --background: #fff; --surface: #fff; --surface-subtle: #f6f8fa; --surface-muted: #f6f8fa; --text: #24292f; --text-strong: #1f2328; --text-muted: #57606a; --border: #d0d7de; --border-strong: #8c959f; --accent: #0969da; --reader-font-family: ${document.css.includes('--reader-font-family') ? 'inherit' : 'Arial, sans-serif'}; }
    html, body { margin: 0; background: #fff; color: #24292f; }
    body { padding: 0 24px; }
    .mermaid-open-button, .header-anchor { display: none !important; }
    @media print { body { padding: 0; } .markdown-body { width: auto !important; padding-top: 0 !important; } }
    ${document.css}
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;

const chooseFilePath = async (
  window: BrowserWindow,
  document: ExportDocument,
  format: Exclude<ExportFormat, 'csv'>,
) => {
  const extension = extensionByFormat[format];
  const result = await dialog.showSaveDialog(window, {
    title: `Export as ${labelByFormat[format]}`,
    defaultPath: `${suggestedBasePath(document)}.${extension}`,
    filters: [{ name: labelByFormat[format], extensions: [extension] }],
  });
  return result.canceled ? null : result.filePath ?? null;
};

const exportPdf = async (filePath: string, html: string) => {
  const tempPath = path.join(path.dirname(filePath), `.mdreader-export-${randomUUID()}.html`);
  const exportWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await fs.writeFile(tempPath, html, 'utf8');
    await exportWindow.loadFile(tempPath);
    const pdf = await exportWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    await fs.writeFile(filePath, pdf);
  } finally {
    exportWindow.destroy();
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
};

const uniqueSheetName = (workbook: ExcelJS.Workbook, requestedName: string, index: number) => {
  const base = (requestedName.replace(/[\\/*?:[\]]/g, ' ').trim() || `Table ${index + 1}`).slice(0, 31);
  let name = base;
  let suffix = 2;
  while (workbook.getWorksheet(name)) {
    const ending = ` ${suffix++}`;
    name = `${base.slice(0, 31 - ending.length)}${ending}`;
  }
  return name;
};

const createWorkbook = async (tables: ExportTable[]) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MdReader';
  workbook.created = new Date();
  tables.forEach((table, index) => {
    const sheet = workbook.addWorksheet(uniqueSheetName(workbook, table.name, index), {
      views: [{ state: 'frozen', ySplit: table.rows.length > 1 ? 1 : 0 }],
    });
    table.rows.forEach((row) => sheet.addRow(row));
    if (sheet.rowCount > 0) {
      const header = sheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      header.alignment = { vertical: 'middle', wrapText: true };
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, sheet.columnCount) } };
    }
    sheet.columns.forEach((column) => {
      let maxLength = 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        maxLength = Math.max(maxLength, String(cell.value ?? '').length);
        cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: true };
      });
      column.width = Math.min(60, maxLength + 2);
    });
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const toCsv = (rows: string[][]) => {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return `\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;
};

const exportCsv = async (window: BrowserWindow, document: ExportDocument): Promise<ExportResult> => {
  if (document.tables.length === 1) {
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Table as CSV',
      defaultPath: `${suggestedBasePath(document)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true, filePaths: [] };
    await fs.writeFile(result.filePath, toCsv(document.tables[0].rows), 'utf8');
    return { canceled: false, filePaths: [result.filePath] };
  }

  const result = await dialog.showOpenDialog(window, {
    title: 'Choose a Folder for CSV Files',
    defaultPath: path.dirname(suggestedBasePath(document)),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true, filePaths: [] };
  const base = safeBaseName(path.basename(suggestedBasePath(document)));
  const paths: string[] = [];
  for (let index = 0; index < document.tables.length; index += 1) {
    const table = document.tables[index];
    const tableName = safeBaseName(table.name || `table-${index + 1}`);
    const filePath = path.join(result.filePaths[0], `${base}-${index + 1}-${tableName}.csv`);
    await fs.writeFile(filePath, toCsv(table.rows), 'utf8');
    paths.push(filePath);
  }
  return { canceled: false, filePaths: paths };
};

const extractEpubImages = (zip: JSZip, html: string) => {
  const manifest: string[] = [];
  let imageIndex = 0;
  const updatedHtml = html.replace(
    /(<img\b[^>]*?\bsrc=["'])data:(image\/[^;]+);base64,([^"']+)(["'][^>]*>)/gi,
    (_match, prefix: string, mime: string, data: string, suffix: string) => {
      const subtype = mime.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg');
      const name = `image-${++imageIndex}.${subtype}`;
      zip.file(`OEBPS/images/${name}`, data, { base64: true });
      manifest.push(`<item id="image-${imageIndex}" href="images/${name}" media-type="${mime}"/>`);
      return `${prefix}images/${name}${suffix}`;
    },
  );
  return { html: updatedHtml, manifest };
};

const createEpub = async (document: ExportDocument, bodyHtml: string) => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const images = extractEpubImages(zip, bodyHtml);
  const identifier = `urn:uuid:${randomUUID()}`;
  const title = escapeHtml(document.title);
  zip.file('OEBPS/styles.css', document.css);
  zip.file('OEBPS/content.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title><meta charset="utf-8"/><link rel="stylesheet" type="text/css" href="styles.css"/></head><body>${images.html}</body></html>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol><li><a href="content.xhtml">${title}</a></li></ol></nav></body></html>`);
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${identifier}"/></head><docTitle><text>${title}</text></docTitle><navMap><navPoint id="navPoint-1" playOrder="1"><navLabel><text>${title}</text></navLabel><content src="content.xhtml"/></navPoint></navMap></ncx>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="styles.css" media-type="text/css"/>${images.manifest.join('')}</manifest><spine toc="ncx"><itemref idref="content"/></spine></package>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
};

export const exportDocument = async (
  window: BrowserWindow,
  document: ExportDocument,
): Promise<ExportResult> => {
  if ((document.format === 'xlsx' || document.format === 'csv') && document.tables.length === 0) {
    throw new Error('This document does not contain any tables to export.');
  }
  if (document.destination === 'clipboard') {
    const directory = await createClipboardExportDirectory();
    try {
      const base = safeBaseName(path.basename(suggestedBasePath(document)));
      const filePaths: string[] = [];
      if (document.format === 'csv') {
        for (const [index, table] of document.tables.entries()) {
          const name = document.tables.length === 1 ? base : `${base}-${index + 1}-${safeBaseName(table.name || `table-${index + 1}`)}`;
          const filePath = path.join(directory, `${name}.csv`);
          await fs.writeFile(filePath, toCsv(table.rows), 'utf8');
          filePaths.push(filePath);
        }
      } else {
        const filePath = path.join(directory, `${base}.${extensionByFormat[document.format]}`);
        await writeExportFile(document, filePath);
        filePaths.push(filePath);
      }
      await copyFilesToClipboard(filePaths);
      scheduleClipboardExportCleanup(directory);
      return { canceled: false, filePaths };
    } catch (error) {
      await removeClipboardExport(directory).catch(() => undefined);
      throw error;
    }
  }
  if (document.format === 'csv') return exportCsv(window, document);

  const filePath = await chooseFilePath(window, document, document.format);
  if (!filePath) return { canceled: true, filePaths: [] };

  await writeExportFile(document, filePath);
  return { canceled: false, filePaths: [filePath] };
};

const writeExportFile = async (document: ExportDocument, filePath: string) => {
  const embeddedBody = await embedLocalImages(document.html, document.sourceFilePath);
  const fullHtml = createHtmlDocument(document, embeddedBody);

  switch (document.format) {
    case 'html': await fs.writeFile(filePath, fullHtml, 'utf8'); break;
    case 'txt': await fs.writeFile(filePath, document.plainText, 'utf8'); break;
    case 'pdf': await exportPdf(filePath, fullHtml); break;
    case 'docx': {
      const docx = await HTMLtoDOCX(fullHtml, null, {
        title: document.title, creator: 'MdReader', pageSize: { width: '21cm', height: '29.7cm' },
        margins: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
        font: 'Arial', fontSize: '11pt', complexScriptFontSize: '11pt', table: { row: { cantSplit: true } },
      });
      await fs.writeFile(filePath, docx);
      break;
    }
    case 'epub': await fs.writeFile(filePath, await createEpub(document, embeddedBody)); break;
    case 'xlsx': await fs.writeFile(filePath, await createWorkbook(document.tables)); break;
  }
};
