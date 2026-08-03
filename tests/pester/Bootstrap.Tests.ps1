BeforeAll {
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $bootstrap = Join-Path $repo 'scripts\windows\Bootstrap.ps1'
}

Describe 'Bootstrap.ps1' {
    It 'WhatIf (既定) は書き込みをしない' {
        $tmp = Join-Path $TestDrive 'project1'
        New-Item -ItemType Directory -Path $tmp | Out-Null
        & $bootstrap -ProjectDirectory $tmp -WhatIf 2>$null
        (Test-Path (Join-Path $tmp '.ai-startup-tools')) | Should -Be $false
    }

    It 'Apply で初期化され、再実行しても冪等' {
        $tmp = Join-Path $TestDrive 'project2'
        New-Item -ItemType Directory -Path $tmp | Out-Null
        & $bootstrap -ProjectDirectory $tmp -Apply -Yes -NonInteractive 2>$null
        (Test-Path (Join-Path $tmp '.ai-startup-tools\config.yml')) | Should -Be $true
        (Test-Path (Join-Path $tmp '.ai-startup-tools\profile.yml')) | Should -Be $true

        & $bootstrap -ProjectDirectory $tmp -Apply -Yes -NonInteractive 2>$null
        (Test-Path (Join-Path $tmp '.ai-startup-tools\config.yml')) | Should -Be $true
    }
}
