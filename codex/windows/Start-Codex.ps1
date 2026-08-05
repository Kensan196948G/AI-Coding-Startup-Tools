<#
.SYNOPSIS
Codex 安全起動 (Windows)

.DESCRIPTION
起動前検査 (Git 状態・指示ファイル・プロンプト変数) を実施してから Codex を起動します。
既定では起動前に確認を求めます。

.EXAMPLE
./codex/windows/Start-Codex.ps1 -Check
#>
[CmdletBinding()]
param(
    [string]$ProjectDirectory = (Get-Location).Path,
    [string]$Profile = 'safe',
    [string[]]$Set,
    [switch]$Check,
    [switch]$WhatIf,
    [switch]$Yes,
    [switch]$NonInteractive,
    [switch]$AllowDangerous,
    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\..\scripts\windows\Modules\AIStartupTools.psm1') -Force

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] codex が見つかりません。公式ドキュメント https://developers.openai.com/codex/ を参照して導入してください。'
    exit 3
}

try {
    $ProjectDirectory = Resolve-ProjectDirectory -Path $ProjectDirectory
}
catch {
    Write-Host "[ERROR] $($_.Exception.Message)"
    exit 2
}

$gitRoot = git -C $ProjectDirectory rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -eq 0) {
    $branch = git -C $ProjectDirectory branch --show-current
    $dirty = @(git -C $ProjectDirectory status --porcelain).Count
    $remote = git -C $ProjectDirectory remote get-url origin 2>$null
    if (-not $remote) { $remote = '(none)' }
    Write-Host "[INFO] Git 状態: ブランチ=$branch, dirty=$dirty, remote=$remote"
}
else {
    Write-Warning "Git リポジトリではありません (ディレクトリ: $ProjectDirectory)"
}

foreach ($f in @('AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md')) {
    if (Test-Path -LiteralPath (Join-Path $ProjectDirectory $f) -PathType Leaf) {
        Write-Host "[INFO] 指示ファイルあり: $f"
    }
}

$toolkitRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$promptPath = 'prompts/common/implementation-safe.md'
$localProfile = Join-Path $ProjectDirectory '.ai-startup-tools\profile.yml'
if (Test-Path -LiteralPath $localProfile) {
    $m = Select-String -LiteralPath $localProfile -Pattern '^\s*default:\s*(.+)$'
    if ($m) {
        $promptPath = $m.Matches[0].Groups[1].Value.Trim().Trim('"')
    }
}
if (-not [System.IO.Path]::IsPathRooted($promptPath)) {
    $promptPath = Join-Path $toolkitRoot $promptPath
}
if (Test-Path -LiteralPath $promptPath) {
    Write-Host "[INFO] プロンプト: $promptPath"
    $missing = @()
    foreach ($line in Get-Content -LiteralPath $promptPath) {
        if ($line -match '\{\{([A-Z][A-Z0-9_]*)\}\}') {
            $var = $Matches[1]
            $provided = @($Set) | Where-Object { $_ -match "^$var=" }
            if (-not $provided) {
                $missing += $var
            }
        }
    }
    if ($missing.Count -gt 0) {
        Write-Host "[ERROR] 未解決のプロンプト変数があります: $($missing -join ', ') (-Set で指定してください)"
        exit 2
    }
}
else {
    Write-Warning "プロンプトが見つかりません: $promptPath (変数検査をスキップ)"
}

$argsList = @('--cd', $ProjectDirectory)
if ($AllowDangerous) {
    Write-Warning '全権限オプション (--dangerously-bypass-approvals-and-sandbox) を有効化します。利用者はリスクを理解している必要があります。'
    $argsList = @('--dangerously-bypass-approvals-and-sandbox') + $argsList
}

if ($Check) {
    Write-Host '[INFO] 起動前検査に合格しました。'
    if ($AsJson) {
        [pscustomobject]@{ status = 'ok'; projectDir = $ProjectDirectory; command = ($argsList -join ' ') } | ConvertTo-Json -Compress
    }
    exit 0
}

if ($WhatIf) {
    Write-Host "[INFO] 実行予定コマンド: codex $($argsList -join ' ')"
    exit 0
}

if ($NonInteractive -and -not $Yes) {
    Write-Host '[ERROR] 非対話モードでは起動前に -Yes が必要です。'
    exit 4
}

if (-not $Yes) {
    $answer = Read-Host 'Codex を起動しますか? (yes/no)'
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host 'キャンセルしました。'
        exit 4
    }
}

Write-Host "[INFO] Codex を起動します: $ProjectDirectory"
Push-Location $ProjectDirectory
try {
    & codex @argsList
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
