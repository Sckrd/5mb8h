#!/bin/bash

# ===============================
# scripts/setup.sh - سكريبت الإعداد الأولي
# ===============================

set -e

echo "🚀 بدء إعداد ChatLive Pro..."

# التحقق من Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js غير مثبت. يرجى تثبيت Node.js 16+ أولاً"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ يتطلب Node.js إصدار 16 أو أحدث. الإصدار الحالي: $(node -v)"
    exit 1
fi

echo "✅ Node.js إصدار $(node -v) مثبت"

# التحقق من MongoDB
if ! command -v mongod &> /dev/null; then
    echo "⚠️ MongoDB غير مثبت. هل تريد تثبيته؟ (y/n)"
    read -r answer
    if [ "$answer" = "y" ]; then
        # تثبيت MongoDB على Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -
            echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
            sudo apt-get update
            sudo apt-get install -y mongodb-org
            sudo systemctl start mongod
            sudo systemctl enable mongod
            echo "✅ تم تثبيت MongoDB بنجاح"
        else
            echo "❌ يرجى تثبيت MongoDB يدوياً"
            exit 1
        fi
    fi
fi

# إنشاء المجلدات المطلوبة
echo "📁 إنشاء هيكل المجلدات..."
mkdir -p config models utils public logs nginx/ssl monitoring/grafana/dashboards monitoring/grafana/datasources scripts

# تثبيت المكتبات
echo "📦 تثبيت المكتبات..."
npm install

# إنشاء ملف .env من القالب
if [ ! -f .env ]; then
    echo "⚙️ إنشاء ملف .env..."
    cat > .env << EOL
# ملف متغيرات البيئة - ChatLive Pro
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/videochat
JWT_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
EOL
    echo "✅ تم إنشاء ملف .env"
fi

# إنشاء ملف healthcheck.js
cat > healthcheck.js << 'EOL'
const http = require('http');

const options = {
    hostname: 'localhost',
    port: process.env.PORT || 3001,
    path: '/health',
    method: 'GET',
    timeout: 2000
};

const request = http.request(options, (response) => {
    if (response.statusCode === 200) {
        process.exit(0);
    } else {
        process.exit(1);
    }
});

request.on('error', () => {
    process.exit(1);
});

request.on('timeout', () => {
    request.destroy();
    process.exit(1);
});

request.end();
EOL

echo "✅ إعداد ChatLive Pro مكتمل!"
echo "🔥 يمكنك الآن تشغيل التطبيق بـ: npm run dev"

# ===============================
# scripts/deploy.sh - سكريبت النشر
# ===============================

#!/bin/bash

set -e

echo "🚀 بدء عملية النشر..."

# التحقق من البيئة
if [ "$NODE_ENV" != "production" ]; then
    echo "⚠️ تحذير: لم يتم تعيين NODE_ENV=production"
    echo "هل تريد المتابعة؟ (y/n)"
    read -r answer
    if [ "$answer" != "y" ]; then
        exit 1
    fi
fi

# عمل backup لقاعدة البيانات
echo "💾 عمل نسخة احتياطية لقاعدة البيانات..."
./scripts/backup.sh

# إيقاف التطبيق الحالي
echo "⏹️ إيقاف التطبيق الحالي..."
pm2 stop chatlive-pro || true

# تحديث الكود
echo "📥 تحديث الكود..."
git pull origin main

# تثبيت المكتبات المحدثة
echo "📦 تحديث المكتبات..."
npm ci --production

# تشغيل اختبارات سريعة
echo "🧪 تشغيل الاختبارات..."
npm test || echo "⚠️ بعض الاختبارات فشلت"

# تشغيل التطبيق المحدث
echo "▶️ تشغيل التطبيق المحدث..."
pm2 start ecosystem.config.js --env production
pm2 save

# فحص حالة التطبيق
sleep 5
if pm2 list | grep -q "online.*chatlive-pro"; then
    echo "✅ تم النشر بنجاح!"
    echo "📊 حالة التطبيق:"
    pm2 status chatlive-pro
else
    echo "❌ فشل في النشر!"
    echo "📋 عرض آخر اللوجز:"
    pm2 logs chatlive-pro --lines 20
    exit 1
fi

# ===============================
# scripts/backup.sh - سكريبت النسخ الاحتياطي
# ===============================

#!/bin/bash

set -e

BACKUP_DIR="${BACKUP_PATH:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="chatlive_backup_$TIMESTAMP"

echo "💾 بدء النسخ الاحتياطي..."

# إنشاء مجلد النسخ الاحتياطية
mkdir -p "$BACKUP_DIR"

# نسخ احتياطي لقاعدة البيانات
echo "📊 نسخ احتياطي لقاعدة البيانات..."
if command -v mongodump &> /dev/null; then
    mongodump --db videochat --out "$BACKUP_DIR/$BACKUP_NAME"
    echo "✅ تم إنشاء نسخة احتياطية للبيانات في: $BACKUP_DIR/$BACKUP_NAME"
