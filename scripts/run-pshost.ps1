param(
    [Parameter(Mandatory=$true)][string]$ScriptPath,
    [string[]]$ScriptArgs
)
$ErrorActionPreference = "Stop"
$hostExe = "powershell"
if (Get-Command pwsh -ErrorAction SilentlyContinue) { $hostExe = "pwsh" }
$argList = @("-NoLogo","-NoProfile","-ExecutionPolicy","Bypass","-File", $ScriptPath)
if ($ScriptArgs) { $argList += $ScriptArgs }
& $hostExe @argList
exit $LASTEXITCODE
