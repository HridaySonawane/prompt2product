# Real Windows launcher checks. Run with project/model built and app ports stopped.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $projectRoot 'start.ps1'
$shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$savedPath = $env:PATH
$savedLocalAppData = $env:LOCALAPPDATA
$savedModel = $env:IOTFORGE_OLLAMA_MODEL
$savedUrl = $env:IOTFORGE_OLLAMA_URL
function Assert-True($Condition, $Message) { if (!$Condition) { throw $Message } }
function Assert-Stopped {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8000,11434) })
    Assert-True ($listeners.Count -eq 0) 'Launcher left an app/Ollama listener running.'
}
try {
    Assert-Stopped
    # Remove Ollama discovery only in this test process; do not uninstall anything.
    $env:LOCALAPPDATA = Join-Path $env:TEMP ('iotforge-no-ollama-' + [Guid]::NewGuid())
    $env:PATH = (($savedPath -split ';') | Where-Object { $_ -and !(Test-Path -LiteralPath (Join-Path $_ 'ollama.exe')) }) -join ';'
    $output = @(& $shell -NoProfile -ExecutionPolicy Bypass -File $launcher -Check)
    Assert-True ($LASTEXITCODE -eq 1 -and $output.Count -eq 1 -and $output[0] -like 'Configure Ollama:*') 'Missing Ollama did not exit quietly.'
    $env:PATH = $savedPath; $env:LOCALAPPDATA = $savedLocalAppData
    Assert-Stopped
    Write-Output 'PASS missing Ollama: one setup message, exit 1, no services'

    $env:IOTFORGE_OLLAMA_URL = 'http://127.0.0.1:11434'
    $env:IOTFORGE_OLLAMA_MODEL = 'iotforge-missing-test-model:' + [Guid]::NewGuid()
    $output = @(& $shell -NoProfile -ExecutionPolicy Bypass -File $launcher -Check)
    Assert-True ($LASTEXITCODE -eq 1 -and $output.Count -eq 1 -and $output[0] -like 'Configure Ollama:*') 'Missing model did not exit quietly.'
    Assert-Stopped
    Write-Output 'PASS missing model: one setup message, exit 1, owned Ollama cleaned up'

    $env:IOTFORGE_OLLAMA_MODEL = if ($savedModel) { $savedModel } else { 'qwen2.5:1.5b' }
    $output = @(& $shell -NoProfile -ExecutionPolicy Bypass -File $launcher -Check)
    Assert-True ($LASTEXITCODE -eq 0 -and $output[-1] -like 'Ready:*') 'Configured preflight failed.'
    Assert-Stopped
    Write-Output 'PASS configured preflight: exit 0, no services left running'

    $portProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,8000)
    $portProbe.Start()
    try {
        $output = @(& $shell -NoProfile -ExecutionPolicy Bypass -File $launcher -Check)
        Assert-True ($LASTEXITCODE -eq 1 -and $output[-1] -like 'Port 8000 is already in use.*') 'Occupied port was not rejected.'
    } finally { $portProbe.Stop() }
    Assert-Stopped
    Write-Output 'PASS occupied port: rejected without killing the existing listener'

    Write-Output '4 launcher preflight checks passed. All app/model services stopped.'
    Write-Output 'Full startup/Ctrl+C: run .\start.ps1 in a foreground terminal, then follow the root README lifecycle test.'
} finally {
    $env:PATH = $savedPath; $env:LOCALAPPDATA = $savedLocalAppData
    $env:IOTFORGE_OLLAMA_MODEL = $savedModel; $env:IOTFORGE_OLLAMA_URL = $savedUrl
}
