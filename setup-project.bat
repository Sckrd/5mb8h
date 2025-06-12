@echo off
echo 🚀 إعداد مشروع ChatLive Pro...
echo.

REM إنشاء المجلدات المطلوبة
echo 📁 إنشاء المجلدات...
mkdir config 2>nul
mkdir models 2>nul
mkdir utils 2>nul
mkdir public 2>nul
mkdir logs 2>nul
mkdir scripts 2>nul

REM تثبيت المكتبات الأساسية
echo 📦 تثبيت المكتبات الأساسية...
call npm install express socket.io cors dotenv bcryptjs jsonwebtoken mongoose helmet rate-limiter-flexible

REM تثبيت أدوات التطوير
echo 🛠️ تثبيت أدوات التطوير...
call npm install --save-dev nodemon

REM إنشاء ملف .env
echo ⚙️ إنشاء ملف .env...
(
echo # ملف متغيرات البيئة - ChatLive Pro
echo NODE_ENV=development
echo PORT=3001
echo MONGODB_URI=mongodb://localhost:27017/videochat
echo JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
echo SESSION_SECRET=your-session-secret-key-make-it-secure
echo CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
echo.
echo # إعدادات التطوير
echo DEBUG=true
echo LOG_LEVEL=info
) > .env

REM إنشاء ملف .gitignore
echo 📝 إنشاء ملف .gitignore...
(
echo node_modules/
echo .env
echo .env.local
echo .env.production
echo logs/
echo *.log
echo npm-debug.log*
echo .DS_Store
echo Thumbs.db
echo coverage/
echo .nyc_output/
) > .gitignore

REM تحديث package.json scripts
echo 📄 تحديث package.json...
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = {
  'start': 'node server.js',
  'dev': 'nodemon server.js',
  'dev-npx': 'npx nodemon server.js',
  'dev-node': 'node server.js',
  'test': 'echo \"Error: no test specified\" && exit 1'
};
pkg.engines = {
  'node': '>=16.0.0'
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

REM إنشاء ملف healthcheck.js
echo 🏥 إنشاء ملف healthcheck.js...
(
echo const http = require('http'^);
echo.
echo const options = {
echo     hostname: 'localhost',
echo     port: process.env.PORT ^|^| 3001,
echo     path: '/health',
echo     method: 'GET',
echo     timeout: 2000
echo };
echo.
echo const request = http.request'(options, '(response'^) =^> {
echo     if '(response.statusCode === 200'^) {
echo         process.exit'(0'^);
echo     } else {
echo         process.exit'(1'^);
echo     }
echo }'^);
echo.
echo request.on'('error', '('^) =^> {
echo     process.exit'(1'^);
echo }'^);
echo.
echo request.on'('timeout', '('^) =^> {
echo     request.destroy'('^);
echo     process.exit'(1'^);
echo }'^);
echo.
echo request.end'('^);
) > healthcheck.js

echo.
echo ✅ تم إعداد المشروع بنجاح!
echo.
echo 🔥 الخطوات التالية:
echo 1. تأكد من تشغيل MongoDB
echo 2. انسخ ملفات الكود من الأرتفاكت
echo 3. شغل التطبيق بـ: npm run dev
echo.
echo 📍 روابط مهمة:
echo - التطبيق: http://localhost:3001
echo - فحص الصحة: http://localhost:3001/health
echo - قاعدة البيانات: mongodb://localhost:27017/videochat
echo.
pause