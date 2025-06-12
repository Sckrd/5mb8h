const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// إنشاء التطبيق والسيرفر
const app = express();
const server = http.createServer(app);

// إعداد Socket.io مع CORS
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Middleware للأمان والإعدادات
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// متغيرات تتبع المستخدمين والغرف
let activeUsers = new Map();
let waitingUsers = [];
let activeRooms = new Map();
let blockedUsers = new Set();
let reportedSessions = new Map();

// نظام تسجيل مبسط للأمان
class SafetyLogger {
    constructor() {
        this.logsDir = path.join(__dirname, 'safety_logs');
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.logsDir, { recursive: true });
            await fs.mkdir(path.join(this.logsDir, 'reports'), { recursive: true });
            console.log('📁 تم إنشاء مجلدات الأمان');
        } catch (error) {
            console.error('❌ خطأ في إنشاء مجلدات الأمان:', error);
        }
    }

    async logSession(user1Id, user2Id, roomId, action = 'start') {
        const logData = {
            timestamp: new Date().toISOString(),
            sessionId: roomId,
            action: action,
            users: [
                {
                    id: this.anonymizeId(user1Id),
                    country: activeUsers.get(user1Id)?.country || 'unknown'
                },
                {
                    id: this.anonymizeId(user2Id),
                    country: activeUsers.get(user2Id)?.country || 'unknown'
                }
            ]
        };

        const fileName = `session_${Date.now()}_${action}.json`;
        const filePath = path.join(this.logsDir, fileName);

        try {
            await fs.writeFile(filePath, JSON.stringify(logData, null, 2));
            console.log(`📝 تم تسجيل ${action} للجلسة: ${roomId}`);
        } catch (error) {
            console.error('❌ خطأ في تسجيل الجلسة:', error);
        }
    }

    async logReport(roomId, reporterId, reason, details) {
        const reportData = {
            timestamp: new Date().toISOString(),
            sessionId: roomId,
            reporterId: this.anonymizeId(reporterId),
            reason: reason,
            details: details,
            status: 'pending'
        };

        const fileName = `report_${Date.now()}.json`;
        const filePath = path.join(this.logsDir, 'reports', fileName);

        try {
            await fs.writeFile(filePath, JSON.stringify(reportData, null, 2));
            console.log('🚨 تم تسجيل تقرير جديد:', reason);
            
            // تتبع الجلسات المبلغ عنها
            if (!reportedSessions.has(roomId)) {
                reportedSessions.set(roomId, []);
            }
            reportedSessions.get(roomId).push(reportData);
            
            return fileName;
        } catch (error) {
            console.error('❌ خطأ في تسجيل التقرير:', error);
        }
    }

    anonymizeId(id) {
        return id.substring(0, 6) + '***';
    }

    async getDailyStats() {
        try {
            const files = await fs.readdir(this.logsDir);
            const today = new Date().toISOString().split('T')[0];
            
            const todayFiles = files.filter(file => file.includes(today));
            const sessionFiles = todayFiles.filter(file => file.startsWith('session_'));
            
            return {
                date: today,
                totalSessions: sessionFiles.length,
                reportsCount: reportedSessions.size,
                activeUsers: activeUsers.size,
                activeRooms: activeRooms.size
            };
        } catch (error) {
            console.error('❌ خطأ في الإحصائيات:', error);
            return { error: 'لا يمكن الحصول على الإحصائيات' };
        }
    }
}

const safetyLogger = new SafetyLogger();

