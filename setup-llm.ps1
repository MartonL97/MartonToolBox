<#
  Sets up the AI Assistant's local LLM on a Windows server with Docker Desktop, in one go:

    1. Limits Docker's memory (memory=... under [wsl2] in %USERPROFILE%\.wslconfig).
    2. Restarts Docker Desktop and WSL so the limit applies (also recovers a crashed Docker).
    3. Removes the old "llm" container (model files stay in the "llm-models" volume).
    4. Starts llama.cpp with the chosen model, waits for the download, asks a test question.
    5. Deletes the previous models' files, but only after the new one answers.

  Usage (PowerShell):
    powershell -ExecutionPolicy Bypass -File .\setup-llm.ps1                    # Gemma 3n E4B, Docker limited to 10GB
    powershell -ExecutionPolicy Bypass -File .\setup-llm.ps1 -Memory 12GB
    powershell -ExecutionPolicy Bypass -File .\setup-llm.ps1 -NoRestart         # Docker is fine, just switch the model
    powershell -ExecutionPolicy Bypass -File .\setup-llm.ps1 -HfModel unsloth/gemma-3-12b-it-GGUF:Q4_K_M -Alias gemma-3-12b

  Afterwards set the IIS backend's Llm:Model to the alias and recycle the app pool (the script prints what to set).
#>
param(
    [string]$HfModel = "unsloth/gemma-3n-E4B-it-GGUF:Q4_K_M",  # Hugging Face repo, or repo:quantization
    [string]$Alias = "gemma-3n-e4b",                           # name the API reports; the backend's Llm:Model must match
    [string]$Memory = "10GB",                                  # Docker's memory limit; leave ~6 GB for Windows, IIS, PostgreSQL
    [switch]$NoRestart,                                        # skip the .wslconfig change and the Docker restart
    [switch]$Gpu,                                              # NVIDIA GPU with enough VRAM (not the Quadro K620)
    [switch]$KeepOld,                                          # don't delete the previous models' files
    [int]$Context = 8192,
    [int]$TimeoutMinutes = 120
)

# docker writes progress to stderr; "Stop" would turn that into errors in Windows PowerShell.
$ErrorActionPreference = "Continue"

$Container = "llm"
$Volume = "llm-models"
$Cache = "/root/.cache/llama.cpp"
$Port = 8081
$Image = if ($Gpu) { "ghcr.io/ggml-org/llama.cpp:server-cuda" } else { "ghcr.io/ggml-org/llama.cpp:server" }

function Step([string]$text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail([string]$text) { Write-Host ""; Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }
function Test-Engine { docker info --format "{{.ServerVersion}}" 2>$null | Out-Null; return ($LASTEXITCODE -eq 0) }

if ($Memory -notmatch "^\d+(MB|GB)$") { Fail "Use a value like 10GB for -Memory." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker isn't installed or isn't on PATH." }

if (-not $NoRestart) {
    # --- 1. .wslconfig: set memory= in [wsl2], keep everything else ------------------------------------
    Step "Limiting Docker to $Memory (.wslconfig)"
    $path = Join-Path $env:USERPROFILE ".wslconfig"
    $lines = [System.Collections.Generic.List[string]]::new()
    if (Test-Path $path) { Get-Content $path | ForEach-Object { $lines.Add($_) } }
    $section = -1
    for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].Trim() -ieq "[wsl2]") { $section = $i; break } }
    if ($section -lt 0) {
        if ($lines.Count -and $lines[$lines.Count - 1].Trim()) { $lines.Add("") }
        $lines.Add("[wsl2]"); $lines.Add("memory=$Memory")
    } else {
        $done = $false
        for ($i = $section + 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i].Trim().StartsWith("[")) { break }
            if ($lines[$i] -match "^\s*memory\s*=") { $lines[$i] = "memory=$Memory"; $done = $true; break }
        }
        if (-not $done) { $lines.Insert($section + 1, "memory=$Memory") }
    }
    [IO.File]::WriteAllLines($path, $lines, [Text.Encoding]::ASCII)
    Get-Content $path | ForEach-Object { Write-Host "  $_" }

    # --- 2. Restart Docker Desktop and WSL ---------------------------------------------------------------
    Step "Restarting Docker Desktop and WSL"
    Get-Process "Docker Desktop", "com.docker.backend", "com.docker.build" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    wsl --shutdown
    Start-Sleep -Seconds 5
    # Docker Desktop.exe sits three folders above docker.exe (...\Docker\resources\bin\docker.exe), or in a usual place.
    $dockerCli = (Get-Command docker).Source
    $exe = @(
        (Join-Path (Split-Path (Split-Path (Split-Path $dockerCli))) "Docker Desktop.exe"),
        (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Docker\Docker\Docker Desktop.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe")
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $exe) {
        Fail "Couldn't find Docker Desktop.exe (docker.exe is at $dockerCli). The memory limit is set and WSL is stopped. Start Docker Desktop by hand, then run this with -NoRestart."
    }
    Write-Host "  Starting $exe"
    Start-Process $exe
}

# --- Wait for the engine; remove the old container at once so it can't load a too-big model again ---------
Step "Waiting for the Docker engine"
$start = Get-Date
while (-not (Test-Engine)) {
    if (((Get-Date) - $start).TotalMinutes -gt 5) {
        Fail "Docker didn't start in 5 minutes. In Docker Desktop use Troubleshoot > Restart, then run this again."
    }
    Write-Host ("  {0} s" -f [int]((Get-Date) - $start).TotalSeconds)
    Start-Sleep -Seconds 3
}
docker rm -f $Container 2>$null | Out-Null
Write-Host "Docker is running. Old $Container container removed (if there was one)."

