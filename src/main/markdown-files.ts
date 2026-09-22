import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const markdownExtensions = new Set(['.md', '.markdown', '.mdown', '.mkd']);

export const isMarkdownFile = (filePath: string) =>
  markdownExtensions.has(path.extname(filePath).toLowerCase());

export const readMarkdownFile = async (filePath: string) => {
  if (!isMarkdownFile(filePath)) {
    throw new Error('Only Markdown files can be opened.');
  }

  const content = await fs.readFile(filePath, 'utf8');
  return {
    filePath,
    content,
  };
};

const resolveLocalLinkedPath = (sourceFilePath: string, href: string) => {
  const trimmedHref = href.trim();
  if (!trimmedHref || trimmedHref.startsWith('#')) {
    return null;
  }

  if (/^(https?:|mailto:)/i.test(trimmedHref)) {
    return null;
  }

  if (/^file:/i.test(trimmedHref)) {
    const fileUrl = new URL(trimmedHref);
    fileUrl.hash = '';
    fileUrl.search = '';
    return fileURLToPath(fileUrl);
  }

  if (process.platform === 'win32' && /^[a-z]:[\\/]/i.test(trimmedHref)) {
    return path.normalize(decodeURIComponent(trimmedHref.split(/[?#]/, 1)[0]));
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmedHref)) {
    return null;
  }

  const pathPart = trimmedHref.split(/[?#]/, 1)[0];
  const decodedPath = decodeURIComponent(pathPart);
  if (!sourceFilePath && !path.isAbsolute(decodedPath)) return null;
  return path.resolve(path.dirname(sourceFilePath), decodedPath);
};

export const getLocalLinkedTarget = (sourceFilePath: string, href: string) => {
  let filePath = resolveLocalLinkedPath(sourceFilePath, href);
  if (!filePath) return null;
  const suffix = /:(\d+)(?::(\d+))?$/.exec(filePath);
  const fragment = /^L(\d+)(?:C(\d+))?$/i.exec(getLinkHash(href) ?? '');
  const location = suffix ?? fragment;
  if (suffix) filePath = filePath.slice(0, suffix.index);
  const line = location ? Number(location[1]) : null;
  const column = location?.[2] ? Number(location[2]) : 1;
  if ((line !== null && (!Number.isSafeInteger(line) || line < 1)) ||
      !Number.isSafeInteger(column) || column < 1) {
    throw new Error('Line and column numbers must be positive integers.');
  }
  return { filePath, line, column };
};

export const getLocalLinkedFilePath = (sourceFilePath: string, href: string) =>
  getLocalLinkedTarget(sourceFilePath, href)?.filePath ?? null;

// Kept for callers that used the helper before it was generalized to all local files.
export const getLocalLinkedMarkdownPath = getLocalLinkedFilePath;

export const getLinkHash = (href: string) => {
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) {
    return null;
  }

  return decodeURIComponent(href.slice(hashIndex + 1));
};
