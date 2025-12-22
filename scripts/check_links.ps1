$report = "link-report.txt"
if (Test-Path $report) { Remove-Item $report }
$files = Get-ChildItem -Recurse -Filter *.md
foreach ($f in $files) {
    $text = Get-Content $f.FullName -Raw
    $matches = [regex]::Matches($text, '\[.*?\]\((.*?)\)')
    foreach ($m in $matches) {
        $link = $m.Groups[1].Value
        if ($link -match '^(http|https|mailto):') { continue }
        if ($link -match '^#') { continue }
        if ($link -match '^\s*$') { continue }
        $target = if ([System.IO.Path]::IsPathRooted($link)) { $link } else { Join-Path -Path (Split-Path $f.FullName) -ChildPath $link }
        try { $full = [System.IO.Path]::GetFullPath($target) } catch { $full = $target }
        if (-not (Test-Path $full)) {
            Add-Content -Path $report -Value (("BROKEN|{0}|{1}") -f $f.FullName, $link)
        }
    }
}
if (Test-Path $report) { Write-Host "Broken links found:"; Get-Content $report | Select-Object -First 200 } else { Write-Host "No broken links found" }
