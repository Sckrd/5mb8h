// server.js - خادم خمبقه مع إحصائيات حقيقية ومستخدمين فعليين
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// إعداد Socket.IO
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// إدارة المستخدمين والغرف بشكل فعلي
class RealUserManager {
    constructor() {
        this.users = new Map(); // socketId -> user data
        this.rooms = new Map(); // roomId -> room data
        this.waitingQueue = []; // array of socketIds waiting for partners
        this.stats = {
            totalConnections: 0,
            peakUsers: 0,
            totalRoomsCreated: 0,
            messagesExchanged: 0,
            averageSessionTime: 0
        };
        this.sessionTimes = [];
        
        // تنظيف دوري
        setInterval(() => this.cleanup(), 30000); // كل 30 ثانية
        
        // حفظ الإحصائيات كل دقيقة
        setInterval(() => this.logStats(), 60000);
    }

    addUser(socket, userData) {
        const user = {
            id: socket.id,
            socket: socket,
            country: userData.country || 'UNKNOWN',
            interests: userData.interests || [],
            joinedAt: Date.now(),
            roomId: null,
            partnerId: null,
            messagesCount: 0,
            isActive: true,
            lastActivity: Date.now(),
            ipAddress: socket.request.connection.remoteAddress
        };

        this.users.set(socket.id, user);
        this.stats.totalConnections++;
        
        // تحديث ذروة المستخدمين
        if (this.users.size > this.stats.peakUsers) {
            this.stats.peakUsers = this.users.size;
        }

        console.log(`👤 مستخدم جديد: ${socket.id} من ${user.country} (المجموع: ${this.users.size})`);
        return user;
    }

    removeUser(socketId) {
        const user = this.users.get(socketId);
        if (user) {
            // حساب مدة الجلسة
            const sessionTime = Date.now() - user.joinedAt;
            this.sessionTimes.push(sessionTime);
            
            // تحديث متوسط مدة الجلسة
            if (this.sessionTimes.length > 0) {
                this.stats.averageSessionTime = this.sessionTimes.reduce((a, b) => a + b, 0) / this.sessionTimes.length;
            }

            // إزالة من قائمة الانتظار
            this.removeFromWaitingQueue(socketId);

            // إشعار الشريك إذا كان في غرفة
            if (user.roomId && user.partnerId) {
                const partner = this.users.get(user.partnerId);
                if (partner) {
                    partner.socket.emit('partner-left', {
                        message: 'غادر الشريك المحادثة'
                    });
                    partner.roomId = null;
                    partner.partnerId = null;
                }
                
                // حذف الغرفة
                this.rooms.delete(user.roomId);
            }

            this.users.delete(socketId);
            console.log(`❌ مستخدم غادر: ${socketId} (المجموع: ${this.users.size})`);
        }
    }

    addToWaitingQueue(socketId) {
        if (!this.waitingQueue.includes(socketId)) {
            this.waitingQueue.push(socketId);
            console.log(`⏳ إضافة للانتظار: ${socketId} (في الانتظار: ${this.waitingQueue.length})`);
        }
    }

    removeFromWaitingQueue(socketId) {
        const index = this.waitingQueue.indexOf(socketId);
        if (index > -1) {
            this.waitingQueue.splice(index, 1);
            console.log(`✅ إزالة من الانتظار: ${socketId}`);
        }
    }

    findPartner(currentUserId) {
        const currentUser = this.users.get(currentUserId);
        if (!currentUser) return null;

        // البحث عن شريك مناسب
        const availablePartners = this.waitingQueue.filter(partnerId => {
            const partner = this.users.get(partnerId);
            return partner && 
                   partnerId !== currentUserId && 
                   !partner.roomId &&
                   partner.isActive &&
                   partner.country !== currentUser.country && // تنويع الدول
                   partner.ipAddress !== currentUser.ipAddress; // منع نفس IP
        });

        if (availablePartners.length > 0) {
            // اختيار شريك عشوائي
            const randomIndex = Math.floor(Math.random() * availablePartners.length);
            const partnerId = availablePartners[randomIndex];
            
            return this.users.get(partnerId);
        }

        return null;
    }

