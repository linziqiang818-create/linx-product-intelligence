# 在桌面创建「LINX 选品工作台」快捷方式，双击即启动服务并打开浏览器。
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "启动 LINX.cmd"
if (-not (Test-Path $target)) {
  Write-Error "找不到启动脚本：$target"
  exit 1
}
$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "LINX 选品工作台.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $root
$shortcut.Description = "LINX 家具选品工作台：产品库 → 适配池 → 第二大脑"
$shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$shortcut.Save()
Write-Host "已创建桌面快捷方式：$lnkPath"
