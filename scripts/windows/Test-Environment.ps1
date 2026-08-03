<#
.SYNOPSIS
環境診断 (Windows / PowerShell 7)

.DESCRIPTION
OS、PowerShell、Git、Node.js、Claude Code、Codex の導入状況と互換性を確認します。

.EXAMPLE
./scripts/windows/Test-Environment.ps1

.EXAMPLE
./scripts/windows/Test-Environment.ps1 -AsJson
#>
[CmdletBinding()]
param(
    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'

$items = @()

function Add-Check {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail
    )
    $script:items += [pscustomobject]@{ name = $Name; status = $Status; detail = $Detail }
    if (-not $AsJson) {
        "[$Status] {0,-16} {1}" -f $Name, $Detail
    }
}

$globalExit = 0

Add-Check -Name 'os' -Status 'OK' -Detail "$([System.Environment]::OSVersion.VersionString) / $env:PROCESSOR_ARCHITECTURE"

if ($PSVersionTable.PSVersion.Major -ge 7) {
    Add-Check -Name 'powershell' -Status 'OK' -Detail "PowerShell $($PSVersionTable.PSVersion.ToString())"
}
else {
    Add-Check -Name 'powershell' -Status 'NG' -Detail "PowerShell $($PSVersionTable.PSVersion.ToString()) は非対応です (7.4 以上が必要)"
    $globalExit = 3
}

if (Get-Command git -ErrorAction SilentlyContinue) {
    $ver = (git --version) -replace '^git version ', ''
    Add-Check -Name 'git' -Status 'OK' -Detail "git $ver"
}
else {
    Add-Check -Name 'git' -Status 'NG' -Detail 'git が見つかりません。導入してください。'
    $globalExit = 3
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    $ver = (node --version).TrimStart('v')
    $major = [int]($ver.Split('.')[0])
    if ($major -ge 20) {
        Add-Check -Name 'node' -Status 'OK' -Detail "node $ver"
    }
    else {
        Add-Check -Name 'node' -Status 'NG' -Detail "node $ver は非対応です (20 以上が必要)"
        $globalExit = 3
    }
}
else {
    Add-Check -Name 'node' -Status 'NG' -Detail 'node が見つかりません。導入してください。'
    $globalExit = 3
}

if (Get-Command claude -ErrorAction SilentlyContinue) {
    $ver = try { (claude --version 2>$null | Select-Object -First 1) -join ' ' } catch { 'unknown' }
    Add-Check -Name 'claude' -Status 'OK' -Detail $ver
}
else {
    Add-Check -Name 'claude' -Status 'WARN' -Detail '未導入です。https://docs.anthropic.com/en/docs/claude-code/setup を参照してください。'
}

if (Get-Command codex -ErrorAction SilentlyContinue) {
    $ver = try { (codex --version 2>$null | Select-Object -First 1) -join ' ' } catch { 'unknown' }
    Add-Check -Name 'codex' -Status 'OK' -Detail $ver
}
else {
    Add-Check -Name 'codex' -Status 'WARN' -Detail '未導入です。https://developers.openai.com/codex/ を参照してください。'
}

if ($AsJson) {
    [pscustomobject]@{ os = [System.Environment]::OSVersion.VersionString; items = $items } | ConvertTo-Json -Depth 4
}

if ($globalExit -ne 0) {
    Write-Host '[ERROR] 必須要件を満たしていません。上記の NG 項目を解消してください。'
    exit $globalExit
}

exit 0
