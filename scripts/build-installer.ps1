$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

$outputPaths = @(
  'dist-electron',
  'dist-renderer',
  'dist'
)

foreach ($path in $outputPaths) {
  $fullPath = Join-Path $projectRoot $path
  if (Test-Path -LiteralPath $fullPath) {
    Remove-Item -LiteralPath $fullPath -Recurse -Force
  }
}

& (Join-Path $PSScriptRoot 'generate-icon.ps1')

npm.cmd run lint
npm.cmd run dist:win

Write-Host ''
Write-Host 'Installer output:'
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'dist') -Filter '*.exe' |
  Select-Object FullName, Length, LastWriteTime |
  Format-Table -AutoSize
