$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    # Activate conda env "storm"
    $condaBase = (& "$env:USERPROFILE\miniforge3\Scripts\conda.exe" info --base 2>$null)
    if (-not $condaBase) { $condaBase = "$env:USERPROFILE\miniforge3" }
    $condaHook = Join-Path $condaBase "shell\condabin\conda-hook.ps1"
    if (Test-Path $condaHook) { . $condaHook }
    conda activate storm
    $pythonExe = "python"
    $env:QT_API = "pyside6"

    $tmpDir = Join-Path $repoRoot ".tmp"
    New-Item -ItemType Directory -Force $tmpDir | Out-Null
    $env:TEMP = $tmpDir
    $env:TMP = $tmpDir

    # Manim Slides presenter imports qtpy.QtMultimedia. On conda-forge,
    # this requires the qt6-multimedia runtime package in addition to pyside6.
    cmd /c "$pythonExe -c ""from qtpy import QtMultimedia"" >nul 2>nul"
    $qtMultimediaExitCode = $LASTEXITCODE
    if ($qtMultimediaExitCode -ne 0) {
        Write-Host "ERROR: QtMultimedia could not be loaded in the storm environment." -ForegroundColor Red
        Write-Host ""
        Write-Host "Install the missing Qt runtime package and retry:" -ForegroundColor Yellow
        Write-Host "  conda install -n storm -c conda-forge qt6-multimedia" -ForegroundColor Cyan
        throw "Missing QtMultimedia runtime dependency."
    }

    if (-not (Get-Command latex -ErrorAction SilentlyContinue)) {
        $miktexCandidates = @(
            "$env:LOCALAPPDATA\Programs\MiKTeX\miktex\bin\x64",
            "$env:PROGRAMFILES\MiKTeX\miktex\bin\x64",
            "$env:PROGRAMFILES(x86)\MiKTeX\miktex\bin\x64"
        ) | Where-Object { $_ -and (Test-Path $_) }
        foreach ($candidate in $miktexCandidates) {
            if ($env:PATH -notlike "*$candidate*") {
                $env:PATH = "$env:PATH;$candidate"
            }
        }
    }

    $scenes = @(& $pythonExe -m storm_slides)
    if ($scenes.Count -eq 0) {
        throw "No scenes were discovered in storm_slides.main_deck."
    }

    # Verify slides have been rendered
    $missingSlides = @()
    foreach ($scene in $scenes) {
        $jsonPath = Join-Path -Path (Join-Path -Path $repoRoot -ChildPath "slides") -ChildPath "$scene.json"
        if (-not (Test-Path $jsonPath)) {
            $missingSlides += $scene
        }
    }
    if ($missingSlides.Count -gt 0) {
        Write-Host "ERROR: The following slides have not been rendered yet:" -ForegroundColor Red
        $missingSlides | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
        Write-Host ""
        Write-Host "Run .\scripts\render_full.ps1 (or render_preview.ps1) first." -ForegroundColor Cyan
        throw "Missing rendered slides. Please render before presenting."
    }

    Write-Host "Starting interactive slide presenter..."
    & $pythonExe -m manim_slides present $scenes
}
finally {
    Pop-Location
}