$memGb = [math]::Round([double](docker info --format "{{.MemTotal}}") / 1GB, 1)
# Rough need: the model file plus ~1.5 GB. Gemma 3n E4B ~6 GB, 12B/14B models ~9 GB, gpt-oss-20b ~14 GB.
$needGb = if ($HfModel -match "gpt-oss-20b") { 14 } elseif ($HfModel -match "12b|14b") { 9 } else { 6 }
Write-Host "Docker has $memGb GB of memory; $Alias needs about $needGb GB."
if ($memGb -lt $needGb) {
    Write-Host "Not enough: the container would likely crash while loading." -ForegroundColor Yellow
    if ((Read-Host "Continue anyway? (y/n)") -ne "y") { exit 1 }
}

# --- 3. Remember the files in the volume now, so only those can be deleted later -------------------------
Step "Pulling the latest llama.cpp image"
docker pull $Image
if ($LASTEXITCODE -ne 0) { Fail "Couldn't pull $Image. Check the internet connection." }

Step "Model files in the $Volume volume now"
$before = @(docker run --rm -v "${Volume}:/data" --entrypoint ls $Image -1A /data | Where-Object { $_ -and $_.Trim() })
if ($before.Count) { $before | ForEach-Object { Write-Host "  $_" } } else { Write-Host "  (empty)" }

# --- 4. Start the new model ------------------------------------------------------------------------------
Step "Starting $Alias ($HfModel)"
$runArgs = @("run", "-d", "--name", $Container, "--restart", "unless-stopped",
    "-p", "127.0.0.1:${Port}:8080", "-v", "${Volume}:$Cache")
if ($Gpu) { $runArgs += @("--gpus", "all") }
$runArgs += @($Image, "-hf", $HfModel, "--alias", $Alias, "--jinja", "-c", "$Context", "--host", "0.0.0.0", "--port", "8080")
if ($Gpu) { $runArgs += @("-ngl", "999") }
docker @runArgs
if ($LASTEXITCODE -ne 0) { Fail "docker run failed (see the message above)." }

Step "Downloading and loading the model (shows the size of the model folder)"
$start = Get-Date
$ready = $false
while (((Get-Date) - $start).TotalMinutes -lt $TimeoutMinutes) {
    Start-Sleep -Seconds 15
    try {
        $models = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/models" -TimeoutSec 10 -ErrorAction Stop
        if ($models.data | Where-Object { $_.id -eq $Alias }) { $ready = $true; break }
    } catch { }  # not listening yet, or 503 while loading

    if (-not (Test-Engine)) { Fail "Docker stopped responding, most likely out of memory. Try a smaller model or a higher -Memory." }
    $running = docker inspect -f "{{.State.Running}}" $Container 2>$null
    if ("$running".Trim() -ne "true") {
        docker logs --tail 30 $Container
        Fail "The container stopped (see the log above). Usually: not enough memory, or a wrong model name."
    }
    $size = docker exec $Container du -sh $Cache 2>$null
    $size = if ($size) { ("$size" -split "\s")[0] } else { "?" }
    Write-Host ("  {0} min  model folder: {1}" -f [int]((Get-Date) - $start).TotalMinutes, $size)
}
if (-not $ready) { Fail "Not ready after $TimeoutMinutes minutes. Check: docker logs llm" }
Write-Host "The model is loaded." -ForegroundColor Green

Step "Asking a test question"
$body = @{
    model    = $Alias
    messages = @(@{ role = "user"; content = "Reply with one short sentence: are you working?" })
} | ConvertTo-Json -Depth 5
try {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $reply = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/chat/completions" -Method Post `
        -ContentType "application/json" -Body $body -TimeoutSec 600 -ErrorAction Stop
    Write-Host ("  Answer in {0:N0} s: {1}" -f $timer.Elapsed.TotalSeconds, "$($reply.choices[0].message.content)".Trim()) -ForegroundColor Green
} catch {
    Fail "The model didn't answer: $($_.Exception.Message). Old model files were NOT deleted."
}

# --- 5. Delete the previous models' files ----------------------------------------------------------------
# Keeps every file whose name contains the new repo name (letters and digits only, case ignored).
$key = (($HfModel -split ":")[0]).ToLowerInvariant() -replace "[^a-z0-9]", ""
$old = @($before | Where-Object { -not (($_.ToLowerInvariant() -replace "[^a-z0-9]", "").Contains($key)) })
if ($KeepOld -or $old.Count -eq 0) {
    Step "No old model files to delete"
} else {
    Step "Deleting the old model files"
    foreach ($name in $old) {
        Write-Host "  $name"
        docker exec $Container rm -rf "$Cache/$name"
    }
}
docker exec $Container du -sh $Cache

Step "Done. Now update the IIS backend"
Write-Host "In the site's appsettings.json, in the Llm section:"
Write-Host "  set    ""Model"": ""$Alias"""
if ($HfModel -match "gpt-oss") { Write-Host "  set    ""ReasoningEffort"": ""low""" } else { Write-Host "  remove ""ReasoningEffort"" (gpt-oss only)" }
if ($HfModel -match "qwen3") { Write-Host "  set    ""Think"": false" } else { Write-Host "  remove ""Think"" (Qwen only)" }
Write-Host "Then recycle the site's app pool."
