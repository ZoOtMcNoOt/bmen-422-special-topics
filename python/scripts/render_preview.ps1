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

    Write-Host "Rendering preview deck at 1080p30..."
    & $pythonExe -m manim_slides render -q h --fps 30 storm_slides/main_deck.py $scenes
}
finally {
    Pop-Location
}
