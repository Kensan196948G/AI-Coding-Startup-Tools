<#
.SYNOPSIS
プロジェクト選択メニュー (Windows / PowerShell 7)

.DESCRIPTION
プロジェクトルート直下から、.git と .ai-startup-tools/ の両方を持つフォルダを一覧表示し、番号で選択します。

.EXAMPLE
./scripts/windows/Select-Project.ps1 -ProjectsRoot C:\work\projects

.EXAMPLE
./scripts/windows/Select-Project.ps1 -ProjectsRoot C:\work\projects -ListOnly -AsJson
#>
[CmdletBinding()]
param(
    [string]$ProjectsRoot = $env:AI_STARTUP_TOOLS_PROJECTS_ROOT,
    [ValidateSet('', 'Bootstrap', 'LaunchClaude', 'LaunchCodex')]
    [string]$Action = '',
    [switch]$ListOnly,
    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Modules\AIStartupTools.psm1') -Force

$rootExplicit = -not [string]::IsNullOrWhiteSpace($ProjectsRoot)
if (-not $rootExplicit) {
    $ProjectsRoot = Join-Path $HOME 'projects'
}

if (-not (Test-Path -LiteralPath $ProjectsRoot -PathType Container)) {
    if ($rootExplicit) {
        Write-Host "[ERROR] プロジェクトルートが見つかりません: $ProjectsRoot"
        exit 2
    }
    Write-Host "[WARN] プロジェクトルートがありません (既定値): $ProjectsRoot"
    exit 0
}

$projects = Get-ChildItem -LiteralPath $ProjectsRoot -Directory |
    Where-Object {
        (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName '.ai-startup-tools'))
    } |
    ForEach-Object {
        [pscustomobject]@{ name = $_.Name; path = $_.FullName }
    } |
    Sort-Object name

if ($ListOnly) {
    if ($AsJson) {
        if ($projects.Count -eq 0) {
            '[]'
        }
        else {
            $projects | ConvertTo-Json -Depth 3
        }
    }
    else {
        $projects | ForEach-Object { "$($_.name)`t$($_.path)" }
    }
    exit 0
}

if (-not $projects) {
    Write-Host '[WARN] 対象プロジェクトがありません (.git と .ai-startup-tools/ の両方が必要)'
    exit 0
}

Write-Host "[INFO]  プロジェクトルート: $ProjectsRoot"
$i = 0
foreach ($p in $projects) {
    $i++
    "[$i] $($p.name)"
    "    $($p.path)"
}

$answer = Read-Host "番号を選択してください (1-$i, q=終了)"
if ($answer -match '^[qQ]$') {
    Write-Host 'キャンセルしました。'
    exit 4
}
if ($answer -notmatch '^\d+$') {
    Write-Host "[ERROR] 選択が不正です: $answer"
    exit 2
}
$idx = [int]$answer - 1
if ($idx -lt 0 -or $idx -ge $projects.Count) {
    Write-Host "[ERROR] 選択が不正です: $answer"
    exit 2
}
$selected = $projects[$idx]
Write-Host "[INFO]  選択: $($selected.name) ($($selected.path))"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
switch ($Action) {
    'Bootstrap' {
        & (Join-Path $PSScriptRoot 'Bootstrap.ps1') -ProjectDirectory $selected.path -WhatIf
    }
    'LaunchClaude' {
        & (Join-Path $repoRoot 'claude-code\windows\Start-ClaudeCode.ps1') -ProjectDirectory $selected.path
    }
    'LaunchCodex' {
        & (Join-Path $repoRoot 'codex\windows\Start-Codex.ps1') -ProjectDirectory $selected.path
    }
    default {
        $selected.path
    }
}
exit 0
