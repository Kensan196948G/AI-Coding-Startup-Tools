BeforeAll {
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

Describe 'Start-ClaudeCode.ps1' {
    It 'claude 未導入なら起動前検査で停止する' {
        if (Get-Command claude -ErrorAction SilentlyContinue) {
            Set-ItResult -Skipped -Because 'この環境には claude が導入されているため'
            return
        }
        $launcher = Join-Path $repo 'claude-code\windows\Start-ClaudeCode.ps1'
        & $launcher -Check -ProjectDirectory $repo 2>$null
        $LASTEXITCODE | Should -Be 3
    }
}
