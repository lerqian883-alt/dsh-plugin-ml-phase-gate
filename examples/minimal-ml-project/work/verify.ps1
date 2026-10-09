param([string[]]$Only)
if ($Only -contains '010-') { & "$PSScriptRoot\checks\010-problem.ps1"; exit $LASTEXITCODE }
if ($Only -contains '011-') { & "$PSScriptRoot\checks\011-data.ps1"; exit $LASTEXITCODE }
exit 1