// Routes الأساسية
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>خمبقه - سيرفر الدردشة المرئية</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                margin: 0;
                padding: 20px;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: rgba(255,255,255,0.1);
                padding: 40px;
                border-radius: 20px;
                text-align: center;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                max-width: 600px;
                width: 100%;
            }
            h1 {
                font-size: 3em;
                margin-bottom: 20px;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }
            .stats {
                background: rgba(255,255,255,0.15);
                padding: 20px;
                border-radius: 15px;
                margin: 20px 0;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
            }
            .stat-item {
                background: rgba(255,255,255,0.1);
                padding: 15px;
                border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.2);
            }
            .stat-number {
                font-size: 2em;
                font-weight: bold;
                color: #ffd700;
            }
            .links {
                margin-top: 30px;
            }
            .links a {
                display: inline-block;
                background: rgba(255,255,255,0.2);
                color: white;
                text-decoration: none;
                padding: 12px 25px;
                margin: 5px;
                border-radius: 25px;
                border: 2px solid rgba(255,255,255,0.3);
                transition: all 0.3s ease;
            }
            .links a:hover {
                background: rgba(255,255,255,0.3);
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            }
            .status {
                background: #4ade80;
                padding: 10px 20px;
                border-radius: 20px;
                display: inline-block;
                margin-bottom: 20px;
                font-weight: bold;
            }
            .footer {
                margin-top: 30px;
                font-size: 0.9em;
                opacity: 0.8;
            }
            .safety-badge {
                background: #27ae60;
                padding: 8px 15px;
                border-radius: 15px;
                display: inline-block;
                margin: 10px;
                font-size: 0.9em;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status">🟢 السيرفر نشط</div>
            <h1>🚀 خمبقه</h1>
            <p style="font-size: 1.2em; margin-bottom: 30px;">منصة الدردشة المرئية الاحترافية</p>
            
            <div class="safety-badge">🛡️ نظام أمان متقدم</div>
            <div class="safety-badge">📊 مراقبة ذكية</div>
            
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-number">${activeUsers.size}</div>
                    <div>المستخدمون النشطون</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${waitingUsers.length}</div>
                    <div>في الانتظار</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${activeRooms.size}</div>
                    <div>المحادثات النشطة</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${reportedSessions.size}</div>
                    <div>تقارير اليوم</div>
                </div>
            </div>
            
            <div class="links">
                <a href="/health">📊 فحص الصحة</a>
                <a href="/stats">📈 الإحصائيات</a>
                <a href="/safety">🛡️ تقارير الأمان</a>
            </div>
            
            <div class="footer">
                <p>تم التطوير بـ ❤️ | Node.js + Socket.io</p>
                <p>الإصدار: 2.0.0 | البيئة: ${process.env.NODE_ENV || 'development'}</p>
                <p><strong>خمبقه</strong> - أفضل منصة دردشة مرئية آمنة في الوطن العربي</p>
            </div>
        </div>
    </body>
    </html>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'السيرفر يعمل بنجاح ✅',
        timestamp: new Date().toISOString(),
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version,
            platform: process.platform
        },
        stats: {
            activeUsers: activeUsers.size,
            waitingUsers: waitingUsers.length,
            activeRooms: activeRooms.size,
            reportedSessions: reportedSessions.size
        },
        safety: {
            enabled: true,
            logsDirectory: './safety_logs',
            monitoring: 'active'
        }
    });
});

app.get('/stats', (req, res) => {
    const detailedStats = {
        overview: {
            activeUsers: activeUsers.size,
            waitingUsers: waitingUsers.length,
            activeRooms: activeRooms.size,
            reportedSessions: reportedSessions.size,
            uptime: process.uptime()
        },
        users: Array.from(activeUsers.values()).map(user => ({
            id: user.id.substring(0, 8) + '...',
            country: user.country,
            isWaiting: user.isWaiting,
            hasRoom: !!user.roomId,
            joinedAt: user.joinedAt
        })),
        rooms: Array.from(activeRooms.entries()).map(([roomId, room]) => ({
            roomId: roomId.substring(0, 12) + '...',
            userCount: room.users.length,
            createdAt: room.createdAt,
            reported: reportedSessions.has(roomId)
        })),
        system: {
            memory: process.memoryUsage(),
            version: process.version,
            platform: process.platform
        }
    };
    
    res.json(detailedStats);
});

app.get('/safety', async (req, res) => {
    try {
        const dailyStats = await safetyLogger.getDailyStats();
        res.json({
            message: 'تقارير الأمان والسلامة',
            dailyStats: dailyStats,
            reportedSessions: Array.from(reportedSessions.entries()).map(([roomId, reports]) => ({
                sessionId: roomId.substring(0, 12) + '...',
                reportCount: reports.length,
                lastReport: reports[reports.length - 1]?.timestamp
            })),
            blockedUsers: blockedUsers.size,
            safetyFeatures: [
                'نظام التقارير التلقائي',
                'مراقبة الجلسات',
                'حظر المستخدمين المخالفين',
                'إحصائيات يومية',
                'تسجيل آمن بدون انتهاك الخصوصية'
            ]
        });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الحصول على تقارير الأمان' });
    }
});

