# LINX 一键启动：检查 Node → 首次安装依赖 → 首次构建界面 → 启动数据服务 → 打开浏览器。
# 服务已在运行时只打开浏览器。关闭窗口即停止服务。
$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $Host.UI.RawUI.WindowTitle = "LINX 选品工作台" } catch {}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 访问密码：打开页面时需要输入，浏览器记住后不再询问。想换密码就改下面两行。
$env:LINX_USER = "linx"
$env:LINX_PASS = "linx1234"

function Fail($message) {
  Write-Host "[LINX] $message" -ForegroundColor Red
  Read-Host "按回车关闭" | Out-Null
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "未找到 Node.js。请先安装 Node.js 22.13 或更新版本：https://nodejs.org/"
}

if (-not (Test-Path "node_modules\express")) {
  Write-Host "[LINX] 首次运行，正在安装依赖，请稍候..." -ForegroundColor Yellow
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "依赖安装失败，请截图此窗口反馈。" }
}

if (-not (Test-Path "dist\index.html")) {
  Write-Host "[LINX] 正在构建界面..." -ForegroundColor Yellow
  & npm run build
  if ($LASTEXITCODE -ne 0) { Fail "构建失败，请截图此窗口反馈。" }
}

$running = $false
try {
  $null = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/status" -TimeoutSec 5
  $running = $true
} catch {
  # 开启访问密码后，未带凭据的探测会收到 401，同样说明服务已在运行
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { $running = $true }
}

if ($running) {
  Write-Host "[LINX] 服务已在运行，直接打开浏览器。" -ForegroundColor Green
  Start-Process "http://localhost:3000/"
  Start-Sleep -Seconds 1
  exit 0
}

Write-Host ""
Write-Host "  LINX 选品工作台   http://localhost:3000" -ForegroundColor Cyan
Write-Host "  已开启访问密码：账号 linx，密码见本脚本顶部（浏览器首次打开会提示输入一次）。"
Write-Host "  数据服务正在启动，浏览器几秒后自动打开。"
Write-Host "  使用期间请保持本窗口开着（最小化即可）。" -ForegroundColor Yellow
Write-Host "  用完直接关掉本窗口就是退出，数据已实时保存，下次双击桌面图标再开。"
Write-Host ""
Start-Job -ScriptBlock { Start-Sleep -Seconds 3; Start-Process "http://localhost:3000/" } | Out-Null
& node server\index.mjs
Write-Host ""
Write-Host "[LINX] 服务已停止。"
Read-Host "按回车关闭" | Out-Null
