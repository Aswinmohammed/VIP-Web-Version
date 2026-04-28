param(
    [int]$PollSeconds = 15,
    [int]$BatchSize = 50
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $projectRoot

$pythonExe = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    throw "Python runtime not found at $pythonExe. Create the virtual environment first."
}

& $pythonExe backend\scripts\run_sms_worker.py --poll-seconds $PollSeconds --batch-size $BatchSize
