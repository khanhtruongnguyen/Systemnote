@echo off
chcp 65001 >nul
title SystemNote - So Do Tu Duy & Trinh Soan Thao
echo ===================================================
echo     SystemNote - So Do & Lien Ket Giao Dien Sang
echo ===================================================
echo.
echo Dang khoi dong may chu ung dung...
echo Trinh duyet se tu dong mo sau vai giay.
echo.

start http://localhost:5173
call npm.cmd run dev
pause
