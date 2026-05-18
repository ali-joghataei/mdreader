# MdReader

English | [فارسی](README.fa.md) | [العربية](README.ar.md) | [עברית](README.he.md) | [اردو](README.ur.md)

MdReader is a cross-platform desktop app for opening, reading, and editing Markdown files.

Its main focus is clean Markdown rendering for Persian and other right-to-left languages. It is designed to handle mixed RTL/LTR content more reliably than a simple `dir="auto"` approach, especially when a paragraph starts with English words, class names, test names, or inline code.

This project was written entirely with AI assistance.

## Features

- Open Markdown files from the File menu
- Open files with drag and drop
- Open each file in a separate app window
- Read-only preview mode by default
- Optional editor mode with live preview
- Split view for editing and previewing at the same time
- Unsaved-change indicator for modified files
- Font selection from installed system fonts
- Persistent app settings
- Better rendering for right-to-left and bilingual Markdown content
- Toggle Developer Tools from the app menu
- Markdown file association support in packaged builds

## Right-To-Left Support

MdReader detects the text direction of rendered Markdown blocks more intelligently than plain `dir="auto"`.

This matters for technical Markdown written in Persian, Arabic, Hebrew, Urdu, or other RTL languages where blocks often contain English identifiers, inline code, test names, enum names, or framework-specific terms.

The app analyzes each rendered block and applies RTL direction when the content is mostly RTL, while keeping code and naturally LTR fragments readable.

## Development

```powershell
npm install
npm run dev
```

## Build

Build the app:

```powershell
npm run build
```

Build the Windows installer:

```powershell
npm run dist:win
```

Or use the helper script:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-installer.ps1
```
