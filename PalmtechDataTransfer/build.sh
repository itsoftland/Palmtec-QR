#!/bin/bash
echo "Installing requirements..."
pip3 install -r requirements.txt

echo ""
echo "Building the executable via PyInstaller..."
python3 -m PyInstaller --clean --windowed --onefile --hidden-import usb_transfer --hidden-import serial_transfer --name "PalmtechDataTransfer" main.py

echo ""
echo "Build complete! Check the 'dist' directory for the 'PalmtechDataTransfer' Linux binary."
