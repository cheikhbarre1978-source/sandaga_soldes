@echo off
title Sandaga Soldes - Serveur local
cd /d "%~dp0"

echo.
echo   Demarrage du site Sandaga Soldes...
echo   (laisse cette fenetre ouverte pendant que tu regardes le site)
echo.

start "Serveur Sandaga Soldes" cmd /k npx --yes serve -l 5180 "%~dp0"

timeout /t 3 /nobreak >nul
start "" http://localhost:5180

echo.
echo   Le site vient de s'ouvrir dans ton navigateur : http://localhost:5180
echo   Pour arreter le serveur, ferme la fenetre "Serveur Sandaga Soldes".
echo.
pause
