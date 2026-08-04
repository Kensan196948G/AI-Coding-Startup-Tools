BeforeAll {
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    Import-Module (Join-Path $repo 'scripts\windows\Modules\AIStartupTools.psm1') -Force
}

Describe 'AIStartupTools module' {
    It 'Get-ToolkitVersion が package.json と一致する' {
        $pkg = Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json
        Get-ToolkitVersion | Should -Be $pkg.version
    }

    It 'Resolve-SafeOutput は通常の相対パスを許可する' {
        $tmp = Join-Path $TestDrive 'root'
        New-Item -ItemType Directory -Path $tmp | Out-Null
        Resolve-SafeOutput -Root $tmp -Relative 'docs\report.md' | Should -Be (Join-Path $tmp 'docs\report.md')
    }

    It 'Resolve-SafeOutput は .. を含むパスを拒否する' {
        { Resolve-SafeOutput -Root (Join-Path $TestDrive 'root') -Relative '..\evil.txt' } | Should -Throw
    }

    It 'Resolve-SafeOutput はジャンクション経由のルート外出力を拒否する' {
        $id = [guid]::NewGuid().ToString('N')
        $root = Join-Path $TestDrive "root-$id"
        $outside = Join-Path $TestDrive "outside-$id"
        New-Item -ItemType Directory -Path $root | Out-Null
        New-Item -ItemType Directory -Path $outside | Out-Null
        $link = Join-Path $root 'link'
        try {
            New-Item -ItemType Junction -Path $link -Target $outside -ErrorAction Stop | Out-Null
        }
        catch {
            Set-ItResult -Skipped -Because 'ジャンクション作成に権限が必要なため'
            return
        }
        if (-not (Test-Path -LiteralPath $link)) {
            Set-ItResult -Skipped -Because 'このプラットフォームではジャンクションが作成できないため'
            return
        }
        { Resolve-SafeOutput -Root $root -Relative 'link\evil.txt' } | Should -Throw
    }
}
