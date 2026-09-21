@echo off
echo Installing requirements...
pip install -r requirements.txt

echo.
echo Building the executable via PyInstaller...
python -m PyInstaller --clean --windowed --onefile --hidden-import usb_transfer --hidden-import serial_transfer --name "PalmtechDataTransfer" main.py

echo.
echo Build complete! Check the 'dist' directory for 'PalmtechDataTransfer.exe'.
pause
