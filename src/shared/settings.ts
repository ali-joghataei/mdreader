import type { AppSettings } from './contracts';

export const defaultAppSettings: AppSettings = {
  fontFamily: null,
  customizeEditorFont: false,
  useEditorFont: false,
  editorFontFamily: null,
  themeMode: 'auto',
};

export const normalizeSettings = (settings: Partial<AppSettings>): AppSettings => ({
  fontFamily:
    typeof settings.fontFamily === 'string' && settings.fontFamily.trim()
      ? settings.fontFamily.trim()
      : null,
  customizeEditorFont: settings.customizeEditorFont === true,
  useEditorFont: settings.useEditorFont === true,
  editorFontFamily:
    typeof settings.editorFontFamily === 'string' && settings.editorFontFamily.trim()
      ? settings.editorFontFamily.trim()
      : null,
  themeMode:
    settings.themeMode === 'light' || settings.themeMode === 'dark'
      ? settings.themeMode
      : 'auto',
});
