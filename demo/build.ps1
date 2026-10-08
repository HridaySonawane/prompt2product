param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
$locator = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (!(Test-Path -LiteralPath $locator)) { throw 'Install Visual Studio 2022 Desktop development with C++.' }
$installation = & $locator -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'MSVC x64 tools are unavailable.' }
$developerCommand = Join-Path $installation 'Common7\Tools\VsDevCmd.bat'
$cmake = Join-Path $installation 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
if (!(Test-Path -LiteralPath $cmake)) { $cmake = (Get-Command cmake -ErrorAction Stop).Source }
$ctest = Join-Path (Split-Path $cmake) 'ctest.exe'
$buildCommand = "`"$developerCommand`" -arch=x64 -host_arch=x64 && `"$cmake`" -S simulator -B simulator/build -G `"NMake Makefiles`" -DCMAKE_BUILD_TYPE=Debug && `"$cmake`" --build simulator/build && `"$ctest`" --test-dir simulator/build --output-on-failure && `"$cmake`" -S simulator -B simulator/build-release -G `"NMake Makefiles`" -DCMAKE_BUILD_TYPE=Release -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded && `"$cmake`" --build simulator/build-release && `"$ctest`" --test-dir simulator/build-release --output-on-failure"
Invoke-Checked -Program 'cmd.exe' -Arguments @('/d', '/s', '/c', $buildCommand)
$python = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { Invoke-Checked -Program 'python' -Arguments @('-m', 'venv', 'backend\.venv') }
if (!$SkipInstall) {
    Invoke-Checked -Program $python -Arguments @('-m', 'pip', 'install', '-r', 'backend/requirements-dev.txt')
}
Invoke-Checked -Program $python -Arguments @('-m', 'unittest', 'discover', '-s', 'backend/tests', '-v')
Push-Location -LiteralPath (Join-Path $projectRoot 'frontend')
try {
    if (!$SkipInstall) { Invoke-Checked -Program 'npm.cmd' -Arguments @('ci', '--no-fund') }
    Invoke-Checked -Program 'npm.cmd' -Arguments @('test')
    Invoke-Checked -Program 'npm.cmd' -Arguments @('run', 'build')
} finally { Pop-Location }
& (Join-Path $PSScriptRoot 'package.ps1')
Write-Output 'Build and tests succeeded. Run .\demo\start.ps1 and open http://127.0.0.1:8000.'
