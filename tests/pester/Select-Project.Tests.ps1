BeforeAll {
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $selector = Join-Path $repo 'scripts\windows\Select-Project.ps1'
}

Describe 'Select-Project.ps1' {
    It 'ListOnly は .git と .ai-startup-tools の両方を持つプロジェクトだけを列挙する' {
        $root = Join-Path $TestDrive 'projects'
        New-Item -ItemType Directory -Path (Join-Path $root 'good\.git') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $root 'good\.ai-startup-tools') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $root 'onlygit\.git') -Force | Out-Null

        $out = & $selector -ProjectsRoot $root -ListOnly -AsJson | ConvertFrom-Json
        $out.Count | Should -Be 1
        $out[0].name | Should -Be 'good'
    }

    It '明示したルートが無ければ終了コード 2' {
        & $selector -ProjectsRoot (Join-Path $TestDrive 'nonexistent') -ListOnly 2>$null
        $LASTEXITCODE | Should -Be 2
    }
}
