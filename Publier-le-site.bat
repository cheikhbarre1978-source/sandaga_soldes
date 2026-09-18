@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ================================================
echo   SANDAGA SOLDES - Mise en ligne du catalogue
echo ================================================
echo.

call "scripts\publier-core.bat"
if errorlevel 1 goto erreur

echo.
echo Le flux Meta (feed.xml) est aussi a jour : Facebook et
echo Instagram recupereront les nouveaux prix automatiquement.
echo.
pause
exit /b 0

:erreur
echo.
echo ================================================
echo   UNE ERREUR EST SURVENUE - rien n'a ete publie
echo   Regardez le message ci-dessus, ou faites-en une
echo   capture d'ecran a envoyer a votre developpeur.
echo ================================================
echo.
pause
exit /b 1
