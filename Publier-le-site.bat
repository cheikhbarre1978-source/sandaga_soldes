@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ================================================
echo   SANDAGA SOLDES - Mise en ligne du catalogue
echo ================================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo ERREUR : ce dossier n'est pas connecte a Git.
    echo Contactez votre developpeur.
    echo.
    pause
    exit /b 1
)

set "CHANGEMENTS="
for /f "delims=" %%i in ('git status --porcelain') do set "CHANGEMENTS=1"

if not defined CHANGEMENTS (
    echo Aucun changement detecte depuis la derniere mise en ligne.
    echo Le site est deja a jour, il n'y a rien a publier.
    echo.
    pause
    exit /b 0
)

echo [1/4] Regeneration des fiches produits...
node "scripts\regenerer_fiches.js"
if errorlevel 1 goto erreur

echo.
echo [2/4] Regeneration du flux Meta ^(feed.xml^)...
node "scripts\generer_feed.js"
if errorlevel 1 goto erreur

echo.
echo [3/4] Envoi vers GitHub...
git add -A
git commit -m "Mise a jour du catalogue depuis la console d'administration"
if errorlevel 1 goto erreur
git push
if errorlevel 1 goto erreur

echo.
echo [4/4] Termine !
echo.
echo Le site https://sandagasoldes.com est a jour.
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
