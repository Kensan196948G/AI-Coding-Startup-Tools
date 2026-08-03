# AI Coding Startup Tools 共通モジュール (Windows / PowerShell 7)
Set-StrictMode -Version Latest

function Write-LogInfo {
    param([string]$Message)
    Write-Host "[INFO]  $Message"
}

function Write-LogWarn {
    param([string]$Message)
    Write-Host "[WARN]  $Message"
}

function Write-LogError {
    param([string]$Message)
    Write-Error "[ERROR] $Message"
}

function Resolve-ProjectDirectory {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw 'プロジェクトディレクトリが指定されていません。'
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "プロジェクトディレクトリが見つかりません: $Path"
    }
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $root = [System.IO.Path]::GetPathRoot($resolved)
    if ($resolved -eq $root) {
        throw 'ルートディレクトリをプロジェクトに指定できません。'
    }
    if ($resolved -eq $HOME) {
        throw 'ホームディレクトリ全体をプロジェクトに指定できません。'
    }
    return $resolved
}

function Resolve-SafeOutput {
    param(
        [string]$Root,
        [string]$Relative
    )
    if ([System.IO.Path]::IsPathRooted($Relative)) {
        throw "出力パスは相対パスで指定してください: $Relative"
    }
    if (($Relative -split '[\\/]') -contains '..') {
        throw "出力パスに '..' を含めることはできません: $Relative"
    }
    $rootFull = [System.IO.Path]::GetFullPath($Root)
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $rootFull $Relative))
    if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "出力パスがプロジェクトルート外です: $Relative"
    }
    return $candidate
}

function Get-OperationId {
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
    return "op-$stamp-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
}

function Invoke-AtomicWrite {
    param(
        [string]$Target,
        [string]$Content
    )
    $dir = Split-Path -Parent $Target
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $tmp = Join-Path $dir ('.tmp-' + [guid]::NewGuid().ToString('N'))
    Set-Content -LiteralPath $tmp -Value $Content -Encoding utf8
    Move-Item -LiteralPath $tmp -Destination $Target -Force
}

function Backup-Target {
    param(
        [string]$Target,
        [string]$BackupDir
    )
    if (Test-Path -LiteralPath $Target) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        Copy-Item -LiteralPath $Target -Destination (Join-Path $BackupDir (Split-Path -Leaf $Target)) -Force
        Write-LogInfo "バックアップ作成: $Target -> $BackupDir\$(Split-Path -Leaf $Target)"
    }
}

Export-ModuleMember -Function Write-LogInfo, Write-LogWarn, Write-LogError, Resolve-ProjectDirectory, Resolve-SafeOutput, Get-OperationId, Invoke-AtomicWrite, Backup-Target