    createRoom(user1, user2) {
        const roomId = this.generateRoomId();
        const room = {
            id: roomId,
            users: [user1.id, user2.id],
            createdAt: Date.now(),
            messages: [],
            country1: user1.country,
            country2: user2.country,
            isActive: true
        };

        this.rooms.set(roomId, room);
        this.stats.totalRoomsCreated++;

        // تحديث بيانات المستخدمين
        user1.roomId = roomId;
        user1.partnerId = user2.id;
        user2.roomId = roomId;
        user2.partnerId = user1.id;

        // إزالة من قائمة الانتظار
        this.removeFromWaitingQueue(user1.id);
        this.removeFromWaitingQueue(user2.id);

        // إدخال الغرفة
        user1.socket.join(roomId);
        user2.socket.join(roomId);

        console.log(`🏠 غرفة جديدة: ${roomId} (${user1.country} ↔ ${user2.country})`);
        return room;
    }

    generateRoomId() {
        return `room_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    addMessage(roomId, senderId, message) {
        const room = this.rooms.get(roomId);
        if (room) {
            const messageData = {
                id: Date.now() + Math.random(),
                senderId: senderId,
                content: message,
                timestamp: Date.now()
            };
            
            room.messages.push(messageData);
            this.stats.messagesExchanged++;

            // تحديث نشاط المستخدم
            const user = this.users.get(senderId);
            if (user) {
                user.messagesCount++;
                user.lastActivity = Date.now();
            }

            return messageData;
        }
        return null;
    }

    getActiveStats() {
        // إحصائيات مباشرة ومحدثة
        const activeUsers = Array.from(this.users.values()).filter(user => 
            user.isActive && (Date.now() - user.lastActivity) < 300000 // نشط خلال 5 دقائق
        );

        const activeRooms = Array.from(this.rooms.values()).filter(room => 
            room.isActive && this.users.has(room.users[0]) && this.users.has(room.users[1])
        );

        // إحصائيات التوزيع الجغرافي
        const countryStats = {};
        activeUsers.forEach(user => {
            countryStats[user.country] = (countryStats[user.country] || 0) + 1;
        });

        return {
            activeUsers: activeUsers.length,
            waitingUsers: this.waitingQueue.length,
            activeRooms: activeRooms.length,
            totalConnections: this.stats.totalConnections,
            peakUsers: this.stats.peakUsers,
            totalRoomsCreated: this.stats.totalRoomsCreated,
            messagesExchanged: this.stats.messagesExchanged,
            averageSessionTime: Math.round(this.stats.averageSessionTime / 1000 / 60), // دقائق
            countryDistribution: countryStats,
            timestamp: Date.now()
        };
    }

    cleanup() {
        const now = Date.now();
        const inactiveThreshold = 10 * 60 * 1000; // 10 دقائق

        // تنظيف المستخدمين غير النشطين
        for (const [socketId, user] of this.users.entries()) {
            if (now - user.lastActivity > inactiveThreshold) {
                console.log(`🧹 تنظيف مستخدم غير نشط: ${socketId}`);
                this.removeUser(socketId);
            }
        }

        // تنظيف الغرف الفارغة
        for (const [roomId, room] of this.rooms.entries()) {
            const hasActiveUsers = room.users.some(userId => this.users.has(userId));
            if (!hasActiveUsers) {
                console.log(`🧹 حذف غرفة فارغة: ${roomId}`);
                this.rooms.delete(roomId);
            }
        }

        // تنظيف قائمة الانتظار
        this.waitingQueue = this.waitingQueue.filter(socketId => 
            this.users.has(socketId) && this.users.get(socketId).isActive
        );
    }

    logStats() {
        const stats = this.getActiveStats();
        console.log(`📊 إحصائيات الخادم:
        - المستخدمون النشطون: ${stats.activeUsers}
        - في الانتظار: ${stats.waitingUsers}  
        - الغرف النشطة: ${stats.activeRooms}
        - إجمالي الاتصالات: ${stats.totalConnections}
        - ذروة المستخدمين: ${stats.peakUsers}
        - الرسائل المتبادلة: ${stats.messagesExchanged}
        - متوسط مدة الجلسة: ${stats.averageSessionTime} دقيقة`);
    }

    updateUserActivity(socketId) {
        const user = this.users.get(socketId);
        if (user) {
            user.lastActivity = Date.now();
            user.isActive = true;
        }
    }
}

// إنشاء مدير المستخدمين
const userManager = new RealUserManager();

// بث الإحصائيات للجميع كل 5 ثوانٍ
setInterval(() => {
    const stats = userManager.getActiveStats();
    io.emit('server-stats', stats);
}, 5000);

// معالجة اتصالات Socket.IO
io.on('connection', (socket) => {
    console.log(`🔗 اتصال جديد: ${socket.id}`);
    
    // إرسال الإحصائيات فوراً للمستخدم الجديد
    const initialStats = userManager.getActiveStats();
    socket.emit('server-stats', initialStats);

    // تسجيل مستخدم جديد
    socket.on('register-user', (userData) => {
        try {
            const user = userManager.addUser(socket, userData);
            
            socket.emit('registration-success', {
                message: 'تم التسجيل بنجاح في خمبقه! 🎉',
                userId: user.id,
                serverInfo: {
                    onlineUsers: userManager.users.size,
                    totalRooms: userManager.rooms.size
                }
            });

            // إرسال رسالة ترحيب شخصية
            socket.emit('welcome-message', {
                message: `أهلاً بك من ${user.country}! يوجد ${userManager.users.size} مستخدم متصل الآن.`,
                country: user.country
            });

        } catch (error) {
            console.error('خطأ في تسجيل المستخدم:', error);
            socket.emit('registration-error', {
                message: 'خطأ في التسجيل، يرجى المحاولة مرة أخرى'
            });
        }
    });

    // البحث عن شريك
    socket.on('find-partner', () => {
        const user = userManager.users.get(socket.id);
        if (!user) {
            socket.emit('error', { message: 'يجب التسجيل أولاً' });
            return;
        }

        userManager.updateUserActivity(socket.id);

        // التحقق من وجود الشريك
        const partner = userManager.findPartner(socket.id);

        if (partner) {
            // إنشاء غرفة جديدة
            const room = userManager.createRoom(user, partner);

            // إشعار كلا المستخدمين
            socket.emit('partner-found', {
                message: `تم العثور على شريك من ${partner.country}! 🎉`,
                roomId: room.id,
                partnerId: partner.id,
                partnerCountry: partner.country
            });

            partner.socket.emit('partner-found', {
                message: `تم العثور على شريك من ${user.country}! 🎉`,
                roomId: room.id,
                partnerId: user.id,
                partnerCountry: user.country
            });

            console.log(`🤝 تم ربط ${user.id} (${user.country}) مع ${partner.id} (${partner.country})`);

        } else {
            // إضافة لقائمة الانتظار
            userManager.addToWaitingQueue(socket.id);
            
            socket.emit('waiting-for-partner', {
                message: 'جاري البحث عن شريك مناسب...',
                waitingCount: userManager.waitingQueue.length,
                estimatedWait: Math.max(1, Math.floor(userManager.waitingQueue.length / 2)) // تقدير وقت الانتظار
            });
        }

        // إرسال إحصائيات محدثة
        const stats = userManager.getActiveStats();
        io.emit('server-stats', stats);
    });

    // مغادرة المحادثة
    socket.on('leave-chat', () => {
        const user = userManager.users.get(socket.id);
        if (user && user.roomId) {
            const room = userManager.rooms.get(user.roomId);
            if (room) {
                // إشعار الشريك
                const partnerId = user.partnerId;
                if (partnerId) {
                    const partner = userManager.users.get(partnerId);
                    if (partner) {
                        partner.socket.emit('partner-left', {
                            message: 'غادر الشريك المحادثة 👋',
                            sessionDuration: Math.floor((Date.now() - room.createdAt) / 1000 / 60) // بالدقائق
                        });
                        partner.roomId = null;
                        partner.partnerId = null;
                    }
                }

                // حذف الغرفة
                userManager.rooms.delete(user.roomId);
                user.roomId = null;
                user.partnerId = null;

                console.log(`🚪 ${socket.id} غادر الغرفة ${room.id}`);
            }
        }

        // إزالة من قائمة الانتظار
        userManager.removeFromWaitingQueue(socket.id);
    });

    // إرسال رسالة
    socket.on('send-message', (data) => {
        const user = userManager.users.get(socket.id);
        if (!user || !user.roomId) {
            return;
        }

        userManager.updateUserActivity(socket.id);

        const message = data.message.trim();
        if (!message || message.length > 500) { // حد أقصى 500 حرف
            return;
        }

        // إضافة الرسالة للغرفة
        const messageData = userManager.addMessage(user.roomId, socket.id, message);
        
        if (messageData) {
            // إرسال للشريك فقط
            socket.to(user.roomId).emit('receive-message', {
                message: message,
                senderId: socket.id,
                timestamp: messageData.timestamp
            });

            console.log(`💬 رسالة في ${user.roomId}: ${message.substring(0, 50)}...`);
        }
    });

    // WebRTC Signaling
    socket.on('webrtc-offer', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.partnerId) {
            socket.to(user.partnerId).emit('webrtc-offer', {
                offer: data.offer,
                senderId: socket.id
            });
            console.log(`📞 عرض WebRTC من ${socket.id} إلى ${user.partnerId}`);
        }
    });

    socket.on('webrtc-answer', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.partnerId) {
            socket.to(user.partnerId).emit('webrtc-answer', {
                answer: data.answer,
                senderId: socket.id
            });
            console.log(`📞 إجابة WebRTC من ${socket.id} إلى ${user.partnerId}`);
        }
    });

    socket.on('webrtc-ice-candidate', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.partnerId) {
            socket.to(user.partnerId).emit('webrtc-ice-candidate', {
                candidate: data.candidate,
                senderId: socket.id
            });
        }
    });

    // تحديث حالة الصوت/الفيديو
    socket.on('toggle-audio', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.partnerId) {
            socket.to(user.partnerId).emit('partner-audio-toggle', {
                isEnabled: data.isEnabled
            });
        }
    });

    socket.on('toggle-video', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.partnerId) {
            socket.to(user.partnerId).emit('partner-video-toggle', {
                isEnabled: data.isEnabled
            });
        }
    });

    // نظام الإبلاغ
    socket.on('submit-report', (reportData) => {
        const user = userManager.users.get(socket.id);
        if (user && user.roomId) {
            const report = {
                id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                reporterId: socket.id,
                reportedUserId: user.partnerId,
                roomId: user.roomId,
                reason: reportData.reason,
                details: reportData.details,
                timestamp: Date.now(),
                reporterCountry: user.country,
                reporterIP: socket.request.connection.remoteAddress
            };

            // حفظ التقرير (هنا يمكن حفظه في قاعدة البيانات)
            console.log(`🚨 تقرير جديد: ${report.id} - ${report.reason}`);

            socket.emit('report-submitted', {
                message: 'تم إرسال التقرير بنجاح. شكراً لك! 🛡️',
                reportId: report.id
            });

            // إحصائية التقارير
            userManager.stats.reportsSubmitted = (userManager.stats.reportsSubmitted || 0) + 1;
        }
    });

    // نظام الحظر
    socket.on('block-user', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.roomId) {
            const partnerId = user.partnerId;

            // إشعار الشريك وقطع الاتصال
            if (partnerId) {
                const partner = userManager.users.get(partnerId);
                if (partner) {
                    partner.socket.emit('partner-left', {
                        message: 'انتهت المحادثة'
                    });
                    partner.roomId = null;
                    partner.partnerId = null;
                }
            }

            // حذف الغرفة
            if (user.roomId) {
                userManager.rooms.delete(user.roomId);
            }

            user.roomId = null;
            user.partnerId = null;

            socket.emit('user-blocked', {
                message: 'تم حظر المستخدم بنجاح ✅'
            });

            console.log(`🚫 ${socket.id} حظر ${partnerId}`);
        }
    });

    // ping للتأكد من النشاط
    socket.on('ping', () => {
        userManager.updateUserActivity(socket.id);
        socket.emit('pong');
    });

    // قطع الاتصال
    socket.on('disconnect', (reason) => {
        console.log(`📴 انقطع الاتصال: ${socket.id} - السبب: ${reason}`);
        userManager.removeUser(socket.id);
        
        // إرسال إحصائيات محدثة
        const stats = userManager.getActiveStats();
        io.emit('server-stats', stats);
    });

    // خطأ في الاتصال
    socket.on('error', (error) => {
        console.error(`❌ خطأ في الاتصال ${socket.id}:`, error);
    });
});

// REST API للإحصائيات العامة
app.get('/api/stats', (req, res) => {
    try {
        const stats = userManager.getActiveStats();
        res.json({
            success: true,
            data: stats,
            server: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'خطأ في جلب الإحصائيات'
        });
    }
});

// API للصحة العامة للخادم
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'running',
        timestamp: new Date().toISOString(),
        users: userManager.users.size,
        rooms: userManager.rooms.size,
        uptime: process.uptime()
    });
});

// API لتفاصيل التوزيع الجغرافي
app.get('/api/countries', (req, res) => {
    try {
        const stats = userManager.getActiveStats();
        res.json({
            success: true,
            distribution: stats.countryDistribution,
            totalCountries: Object.keys(stats.countryDistribution).length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'خطأ في جلب بيانات الدول'
        });
    }
});

// صفحة المراقبة للإدارة
app.get('/admin', (req, res) => {
    const stats = userManager.getActiveStats();
    const html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <title>مراقبة خمبقه</title>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="10">
        <style>
            body { font-family: Arial; padding: 20px; background: #f5f5f5; }
            .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .stat { display: inline-block; margin: 10px; padding: 15px; background: #667eea; color: white; border-radius: 5px; }
            .countries { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
            .country { background: #27ae60; color: white; padding: 10px; border-radius: 5px; text-align: center; }
        </style>
    </head>
    <body>
        <h1>🎥 لوحة مراقبة خمبقه</h1>
        
        <div class="card">
            <h2>📊 الإحصائيات المباشرة</h2>
            <div class="stat">👥 المستخدمون النشطون: ${stats.activeUsers}</div>
            <div class="stat">⏳ في الانتظار: ${stats.waitingUsers}</div>
            <div class="stat">🏠 الغرف النشطة: ${stats.activeRooms}</div>
            <div class="stat">📈 إجمالي الاتصالات: ${stats.totalConnections}</div>
            <div class="stat">🔝 ذروة المستخدمين: ${stats.peakUsers}</div>
            <div class="stat">💬 الرسائل المتبادلة: ${stats.messagesExchanged}</div>
            <div class="stat">⏱️ متوسط مدة الجلسة: ${stats.averageSessionTime} دقيقة</div>
        </div>

        <div class="card">
            <h2>🌍 التوزيع الجغرافي</h2>
            <div class="countries">
                ${Object.entries(stats.countryDistribution).map(([country, count]) => 
                    `<div class="country">${country}: ${count} مستخدم</div>`
                ).join('')}
            </div>
        </div>

        <div class="card">
            <h2>🖥️ معلومات الخادم</h2>
            <p><strong>وقت التشغيل:</strong> ${Math.floor(process.uptime() / 3600)} ساعة</p>
            <p><strong>استخدام الذاكرة:</strong> ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB</p>
            <p><strong>آخر تحديث:</strong> ${new Date().toLocaleString('ar-SA')}</p>
        </div>
    </body>
    </html>`;
    
    res.send(html);
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
    console.error('خطأ في الخادم:', err);
    res.status(500).json({
        success: false,
        error: 'خطأ داخلي في الخادم'
    });
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
    console.log(`🚀 خادم خمبقه يعمل على http://${HOST}:${PORT}`);
    console.log(`📊 لوحة المراقبة: http://${HOST}:${PORT}/admin`);
    console.log(`📈 API الإحصائيات: http://${HOST}:${PORT}/api/stats`);
    console.log(`🌍 API الدول: http://${HOST}:${PORT}/api/countries`);
    console.log(`💫 جاهز لاستقبال المستخدمين!`);
});

// إغلاق آمن
process.on('SIGTERM', () => {
    console.log('🔄 إيقاف الخادم...');
    server.close(() => {
        console.log('✅ تم إيقاف الخادم بأمان');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🔄 إيقاف الخادم (Ctrl+C)...');
    userManager.logStats(); // طباعة الإحصائيات النهائية
    server.close(() => {
        console.log('✅ تم إيقاف الخادم بأمان');
        process.exit(0);
    });
});

module.exports = { app, server, userManager };
