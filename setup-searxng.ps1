<#
  Sets up SearXNG, the self-hosted search engine the AI Assistant uses for "Search the web".

    1. Writes C:\searxng\settings.yml (JSON output on, bot limiter off, safe search on).
    2. Replaces the "searxng" container (port 8888, reachable from this server only).
    3. Runs a test search and shows the first results.

  Usage (PowerShell, Docker Desktop running):
    powershell -ExecutionPolicy Bypass -File .\setup-searxng.ps1

  Then add to the IIS site's appsettings.json:   "Search": { "BaseUrl": "http://localhost:8888" }
  and recycle the app pool. The AI Assistant then shows a "Search the web" button.
#>
param(
    [string]$ConfigDir = "C:\searxng",
    [int]$Port = 8888
)

$ErrorActionPreference = "Continue"

$Container = "searxng"
$Image = "searxng/searxng:latest"

function Step([string]$text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Fail([string]$text) { Write-Host ""; Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }

Step "Checking Docker"
docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Docker isn't running. Start Docker Desktop and try again." }

# --- 1. settings.yml -------------------------------------------------------------------------------------
Step "Writing $ConfigDir\settings.yml"
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
$settings = Join-Path $ConfigDir "settings.yml"

# Keep the secret key of an earlier run; otherwise make a new random one.
$key = $null
if (Test-Path $settings) {
    $match = Select-String -Path $settings -Pattern 'secret_key:\s*"([0-9a-f]{32,})"' | Select-Object -First 1
    if ($match) { $key = $match.Matches[0].Groups[1].Value }
}
if (-not $key) { $key = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) }

$yaml = @"
# SearXNG for the MartonToolBox AI Assistant. Written by setup-searxng.ps1.
use_default_settings: true
server:
  secret_key: "$key"
  limiter: false        # only the backend on this server calls it
  image_proxy: false
search:
  safe_search: 1        # filter adult results
  formats:
    - html
    - json              # the backend reads JSON; without it SearXNG answers 403
"@
[IO.File]::WriteAllText($settings, $yaml.Replace("`r`n", "`n"), [Text.Encoding]::ASCII)
Write-Host "  done"

# --- 2. Container ----------------------------------------------------------------------------------------
Step "Pulling $Image"
docker pull $Image
if ($LASTEXITCODE -ne 0) { Fail "Couldn't pull $Image. Check the internet connection." }

Step "Starting the $Container container on 127.0.0.1:$Port"
docker rm -f $Container 2>$null | Out-Null
docker run -d --name $Container --restart unless-stopped -p "127.0.0.1:${Port}:8080" -v "${ConfigDir}:/etc/searxng" $Image
if ($LASTEXITCODE -ne 0) { Fail "docker run failed. Is port $Port in use? (netstat -ano | findstr $Port)" }

# --- 3. Test search --------------------------------------------------------------------------------------
Step "Waiting for a test search"
$url = "http://127.0.0.1:$Port/search?q=weather%20Cluj&format=json"
$start = Get-Date
$result = $null
while (((Get-Date) - $start).TotalSeconds -lt 90) {
    Start-Sleep -Seconds 3
    try {
        $result = Invoke-RestMethod -Uri $url -TimeoutSec 20 -ErrorAction Stop
        break
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 403) { Fail "SearXNG answered 403: JSON output is off. Check $settings (formats: json), then: docker restart $Container" }
        $running = docker inspect -f "{{.State.Running}}" $Container 2>$null
        if ("$running".Trim() -ne "true") {
            docker logs --tail 30 $Container
            Fail "The container stopped (see the log above)."
        }
        Write-Host ("  {0} s" -f [int]((Get-Date) - $start).TotalSeconds)
    }
}
if (-not $result) { Fail "No answer after 90 seconds. Check: docker logs $Container" }

$hits = @($result.results)
if ($hits.Count -eq 0) {
    Write-Host "SearXNG works but found nothing for the test search. The search engines may be blocking for a while; try again later." -ForegroundColor Yellow
} else {
    Write-Host "SearXNG works. First results:" -ForegroundColor Green
    $hits | Select-Object -First 3 | ForEach-Object { Write-Host "  - $($_.title)"; Write-Host "    $($_.url)" }
}

Step "Done. Now update the IIS backend"
Write-Host "Deploy the new backend (publish_toolbox), then in the site's appsettings.json add:"
Write-Host ""
Write-Host "  ""Search"": { ""BaseUrl"": ""http://localhost:$Port"" },"
Write-Host ""
Write-Host "and recycle the site's app pool. The AI Assistant then shows a 'Search the web' button."
