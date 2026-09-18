@echo off
rem Relance la publication automatique si elle ne tourne plus (ex : apres un redemarrage de Windows).
rem Lance regulierement par la tache planifiee "Sandaga - surveillance catalogue".
set "PM2=%APPDATA%\npm\pm2.cmd"
set "PID="
for /f "delims=" %%i in ('call "%PM2%" pid publier-watcher 2^>nul') do set "PID=%%i"
if defined PID if not "%PID%"=="0" exit /b 0
call "%PM2%" resurrect >nul 2>&1
exit /b 0
