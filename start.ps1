param(
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [switch]$Check
)

# Single Windows launcher: built React + FastAPI + on-demand C++ + local Ollama.
# Startup never installs software, downloads models, or substitutes a fallback.
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$ownedOllama = $null
$ownedBackend = $null
$launcherExit = 1

function Stop-OwnedProcess {
    param($Process)
    if ($null -ne $Process -and !$Process.HasExited) {
        # Only this launcher's process and descendants, including venv redirectors.
        try { & taskkill.exe /PID $Process.Id /T /F *> $null } catch { }
    }
}

function Get-OllamaTags {
    try { return Invoke-RestMethod -Uri "$ollamaUrl/api/tags" -TimeoutSec 2 -ErrorAction Stop }
    catch { return $null }
}

try {
    Set-Location -LiteralPath $projectRoot
    $model = if ($env:IOTFORGE_OLLAMA_MODEL) { $env:IOTFORGE_OLLAMA_MODEL } else { 'qwen2.5:1.5b' }
    $ollamaUrl = if ($env:IOTFORGE_OLLAMA_URL) { $env:IOTFORGE_OLLAMA_URL.TrimEnd('/') } else { 'http://127.0.0.1:11434' }
    $ollamaCommand = Get-Command ollama.exe -ErrorAction SilentlyContinue
    $ollamaExe = if ($ollamaCommand) { $ollamaCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' }
    if (!(Test-Path -LiteralPath $ollamaExe -PathType Leaf)) {
        Write-Output "Configure Ollama: install Ollama and run 'ollama pull $model'."
        exit 1
    }

    $runtimeDirectory = Join-Path $projectRoot '.runtime'
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    $tags = Get-OllamaTags
    if ($null -eq $tags) {
        $ollamaAddress = [Uri]$ollamaUrl
        if (!$ollamaAddress.IsLoopback) {
            Write-Output 'Configure Ollama: the configured service is unavailable.'
            exit 1
        }
        $previousOllamaHost = $env:OLLAMA_HOST
        try {
            $env:OLLAMA_HOST = $ollamaAddress.Authority
            $ownedOllama = Start-Process -FilePath $ollamaExe -ArgumentList @('serve') -PassThru -WindowStyle Hidden `
                -RedirectStandardOutput (Join-Path $runtimeDirectory 'ollama.stdout.log') `
                -RedirectStandardError (Join-Path $runtimeDirectory 'ollama.stderr.log')
        } finally { $env:OLLAMA_HOST = $previousOllamaHost }
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            $tags = Get-OllamaTags
            if ($null -ne $tags -or $ownedOllama.HasExited) { break }
            Start-Sleep -Milliseconds 250
        }
    }
    if ($null -eq $tags -or !(@($tags.models | ForEach-Object { $_.name }) -contains $model)) {
        Write-Output "Configure Ollama: install/start Ollama and run 'ollama pull $model'."
        exit 1
    }

    $python = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
    $frontend = Join-Path $projectRoot 'frontend\dist\index.html'
    $simulator = if ($env:IOTFORGE_SIMULATOR_PATH) { $env:IOTFORGE_SIMULATOR_PATH } else { Join-Path $projectRoot 'simulator\build\iot_simulator.exe' }
    if (!(Test-Path -LiteralPath $python -PathType Leaf) -or !(Test-Path -LiteralPath $frontend -PathType Leaf) -or !(Test-Path -LiteralPath $simulator -PathType Leaf)) {
        Write-Output 'Project build/setup missing. Follow the root README setup instructions.'
        exit 1
    }
    & $python -c 'import fastapi, uvicorn, jsonschema' *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Output 'Python dependencies missing. Run .\demo\build.ps1 first.'
        exit 1
    }
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $probe.Server.ExclusiveAddressUse = $true
    try { $probe.Start() }
    catch { Write-Output "Port $Port is already in use. Stop that instance or run .\start.ps1 -Port 8001."; exit 1 }
    finally { $probe.Stop() }

    if ($Check) {
        Write-Output 'Ready: Ollama/model, Python dependencies, frontend, simulator and port checked.'
        $launcherExit = 0
    } else {
        $ownedBackend = Start-Process -FilePath $python -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden `
            -ArgumentList @('-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', "$Port") `
            -RedirectStandardOutput (Join-Path $runtimeDirectory 'backend.stdout.log') `
            -RedirectStandardError (Join-Path $runtimeDirectory 'backend.stderr.log')
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ($ownedBackend.HasExited) { break }
            try {
                $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1 -ErrorAction Stop
                if ($health.simulator_available) { $ready = $true; break }
            } catch { }
            Start-Sleep -Milliseconds 250
        }
        if (!$ready) { throw 'Application startup failed. See .runtime\backend.stderr.log.' }
        Write-Output "IoTForge: http://127.0.0.1:$Port | API docs: http://127.0.0.1:$Port/api/docs"
        Write-Output "AI: $model | Ctrl+C stops this launcher and the services it started. Logs: .runtime\"
        while (!$ownedBackend.HasExited) { Start-Sleep -Milliseconds 250 }
        $launcherExit = $ownedBackend.ExitCode
    }
} catch {
    Write-Output $_.Exception.Message
} finally {
    Stop-OwnedProcess $ownedBackend
    Stop-OwnedProcess $ownedOllama
}
exit $launcherExit
