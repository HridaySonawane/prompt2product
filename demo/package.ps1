$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$outputRoot = Join-Path $PSScriptRoot 'build'
$stage = Join-Path $outputRoot ('IoTForge-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
foreach ($relative in @('backend','frontend/dist','simulator/build','shared/fixtures')) {
    New-Item -ItemType Directory -Path (Join-Path $stage $relative) -Force | Out-Null
}
$binary = Join-Path $projectRoot 'simulator\build-release\iot_simulator.exe'
if (!(Test-Path -LiteralPath $binary)) { throw 'Build the Release simulator before packaging.' }
Copy-Item -LiteralPath $binary -Destination (Join-Path $stage 'simulator/build/iot_simulator.exe') -Force
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'backend') -File | Where-Object { $_.Extension -eq '.py' -or $_.Name -eq 'requirements.txt' } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stage 'backend') -Force
}
Copy-Item -Path (Join-Path $projectRoot 'frontend/dist/*') -Destination (Join-Path $stage 'frontend/dist') -Recurse -Force
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'shared') -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stage 'shared') -Force }
Copy-Item -Path (Join-Path $projectRoot 'shared/fixtures/*') -Destination (Join-Path $stage 'shared/fixtures') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination $stage -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'start.ps1') -Destination $stage -Force
@'
@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
exit /b %errorlevel%
'@ | Set-Content -LiteralPath (Join-Path $stage 'start.cmd') -Encoding ascii
@'
IoTForge Windows x64 runtime
Requires Python 3.11+ and Ollama with qwen2.5:1.5b installed.
Extract this archive. In its root, perform this one-time setup:
  python -m venv backend\.venv
  backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
  ollama pull qwen2.5:1.5b
Then run start.cmd (or .\start.ps1) and open http://127.0.0.1:8000.
No Node.js, CMake, or Visual Studio is needed for this prebuilt runtime.
Missing Ollama/model: the launcher prints Configure Ollama and exits.
Ctrl+C stops the app and any Ollama service started by the launcher.
The included simulator is an MSVC Release build with the static C++ runtime.
See shared/NETWORK_MODEL.md for approximate simulation assumptions.
'@ | Set-Content -LiteralPath (Join-Path $stage 'START-HERE.txt') -Encoding ascii
$archive = Join-Path $outputRoot 'IoTForge-windows-x64.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -Force
Write-Output "Runtime archive: $archive"
