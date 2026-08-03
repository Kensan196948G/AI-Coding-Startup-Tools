<#
.SYNOPSIS
開発文書テンプレート生成 (Windows / PowerShell 7)

.DESCRIPTION
テンプレートマニフェストに従い、変数を置換して開発文書を生成します。
既定は WhatIf です。

.EXAMPLE
./scripts/windows/New-ProjectFromTemplate.ps1 -Template templates\requirements -Set PROJECT_NAME=Demo,PROJECT_SLUG=demo-app -Apply -Yes
#>
[CmdletBinding()]
param(
    [string]$Template,
    [string]$ProjectDirectory = (Get-Location).Path,
    [string[]]$Set,
    [switch]$Apply,
    [switch]$Yes,
    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Modules\AIStartupTools.psm1') -Force

if ([string]::IsNullOrWhiteSpace($Template)) {
    Write-Host '[ERROR] -Template を指定してください。'
    exit 2
}
$manifestPath = Join-Path $Template 'manifest.yml'
if (-not (Test-Path -LiteralPath $manifestPath)) {
    Write-Host "[ERROR] マニフェストが見つかりません: $manifestPath"
    exit 2
}

$projectDir = Resolve-ProjectDirectory -Path $ProjectDirectory

$entryMatch = Select-String -LiteralPath $manifestPath -Pattern '^entrypoint:\s*(.+)$' | Select-Object -First 1
$outputMatch = Select-String -LiteralPath $manifestPath -Pattern '^output:\s*(.+)$' | Select-Object -First 1
$entrypoint = $entryMatch.Matches[0].Groups[1].Value.Trim().Trim('"')
$outputTemplate = $outputMatch.Matches[0].Groups[1].Value.Trim().Trim('"')

if ([string]::IsNullOrWhiteSpace($entrypoint) -or [string]::IsNullOrWhiteSpace($outputTemplate)) {
    Write-Host '[ERROR] マニフェストに entrypoint / output がありません。'
    exit 2
}

$vars = @{}
foreach ($entry in $Set) {
    $eq = $entry.IndexOf('=')
    if ($eq -le 0) {
        Write-Host "[ERROR] 変数指定が不正です: $entry (NAME=value 形式)"
        exit 2
    }
    $name = $entry.Substring(0, $eq)
    if ($name -notmatch '^[A-Z][A-Z0-9_]*$') {
        Write-Host "[ERROR] 変数名が不正です: $name"
        exit 2
    }
    $vars[$name] = $entry.Substring($eq + 1)
}

$inRequired = $false
$required = @()
foreach ($line in (Get-Content -LiteralPath $manifestPath)) {
    if ($line -match '^requiredVariables:') { $inRequired = $true; continue }
    if ($inRequired) {
        if ($line -match '^\s*-\s*([A-Z][A-Z0-9_]*)\s*$') {
            $required += $Matches[1]
        }
        elseif ($line -match '^\S') {
            break
        }
    }
}

foreach ($var in $required) {
    if (-not $vars.ContainsKey($var)) {
        Write-Host "[ERROR] 必須変数が指定されていません: $var (-Set $var=value)"
        exit 2
    }
}

$body = Get-Content -Raw -LiteralPath (Join-Path $Template $entrypoint)
foreach ($name in $vars.Keys) {
    $body = $body.Replace("{{$name}}", $vars[$name])
}

$unresolved = [regex]::Matches($body, '\{\{[A-Z][A-Z0-9_]*\}\}') | ForEach-Object { $_.Value } | Sort-Object -Unique
if ($unresolved.Count -gt 0) {
    Write-Host "[ERROR] 未解決の変数があります: $($unresolved -join ' ')"
    exit 2
}

$outputRel = $outputTemplate
foreach ($name in $vars.Keys) {
    $outputRel = $outputRel.Replace("{{$name}}", $vars[$name])
}
try {
    $outputAbs = Resolve-SafeOutput -Root $projectDir -Relative $outputRel
}
catch {
    Write-Host "[ERROR] $($_.Exception.Message)"
    exit 5
}

if (Test-Path -LiteralPath $outputAbs) {
    Write-Host "[ERROR] 既存ファイルとの衝突のため生成しません: $outputRel (conflictPolicy: fail)"
    exit 6
}

Write-LogInfo "出力先: $outputRel"
if ($AsJson) {
    [pscustomobject]@{ output = $outputRel; bytes = $body.Length } | ConvertTo-Json -Compress
}

if (-not $Apply) {
    Write-LogInfo '--- 生成内容 (先頭 40 行) ---'
    $body -split "`n" | Select-Object -First 40
    Write-LogInfo 'dry-run のため書き込みません。-Apply で生成します。'
    exit 0
}

if (-not $Yes) {
    $answer = Read-Host 'ファイルを生成しますか? (yes/no)'
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host 'キャンセルしました。'
        exit 4
    }
}

Invoke-AtomicWrite -Target $outputAbs -Content $body
Write-LogInfo "生成しました: $outputAbs"
exit 0
