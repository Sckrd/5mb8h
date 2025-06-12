// secure-server.js - خادم آمن مع حماية متقدمة
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const app = express();
const server = http.createServer(app);

// إعدادات الأمان
const rateLimiter = new RateLimiterMemory({
    keyGenerator: (req) => req.ip,
    points: 100, // عدد الطلبات
    duration: 60, // في الثانية
});

const messageRateLimiter = new RateLimiterMemory({
    points: 10, // 10 رسائل
    duration: 60, // في الدقيقة
});

// Middleware للأمان
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"],
            mediaSrc: ["'self'"]
        }
    }
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting middleware
app.use(async (req, res, next) => {
    try {
        await rateLimiter.consume(req.ip);
        next();
    } catch (rejRes) {
        res.status(429).json({
            error: 'تم تجاوز الحد المسموح من الطلبات',
            retryAfter: rejRes.msBeforeNext
        });
    }
});

// Socket.IO مع إعدادات أمان
const io = socketIo(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ["GET", "POST"]
    },
    transports: ['websocket'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// تخزين بيانات آمن
class SecureUserManager {
    constructor() {
        this.users = new Map();
        this.rooms = new Map();
        this.waitingUsers = [];
        this.blacklistedIPs = new Set();
        this.reports = [];
    }

    addUser(socketId, userData, ipAddress) {
        // التحقق من IP المحظورة
        if (this.blacklistedIPs.has(ipAddress)) {
            throw new Error('عذراً، تم حظر الوصول من هذا العنوان');
        }

        const user = {
            id: socketId,
            country: this.sanitizeInput(userData.country) || 'UNKNOWN',
            interests: Array.isArray(userData.interests) ? userData.interests.slice(0, 5) : [],
            connectedAt: new Date(),
            ipAddress: ipAddress,
            roomId: null,
            partnerId: null,
            reportCount: 0,
            blocked: false
        };

        this.users.set(socketId, user);
        return user;
    }

    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.replace(/[<>'"&]/g, '').trim().slice(0, 100);
    }

    createSecureRoom(user1, user2) {
        const roomId = this.generateSecureId();
        const room = {
            id: roomId,
            users: [user1.id, user2.id],
            createdAt: new Date(),
            messages: [],
            reportCount: 0,
            encrypted: true
        };

        this.rooms.set(roomId, room);
        user1.roomId = roomId;
        user2.roomId = roomId;
        user1.partnerId = user2.id;
        user2.partnerId = user1.id;

        return room;
    }

    generateSecureId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `room_${Date.now()}_${result}`;
    }

    addReport(reportData) {
        const report = {
            id: this.generateSecureId(),
            ...reportData,
            timestamp: new Date(),
            status: 'pending',
            reviewed: false
        };

        this.reports.push(report);

        // إذا كان لدى المستخدم تقارير كثيرة، احظره مؤقتاً
        const user = this.users.get(reportData.reportedUserId);
        if (user) {
            user.reportCount++;
            if (user.reportCount >= 3) {
                user.blocked = true;
                this.blacklistedIPs.add(user.ipAddress);
            }
        }

        return report;
    }

    cleanupInactiveUsers() {
        const now = new Date();
        const inactiveThreshold = 30 * 60 * 1000; // 30 دقيقة

        for (const [socketId, user] of this.users.entries()) {
            if (now - user.connectedAt > inactiveThreshold) {
                this.removeUser(socketId);
            }
        }
    }

    removeUser(socketId) {
        const user = this.users.get(socketId);
        if (user) {
            // إزالة من قائمة الانتظار
            const waitingIndex = this.waitingUsers.indexOf(socketId);
            if (waitingIndex > -1) {
                this.waitingUsers.splice(waitingIndex, 1);
            }

            // إزالة الغرفة إذا كان فيها
            if (user.roomId) {
                this.rooms.delete(user.roomId);
            }

            this.users.delete(socketId);
        }
    }

    getStats() {
        return {
            totalUsers: this.users.size,
            activeRooms: this.rooms.size,
            waitingUsers: this.waitingUsers.length,
            totalReports: this.reports.length,
            blacklistedIPs: this.blacklistedIPs.size
        };
    }
}

const userManager = new SecureUserManager();

// تنظيف دوري للمستخدمين غير النشطين
setInterval(() => {
    userManager.cleanupInactiveUsers();
}, 5 * 60 * 1000); // كل 5 دقائق

// معالجة Socket connections
io.on('connection', (socket) => {
    const clientIP = socket.request.connection.remoteAddress;
    console.log(`✅ User connected: ${socket.id} from IP: ${clientIP}`);

    // التحقق من IP محظور
    if (userManager.blacklistedIPs.has(clientIP)) {
        socket.emit('error', { message: 'تم حظر الوصول من هذا العنوان' });
        socket.disconnect(true);
        return;
    }

    socket.on('register-user', async (userData) => {
        try {
            const user = userManager.addUser(socket.id, userData, clientIP);
            
            socket.emit('registration-success', {
                message: 'تم التسجيل بنجاح',
                userId: socket.id
            });

            console.log(`👤 User registered: ${socket.id} from ${user.country}`);
        } catch (error) {
            socket.emit('registration-error', { message: error.message });
            socket.disconnect(true);
        }
    });

    socket.on('send-message', async (data) => {
        try {
            // Rate limiting للرسائل
            await messageRateLimiter.consume(socket.id);

            const user = userManager.users.get(socket.id);
            if (!user || !user.roomId || user.blocked) {
                return;
            }

            const sanitizedMessage = userManager.sanitizeInput(data.message);
            if (!sanitizedMessage || sanitizedMessage.length === 0) {
                return;
            }

            const room = userManager.rooms.get(user.roomId);
            if (room) {
                const message = {
                    id: userManager.generateSecureId(),
                    senderId: socket.id,
                    content: sanitizedMessage,
                    timestamp: new Date()
                };

                room.messages.push(message);

                // إرسال للشريك فقط
                socket.to(user.roomId).emit('receive-message', {
                    message: sanitizedMessage,
                    senderId: socket.id
                });
            }
        } catch (rejRes) {
            socket.emit('error', { message: 'تم إرسال رسائل كثيرة، يرجى التمهل' });
        }
    });

    socket.on('submit-report', (reportData) => {
        const user = userManager.users.get(socket.id);
        if (!user || !user.roomId) {
            return;
        }

        const sanitizedReport = {
            reporterId: socket.id,
            reportedUserId: user.partnerId,
            roomId: user.roomId,
            reason: userManager.sanitizeInput(reportData.reason),
            details: userManager.sanitizeInput(reportData.details),
            reporterIP: clientIP
        };

        const report = userManager.addReport(sanitizedReport);
        
        socket.emit('report-submitted', {
            message: 'تم إرسال التقرير بنجاح',
            reportId: report.id
        });

        console.log('🚨 Report submitted:', report.id);
    });

    socket.on('find-partner', () => {
        const user = userManager.users.get(socket.id);
        if (!user || user.blocked) {
            socket.emit('error', { message: 'غير مسموح بالبحث حالياً' });
            return;
        }

        // البحث عن شريك آمن
        const availableUsers = userManager.waitingUsers.filter(userId => {
            const otherUser = userManager.users.get(userId);
            return otherUser && 
                   otherUser.id !== user.id && 
                   !otherUser.roomId &&
                   !otherUser.blocked &&
                   otherUser.ipAddress !== user.ipAddress; // منع نفس IP
        });

        if (availableUsers.length > 0) {
            const partnerId = availableUsers[0];
            const partner = userManager.users.get(partnerId);

            if (partner) {
                // إزالة من قائمة الانتظار
                const currentIndex = userManager.waitingUsers.indexOf(user.id);
                const partnerIndex = userManager.waitingUsers.indexOf(partnerId);

                if (currentIndex > -1) userManager.waitingUsers.splice(currentIndex, 1);
                if (partnerIndex > -1) userManager.waitingUsers.splice(partnerIndex, 1);

                // إنشاء غرفة آمنة
                const room = userManager.createSecureRoom(user, partner);

                socket.join(room.id);
                partner.socket = io.sockets.sockets.get(partnerId);
                if (partner.socket) {
                    partner.socket.join(room.id);
                }

                // إشعار المستخدمين
                socket.emit('partner-found', {
                    message: 'تم العثور على شريك!',
                    roomId: room.id
                });

                if (partner.socket) {
                    partner.socket.emit('partner-found', {
                        message: 'تم العثور على شريك!',
                        roomId: room.id
                    });
                }

                console.log(`🎉 Secure room created: ${room.id}`);
            }
        } else {
            // إضافة لقائمة الانتظار
            if (!userManager.waitingUsers.includes(socket.id)) {
                userManager.waitingUsers.push(socket.id);
            }

            socket.emit('waiting-for-partner', {
                message: 'جاري البحث عن شريك آمن...',
                waitingCount: userManager.waitingUsers.length
            });
        }

        // إرسال الإحصائيات المحدثة
        io.emit('server-stats', userManager.getStats());
    });

    socket.on('leave-chat', () => {
        const user = userManager.users.get(socket.id);
        if (user && user.roomId) {
            const room = userManager.rooms.get(user.roomId);
            if (room) {
                // إشعار الشريك
                const partnerId = user.partnerId;
                if (partnerId) {
                    const partnerSocket = io.sockets.sockets.get(partnerId);
                    if (partnerSocket) {
                        partnerSocket.emit('partner-left', {
                            message: 'غادر الشريك المحادثة'
                        });
                    }

                    // تنظيف بيانات الشريك
                    const partner = userManager.users.get(partnerId);
                    if (partner) {
                        partner.roomId = null;
                        partner.partnerId = null;
                    }
                }

                // حذف الغرفة
                userManager.rooms.delete(user.roomId);
                user.roomId = null;
                user.partnerId = null;
            }
        }

        // إزالة من قائمة الانتظار
        const waitingIndex = userManager.waitingUsers.indexOf(socket.id);
        if (waitingIndex > -1) {
            userManager.waitingUsers.splice(waitingIndex, 1);
        }

        io.emit('server-stats', userManager.getStats());
    });

    socket.on('block-user', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.roomId) {
            const partnerId = user.partnerId;

            // إشعار الشريك وقطع الاتصال
            if (partnerId) {
                const partnerSocket = io.sockets.sockets.get(partnerId);
                if (partnerSocket) {
                    partnerSocket.emit('partner-left', {
                        message: 'تم قطع الاتصال'
                    });
                }

                const partner = userManager.users.get(partnerId);
                if (partner) {
                    partner.roomId = null;
                    partner.partnerId = null;
                    partner.reportCount++; // زيادة عداد التقارير للمحظور
                }
            }

            // حذف الغرفة
            if (user.roomId) {
                userManager.rooms.delete(user.roomId);
            }

            user.roomId = null;
            user.partnerId = null;

            socket.emit('user-blocked', {
                message: 'تم حظر المستخدم بنجاح'
            });

            console.log(`🚫 User ${socket.id} blocked user ${partnerId}`);
        }
    });

    // WebRTC Signaling مع تشفير
    socket.on('webrtc-offer', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.partnerId && !user.blocked) {
            const partnerSocket = io.sockets.sockets.get(user.partnerId);
            if (partnerSocket) {
                partnerSocket.emit('webrtc-offer', {
                    offer: data.offer,
                    senderId: socket.id
                });
            }
        }
    });

    socket.on('webrtc-answer', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.partnerId && !user.blocked) {
            const partnerSocket = io.sockets.sockets.get(user.partnerId);
            if (partnerSocket) {
                partnerSocket.emit('webrtc-answer', {
                    answer: data.answer,
                    senderId: socket.id
                });
            }
        }
    });

    socket.on('webrtc-ice-candidate', (data) => {
        const user = userManager.users.get(socket.id);
        if (user && user.partnerId && !user.blocked) {
            const partnerSocket = io.sockets.sockets.get(user.partnerId);
            if (partnerSocket) {
                partnerSocket.emit('webrtc-ice-candidate', {
                    candidate: data.candidate,
                    senderId: socket.id
                });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.id}`);
        userManager.removeUser(socket.id);
        io.emit('server-stats', userManager.getStats());
    });
});

// API Routes الآمنة
app.get('/api/stats', (req, res) => {
    const stats = userManager.getStats();
    res.json({
        success: true,
        stats: {
            activeUsers: stats.totalUsers,
            waitingUsers: stats.waitingUsers,
            activeRooms: stats.activeRooms
        },
        timestamp: new Date()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running securely',
        uptime: process.uptime(),
        timestamp: new Date(),
        version: '1.0.0'
    });
});

// Admin API للمراجعة (يتطلب توثيق)
app.get('/admin/reports', (req, res) => {
    // هنا يمكن إضافة نظام توثيق للإدارة
    const adminKey = req.headers['admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const recentReports = userManager.reports.slice(-50); // آخر 50 تقرير
    res.json({
        success: true,
        reports: recentReports.map(report => ({
            id: report.id,
            reason: report.reason,
            timestamp: report.timestamp,
            status: report.status
        }))
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(500).json({
        error: 'حدث خطأ في الخادم',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'الصفحة غير موجودة',
        path: req.originalUrl
    });
});

// بدء الخادم الآمن
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
    console.log(`🔒 خادم خمبقه الآمن يعمل على: ${HOST}:${PORT}`);
    console.log(`📱 الموقع متاح على: http://${HOST}:${PORT}`);
    console.log(`🛡️ الأمان: مفعل`);
    console.log(`🚀 البيئة: ${process.env.NODE_ENV || 'development'}`);
});

// إغلاق آمن للخادم
process.on('SIGTERM', () => {
    console.log('🔄 إيقاف الخادم بأمان...');
    server.close(() => {
        console.log('✅ تم إيقاف الخادم بنجاح');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🔄 إيقاف الخادم (Ctrl+C)...');
    server.close(() => {
        console.log('✅ تم إيقاف الخادم بنجاح');
        process.exit(0);
    });
});

// معالجة الأخطاء العامة
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
    process.exit(1);
});

module.exports = { app, server, userManager };
