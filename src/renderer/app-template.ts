export const appTemplate = `
  <div class="app-shell">
    <header class="toolbar">
      <button class="icon-button sidebar-toggle icon-only-button" id="sidebarToggleButton" title="Toggle file explorer" aria-label="Toggle file explorer" aria-expanded="false"><i data-lucide="panel-left"></i></button>
      <div class="document-meta">
        <div class="file-name" id="fileName">Untitled</div>
        <div class="file-path" id="filePath">Open or drop a Markdown file</div>
      </div>
      <div class="dirty-badge" id="dirtyBadge" hidden>Unsaved</div>
      <div class="toolbar-actions">
        <button class="icon-button" id="openButton" title="Open Markdown file" aria-label="Open Markdown file">Open</button>
        <button class="icon-button" id="saveButton" title="Save" aria-label="Save">Save</button>
        <button class="icon-button" id="saveAsButton" title="Save as" aria-label="Save as">Save As</button>
        <button class="icon-button" id="settingsButton" title="Settings" aria-label="Settings">Settings</button>
      </div>
      <div class="mode-switch" role="tablist" aria-label="View mode">
        <button class="mode-button active" data-mode="preview" role="tab" aria-selected="true">Preview</button>
        <button class="mode-button" data-mode="edit" role="tab" aria-selected="false">Edit</button>
        <button class="mode-button" data-mode="split" role="tab" aria-selected="false">Split</button>
      </div>
    </header>
    <main class="content-shell">
      <aside class="file-sidebar" id="fileSidebar" aria-label="File explorer">
        <div class="sidebar-header">
          <div>
            <div class="sidebar-title">Explorer</div>
            <div class="sidebar-path" id="sidebarPath">No file open</div>
          </div>
        </div>
        <div class="file-tree" id="fileTree"></div>
      </aside>
      <section class="workspace preview-mode" id="workspace">
        <section class="pane editor-pane" aria-label="Markdown editor">
          <div class="editor-toolbar">
            <div class="direction-toggle" role="group" aria-label="Editor direction">
              <button class="direction-button active" data-editor-direction="ltr" title="Left to right" aria-label="Left to right" aria-pressed="true">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6H3" /><path d="M15 12H3" /><path d="M17 18H3" /></svg>
                <span>LTR</span>
              </button>
              <button class="direction-button" data-editor-direction="rtl" title="Right to left" aria-label="Right to left" aria-pressed="false">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M9 12h12" /><path d="M7 18h14" /></svg>
                <span>RTL</span>
              </button>
            </div>
          </div>
          <div id="editor"></div>
        </section>
        <section class="pane preview-pane" aria-label="Markdown preview">
          <div class="preview-search" id="previewSearch" hidden>
            <input id="previewSearchInput" type="search" aria-label="Search preview" placeholder="Search" autocomplete="off" />
            <span class="preview-search-count" id="previewSearchCount">0/0</span>
            <button class="preview-search-button" id="previewSearchPreviousButton" title="Previous match" aria-label="Previous match">‹</button>
            <button class="preview-search-button" id="previewSearchNextButton" title="Next match" aria-label="Next match">›</button>
            <button class="preview-search-button" id="closePreviewSearchButton" title="Close search" aria-label="Close search">×</button>
          </div>
          <article class="markdown-body" id="preview"></article>
        </section>
      </section>
      <div class="drop-overlay" id="dropOverlay">Drop Markdown file to open</div>
    </main>
    <div class="settings-modal external-change-modal" id="externalChangeModal" hidden>
      <div class="settings-dialog" role="alertdialog" aria-modal="true" aria-labelledby="externalChangeTitle" aria-describedby="externalChangeMessage">
        <div class="settings-header">
          <h2 id="externalChangeTitle">File changed on disk</h2>
        </div>
        <p class="dialog-message" id="externalChangeMessage"></p>
        <div class="settings-actions">
          <button class="icon-button" id="keepExternalChangeButton" type="button">Keep Editing</button>
          <button class="icon-button primary-button" id="reloadExternalChangeButton" type="button">Reload</button>
        </div>
      </div>
    </div>
    <div class="settings-modal" id="settingsModal" hidden>
      <div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <div class="settings-header">
          <h2 id="settingsTitle">Settings</h2>
          <button class="close-button" id="closeSettingsButton" title="Close settings" aria-label="Close settings">x</button>
        </div>
        <label class="settings-field" for="fontSelect">
          <span>Preview font</span>
          <select id="fontSelect">
            <option value="">System default</option>
          </select>
        </label>
        <label class="settings-check">
          <input type="checkbox" id="customizeEditorFontCheckbox" />
          <span>Customize editor font</span>
        </label>
        <label class="settings-check">
          <input type="checkbox" id="useEditorFontCheckbox" />
          <span>Use a separate editor font</span>
        </label>
        <label class="settings-field" for="editorFontSelect">
          <span>Editor font</span>
          <select id="editorFontSelect">
            <option value="">Same as preview</option>
          </select>
        </label>
        <label class="settings-field" for="themeSelect">
          <span>Theme</span>
          <select id="themeSelect">
            <option value="auto">Auto (system)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <div class="settings-preview" id="settingsPreview">
          # Markdown Preview
          The quick brown fox jumps over the lazy dog.
        </div>
        <div class="settings-actions">
          <button class="icon-button" id="resetFontButton">Use Default</button>
          <button class="icon-button primary-button" id="saveSettingsButton">Save</button>
        </div>
      </div>
    </div>
  </div>
`;

