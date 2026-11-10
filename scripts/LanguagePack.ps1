[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$Preview,
    [switch]$Status,
    [Alias('Dir')][string]$InstallDir,
    [switch]$NoRestart,
    [switch]$PauseAtEnd
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'windows-discovery.ps1')

function Select-CursorInstall {
    param([string]$ExplicitPath)
    if ($ExplicitPath) {
        $root = Resolve-CursorInstallRoot $ExplicitPath
        if (-not $root) { throw "找不到 Cursor 程序资源：$ExplicitPath" }
        return $root
    }
    $installs = @(Find-CursorInstalls)
    if (-not $installs.Count) { throw '未发现 Cursor。请用 -InstallDir 指定安装目录，支持直接填写 Cursor.exe 路径。' }
    if ($installs.Count -eq 1) { return $installs[0] }
    Write-Host '发现多份 Cursor，请选择要处理的安装：'
    for ($index = 0; $index -lt $installs.Count; $index++) { Write-Host ("  {0}. {1}" -f ($index + 1), $installs[$index]) }
    if ([Console]::IsInputRedirected) { throw '非交互运行请使用 -InstallDir 指定目标。' }
    $answer = Read-Host '输入编号'
    if ($answer -notmatch '^\d+$' -or [int]$answer -lt 1 -or [int]$answer -gt $installs.Count) { throw '无效选择，未修改程序。' }
    return $installs[[int]$answer - 1]
}

function Find-LanguagePackRuntime {
    param([string]$InstallRoot)
    # Use Cursor's bundled Electron runtime in Node mode.
    $candidates = @((Join-Path $InstallRoot 'Cursor.exe'))
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($node) { $candidates += $node.Source }
    foreach ($candidate in $candidates) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $version = & $candidate --version 2>$null | Out-String
        if ($LASTEXITCODE -eq 0 -and "$version" -match '^v(\d+)\.(\d+)\.') {
            if ([int]$Matches[1] -gt 18 -or ([int]$Matches[1] -eq 18 -and [int]$Matches[2] -ge 17)) { return $candidate }
        }
    }
    throw 'Cursor 内置运行时不可用，请安装 Node.js 22 或更高版本后重试。'
}

$exitCode = 0
$savedElectronMode = $env:ELECTRON_RUN_AS_NODE
try {
    if (([int]$Uninstall.IsPresent + [int]$Preview.IsPresent + [int]$Status.IsPresent) -gt 1) { throw '-Uninstall、-Preview、-Status 不能同时使用。' }
    $root = Select-CursorInstall $InstallDir
    Write-Host "Cursor 安装目录：$root"
    if (-not $Preview -and -not $Status) { Assert-CursorClosed -InstallRoot $root }
    $env:ELECTRON_RUN_AS_NODE = '1'
    $runtime = Find-LanguagePackRuntime $root
    Write-Host "脚本运行时：$runtime"
    $arguments = @("--dir=$root")
    if ($Uninstall) { $arguments += '--restore' }
    elseif ($Preview) { $arguments += '--preview' }
    elseif ($Status) { $arguments += '--status' }
    # A pipeline also makes Windows PowerShell wait for Cursor.exe (GUI subsystem).
    & $runtime (Join-Path $PSScriptRoot 'LanguagePack.mjs') @arguments | Out-Host
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw "汉化工具退出码：$exitCode。请保留错误信息，处理后重试。" }
    if ($Uninstall) { Write-Host '已恢复安装前的程序文件。' }
    elseif (-not $Preview -and -not $Status) {
        Write-Host '汉化安装完成。Cursor 更新后请重新运行安装脚本。'
        if (-not $NoRestart) {
            $env:ELECTRON_RUN_AS_NODE = $savedElectronMode
            try { Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + (Join-Path $root 'Cursor.exe') + '"') -WindowStyle Hidden }
            catch { Write-Host '请手动启动 Cursor。' }
        }
    }
} catch {
    Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
    if ($exitCode -eq 0) { $exitCode = 1 }
} finally {
    $env:ELECTRON_RUN_AS_NODE = $savedElectronMode
    if ($PauseAtEnd) { [void](Read-Host '按回车关闭窗口') }
}
exit $exitCode
