@echo off
echo Iniciando el verificador mensual de precios de Antalis...
cd /d "c:\Users\750\Desktop\Antigravity\App Papel v.2"
node scripts\monthly-price-check.js
echo.
echo Verificacion completada.
