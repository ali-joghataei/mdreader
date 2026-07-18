export const getAppElements = () => {
  const fileNameElement = document.querySelector<HTMLDivElement>('#fileName');
  const filePathElement = document.querySelector<HTMLDivElement>('#filePath');
  const dirtyBadge = document.querySelector<HTMLDivElement>('#dirtyBadge');
  const workspace = document.querySelector<HTMLElement>('#workspace');
  const contentShell = document.querySelector<HTMLElement>('.content-shell');
  const sidebarToggleButton =
    document.querySelector<HTMLButtonElement>('#sidebarToggleButton');
  const fileSidebar = document.querySelector<HTMLElement>('#fileSidebar');
  const sidebarPath = document.querySelector<HTMLDivElement>('#sidebarPath');
  const fileTree = document.querySelector<HTMLDivElement>('#fileTree');
  const fileSidebarResizer =
    document.querySelector<HTMLDivElement>('#fileSidebarResizer');
  const tocToggleButton =
    document.querySelector<HTMLButtonElement>('#tocToggleButton');
  const tocSidebar = document.querySelector<HTMLElement>('#tocSidebar');
  const tocList = document.querySelector<HTMLElement>('#tocList');
  const tocSidebarResizer =
    document.querySelector<HTMLDivElement>('#tocSidebarResizer');
  const editorPane = document.querySelector<HTMLElement>('.editor-pane');
  const previewPane = document.querySelector<HTMLElement>('.preview-pane');
  const preview = document.querySelector<HTMLElement>('#preview');
  const previewSearch = document.querySelector<HTMLDivElement>('#previewSearch');
  const previewSearchInput =
    document.querySelector<HTMLInputElement>('#previewSearchInput');
  const previewSearchCount =
    document.querySelector<HTMLSpanElement>('#previewSearchCount');
  const previewSearchPreviousButton =
    document.querySelector<HTMLButtonElement>('#previewSearchPreviousButton');
  const previewSearchNextButton =
    document.querySelector<HTMLButtonElement>('#previewSearchNextButton');
  const closePreviewSearchButton =
    document.querySelector<HTMLButtonElement>('#closePreviewSearchButton');
  const editorHost = document.querySelector<HTMLDivElement>('#editor');
  const settingsButton = document.querySelector<HTMLButtonElement>('#settingsButton');
  const paneToolbarsToggleButton =
    document.querySelector<HTMLButtonElement>('#paneToolbarsToggleButton');
  const dropOverlay = document.querySelector<HTMLDivElement>('#dropOverlay');
  const externalChangeModal = document.querySelector<HTMLDivElement>('#externalChangeModal');
  const externalChangeMessage =
    document.querySelector<HTMLParagraphElement>('#externalChangeMessage');
  const keepExternalChangeButton =
    document.querySelector<HTMLButtonElement>('#keepExternalChangeButton');
  const reloadExternalChangeButton =
    document.querySelector<HTMLButtonElement>('#reloadExternalChangeButton');
  const settingsModal = document.querySelector<HTMLDivElement>('#settingsModal');
  const closeSettingsButton =
    document.querySelector<HTMLButtonElement>('#closeSettingsButton');
  const fontSelect = document.querySelector<HTMLSelectElement>('#fontSelect');
  const customizeEditorFontCheckbox =
    document.querySelector<HTMLInputElement>('#customizeEditorFontCheckbox');
  const useEditorFontCheckbox =
    document.querySelector<HTMLInputElement>('#useEditorFontCheckbox');
  const editorFontSelect = document.querySelector<HTMLSelectElement>('#editorFontSelect');
  const themeSelect = document.querySelector<HTMLSelectElement>('#themeSelect');
  const settingsPreview = document.querySelector<HTMLDivElement>('#settingsPreview');
  const resetFontButton = document.querySelector<HTMLButtonElement>('#resetFontButton');
  const saveSettingsButton =
    document.querySelector<HTMLButtonElement>('#saveSettingsButton');
  const modeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.mode-button'),
  );
  const editorDirectionButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-editor-direction]'),
  );
  const previewWidthButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-preview-width]'),
  );
  
  if (
    !fileNameElement ||
    !filePathElement ||
    !dirtyBadge ||
    !contentShell ||
    !sidebarToggleButton ||
    !fileSidebar ||
    !sidebarPath ||
    !fileTree ||
    !fileSidebarResizer ||
    !tocToggleButton ||
    !tocSidebar ||
    !tocList ||
    !tocSidebarResizer ||
    !workspace ||
    !editorPane ||
    !previewPane ||
    !preview ||
    !previewSearch ||
    !previewSearchInput ||
    !previewSearchCount ||
    !previewSearchPreviousButton ||
    !previewSearchNextButton ||
    !closePreviewSearchButton ||
    !editorHost ||
    !settingsButton ||
    !paneToolbarsToggleButton ||
    !dropOverlay ||
    !externalChangeModal ||
    !externalChangeMessage ||
    !keepExternalChangeButton ||
    !reloadExternalChangeButton ||
    !settingsModal ||
    !closeSettingsButton ||
    !fontSelect ||
    !customizeEditorFontCheckbox ||
    !useEditorFontCheckbox ||
    !editorFontSelect ||
    !themeSelect ||
    !settingsPreview ||
    !resetFontButton ||
    !saveSettingsButton ||
    editorDirectionButtons.length === 0 ||
    previewWidthButtons.length === 0
  ) {
    throw new Error('Required UI elements are missing.');
  }

  return {
    fileNameElement,
    filePathElement,
    dirtyBadge,
    workspace,
    contentShell,
    sidebarToggleButton,
    fileSidebar,
    sidebarPath,
    fileTree,
    fileSidebarResizer,
    tocToggleButton,
    tocSidebar,
    tocList,
    tocSidebarResizer,
    editorPane,
    previewPane,
    preview,
    previewSearch,
    previewSearchInput,
    previewSearchCount,
    previewSearchPreviousButton,
    previewSearchNextButton,
    closePreviewSearchButton,
    editorHost,
    settingsButton,
    paneToolbarsToggleButton,
    dropOverlay,
    externalChangeModal,
    externalChangeMessage,
    keepExternalChangeButton,
    reloadExternalChangeButton,
    settingsModal,
    closeSettingsButton,
    fontSelect,
    customizeEditorFontCheckbox,
    useEditorFontCheckbox,
    editorFontSelect,
    themeSelect,
    settingsPreview,
    resetFontButton,
    saveSettingsButton,
    modeButtons,
    editorDirectionButtons,
    previewWidthButtons,
  };
};
