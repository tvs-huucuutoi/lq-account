@echo off
chcp 65001 >nul
python -m pip install customtkinter pyinstaller
pyinstaller --noconfirm --onefile --windowed --name LQ_Account_Tool main.py
echo.
echo EXE nam trong thu muc dist
pause
