const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
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
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status">🟢 السيرفر نشط</div>
            <h1>🚀 خمبقه</h1>
            <p style="font-size: 1.2em; margin-bottom: 30px;">منصة الدردشة المرئية الاحترافية</p>
            
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
                    <div class="stat-number">${Math.floor(process.uptime() / 60)}</div>
                    <div>دقائق التشغيل</div>
                </div>
            </div>
            
            <div class="links">
                <a href="/health">📊 فحص الصحة</a>
                <a href="/stats">📈 الإحصائيات المفصلة</a>
            </div>
            
            <div class="footer">
                <p>تم التطوير بـ ❤️ | Node.js + Socket.io</p>
                <p>الإصدار: 1.0.0 | البيئة: ${process.env.NODE_ENV || 'development'}</p>
                <p><strong>خمبقه</strong> - أفضل منصة دردشة مرئية في الوطن العربي</p>
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
            activeRooms: activeRooms.size
        },
        environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            port: process.env.PORT || 3001
        }
    });
});

app.get('/stats', (req, res) => {
    const detailedStats = {
        overview: {
            activeUsers: activeUsers.size,
            waitingUsers: waitingUsers.length,
            activeRooms: activeRooms.size,
            uptime: process.uptime()
        },
        users: Array.from(activeUsers.values()).map(user => ({
            id: user.id.substring(0, 8) + '...',
            country: user.country,
            interests: user.interests,
            isWaiting: user.isWaiting,
            hasRoom: !!user.roomId,
            joinedAt: user.joinedAt
        })),
        rooms: Array.from(activeRooms.entries()).map(([roomId, room]) => ({
            roomId: roomId.substring(0, 12) + '...',
            userCount: room.users.length,
            createdAt: room.createdAt,
            duration: Date.now() - new Date(room.createdAt).getTime()
        })),
        system: {
            memory: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            version: process.version,
            platform: process.platform
        }
    };
    
    res.json(detailedStats);
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
                joinedAt: new Date()
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

        // البحث عن مستخدم متوافق
        const partner = findCompatiblePartner(currentUser);
        
        if (partner) {
            // إنشاء غرفة جديدة
            const roomId = generateRoomId();
            createRoom(roomId, currentUser, partner);
            
        } else {
            // إضافة للقائمة المنتظرة
            if (!waitingUsers.includes(socket.id)) {
                waitingUsers.push(socket.id);
                currentUser.isWaiting = true;
            }
            
            socket.emit('waiting-for-partner', {
                message: 'جاري البحث عن شريك مناسب... 🔍',
                waitingCount: waitingUsers.length,
                estimatedWait: waitingUsers.length * 5 // تقدير 5 ثوان لكل مستخدم
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

    // إنهاء المحادثة والبحث عن شريك جديد
    socket.on('next-partner', () => {
        const user = activeUsers.get(socket.id);
        if (user && user.roomId) {
            leaveRoom(socket.id);
        }
        
        // البحث عن شريك جديد
        socket.emit('find-partner');
    });

    // مغادرة المحادثة
    socket.on('leave-chat', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            if (user.roomId) {
                leaveRoom(socket.id);
            }
            
            // إزالة من قائمة الانتظار
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
            socket.to(user.roomId).emit('webrtc-offer', {
                offer: data.offer,
                senderId: socket.id
            });
            console.log('📞 عرض WebRTC من:', socket.id);
        }
    });

    socket.on('webrtc-answer', (data) => {
        const user = activeUsers.get(socket.id);
        if (user && user.roomId) {
            socket.to(user.roomId).emit('webrtc-answer', {
                answer: data.answer,
                senderId: socket.id
            });
            console.log('📞 رد WebRTC من:', socket.id);
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

    // معالجة الأخطاء
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
            // إزالة من قائمة الانتظار
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

function createRoom(roomId, user1, user2) {
    const room = {
        users: [user1.id, user2.id],
        createdAt: new Date(),
        lastActivity: new Date()
    };
    
    activeRooms.set(roomId, room);

    // تحديث معلومات المستخدمين
    user1.roomId = roomId;
    user2.roomId = roomId;
    user1.isWaiting = false;
    user2.isWaiting = false;

    // إضافة المستخدمين للغرفة
    const socket1 = io.sockets.sockets.get(user1.id);
    const socket2 = io.sockets.sockets.get(user2.id);
    
    if (socket1) socket1.join(roomId);
    if (socket2) socket2.join(roomId);

    // إشعار كلا المستخدمين
    io.to(roomId).emit('partner-found', {
        roomId: roomId,
        message: '🎉 تم العثور على شريك مناسب!',
        partnerInfo: {
            country: 'مجهول', // حفاظاً على الخصوصية
            interests: []
        }
    });
    
    console.log('🏠 تم إنشاء غرفة:', roomId, 'للمستخدمين:', user1.id, 'و', user2.id);
    updateServerStats();
}

function leaveRoom(userId) {
    const user = activeUsers.get(userId);
    if (!user || !user.roomId) return;

    const roomId = user.roomId;
    const room = activeRooms.get(roomId);
    
    if (room) {
        // إشعار الشريك
        const partnerId = room.users.find(id => id !== userId);
        if (partnerId) {
            const partnerSocket = io.sockets.sockets.get(partnerId);
            if (partnerSocket) {
                partnerSocket.leave(roomId);
                partnerSocket.emit('partner-left', {
                    message: 'غادر الشريك المحادثة 👋'
                });
                
                // إعادة تعيين معلومات الشريك
                const partner = activeUsers.get(partnerId);
                if (partner) {
                    partner.roomId = null;
                    partner.isWaiting = false;
                }
            }
        }
        
        // حذف الغرفة
        activeRooms.delete(roomId);
    }
    
    // إعادة تعيين معلومات المستخدم
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
        // مغادرة الغرفة إن وجدت
        if (user.roomId) {
            leaveRoom(userId);
        }
        
        // إزالة من قائمة الانتظار
        waitingUsers = waitingUsers.filter(id => id !== userId);
        
        // حذف المستخدم
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
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    };
    
    // إرسال الإحصائيات لجميع المتصلين
    io.emit('server-stats', stats);
}

// تنظيف الغرف المهجورة كل 5 دقائق
setInterval(() => {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    for (const [roomId, room] of activeRooms.entries()) {
        if (now - new Date(room.lastActivity).getTime() > fiveMinutes) {
            console.log('🧹 تنظيف الغرفة المهجورة:', roomId);
            
            // إزالة المستخدمين من الغرفة
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

// معالجة إيقاف السيرفر بأمان
process.on('SIGTERM', () => {
    console.log('📴 إيقاف السيرفر...');
    
    // إشعار جميع المستخدمين
    io.emit('server-shutdown', {
        message: 'السيرفر سيتم إعادة تشغيله خلال ثوانِ...'
    });
    
    // إغلاق اتصالات Socket.io
    io.close(() => {
        console.log('✅ تم إغلاق Socket.io بنجاح');
        
        // إغلاق السيرفر
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
const HOST = '0.0.0.0'; // مهم جداً للعمل على Render

server.listen(PORT, HOST, () => {
    console.log('🚀═══════════════════════════════════════════════════════════════🚀');
    console.log('                           خمبقه Server                              ');
    console.log('🚀═══════════════════════════════════════════════════════════════🚀');
    console.log(`🌐 السيرفر يعمل على: http://${HOST}:${PORT}`);
    console.log(`📊 مراقبة الصحة: http://${HOST}:${PORT}/health`);
    console.log(`📈 الإحصائيات: http://${HOST}:${PORT}/stats`);
    console.log(`🔧 البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⚡ Node.js: ${process.version}`);
    console.log('🚀═══════════════════════════════════════════════════════════════🚀');
    console.log('✅ السيرفر جاهز لاستقبال الاتصالات!');
    console.log('🔄 لإعادة التشغيل: اكتب rs واضغط Enter');
    console.log('🛑 للإيقاف: اضغط Ctrl+C');
    console.log('🚀═══════════════════════════════════════════════════════════════🚀');
});
