param(
    [string]$NssmPath = "C:\nssm\nssm.exe",
    [string]$BackendServiceName = "VIPTailorsBackend",
    [string]$SmsWorkerServiceName = "VIPTailorsSmsWorker",
    [string]$BackendHost = "127.0.0.1",
    [int]$BackendPort = 8000,
    [int]$SmsPollSeconds = 15,
    [int]$SmsBatchSize = 50
)

$ErrorActionPreference = "Stop"

function Set-NssmValue {
    param(
        [string]$ServiceName,
        [string]$Key,
        [string]$Value
    )

    & $NssmPath set $ServiceName $Key $Value | Out-Null
}

function Install-OrUpdateService {
    param(
        [string]$ServiceName,
        [string]$DisplayName,
        [string]$Description,
        [string]$AppPath,
        [string]$AppDirectory,
        [string]$AppParameters,
        [string]$StdoutLog,
        [string]$StderrLog
    )

    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        & $NssmPath install $ServiceName $AppPath $AppParameters | Out-Null
    }

    Set-NssmValue -ServiceName $ServiceName -Key "Application" -Value $AppPath
    Set-NssmValue -ServiceName $ServiceName -Key "AppDirectory" -Value $AppDirectory
    Set-NssmValue -ServiceName $ServiceName -Key "AppParameters" -Value $AppParameters
    Set-NssmValue -ServiceName $ServiceName -Key "DisplayName" -Value $DisplayName
    Set-NssmValue -ServiceName $ServiceName -Key "Description" -Value $Description
    Set-NssmValue -ServiceName $ServiceName -Key "Start" -Value "SERVICE_AUTO_START"
    Set-NssmValue -ServiceName $ServiceName -Key "AppStdout" -Value $StdoutLog
    Set-NssmValue -ServiceName $ServiceName -Key "AppStderr" -Value $StderrLog
    Set-NssmValue -ServiceName $ServiceName -Key "AppRotateFiles" -Value "1"
    Set-NssmValue -ServiceName $ServiceName -Key "AppRotateOnline" -Value "1"
    Set-NssmValue -ServiceName $ServiceName -Key "AppRotateSeconds" -Value "86400"
    Set-NssmValue -ServiceName $ServiceName -Key "AppRotateBytes" -Value "10485760"
}

if (-not (Test-Path $NssmPath)) {
    throw "NSSM not found at $NssmPath. Install NSSM first or pass the correct -NssmPath value."
}

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pythonExe = Join-Path $projectRoot ".venv\Scripts\python.exe"
$logsDir = Join-Path $projectRoot "logs"

if (-not (Test-Path $pythonExe)) {
    throw "Python runtime not found at $pythonExe. Create the virtual environment first."
}

New-Item -ItemType Directory -Force $logsDir | Out-Null

$backendArgs = "-ExecutionPolicy Bypass -File `"$projectRoot\scripts\windows\start_backend.ps1`" -HostAddress $BackendHost -Port $BackendPort"
$smsWorkerArgs = "-ExecutionPolicy Bypass -File `"$projectRoot\scripts\windows\start_sms_worker.ps1`" -PollSeconds $SmsPollSeconds -BatchSize $SmsBatchSize"

Install-OrUpdateService `
    -ServiceName $BackendServiceName `
    -DisplayName "VIP Tailors Backend" `
    -Description "FastAPI backend for VIP Tailors" `
    -AppPath "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -AppDirectory $projectRoot `
    -AppParameters $backendArgs `
    -StdoutLog (Join-Path $logsDir "backend-service.log") `
    -StderrLog (Join-Path $logsDir "backend-service-error.log")

Install-OrUpdateService `
    -ServiceName $SmsWorkerServiceName `
    -DisplayName "VIP Tailors SMS Worker" `
    -Description "Queued SMS worker for VIP Tailors" `
    -AppPath "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -AppDirectory $projectRoot `
    -AppParameters $smsWorkerArgs `
    -StdoutLog (Join-Path $logsDir "sms-worker-service.log") `
    -StderrLog (Join-Path $logsDir "sms-worker-service-error.log")

Restart-Service -Name $BackendServiceName -ErrorAction SilentlyContinue
Restart-Service -Name $SmsWorkerServiceName -ErrorAction SilentlyContinue

Write-Host "Configured services:"
Write-Host " - $BackendServiceName"
Write-Host " - $SmsWorkerServiceName"
Write-Host "Log files are stored in $logsDir"
