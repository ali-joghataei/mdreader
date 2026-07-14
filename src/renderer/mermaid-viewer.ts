const getCssVariable = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const createMermaidViewerHtml = (svgMarkup: string, theme: 'light' | 'dark') => {
  const colors = {
    bg: getCssVariable('--bg'),
    surface: getCssVariable('--surface'),
    surfaceSubtle: getCssVariable('--surface-subtle'),
    border: getCssVariable('--border'),
    borderStrong: getCssVariable('--border-strong'),
    text: getCssVariable('--text'),
    textMuted: getCssVariable('--text-muted'),
    accentSoft: getCssVariable('--accent-soft'),
  };

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mermaid Diagram</title>
  <style>
    :root {
      --bg: ${colors.bg};
      --surface: ${colors.surface};
      --surface-subtle: ${colors.surfaceSubtle};
      --border: ${colors.border};
      --border-strong: ${colors.borderStrong};
      --text: ${colors.text};
      --text-muted: ${colors.textMuted};
      --accent-soft: ${colors.accentSoft};
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      color: var(--text);
      background: var(--bg);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .mermaid-viewer {
      display: grid;
      grid-template-rows: auto 1fr;
      width: 100%;
      height: 100%;
    }

    .mermaid-viewer-toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
      min-height: 46px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }

    .mermaid-viewer-button {
      display: inline-grid;
      width: 34px;
      height: 34px;
      border: 1px solid var(--border-strong);
      border-radius: 7px;
      color: var(--text);
      background: var(--surface);
      cursor: pointer;
      place-items: center;
    }

    .mermaid-viewer-button:hover {
      background: var(--accent-soft);
    }

    .mermaid-viewer-button svg {
      width: 17px;
      height: 17px;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 2;
    }

    .mermaid-viewer-button text {
      fill: currentColor;
      font-family: inherit;
      font-size: 7px;
      font-weight: 700;
      stroke: none;
    }

    .mermaid-viewer-zoom {
      min-width: 52px;
      color: var(--text-muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .mermaid-viewer-stage {
      position: relative;
      overflow: hidden;
      background: var(--surface-subtle);
      cursor: default;
      user-select: none;
    }

    .mermaid-viewer-stage.is-pannable {
      cursor: grab;
    }

    .mermaid-viewer-stage.is-dragging {
      cursor: grabbing;
    }

    .mermaid-viewer-content {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
    }

    .mermaid-viewer-content svg {
      display: block;
      width: 100%;
      height: 100%;
      max-width: none;
      background: var(--surface);
    }
  </style>
</head>
<body>
  <main class="mermaid-viewer">
    <div class="mermaid-viewer-toolbar" aria-label="Mermaid zoom controls">
      <button class="mermaid-viewer-button" id="zoomOutButton" type="button" title="Zoom out" aria-label="Zoom out">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg>
      </button>
      <button class="mermaid-viewer-button" id="resetZoomButton" type="button" title="Reset zoom to 100%" aria-label="Reset zoom to 100%">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"></path><text x="12" y="14" text-anchor="middle">1:1</text></svg>
      </button>
      <button class="mermaid-viewer-button" id="zoomInButton" type="button" title="Zoom in" aria-label="Zoom in">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
      </button>
      <span class="mermaid-viewer-zoom" id="zoomValue">100%</span>
    </div>
    <div class="mermaid-viewer-stage" id="viewerStage">
      <div class="mermaid-viewer-content" id="viewerContent">${svgMarkup}</div>
    </div>
  </main>
</body>
</html>`;
};

export const initializeMermaidViewerWindow = (viewerWindow: Window) => {
  const viewerDocument = viewerWindow.document;
  const stage = viewerDocument.querySelector<HTMLElement>('#viewerStage');
  const content = viewerDocument.querySelector<HTMLElement>('#viewerContent');
  const zoomValue = viewerDocument.querySelector<HTMLElement>('#zoomValue');
  const zoomInButton =
    viewerDocument.querySelector<HTMLButtonElement>('#zoomInButton');
  const zoomOutButton =
    viewerDocument.querySelector<HTMLButtonElement>('#zoomOutButton');
  const resetZoomButton =
    viewerDocument.querySelector<HTMLButtonElement>('#resetZoomButton');

  if (
    !stage ||
    !content ||
    !zoomValue ||
    !zoomInButton ||
    !zoomOutButton ||
    !resetZoomButton
  ) {
    return;
  }

  const minScale = 0.1;
  const maxScale = 8;
  let scale = 1;
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  const svg = content.querySelector<SVGSVGElement>('svg');

  if (!svg) {
    return;
  }

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const getBaseViewBox = () => {
    const viewBox = svg.viewBox.baseVal;
    if (viewBox.width > 0 && viewBox.height > 0) {
      return {
        x: viewBox.x,
        y: viewBox.y,
        width: viewBox.width,
        height: viewBox.height,
      };
    }

    try {
      const bounds = svg.getBBox();
      if (bounds.width > 0 && bounds.height > 0) {
        return {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      }
    } catch {
      // Keep the fallback below.
    }

    return {
      x: 0,
      y: 0,
      width: svg.getBoundingClientRect().width || 1,
      height: svg.getBoundingClientRect().height || 1,
    };
  };

  const baseViewBox = getBaseViewBox();
  let currentViewBox = { ...baseViewBox };
  svg.removeAttribute('style');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const getSvgViewport = () => {
    const rect = svg.getBoundingClientRect();
    const svgAspect = currentViewBox.width / currentViewBox.height;
    const rectAspect = rect.width / rect.height;
    let width = rect.width;
    let height = rect.height;
    let x = rect.left;
    let y = rect.top;

    if (rectAspect > svgAspect) {
      width = rect.height * svgAspect;
      x = rect.left + (rect.width - width) / 2;
    } else {
      height = rect.width / svgAspect;
      y = rect.top + (rect.height - height) / 2;
    }

    return { x, y, width, height };
  };

  const applyViewBox = () => {
    svg.setAttribute(
      'viewBox',
      `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`,
    );
    scale = svg.getBoundingClientRect().width / currentViewBox.width;
    zoomValue.textContent = `${Math.round(scale * 100)}%`;
  };

  const centerAtScale = (nextScale: number) => {
    scale = clamp(nextScale, minScale, maxScale);
    const rect = svg.getBoundingClientRect();
    const centerX = baseViewBox.x + baseViewBox.width / 2;
    const centerY = baseViewBox.y + baseViewBox.height / 2;
    currentViewBox = {
      x: centerX - rect.width / scale / 2,
      y: centerY - rect.height / scale / 2,
      width: rect.width / scale,
      height: rect.height / scale,
    };
    applyViewBox();
  };

  const fitToStage = () => {
    currentViewBox = { ...baseViewBox };
    applyViewBox();
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const nextScale = clamp(scale * factor, minScale, maxScale);
    if (nextScale === scale) {
      return;
    }

    const viewport = getSvgViewport();
    const xRatio = (clientX - viewport.x) / viewport.width;
    const yRatio = (clientY - viewport.y) / viewport.height;
    const anchorX = currentViewBox.x + currentViewBox.width * xRatio;
    const anchorY = currentViewBox.y + currentViewBox.height * yRatio;
    const nextWidth = svg.getBoundingClientRect().width / nextScale;
    const nextHeight = svg.getBoundingClientRect().height / nextScale;

    currentViewBox = {
      x: anchorX - nextWidth * xRatio,
      y: anchorY - nextHeight * yRatio,
      width: nextWidth,
      height: nextHeight,
    };
    applyViewBox();
  };

  const zoomAtCenter = (factor: number) => {
    const rect = stage.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  zoomInButton.addEventListener('click', () => zoomAtCenter(1.2));
  zoomOutButton.addEventListener('click', () => zoomAtCenter(1 / 1.2));
  resetZoomButton.addEventListener('click', () => centerAtScale(1));

  stage.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    { passive: false },
  );

  stage.addEventListener('pointerdown', (event) => {
    if (!event.ctrlKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    isDragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', (event) => {
    stage.classList.toggle('is-pannable', event.ctrlKey && !isDragging);

    if (!isDragging) {
      return;
    }

    const viewport = getSvgViewport();
    currentViewBox.x -=
      ((event.clientX - lastX) / viewport.width) * currentViewBox.width;
    currentViewBox.y -=
      ((event.clientY - lastY) / viewport.height) * currentViewBox.height;
    lastX = event.clientX;
    lastY = event.clientY;
    applyViewBox();
  });

  const stopDragging = (event: PointerEvent) => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
  };

  stage.addEventListener('pointerup', stopDragging);
  stage.addEventListener('pointercancel', stopDragging);
  viewerWindow.addEventListener('keydown', (event) => {
    if (event.key === 'Control' || event.key === 'Meta') {
      stage.classList.add('is-pannable');
    }
  });
  viewerWindow.addEventListener('keyup', (event) => {
    if (event.key === 'Control' || event.key === 'Meta') {
      stage.classList.remove('is-pannable');
    }
  });
  viewerWindow.addEventListener('resize', fitToStage, { once: true });
  viewerWindow.requestAnimationFrame(fitToStage);
};

