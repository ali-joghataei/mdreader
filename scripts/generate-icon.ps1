$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$buildDir = Join-Path $projectRoot 'build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

Add-Type -AssemblyName System.Drawing

function New-IconBitmap {
  param([int]$Size)

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $margin = [Math]::Max(1, [int]($Size * 0.035))
  $rect = New-Object System.Drawing.RectangleF $margin, $margin, ($Size - ($margin * 2)), ($Size - ($margin * 2))
  $radius = [Math]::Max(4, [int]($Size * 0.16))
  $diameter = $radius * 2

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 35, 118, 190)), ([System.Drawing.Color]::FromArgb(255, 15, 48, 86)), 45
  $graphics.FillPath($background, $path)

  $shineRect = New-Object System.Drawing.RectangleF $rect.X, $rect.Y, $rect.Width, ($rect.Height * 0.46)
  $shinePath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shinePath.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $shinePath.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $shinePath.AddLine($rect.Right, $shineRect.Bottom, $rect.X, $shineRect.Bottom)
  $shinePath.CloseFigure()
  $shineBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(42, 255, 255, 255))
  $graphics.FillPath($shineBrush, $shinePath)

  $borderWidth = [Math]::Max(1, [int]($Size * 0.018))
  $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 255, 255, 255)), $borderWidth
  $graphics.DrawPath($borderPen, $path)

  $fontFamily = New-Object System.Drawing.FontFamily 'Segoe UI'
  $fontStyle = [System.Drawing.FontStyle]::Bold
  $fontSize = [Math]::Max(9, [single]($Size * 0.58))
  $textPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $textFormat = [System.Drawing.StringFormat]::GenericTypographic
  $textPath.AddString('MD', $fontFamily, [int]$fontStyle, $fontSize, (New-Object System.Drawing.PointF 0, 0), $textFormat)

  $bounds = $textPath.GetBounds()
  $maxWidth = $Size * 0.88
  $maxHeight = $Size * 0.62
  $scale = [Math]::Min(($maxWidth / $bounds.Width), ($maxHeight / $bounds.Height))
  $targetWidth = $bounds.Width * $scale
  $targetHeight = $bounds.Height * $scale
  $targetX = ($Size - $targetWidth) / 2
  $targetY = (($Size - $targetHeight) / 2) - ($Size * 0.015)

  $matrix = New-Object System.Drawing.Drawing2D.Matrix
  $matrix.Translate(-$bounds.X, -$bounds.Y)
  $matrix.Scale($scale, $scale, [System.Drawing.Drawing2D.MatrixOrder]::Append)
  $matrix.Translate($targetX, $targetY, [System.Drawing.Drawing2D.MatrixOrder]::Append)
  $textPath.Transform($matrix)

  $shadowPath = $textPath.Clone()
  $shadowMatrix = New-Object System.Drawing.Drawing2D.Matrix
  $shadowMatrix.Translate(($Size * 0.018), ($Size * 0.024))
  $shadowPath.Transform($shadowMatrix)
  $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(85, 0, 0, 0))
  $graphics.FillPath($shadowBrush, $shadowPath)

  $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $graphics.FillPath($textBrush, $textPath)

  $graphics.Dispose()
  $background.Dispose()
  $shinePath.Dispose()
  $shineBrush.Dispose()
  $borderPen.Dispose()
  $fontFamily.Dispose()
  $textFormat.Dispose()
  $textPath.Dispose()
  $shadowPath.Dispose()
  $matrix.Dispose()
  $shadowMatrix.Dispose()
  $shadowBrush.Dispose()
  $textBrush.Dispose()
  $path.Dispose()

  return $bitmap
}

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$pngEntries = @()

foreach ($size in $sizes) {
  $bitmap = New-IconBitmap -Size $size
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngEntries += [pscustomobject]@{
    Size = $size
    Bytes = $stream.ToArray()
  }
  $bitmap.Dispose()
  $stream.Dispose()
}

$previewBitmap = New-IconBitmap -Size 1024
$previewBitmap.Save((Join-Path $buildDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$previewBitmap.Dispose()

$out = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $out
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$pngEntries.Count)

$offset = 6 + (16 * $pngEntries.Count)
foreach ($entry in $pngEntries) {
  $dimension = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
  $writer.Write([byte]$dimension)
  $writer.Write([byte]$dimension)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$entry.Bytes.Length)
  $writer.Write([UInt32]$offset)
  $offset += $entry.Bytes.Length
}

foreach ($entry in $pngEntries) {
  $writer.Write($entry.Bytes)
}

[System.IO.File]::WriteAllBytes((Join-Path $buildDir 'icon.ico'), $out.ToArray())
$writer.Dispose()
$out.Dispose()

Get-Item (Join-Path $buildDir 'icon.ico'), (Join-Path $buildDir 'icon.png') |
  Select-Object FullName, Length, LastWriteTime |
  Format-Table -AutoSize