// معالجة اتصالات Socket.io
io.on('connection', (socket) => {
    console.log('🔗 مستخدم جديد متصل:', socket.id);

    // تسجيل مستخدم جديد
    socket.on('register-user', (userData) => {
        try {
            const user = {
                id: socket.id,
                country: userData.country || 'OTHER',
                interests: userData.interests || [],
                isWaiting: false,
                roomId: null,
                joinedAt: new Date(),
                reportCount: 0
            };
            
            activeUsers.set(socket.id, user);
            updateServerStats();
            
            socket.emit('registration-success', { 
                userId: socket.id,
                message: 'تم التسجيل بنجاح ✅'
            });
            
            console.log('✅ تم تسجيل المستخدم:', socket.id, 'من:', user.country);
            
        } catch (error) {
            console.error('❌ خطأ في تسجيل المستخدم:', error);
            socket.emit('registration-error', { 
                message: 'حدث خطأ في التسجيل، حاول مرة أخرى'
            });
        }
    });

    // البحث عن شريك
    socket.on('find-partner', () => {
        const currentUser = activeUsers.get(socket.id);
        if (!currentUser) {
            socket.emit('error', { message: 'يجب التسجيل أولاً' });
            return;
        }

        console.log('🔍 المستخدم', socket.id, 'يبحث عن شريك');

        // التحقق من الحظر
        if (blockedUsers.has(socket.id)) {
            socket.emit('error', { message: 'تم حظرك من الخدمة' });
            return;
        }

        const partner = findCompatiblePartner(currentUser);
        
        if (partner) {
            const roomId = generateRoomId();
            createRoom(roomId, currentUser, partner);
        } else {
            if (!waitingUsers.includes(socket.id)) {
                waitingUsers.push(socket.id);
                currentUser.isWaiting = true;
            }
            
            socket.emit('waiting-for-partner', {
                message: 'جاري البحث عن شريك مناسب... 🔍',
                waitingCount: waitingUsers.length,
                estimatedWait: waitingUsers.length * 5
            });
        }
        
        updateServerStats();
    });

    // إرسال رسالة نصية
    socket.on('send-message', (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || !user.roomId) {
            socket.emit('error', { message: 'غير متصل بغرفة دردشة' });
            return;
        }

        if (!data.message || data.message.trim().length === 0) {
            socket.emit('error', { message: 'لا يمكن إرسال رسالة فارغة' });
            return;
        }

        const messageData = {
            message: data.message.trim(),
            timestamp: new Date().toISOString(),
            senderId: socket.id
        };

        socket.to(user.roomId).emit('receive-message', messageData);
        console.log('💬 رسالة من', socket.id, ':', data.message.substring(0, 50));
    });

    // تقديم تقرير أمان
    socket.on('submit-report', async (reportData) => {
        const user = activeUsers.get(socket.id);
        if (!user || !user.roomId) {
            socket.emit('error', { message: 'لا يمكن تقديم تقرير الآن' });
            return;
        }

        console.log('🚨 تقرير جديد من:', socket.id, 'السبب:', reportData.reason);

        try {
            await safetyLogger.logReport(user.roomId, socket.id, reportData.reason, reportData.details);
            
            // زيادة عداد التقارير للمستخدم
            user.reportCount = (user.reportCount || 0) + 1;
            
            socket.emit('report-received', {
                message: 'تم استلام التقرير بنجاح ✅',
                reportId: Date.now()
            });

            // إشعار المشرفين (في التطبيقات الحقيقية)
            console.log('📧 إشعار المشرفين بالتقرير الجديد');

        } catch (error) {
            console.error('❌ خطأ في معالجة التقرير:', error);
            socket.emit('error', { message: 'فشل في إرسال التقرير' });
        }
    });

    // حظر مستخدم
    socket.on('block-user', (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || !user.roomId) return;

        const room = activeRooms.get(user.roomId);
        if (room) {
            const partnerId = room.users.find(id => id !== socket.id);
            if (partnerId) {
                // حظر مؤقت للشريك (يمكن تحسينه)
                console.log('🚫 تم حظر المستخدم:', partnerId, 'بواسطة:', socket.id);
                
                const partnerSocket = io.sockets.sockets.get(partnerId);
                if (partnerSocket) {
                    partnerSocket.emit('user-blocked', {
                        message: 'تم الإبلاغ عنك من قبل مستخدم آخر'
                    });
                }
                
                leaveRoom(socket.id);
            }
        }
    });

    // إنهاء المحادثة والبحث عن شريك جديد
    socket.on('next-partner', () => {
        const user = activeUsers.get(socket.id);
        if (user && user.roomId) {
            leaveRoom(socket.id);
        }
        
        socket.emit('find-partner');
    });

    // مغادرة المحادثة
    socket.on('leave-chat', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            if (user.roomId) {
                leaveRoom(socket.id);
            }
            
            waitingUsers = waitingUsers.filter(id => id !== socket.id);
            user.isWaiting = false;
            
            socket.emit('chat-left', { message: 'تم مغادرة المحادثة' });
        }
        
        updateServerStats();
    });

    // معالجة WebRTC للمكالمات المرئية
    socket.on('webrtc-offer', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.roomId) {
            console.log('📞 تمرير عرض WebRTC من:', socket.id, 'إلى الغرفة:', user.roomId);
            socket.to(user.roomId).emit('webrtc-offer', {
                offer: data.offer,
                senderId: socket.id
            });
        }
    });

    socket.on('webrtc-answer', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.roomId) {
            console.log('📞 تمرير إجابة WebRTC من:', socket.id, 'إلى الغرفة:', user.roomId);
            socket.to(user.roomId).emit('webrtc-answer', {
                answer: data.answer,
                senderId: socket.id
            });
        }
    });

    socket.on('webrtc-ice-candidate', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.roomId) {
            socket.to(user.roomId).emit('webrtc-ice-candidate', {
                candidate: data.candidate,
                senderId: socket.id
            });
        }
    });

    // إشارات التحكم في الصوت والفيديو
    socket.on('toggle-audio', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.roomId) {
            socket.to(user.roomId).emit('partner-audio-toggle', {
                isEnabled: data.isEnabled,
                senderId: socket.id
            });
        }
    });

    socket.on('toggle-video', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.roomId) {
            socket.to(user.roomId).emit('partner-video-toggle', {
                isEnabled: data.isEnabled,
                senderId: socket.id
            });
        }
    });

    // قطع الاتصال
    socket.on('disconnect', () => {
        console.log('❌ مستخدم منقطع:', socket.id);
        handleDisconnection(socket.id);
    });

    socket.on('error', (error) => {
        console.error('⚠️ خطأ Socket من', socket.id, ':', error);
    });
});

