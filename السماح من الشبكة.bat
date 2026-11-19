@echo off
chcp 65001 >nul
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath \"%~f0\" -Verb RunAs" & exit /b)
netsh advfirewall firewall delete rule name="Mawredin 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Mawredin 3000" dir=in action=allow protocol=TCP localport=3000 remoteip=localsubnet profile=any
echo.
echo Done - devices on the same Wi-Fi can now open the app on port 3000.
pause
