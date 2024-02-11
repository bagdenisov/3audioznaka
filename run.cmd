@echo off
:1
python -m http.server 8080 --bind 127.0.0.1
pause
goto 1