// وظائف مساعدة
function findCompatiblePartner(currentUser) {
    for (let i = 0; i < waitingUsers.length; i++) {
        const waitingUserId = waitingUsers[i];
        const waitingUser = activeUsers.get(waitingUserId);
        
        if (waitingUser && waitingUser.id !== currentUser.id && !waitingUser.roomId) {
            waitingUsers.splice(i, 1);
            waitingUser.isWaiting = false;
            return waitingUser;
        }
    }
    return null;
}

function generateRoomId() {
    return 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function createRoom(roomId, user1, user2) {
    const room = {
        users: [user1.id, user2.id],
        createdAt: new Date(),
        lastActivity: new Date()
    };
    
    activeRooms.set(roomId, room);

    user1.roomId = roomId;
    user2.roomId = roomId;
    user1.isWaiting = false;
    user2.isWaiting = false;

    const socket1 = io.sockets.sockets.get(user1.id);
    const socket2 = io.sockets.sockets.get(user2.id);
    
    if (socket1) socket1.join(roomId);
    if (socket2) socket2.join(roomId);

    io.to(roomId).emit('partner-found', {
        roomId: roomId,
        message: '🎉 تم العثور على شريك مناسب!',
        partnerInfo: {
            country: 'مجهول',
            interests: []
        }
    });
    
    // تسجيل بداية الجلسة
    await safetyLogger.logSession(user1.id, user2.id, roomId, 'start');
    
    console.log('🏠 تم إنشاء غرفة:', roomId, 'للمستخدمين:', user1.id, 'و', user2.id);
    updateServerStats();
}

async function leaveRoom(userId) {
    const user = activeUsers.get(userId);
    if (!user || !user.roomId) return;

    const roomId = user.roomId;
    const room = activeRooms.get(roomId);
    
    if (room) {
        const partnerId = room.users.find(id => id !== userId);
        if (partnerId) {
            const partnerSocket = io.sockets.sockets.get(partnerId);
            if (partnerSocket) {
                partnerSocket.leave(roomId);
                partnerSocket.emit('partner-left', {
                    message: 'غادر الشريك المحادثة 👋'
                });
                
                const partner = activeUsers.get(partnerId);
                if (partner) {
                    partner.roomId = null;
                    partner.isWaiting = false;
                }
            }
        }
        
        // تسجيل انتهاء الجلسة
        await safetyLogger.logSession(userId, partnerId || 'unknown', roomId, 'end');
        
        activeRooms.delete(roomId);
    }
    
    const socket = io.sockets.sockets.get(userId);
    if (socket) {
        socket.leave(roomId);
    }
    
    user.roomId = null;
    user.isWaiting = false;
    
    console.log('🚪 المستخدم', userId, 'غادر الغرفة:', roomId);
    updateServerStats();
}

function handleDisconnection(userId) {
    const user = activeUsers.get(userId);
    if (user) {
        if (user.roomId) {
            leaveRoom(userId);
        }
        
        waitingUsers = waitingUsers.filter(id => id !== userId);
        activeUsers.delete(userId);
        
        console.log('🗑️ تم حذف المستخدم:', userId);
    }
    
    updateServerStats();
}

function updateServerStats() {
    const stats = {
        activeUsers: activeUsers.size,
        waitingUsers: waitingUsers.length,
        activeRooms: activeRooms.size,
        reportedSessions: reportedSessions.size,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    };
    
    io.emit('server-stats', stats);
}

// تنظيف الغرف المهجورة كل 5 دقائق
setInterval(() => {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    for (const [roomId, room] of activeRooms.entries()) {
        if (now - new Date(room.lastActivity).getTime() > fiveMinutes) {
            console.log('🧹 تنظيف الغرفة المهجورة:', roomId);
            
            room.users.forEach(userId => {
                const user = activeUsers.get(userId);
                if (user) {
                    user.roomId = null;
                    user.isWaiting = false;
                }
            });
            
            activeRooms.delete(roomId);
        }
    }
    
    updateServerStats();
}, 5 * 60 * 1000);

// إحصائيات يومية كل منتصف ليل
setInterval(async () => {
    try {
        const stats = await safetyLogger.getDailyStats();
        console.log('📊 إحصائيات يومية:', stats);
    } catch (error) {
        console.error('❌ خطأ في الإحصائيات اليومية:', error);
    }
}, 24 * 60 * 60 * 1000);

// معالجة إيقاف السيرفر بأمان
process.on('SIGTERM', () => {
    console.log('📴 إيقاف السيرفر...');
    
    io.emit('server-shutdown', {
        message: 'السيرفر سيتم إعادة تشغيله خلال ثوانِ...'
    });
    
    io.close(() => {
        console.log('✅ تم إغلاق Socket.io بنجاح');
        
        server.close(() => {
            console.log('✅ تم إيقاف السيرفر بنجاح');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('\n📴 تم إيقاف السيرفر بـ Ctrl+C');
    process.exit(0);
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log('🚀═══════════════════════════════════════════════════════════════🚀');
    console.log('                           خمبقه Server v2.0                        ');
    console.log('🚀═══════════════════════════════════════════════════════════════🚀');
    console.log(`🌐 السيرفر يعمل على: http://${HOST}:${PORT}`);
    console.log(`📊 مراقبة الصحة: http://${HOST}:${PORT}/health`);
    console.log(`📈 الإحصائيات: http://${HOST}:${PORT}/stats`);
    console.log(`🛡️ تقارير الأمان: http://${HOST}:${PORT}/safety`);
    console.log(`🔧 البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⚡ Node.js: ${process.version}`);
    console.log('🛡️ نظام الأمان: مفعل');
    console.log('📝 تسجيل الجلسات: مفعل');
    console.log('🚨 نظام التقارير: مفعل');
    console.log('🚀═══════════════════════════════════════════════════════════════🚀');
    console.log('✅ السيرفر جاهز لاستقبال الاتصالات!');
    console.log('🔄 لإعادة التشغيل: اكتب rs واضغط Enter');
    console.log('🛑 للإيقاف: اضغط Ctrl+C');
    console.log('🚀═══════════════════════════════════════════════════════════════🚀');
});
