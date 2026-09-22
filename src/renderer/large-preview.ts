// Keep the complete DOM for find, selection, anchors and export. Chromium can
// skip layout/paint of offscreen blocks while remembering their measured size.
export const optimizeLargePreview = (preview: HTMLElement, sourceLength: number) => {
  const large = sourceLength >= 100_000 || preview.childElementCount >= 600;
  preview.classList.toggle('large-preview', large);
  if (!large) return false;

  const charactersPerLine = Math.max(30, Math.floor(preview.clientWidth / 8));
  const fragment = document.createDocumentFragment();
  let section = document.createElement('div');
  let sectionHeight = 0;
  let sectionLength = 0;
  const finishSection = () => {
    if (!section.childNodes.length) return;
    section.className = 'preview-deferred-block';
    section.style.setProperty('--preview-estimated-height', `${sectionHeight}px`);
    fragment.append(section);
    section = document.createElement('div');
    sectionHeight = 0;
    sectionLength = 0;
  };
  for (const child of Array.from(preview.childNodes)) {
    const text = child.textContent ?? '';
    if (child.nodeType === Node.TEXT_NODE && !text.trim()) {
      section.append(child);
      continue;
    }
    const lines = text.split('\n').reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0,
    );
    section.append(child);
    sectionHeight += Math.max(32, lines * 25) + 16;
    sectionLength += text.length;
    // A few dozen containment regions are cheaper than thousands of regions.
    if (sectionLength >= 12_000 || section.childElementCount >= 60) finishSection();
  }
  finishSection();
  preview.replaceChildren(fragment);
  preview.querySelectorAll('img').forEach((image) => {
    image.loading = 'lazy';
    image.decoding = 'async';
  });
  return true;
};

export const removePreviewOptimization = (preview: HTMLElement) => {
  preview.classList.remove('large-preview');
  preview.querySelectorAll<HTMLElement>('.preview-deferred-block').forEach((block) => {
    block.replaceWith(...Array.from(block.childNodes));
  });
  preview.querySelectorAll('img').forEach((image) => image.removeAttribute('loading'));
};
