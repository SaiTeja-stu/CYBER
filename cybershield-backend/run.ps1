# Cyber Shield backend - dev launcher (PowerShell)
# Usage:  .\run.ps1
# Reads secrets from .env if present, otherwise uses safe dev defaults.

$ErrorActionPreference = "Stop"

function Load-DotEnv($path) {
    if (Test-Path $path) {
        Get-Content $path | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $k, $v = $line -split "=", 2
                Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
            }
        }
        Write-Host "Loaded environment from .env"
    }
}

if (Test-Path "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot") {
    $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
} elseif (Test-Path "C:\Program Files\Java\jdk-21") {
    $env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
} elseif (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
    $env:Path = "$env:JAVA_HOME\bin;$env:Path"
}

Load-DotEnv (Join-Path $PSScriptRoot ".env")

# Fill any missing values with dev defaults
if (-not $env:CYBERSHIELD_JWT_SECRET)    { $env:CYBERSHIELD_JWT_SECRET    = "dev-jwt-secret-change-me-at-least-32-characters" }
if (-not $env:CYBERSHIELD_HMAC_SECRET)   { $env:CYBERSHIELD_HMAC_SECRET   = "dev-hmac-secret-change-me" }
if (-not $env:CYBERSHIELD_ADMIN_USER)    { $env:CYBERSHIELD_ADMIN_USER    = "admin" }
if (-not $env:CYBERSHIELD_ADMIN_PASSWORD){ $env:CYBERSHIELD_ADMIN_PASSWORD = "admin-password-123456" }
if (-not $env:CYBERSHIELD_DB_PATH)       { $env:CYBERSHIELD_DB_PATH       = "./data/cybershield.db" }
if (-not $env:CYBERSHIELD_ARCHIVE_DIR)   { $env:CYBERSHIELD_ARCHIVE_DIR   = "./data/archive" }
if (-not $env:PORT)                      { $env:PORT                      = "8899" }

$mailState = if ($env:SMTP_USERNAME) { "on ($($env:SMTP_USERNAME))" } else { "OFF (set SMTP_* in .env)" }

Write-Host ""
Write-Host "Cyber Shield backend starting..." -ForegroundColor Cyan
Write-Host "  API      : http://localhost:$($env:PORT)"
Write-Host "  Swagger  : http://localhost:$($env:PORT)/swagger-ui.html"
Write-Host "  Admin    : $($env:CYBERSHIELD_ADMIN_USER) / $($env:CYBERSHIELD_ADMIN_PASSWORD)"
Write-Host "  DB file  : $($env:CYBERSHIELD_DB_PATH)"
Write-Host "  Archive  : $($env:CYBERSHIELD_ARCHIVE_DIR)"
Write-Host "  SMTP     : $mailState"
Write-Host ""

& (Join-Path $PSScriptRoot "gradlew.bat") bootRun
