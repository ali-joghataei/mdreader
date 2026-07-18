import { parseDocument } from 'yaml';

export type FrontMatterResult = {
  body: string;
  attributes: Record<string, unknown> | null;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseFrontMatter = (source: string): FrontMatterResult => {
  const opening = source.match(/^\uFEFF?---[ \t]*(?:\r\n|\n|\r)/);
  if (!opening) return { body: source, attributes: null };

  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r\n|\n|\r|$)/gm;
  closing.lastIndex = opening[0].length;
  const match = closing.exec(source);
  if (!match) return { body: source, attributes: null };

  const yamlSource = source.slice(opening[0].length, match.index);
  const document = parseDocument(yamlSource, { prettyErrors: false });
  if (document.errors.length > 0) return { body: source, attributes: null };

  const attributes: unknown = document.toJS({ maxAliasCount: 100 });
  if (!isRecord(attributes)) return { body: source, attributes: null };

  return {
    body: source.slice(match.index + match[0].length),
    attributes,
  };
};

const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '<span class="front-matter-empty">&mdash;</span>';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="front-matter-empty">&mdash;</span>';
    return `<ul class="front-matter-list">${value
      .map((item) => `<li>${renderValue(item)}</li>`)
      .join('')}</ul>`;
  }

  if (isRecord(value)) {
    return `<dl class="front-matter-nested">${Object.entries(value)
      .map(
        ([key, nestedValue]) =>
          `<div><dt>${escapeHtml(key)}</dt><dd>${renderValue(nestedValue)}</dd></div>`,
      )
      .join('')}</dl>`;
  }

  return `<span>${escapeHtml(String(value))}</span>`;
};

export const renderFrontMatter = (attributes: Record<string, unknown> | null) => {
  if (!attributes || Object.keys(attributes).length === 0) return '';

  const fields = Object.entries(attributes)
    .map(
      ([key, value]) =>
        `<div class="front-matter-field"><dt>${escapeHtml(key)}</dt><dd>${renderValue(value)}</dd></div>`,
    )
    .join('');

  return `<section class="front-matter" aria-label="Front Matter"><dl class="front-matter-fields">${fields}</dl></section>`;
};
