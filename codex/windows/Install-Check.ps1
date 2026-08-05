<#
.SYNOPSIS
Codex 導入確認 (Windows)

.DESCRIPTION
codex CLI、Git、Node.js の導入状況を確認します。

.EXAMPLE
./codex/windows/Install-Check.ps1
#>
[CmdletBinding()]
param(
    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'

function Write-Report {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail
    )
    if ($AsJson) {
        [pscustomobject]@{ name = $Name; status = $Status; detail = $Detail } | ConvertTo-Json -Compress
    }
    else {
        "[$Status] $Name : $Detail"
    }
}

$exitCode = 0

if (Get-Command codex -ErrorAction SilentlyContinue) {
    try {
        $ver = ((codex --version 2>$null) | Select-Object -First 1) -join ' '
    }
    catch {
        $ver = 'unknown'
    }
    Write-Report -Name 'codex' -Status 'OK' -Detail $ver
}
else {
    Write-Report -Name 'codex' -Status 'NG' -Detail '未導入です。公式ドキュメント https://developers.openai.com/codex/ を参照して導入してください。'
    $exitCode = 3
}

if (Get-Command git -ErrorAction SilentlyContinue) {
    $ver = (git --version) -replace '^git version ', ''
    Write-Report -Name 'git' -Status 'OK' -Detail "git $ver"
}
else {
    Write-Report -Name 'git' -Status 'NG' -Detail 'git が見つかりません。導入してください。'
    $exitCode = 3
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    $ver = (node --version)
    Write-Report -Name 'node' -Status 'OK' -Detail "node $ver"
}
else {
    Write-Report -Name 'node' -Status 'WARN' -Detail 'node が見つかりません。Codex の実行に必要な場合があります。'
}

exit $exitCode
