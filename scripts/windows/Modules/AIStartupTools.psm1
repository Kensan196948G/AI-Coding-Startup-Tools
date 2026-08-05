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

function Get-OperationId {
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
    return "op-$stamp-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
}

function Get-ToolkitVersion {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
    $pkg = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
    return $pkg.version
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
    $rootTrimmed = $rootFull.TrimEnd('\', '/')
    $separator = [System.IO.Path]::DirectorySeparatorChar

    # ルート境界判定はセパレータまで含めて行う
    # (C:\projects2 が C:\projects 配下と誤判定されないようにする)
    $insideRoot = ($candidate -eq $rootFull) -or
        $candidate.StartsWith($rootTrimmed + $separator, [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $insideRoot) {
        throw "出力パスがプロジェクトルート外です: $Relative"
    }

    # 既存コンポーネントのシンボリックリンク / ジャンクション検査
    $current = $rootFull
    foreach ($part in (($Relative -split '[\\/]') | Where-Object { $_ })) {
        $current = Join-Path $current $part
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
            $isLink = ($null -ne $item.LinkType) -or
                ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
            if ($isLink) {
                $targets = @($item.Target)
                if ($targets.Count -eq 0 -or [string]::IsNullOrWhiteSpace([string]$targets[0])) {
                    try {
                        $targets = @((Resolve-Path -LiteralPath $current).Path)
                    }
                    catch {
                        throw "シンボリックリンクを解決できません: $Relative"
                    }
                }
                foreach ($target in $targets) {
                    $resolved = [System.IO.Path]::GetFullPath([string]$target)
                    $insideRoot = ($resolved -eq $rootFull) -or
                        $resolved.StartsWith($rootTrimmed + $separator, [System.StringComparison]::OrdinalIgnoreCase)
                    if (-not $insideRoot) {
                        throw "シンボリックリンクがルート外を指しています: $Relative"
                    }
                }
            }
        }
    }
    return $candidate
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

Export-ModuleMember -Function Write-LogInfo, Write-LogWarn, Write-LogError, Resolve-ProjectDirectory, Resolve-SafeOutput, Get-OperationId, Get-ToolkitVersion, Invoke-AtomicWrite, Backup-Target
