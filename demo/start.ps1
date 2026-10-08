# Compatibility entry point; all startup logic lives at the repository root.
param([int]$Port = 8000, [switch]$Check)
& (Join-Path (Split-Path $PSScriptRoot -Parent) 'start.ps1') -Port $Port -Check:$Check
exit $LASTEXITCODE
