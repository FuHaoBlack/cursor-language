$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts\windows-discovery.ps1')
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('cursor-discovery-' + [Guid]::NewGuid().ToString('N'))
try {
    $root = Join-Path $fixtureRoot 'Apps & Tools\中文 Cursor=local'
    $app = Join-Path $root 'resources\app'
    [void][IO.Directory]::CreateDirectory((Join-Path $app 'bin'))
    [IO.File]::WriteAllText((Join-Path $app 'package.json'), '{}')
    [IO.File]::WriteAllText((Join-Path $root 'Cursor.exe'), '')
    [IO.File]::WriteAllText((Join-Path $app 'bin\cursor.cmd'), '')
    foreach ($candidate in @($root, (Join-Path $root 'Cursor.exe'), (Join-Path $app 'bin\cursor.cmd'), $app, ('"' + (Join-Path $root 'Cursor.exe') + '",0'))) {
        if ((Resolve-CursorInstallRoot $candidate) -cne $root) { throw "Resolve failed: $candidate" }
    }
    $found = @(Find-CursorInstalls -OnlyCandidates -CandidatePaths @($root, $root.ToUpperInvariant(), (Join-Path $root 'Cursor.exe'), (Join-Path $fixtureRoot 'missing')))
    if ($found.Count -ne 1 -or $found[0] -cne $root) { throw 'Deduplication or missing-path handling failed' }
    $savedInstallDir = $env:CURSOR_INSTALL_DIR
    try {
        $env:CURSOR_INSTALL_DIR = $root
        if (@(Find-CursorInstalls) -notcontains $root) { throw 'Automatic discovery lost candidates when no explicit candidate list was supplied' }
    } finally { $env:CURSOR_INSTALL_DIR = $savedInstallDir }
    Assert-CursorClosed $root
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path $PSScriptRoot -Parent) 'LanguagePack.ps1'), [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw ($errors | Out-String) }
    Write-Host 'PASS Windows discovery, exe/CLI/resource paths, Unicode/spaces, duplicates, missing paths, installer syntax'
} finally {
    $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
    $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolvedFixture.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedFixture -Leaf) -like 'cursor-discovery-*') {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force -ErrorAction SilentlyContinue
    }
}
