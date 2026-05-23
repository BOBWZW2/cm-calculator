@echo off
setlocal

cd /d "%~dp0"

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

echo Starting CM Calculator server on http://localhost:4000
echo Keep this window open while you use the app.
echo.

pushd server
"%NODE_EXE%" dist\index.js
set EXIT_CODE=%ERRORLEVEL%
popd

echo.
echo Server stopped with exit code %EXIT_CODE%.
pause
