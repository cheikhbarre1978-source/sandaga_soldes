@echo off
rem Gardien : verifie toutes les 10 minutes que la publication automatique tourne, sinon la relance.
rem Demarre a l'ouverture de session Windows (dossier Demarrage), sans fenetre visible.
:boucle
call "%~dp0relancer-watcher.bat"
ping -n 601 127.0.0.1 >nul
goto boucle
