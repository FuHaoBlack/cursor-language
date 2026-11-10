function Resolve-CursorInstallRoot {
    param([string]$Candidate)
    if ([string]::IsNullOrWhiteSpace($Candidate)) { return }
    $candidatePath = [Environment]::ExpandEnvironmentVariables($Candidate.Trim())
    if ($candidatePath -match '^"([^"]+)"') { $candidatePath = $Matches[1] }
    $candidatePath = $candidatePath -replace ',\s*-?\d+$', ''
    try { $candidatePath = [IO.Path]::GetFullPath($candidatePath.Trim('"')) } catch { return }
    if (-not (Test-Path -LiteralPath $candidatePath)) { return }
    if (Test-Path -LiteralPath $candidatePath -PathType Leaf) { $candidatePath = Split-Path -Parent $candidatePath }
    for ($level = 0; $level -lt 5 -and $candidatePath; $level++) {
        if (Test-Path -LiteralPath (Join-Path $candidatePath 'resources\app\package.json') -PathType Leaf) {
            return $candidatePath.TrimEnd('\')
        }
        $candidatePath = Split-Path -Parent $candidatePath
    }
}

function Find-CursorInstalls {
    param([string[]]$CandidatePaths, [switch]$OnlyCandidates)
    [string[]]$candidates = @()
    foreach ($suppliedPath in $CandidatePaths) { $candidates += $suppliedPath }
    if (-not $OnlyCandidates) {
        $candidates += $env:CURSOR_INSTALL_DIR
        foreach ($process in @(Get-Process -Name Cursor -ErrorAction SilentlyContinue)) {
            try { $candidates += $process.Path } catch { }
        }
        foreach ($key in @(
            'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Cursor.exe',
            'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\Cursor.exe',
            'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\Cursor.exe'
        )) {
            $entry = Get-Item -LiteralPath $key -ErrorAction SilentlyContinue
            if ($entry) { $candidates += $entry.GetValue('') }
        }
        foreach ($entry in @(Get-ItemProperty -Path @(
            'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
        ) -ErrorAction SilentlyContinue)) {
            if ($entry.PSObject.Properties['DisplayName'] -and $entry.DisplayName -match '^Cursor(?:\s|$)') {
                foreach ($property in @('InstallLocation', 'DisplayIcon', 'UninstallString')) {
                    if ($entry.PSObject.Properties[$property]) { $candidates += [string]$entry.$property }
                }
            }
        }
        foreach ($command in @(Get-Command cursor.exe,cursor.cmd -All -ErrorAction SilentlyContinue)) { $candidates += $command.Source }
        foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs' }))) {
            if ($base) { $candidates += Join-Path $base 'Cursor' }
        }
        foreach ($drive in [IO.DriveInfo]::GetDrives()) {
            if ($drive.DriveType -ne [IO.DriveType]::Fixed -or -not $drive.IsReady) { continue }
            foreach ($relative in @('Cursor', 'Program Files\Cursor', 'Programs\Cursor', 'Apps\Cursor', 'AI\Cursor')) {
                $candidates += Join-Path $drive.RootDirectory.FullName $relative
            }
        }
        $shell = $null
        try {
            $shell = New-Object -ComObject WScript.Shell
            foreach ($folderName in @('DesktopDirectory', 'CommonDesktopDirectory', 'Programs', 'CommonPrograms')) {
                $folder = [Environment]::GetFolderPath($folderName)
                if (-not $folder -or -not (Test-Path -LiteralPath $folder)) { continue }
                foreach ($shortcut in @(Get-ChildItem -LiteralPath $folder -Filter '*Cursor*.lnk' -File -Recurse -ErrorAction SilentlyContinue)) {
                    $link = $shell.CreateShortcut($shortcut.FullName)
                    $candidates += $link.TargetPath
                    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($link)
                }
            }
        } catch { } finally {
            if ($shell) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
        }
    }
    $seen = @{}
    foreach ($candidate in $candidates) {
        $root = Resolve-CursorInstallRoot $candidate
        if ($root -and -not $seen.ContainsKey($root)) { $seen[$root] = $true; $root }
    }
}

function Assert-CursorClosed {
    param([string]$InstallRoot, [int[]]$IgnoreProcessIds = @())
    $root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\') + '\'
    foreach ($process in @(Get-Process -Name Cursor -ErrorAction SilentlyContinue)) {
        if ($IgnoreProcessIds -contains $process.Id) { continue }
        $executable = $null
        try { $executable = $process.Path } catch { }
        if (-not $executable) { throw "Cannot inspect Cursor PID $($process.Id). Please fully exit Cursor and retry." }
        if ([IO.Path]::GetFullPath($executable).StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Cursor is running (PID $($process.Id)). Please save your work and fully exit Cursor before installing or restoring."
        }
    }
}
