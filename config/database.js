const mongoose = require('mongoose');

/**
 * ملف إعداد الاتصال بقاعدة البيانات MongoDB
 * يتضمن معالجة الأخطاء وإعادة الاتصال التلقائي
 */

const connectDB = async () => {
    try {
        // إعدادات الاتصال
        const mongoOptions = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10, // الحد الأقصى لعدد الاتصالات المتزامنة
            serverSelectionTimeoutMS: 5000, // مهلة انتظار الاتصال
            socketTimeoutMS: 45000, // مهلة انتظار العمليات
            family: 4, // استخدام IPv4
            retryWrites: true,
            writeConcern: {
                w: 'majority'
            }
        };

        // رابط قاعدة البيانات من متغيرات البيئة أو القيمة الافتراضية
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/videochat';
        
        console.log('🔄 جاري الاتصال بقاعدة البيانات...');
        
        // الاتصال بقاعدة البيانات
        const conn = await mongoose.connect(mongoURI, mongoOptions);
        
        console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
        console.log(`📊 قاعدة البيانات: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);
        
        // معالجة أحداث الاتصال
        mongoose.connection.on('connected', () => {
            console.log('🔗 Mongoose متصل بـ MongoDB');
        });
        
        mongoose.connection.on('error', (err) => {
            console.error('❌ خطأ في اتصال قاعدة البيانات:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ تم قطع الاتصال عن MongoDB');
        });
        
        // إعادة الاتصال في حالة قطع الاتصال
        mongoose.connection.on('reconnected', () => {
            console.log('🔄 تم إعادة الاتصال بـ MongoDB');
        });
        
        return conn;
        
    } catch (error) {
        console.error('❌ فشل في الاتصال بقاعدة البيانات:', error.message);
        
        // إعادة المحاولة بعد 5 ثوان
        setTimeout(() => {
            console.log('🔄 إعادة محاولة الاتصال بقاعدة البيانات...');
            connectDB();
        }, 5000);
    }
};

// معالجة إغلاق التطبيق بأمان
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('🔐 تم إغلاق اتصال قاعدة البيانات بأمان');
        process.exit(0);
    } catch (error) {
        console.error('❌ خطأ في إغلاق قاعدة البيانات:', error);
        process.exit(1);
    }
});

// تصدير الدالة
module.exports = connectDB;
