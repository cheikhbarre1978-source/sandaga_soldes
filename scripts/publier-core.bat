@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0\.."

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo ERREUR : ce dossier n'est pas connecte a Git.
    exit /b 1
)

set "CHANGEMENTS="
for /f "delims=" %%i in ('git status --porcelain') do set "CHANGEMENTS=1"

if not defined CHANGEMENTS (
    echo Aucun changement detecte depuis la derniere mise en ligne.
    exit /b 0
)

echo [1/4] Regeneration des fiches produits...
node "scripts\regenerer_fiches.js"
if errorlevel 1 exit /b 1

echo [2/4] Regeneration du flux Meta (feed.xml)...
node "scripts\generer_feed.js"
if errorlevel 1 exit /b 1

echo [3/4] Envoi vers GitHub...
git add -A
git commit -m "Mise a jour du catalogue depuis la console d'administration"
if errorlevel 1 exit /b 1
git push
if errorlevel 1 exit /b 1

echo [4/5] Synchronisation du catalogue avec le serveur Awa...
scp -i "%USERPROFILE%\.ssh\sandaga_vps" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10 catalogue.csv root@187.124.179.166:/root/catalogue.csv >nul 2>&1
if errorlevel 1 (
    echo ATTENTION : le site est publie, mais la synchronisation vers le serveur Awa a echoue.
) else (
    echo Catalogue synchronise avec le serveur Awa.
)

echo [5/5] Termine ! Le site https://sandagasoldes.com est a jour.
exit /b 0
