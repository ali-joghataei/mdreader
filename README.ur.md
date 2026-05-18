# MdReader

[English](README.md) | [فارسی](README.fa.md) | [العربية](README.ar.md) | [עברית](README.he.md) | اردو

MdReader ایک کراس پلیٹ فارم ڈیسک ٹاپ ایپ ہے جو Markdown فائلیں کھولنے، پڑھنے اور ایڈٹ کرنے کے لیے بنائی گئی ہے۔

اس کی اصل توجہ فارسی، اردو، عربی، عبرانی اور دوسری دائیں سے بائیں لکھی جانے والی زبانوں کے Markdown کو صاف انداز میں دکھانا ہے۔ یہ mixed RTL/LTR مواد کو ایک سادہ `dir="auto"` کے مقابلے میں بہتر طریقے سے سنبھالتی ہے، خاص طور پر جب پیراگراف انگریزی الفاظ، class names، test names یا inline code سے شروع ہو۔

یہ پروجیکٹ مکمل طور پر AI کی مدد سے لکھا گیا ہے۔

## خصوصیات

- File مینو سے Markdown فائلیں کھولنا
- drag and drop سے فائلیں کھولنا
- ہر فائل کو الگ ونڈو میں کھولنا
- default read-only preview mode
- optional editor mode with live preview
- ایک ساتھ edit اور preview کے لیے split view
- unsaved changes کے لیے indicator
- سسٹم میں installed fonts میں سے font selection
- app settings کو محفوظ رکھنا
- right-to-left اور bilingual Markdown content کی بہتر rendering
- app menu سے Toggle Developer Tools
- packaged builds میں Markdown file association support

## Right-To-Left سپورٹ

MdReader rendered Markdown blocks کی direction کو سادہ `dir="auto"` سے زیادہ سمجھداری کے ساتھ detect کرتی ہے۔

یہ technical Markdown کے لیے اہم ہے، کیونکہ ایسے documents میں اکثر English identifiers، inline code، test names، enum names یا framework terms شامل ہوتے ہیں۔

ایپ ہر rendered block کا content analyze کرتی ہے اور جب text زیادہ تر RTL ہو تو RTL direction لگاتی ہے، جبکہ code اور naturally LTR parts readable رہتے ہیں۔

## Development

```powershell
npm install
npm run dev
```

## Build

ایپ build کریں:

```powershell
npm run build
```

Windows installer build کریں:

```powershell
npm run dist:win
```

یا helper script استعمال کریں:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-installer.ps1
```
