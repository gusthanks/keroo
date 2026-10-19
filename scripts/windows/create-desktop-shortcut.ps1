<#
  scripts/windows/create-desktop-shortcut.ps1

  Creates "Keroo.lnk" on your desktop. Double-clicking it runs scripts/launch.mjs in a
  hidden PowerShell window, which opens Keroo in its own app window.

  Run it once from the project folder:  npm run desktop:shortcut
  Run it again if you move the project folder.
  -Destination puts the shortcut in another folder (the desktop by default).

  keroo.ico holds the 32 px and 192 px mascot PNGs from public/icons.
#>
param(
  [string]$Destination = [Environment]::GetFolderPath('Desktop')
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$launcher = Join-Path $root 'scripts\launch.mjs'
$icon = Join-Path $PSScriptRoot 'keroo.ico'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js was not found on PATH. Install Node.js 22 or newer first.'
}

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$quotedLauncher = $launcher.Replace("'", "''")

$shortcutPath = Join-Path $Destination 'Keroo.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -Command ""node '$quotedLauncher'"""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$icon,0"
$shortcut.WindowStyle = 7  # start minimized, so no console window flashes
$shortcut.Description = 'Open Keroo'
$shortcut.Save()

Write-Host "Created $shortcutPath"
