BeforeAll {
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $renderer = Join-Path $repo 'scripts\windows\New-ProjectFromTemplate.ps1'
}

Describe 'New-ProjectFromTemplate.ps1' {
    It 'WhatIf は書き込みをしない' {
        $tmp = Join-Path $TestDrive 'project1'
        New-Item -ItemType Directory -Path $tmp | Out-Null
        & $renderer -Template (Join-Path $repo 'templates\requirements') -ProjectDirectory $tmp -Set PROJECT_NAME=Demo,PROJECT_SLUG=demo 2>$null
        (Test-Path (Join-Path $tmp 'demo_要件定義書.md')) | Should -Be $false
    }

    It 'Apply で生成され、衝突時はエラーになる' {
        $tmp = Join-Path $TestDrive 'project2'
        New-Item -ItemType Directory -Path $tmp | Out-Null
        & $renderer -Template (Join-Path $repo 'templates\requirements') -ProjectDirectory $tmp -Set PROJECT_NAME=Demo,PROJECT_SLUG=demo -Apply -Yes 2>$null
        (Test-Path (Join-Path $tmp 'demo_要件定義書.md')) | Should -Be $true

        & $renderer -Template (Join-Path $repo 'templates\requirements') -ProjectDirectory $tmp -Set PROJECT_NAME=Demo,PROJECT_SLUG=demo -Apply -Yes 2>$null
        $LASTEXITCODE | Should -Be 6
    }
}