else
    echo "❌ mongodump غير متوفر"
fi

# ضغط النسخة الاحتياطية
echo "🗜️ ضغط النسخة الاحتياطية..."
cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

echo "✅ تم إنشاء النسخة الاحتياطية: $BACKUP_DIR/$BACKUP_NAME.tar.gz"

# حذف النسخ القديمة (الاحتفاظ بآخر 10 نسخ)
echo "🧹 تنظيف النسخ القديمة..."
ls -t chatlive_backup_*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm
echo "✅ تم تنظيف النسخ القديمة"

# ===============================
# scripts/restore.sh - سكريبت الاستعادة
# ===============================

#!/bin/bash

set -e

if [ $# -eq 0 ]; then
    echo "❌ يرجى تحديد ملف النسخة الاحتياطية"
    echo "الاستخدام: ./scripts/restore.sh backup_file.tar.gz"
    exit 1
fi

BACKUP_FILE="$1"
TEMP_DIR="/tmp/chatlive_restore_$"

echo "📥 بدء استعادة النسخة الاحتياطية من: $BACKUP_FILE"

# التحقق من وجود الملف
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ ملف النسخة الاحتياطية غير موجود: $BACKUP_FILE"
    exit 1
fi

# تحذير
echo "⚠️ هذا سيحذف البيانات الحالية ويستبدلها بالنسخة الاحتياطية"
echo "هل أنت متأكد؟ (yes/no)"
read -r answer
if [ "$answer" != "yes" ]; then
    echo "❌ تم إلغاء العملية"
    exit 1
fi

# إنشاء مجلد مؤقت
mkdir -p "$TEMP_DIR"

# استخراج النسخة الاحتياطية
echo "📤 استخراج النسخة الاحتياطية..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# العثور على مجلد البيانات
BACKUP_DATA_DIR=$(find "$TEMP_DIR" -name "videochat" -type d | head -1)

if [ -z "$BACKUP_DATA_DIR" ]; then
    echo "❌ لم يتم العثور على بيانات videochat في النسخة الاحتياطية"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# إيقاف التطبيق
echo "⏹️ إيقاف التطبيق..."
pm2 stop chatlive-pro || true

# حذف البيانات الحالية
echo "🗑️ حذف البيانات الحالية..."
mongo videochat --eval "db.dropDatabase()"

# استعادة البيانات
echo "📊 استعادة البيانات..."
mongorestore --db videochat "$BACKUP_DATA_DIR"

# تشغيل التطبيق
echo "▶️ تشغيل التطبيق..."
pm2 start chatlive-pro

# تنظيف الملفات المؤقتة
rm -rf "$TEMP_DIR"

echo "✅ تم استعادة النسخة الاحتياطية بنجاح!"

# ===============================
# scripts/monitor.sh - سكريبت المراقبة
# ===============================

#!/bin/bash

echo "📊 مراقبة ChatLive Pro"
echo "======================"

# حالة التطبيق
echo "🖥️ حالة التطبيق:"
pm2 status chatlive-pro

echo ""
echo "💾 استخدام الذاكرة:"
pm2 monit chatlive-pro --lines 1

echo ""
echo "🌐 حالة الشبكة:"
netstat -tlnp | grep :3001

echo ""
echo "📊 إحصائيات قاعدة البيانات:"
mongo videochat --quiet --eval "
print('عدد المستخدمين: ' + db.users.count());
print('المستخدمون النشطون: ' + db.users.count({isOnline: true}));
print('إجمالي الاتصالات: ' + db.users.aggregate([{$group: {_id: null, total: {$sum: '$totalConnections'}}}]).toArray()[0].total);
"

echo ""
echo "📋 آخر 10 أسطر من اللوجز:"
pm2 logs chatlive-pro --lines 10 --nostream

# ===============================
# scripts/ssl-setup.sh - إعداد SSL
# ===============================

#!/bin/bash

set -e

if [ $# -eq 0 ]; then
    echo "❌ يرجى تحديد اسم النطاق"
    echo "الاستخدام: ./scripts/ssl-setup.sh yourdomain.com"
    exit 1
fi

DOMAIN="$1"

echo "🔒 إعداد SSL لـ: $DOMAIN"

# تثبيت Certbot
if ! command -v certbot &> /dev/null; then
    echo "📦 تثبيت Certbot..."
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
fi

# الحصول على الشهادة
echo "📜 الحصول على شهادة SSL..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN"

# إعداد التجديد التلقائي
echo "🔄 إعداد التجديد التلقائي..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -

echo "✅ تم إعداد SSL بنجاح لـ: $DOMAIN"

# ===============================
# إعطاء صلاحيات التنفيذ لجميع السكريبتات
# ===============================

chmod +x scripts/*.sh

echo "📜 تم إنشاء جميع سكريبتات الإنتاج!"
