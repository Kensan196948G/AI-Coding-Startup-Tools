<#
.SYNOPSIS
AI Coding Startup Tools 初期化 (Windows / PowerShell 7)

.DESCRIPTION
対象プロジェクトへローカル設定 (.ai-startup-tools) を初期化します。
既定は WhatIf (変更なし) です。適用するには -Apply を指定します。

.EXAMPLE
./scripts/windows/Bootstrap.ps1 -WhatIf

.EXAMPLE
./scripts/windows/Bootstrap.ps1 -Apply -Tool codex -Yes
#>
[CmdletBinding()]
param(
    [string]$ProjectDirectory = (Get-Location).Path,
    [ValidateSet('claude-code', 'codex')]
    [string]$Tool = 'claude-code',
    [string]$Profile = 'safe',
    [switch]$Apply,
    [switch]$WhatIf,
    [switch]$Yes,
    [switch]$NonInteractive,
    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Modules\AIStartupTools.psm1') -Force

$projectDir = Resolve-ProjectDirectory -Path $ProjectDirectory
$toolkitRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

$configSrc = Join-Path $toolkitRoot ("$Tool\common\config.example.yml")
$profileSrc = Join-Path $toolkitRoot ("$Tool\common\profiles\$Profile.yml")

if (-not (Test-Path -LiteralPath $profileSrc)) {
    Write-Host "[ERROR] プロファイルが見つかりません: $profileSrc"
    exit 2
}
if (-not (Test-Path -LiteralPath $configSrc)) {
    Write-Host "[ERROR] 設定の雛形が見つかりません: $configSrc"
    exit 2
}

$localDir = Join-Path $projectDir '.ai-startup-tools'
$configTarget = Join-Path $localDir 'config.yml'
$profileTarget = Join-Path $localDir 'profile.yml'
$gitignoreTarget = Join-Path $localDir '.gitignore'
$logDir = Join-Path $localDir 'logs'
$operationId = Get-OperationId

Write-LogInfo "対象ツール: $Tool / プロファイル: $Profile"
Write-LogInfo "ローカル設定先: $localDir"

foreach ($t in @($configTarget, $profileTarget, $gitignoreTarget)) {
    if (Test-Path -LiteralPath $t) {
        Write-LogInfo "[計画] 更新(既存あり): $t"
    }
    else {
        Write-LogInfo "[計画] 作成: $t"
    }
}
Write-LogInfo "[計画] 監査ログ: $logDir\audit.jsonl"

if ($AsJson) {
    [pscustomobject]@{
        operationId = $operationId
        mode        = $(if ($Apply) { 'apply' } else { 'dry-run' })
        tool        = $Tool
        projectDir  = $projectDir
        targets     = @($configTarget, $profileTarget, $gitignoreTarget)
    } | ConvertTo-Json -Depth 3
}

if ($WhatIf -or -not $Apply) {
    Write-LogInfo 'dry-run のため変更は行いません。適用するには -Apply を指定してください。'
    exit 0
}

if ($NonInteractive -and -not $Yes) {
    Write-Host '[ERROR] 非対話モードで適用するには -Yes が必要です。'
    exit 4
}

if (-not $Yes) {
    $answer = Read-Host '上記の変更を適用しますか? (yes/no)'
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host 'キャンセルしました。'
        exit 4
    }
}

$backupDir = Join-Path $localDir "backups\$operationId"
Backup-Target -Target $configTarget -BackupDir $backupDir
Backup-Target -Target $profileTarget -BackupDir $backupDir
Backup-Target -Target $gitignoreTarget -BackupDir $backupDir

if (-not (Test-Path -LiteralPath $configTarget)) {
    Invoke-AtomicWrite -Target $configTarget -Content (Get-Content -Raw -LiteralPath $configSrc)
}
else {
    Write-LogInfo 'config.yml は既存のため保持します'
}
if (-not (Test-Path -LiteralPath $profileTarget)) {
    Invoke-AtomicWrite -Target $profileTarget -Content (Get-Content -Raw -LiteralPath $profileSrc)
}
else {
    Write-LogInfo 'profile.yml は既存のため保持します'
}
if (-not (Test-Path -LiteralPath $gitignoreTarget)) {
    Invoke-AtomicWrite -Target $gitignoreTarget -Content "*`n"
}
else {
    Write-LogInfo '.gitignore は既存のため保持します'
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$ts = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$toolkitVersion = Get-ToolkitVersion
$audit = [pscustomobject]@{
    timestamp      = $ts
    level          = 'info'
    operationId    = $operationId
    component      = 'bootstrap'
    action         = 'apply'
    target         = $localDir
    result         = 'ok'
    toolkitVersion = $toolkitVersion
} | ConvertTo-Json -Compress
Add-Content -LiteralPath (Join-Path $logDir 'audit.jsonl') -Value $audit -Encoding utf8

Write-LogInfo "初期化が完了しました。復元用バックアップ: $backupDir"
exit 0
