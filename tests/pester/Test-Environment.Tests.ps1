BeforeAll {
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

Describe 'Test-Environment.ps1' {
    It 'AsJson 出力が得られる' {
        $out = & (Join-Path $repo 'scripts\windows\Test-Environment.ps1') -AsJson 2>$null
        $json = $out | ConvertFrom-Json
        $json | Should -Not -BeNullOrEmpty
        $json.items.Count | Should -BeGreaterThan 0
    }
}
