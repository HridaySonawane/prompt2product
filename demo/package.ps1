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
@'
@echo off
cd /d "%~dp0"
if not exist backend\.venv\Scripts\python.exe (
  python -m venv backend\.venv
  if errorlevel 1 exit /b 1
)
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if errorlevel 1 exit /b 1
echo Open http://127.0.0.1:8000 - Ctrl+C to stop.
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
'@ | Set-Content -LiteralPath (Join-Path $stage 'start.cmd') -Encoding ascii
@'
IoTForge Windows x64 runtime
Requires Python 3.11+ on PATH. Extract this archive, run start.cmd, then open
http://127.0.0.1:8000. The first run installs the pinned Python dependencies.
No Node.js, CMake, or Visual Studio is needed for this prebuilt runtime.
Optional AI: install Ollama, run ollama pull qwen2.5:1.5b, and keep Ollama running.
Manual simulation works without AI; planning fallback is explicitly labeled.
The included simulator is an MSVC Release build with the static C++ runtime.
See shared/NETWORK_MODEL.md for approximate simulation assumptions.
'@ | Set-Content -LiteralPath (Join-Path $stage 'START-HERE.txt') -Encoding ascii
$archive = Join-Path $outputRoot 'IoTForge-windows-x64.zip'
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -Force
Write-Output "Runtime archive: $archive"
