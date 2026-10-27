@echo off
chcp 65001 >nul
echo Запуск 3D-конструктора Mebel3D...
start http://localhost:5173/constructor.html
npm run dev
