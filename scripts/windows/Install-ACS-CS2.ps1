#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallDir = "C:\ACS-CS2",
    [string]$SteamCmdDir = "C:\ACS-SteamCMD"
)

$ErrorActionPreference = "Stop"
$steamCmdZip = Join-Path $SteamCmdDir "steamcmd.zip"
$steamCmdExe = Join-Path $SteamCmdDir "steamcmd.exe"

Write-Host "=== Liga Amendoim CS2 - Windows server bootstrap ===" -ForegroundColor Cyan
Write-Host "Server files: $InstallDir"
Write-Host "SteamCMD:     $SteamCmdDir"

New-Item -ItemType Directory -Force -Path $SteamCmdDir, $InstallDir | Out-Null

if (-not (Test-Path $steamCmdExe)) {
    Write-Host "Downloading SteamCMD..."
    Invoke-WebRequest -Uri "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip" -OutFile $steamCmdZip
    Expand-Archive -Path $steamCmdZip -DestinationPath $SteamCmdDir -Force
}

Write-Host "Downloading CS2 server files (AppID 730). This can take a while..."
& $steamCmdExe +force_install_dir $InstallDir +login anonymous +app_update 730 validate +quit
if ($LASTEXITCODE -ne 0) {
    throw "SteamCMD failed with exit code $LASTEXITCODE. Check the output above and rerun this script."
}

$serverExe = Join-Path $InstallDir "game\bin\win64\cs2.exe"
if (-not (Test-Path $serverExe)) {
    throw "CS2 server executable was not found at $serverExe. Check SteamCMD output and install directory."
}

$startScript = Join-Path $InstallDir "Start-ACS-Server.ps1"
@'
# Set these environment variables in this PowerShell session before starting:
# $env:ACS_CS2_GSLT = "your-private-game-server-login-token"
# $env:ACS_CS2_SERVER_PASSWORD = "your-private-match-password"
if ([string]::IsNullOrWhiteSpace($env:ACS_CS2_GSLT)) {
    throw "Set ACS_CS2_GSLT in this PowerShell session first."
}
if ([string]::IsNullOrWhiteSpace($env:ACS_CS2_SERVER_PASSWORD)) {
    throw "Set ACS_CS2_SERVER_PASSWORD in this PowerShell session first."
}
$exe = Join-Path $PSScriptRoot "game\bin\win64\cs2.exe"
if (-not (Test-Path $exe)) { throw "CS2 executable not found: $exe" }
& $exe -dedicated -console -usercon -port 27015 +sv_setsteamaccount $env:ACS_CS2_GSLT +sv_password $env:ACS_CS2_SERVER_PASSWORD +map de_mirage
'@ | Set-Content -Path $startScript -Encoding UTF8

$serverCfgDir = Join-Path $InstallDir "game\csgo\cfg"
New-Item -ItemType Directory -Force -Path $serverCfgDir | Out-Null
$serverCfg = Join-Path $serverCfgDir "server.cfg"
if (-not (Test-Path $serverCfg)) {
@'
// Liga Amendoim CS2 - baseline server configuration
hostname "Liga Amendoim CS2 | Servidor Oficial"
sv_lan 0
sv_cheats 0
mp_autokick 0
mp_limitteams 0
mp_autoteambalance 0
mp_freezetime 15
mp_roundtime 1.92
mp_maxrounds 24
mp_overtime_enable 1
sv_hibernate_when_empty 0
'@ | Set-Content -Path $serverCfg -Encoding UTF8
}

Write-Host ""
Write-Host "CS2 server files installed successfully." -ForegroundColor Green
Write-Host "Next: install Metamod + Windows CounterStrikeSharp + MatchZy as described in CS2_WINDOWS_SERVER.md."
Write-Host "Do NOT publish your GSLT or match password."
Write-Host "Start script: $startScript"
