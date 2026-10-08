param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$python = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Run .\demo\build.ps1 first.' }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'frontend\dist\index.html'))) { throw 'Frontend build missing. Run .\demo\build.ps1.' }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'simulator\build\iot_simulator.exe'))) { throw 'Simulator missing. Run .\demo\build.ps1.' }
Write-Output "IoTForge: http://127.0.0.1:$Port | API docs: /api/docs | Ctrl+C to stop."
Write-Output 'Ollama is optional for manual simulation; use ollama pull qwen2.5:1.5b for local AI.'
& $python -m uvicorn backend.main:app --host 127.0.0.1 --port $Port
exit $LASTEXITCODE
