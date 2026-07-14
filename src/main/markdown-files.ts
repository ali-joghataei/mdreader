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

export const getLocalLinkedMarkdownPath = (sourceFilePath: string, href: string) => {
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

export const getLinkHash = (href: string) => {
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) {
    return null;
  }

  return decodeURIComponent(href.slice(hashIndex + 1));
};
