/**
 * مدير الغرف - يتولى إنشاء وإدارة غرف الدردشة
 * يتضمن إحصائيات وتتبع الغرف النشطة
 */

class RoomManager {
    constructor() {
        this.activeRooms = new Map();
        this.roomHistory = [];
        this.totalRoomsCreated = 0;
        this.maxRoomDuration = 60 * 60 * 1000; // ساعة واحدة كحد أقصى
        
        // تنظيف الغرف القديمة كل 5 دقائق
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldRooms();
        }, 5 * 60 * 1000);
        
        console.log('🏠 تم تهيئة مدير الغرف');
    }

    /**
     * إنشاء غرفة جديدة
     * @param {Object} user1 - المستخدم الأول
     * @param {Object} user2 - المستخدم الثاني
     * @returns {string} معرف الغرفة
     */
    createRoom(user1, user2) {
        const roomId = this.generateRoomId();
        
        const room = {
            id: roomId,
            users: [user1.id, user2.id],
            usersData: {
                [user1.id]: {
                    country: user1.country,
                    interests: user1.interests,
                    joinedAt: new Date()
                },
                [user2.id]: {
                    country: user2.country,
                    interests: user2.interests,
                    joinedAt: new Date()
                }
            },
            createdAt: new Date(),
            lastActivity: new Date(),
            status: 'active',
            messageCount: 0,
            videoCallStarted: false,
            tags: this.generateRoomTags(user1, user2)
        };
        
        this.activeRooms.set(roomId, room);
        this.totalRoomsCreated++;
        
        console.log(`🏠 تم إنشاء غرفة جديدة: ${roomId} بين ${user1.id} و ${user2.id}`);
        
        return roomId;
    }

    /**
     * الحصول على معلومات الغرفة
     * @param {string} roomId - معرف الغرفة
     * @returns {Object|null} معلومات الغرفة
     */
    getRoom(roomId) {
        return this.activeRooms.get(roomId) || null;
    }

    /**
     * تحديث نشاط الغرفة
     * @param {string} roomId - معرف الغرفة
     * @param {string} activityType - نوع النشاط
     */
    updateRoomActivity(roomId, activityType = 'message') {
        const room = this.activeRooms.get(roomId);
        if (!room) return false;

        room.lastActivity = new Date();
        
        switch (activityType) {
            case 'message':
                room.messageCount++;
                break;
            case 'video_start':
                room.videoCallStarted = true;
                break;
            case 'video_end':
                room.videoCallStarted = false;
                break;
        }
        
        return true;
    }

    /**
     * حذف غرفة
     * @param {string} roomId - معرف الغرفة
     * @returns {boolean} نجح الحذف أم لا
     */
    deleteRoom(roomId) {
        const room = this.activeRooms.get(roomId);
        if (!room) return false;

        // حفظ في السجل
        const roomHistory = {
            ...room,
            endedAt: new Date(),
            duration: new Date() - room.createdAt
        };
        
        this.roomHistory.push(roomHistory);
        
        // حذف من الغرف النشطة
        this.activeRooms.delete(roomId);
        
        console.log(`🗑️ تم حذف الغرفة: ${roomId} (مدة المحادثة: ${this.formatDuration(roomHistory.duration)})`);
        
        return true;
    }

    /**
     * إزالة مستخدم من الغرفة
     * @param {string} userId - معرف المستخدم
     * @returns {string|null} معرف الغرفة التي تم الخروج منها
     */
    removeUserFromRoom(userId) {
        for (let [roomId, room] of this.activeRooms) {
            if (room.users.includes(userId)) {
                // إذا كان المستخدم الوحيد، احذف الغرفة
                if (room.users.length === 1) {
                    this.deleteRoom(roomId);
                } else {
                    // إزالة المستخدم من الغرفة
                    room.users = room.users.filter(id => id !== userId);
                    delete room.usersData[userId];
                    room.lastActivity = new Date();
                }
                return roomId;
            }
        }
        return null;
    }

    /**
     * البحث عن غرفة المستخدم
     * @param {string} userId - معرف المستخدم
     * @returns {Object|null} معلومات الغرفة
     */
    findUserRoom(userId) {
        for (let [roomId, room] of this.activeRooms) {
            if (room.users.includes(userId)) {
                return { roomId, room };
            }
        }
        return null;
    }

    /**
     * الحصول على شريك المستخدم في الغرفة
     * @param {string} userId - معرف المستخدم
     * @param {string} roomId - معرف الغرفة
     * @returns {string|null} معرف الشريك
     */
    getPartner(userId, roomId) {
        const room = this.activeRooms.get(roomId);
        if (!room) return null;
        
        return room.users.find(id => id !== userId) || null;
    }

    /**
     * تنظيف الغرف القديمة وغير النشطة
     */
    cleanupOldRooms() {
        const now = new Date();
        const inactiveThreshold = 10 * 60 * 1000; // 10 دقائق
        let cleanedCount = 0;

        for (let [roomId, room] of this.activeRooms) {
            const timeSinceLastActivity = now - room.lastActivity;
            const roomAge = now - room.createdAt;
            
            // حذف الغرف القديمة أو غير النشطة
            if (timeSinceLastActivity > inactiveThreshold || roomAge > this.maxRoomDuration) {
                this.deleteRoom(roomId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 تم تنظيف ${cleanedCount} غرفة قديمة`);
        }

        // تنظيف السجل القديم (الاحتفاظ بآخر 1000 غرفة فقط)
        if (this.roomHistory.length > 1000) {
            this.roomHistory = this.roomHistory.slice(-1000);
        }
    }

    /**
     * توليد معرف غرفة فريد
     * @returns {string} معرف الغرفة
     */
    generateRoomId() {
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substr(2, 8);
        return `room_${timestamp}_${randomStr}`;
    }

    /**
     * توليد علامات للغرفة بناءً على المستخدمين
     * @param {Object} user1 - المستخدم الأول
     * @param {Object} user2 - المستخدم الثاني
     * @returns {Array} قائمة العلامات
     */
    generateRoomTags(user1, user2) {
        const tags = [];
        
        // إضافة الدول
        tags.push(`${user1.country}-${user2.country}`);
        
        // إضافة الاهتمامات المشتركة
        const commonInterests = user1.interests.filter(interest => 
            user2.interests.includes(interest)
        );
        
        tags.push(...commonInterests.map(interest => `interest:${interest}`));
        
        // إضافة علامة إذا كانوا من نفس الدولة
        if (user1.country === user2.country) {
            tags.push('same-country');
        }
        
        return tags;
    }

    /**
     * الحصول على إحصائيات الغرف
     * @returns {Object} الإحصائيات
     */
    getStats() {
        const now = new Date();
        const activeRoomsArray = Array.from(this.activeRooms.values());
        
        // حساب متوسط مدة المحادثة
        const averageDuration = this.roomHistory.length > 0 
            ? this.roomHistory.reduce((sum, room) => sum + room.duration, 0) / this.roomHistory.length
            : 0;

        // حساب أكثر الدول نشاطاً
        const countryPairs = {};
        activeRoomsArray.forEach(room => {
            const countries = room.users.map(userId => 
                room.usersData[userId]?.country
            ).filter(Boolean).sort().join('-');
            
            countryPairs[countries] = (countryPairs[countries] || 0) + 1;
        });

        // حساب متوسط الرسائل لكل غرفة
        const averageMessages = activeRoomsArray.length > 0
            ? activeRoomsArray.reduce((sum, room) => sum + room.messageCount, 0) / activeRoomsArray.length
            : 0;

        return {
            activeRooms: this.activeRooms.size,
            totalRoomsCreated: this.totalRoomsCreated,
            roomsInHistory: this.roomHistory.length,
            averageDuration: Math.round(averageDuration / 1000), // بالثواني
            averageMessages: Math.round(averageMessages),
            activeVideoRooms: activeRoomsArray.filter(room => room.videoCallStarted).length,
            mostActiveCountryPairs: Object.entries(countryPairs)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5),
            timestamp: now.toISOString()
        };
    }

    /**
     * الحصول على عدد الغرف النشطة
     * @returns {number} عدد الغرف النشطة
     */
    getActiveRoomsCount() {
        return this.activeRooms.size;
    }

    /**
     * الحصول على إجمالي الغرف المنشأة
     * @returns {number} إجمالي الغرف المنشأة
     */
    getTotalRoomsCreated() {
        return this.totalRoomsCreated;
    }

    /**
     * الحصول على قائمة الغرف النشطة
     * @returns {Array} قائمة الغرف النشطة
     */
    getActiveRooms() {
        return Array.from(this.activeRooms.values());
    }

    /**
     * تنسيق مدة الوقت
     * @param {number} duration - المدة بالملي ثانية
     * @returns {string} المدة منسقة
     */
    formatDuration(duration) {
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}س ${minutes % 60}د`;
        } else if (minutes > 0) {
            return `${minutes}د ${seconds % 60}ث`;
        } else {
            return `${seconds}ث`;
        }
    }

    /**
     * إيقاف مدير الغرف وتنظيف الموارد
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        console.log(`🏠 إيقاف مدير الغرف - إجمالي الغرف المنشأة: ${this.totalRoomsCreated}`);
    }
}

module.exports = RoomManager;
