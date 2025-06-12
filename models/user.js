const mongoose = require('mongoose');

/**
 * نموذج بيانات المستخدم في قاعدة البيانات
 * يحتوي على جميع المعلومات الأساسية للمستخدم
 */

const userSchema = new mongoose.Schema({
    // معرف Socket الفريد
    socketId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    
    // الدولة
    country: {
        type: String,
        required: true,
        enum: ['SA', 'EG', 'AE', 'JO', 'LB', 'KW', 'QA', 'BH', 'OM', 'YE', 'IQ', 'SY', 'MA', 'TN', 'DZ', 'LY', 'SD', 'OTHER'],
        default: 'OTHER'
    },
    
    // الاهتمامات
    interests: [{
        type: String,
        trim: true,
        maxlength: 50
    }],
    
    // حالة الاتصال
    isOnline: {
        type: Boolean,
        default: false
    },
    
    // آخر ظهور
    lastSeen: {
        type: Date,
        default: Date.now
    },
    
    // عدد الاتصالات الإجمالي
    totalConnections: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // عدد الرسائل المرسلة
    totalMessages: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // مدة الاستخدام الإجمالية (بالدقائق)
    totalUsageTime: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // تقييم المستخدم (من 1 إلى 5)
    rating: {
        type: Number,
        min: 1,
        max: 5,
        default: 5
    },
    
    // عدد التقييمات
    ratingCount: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // حالة الحساب
    status: {
        type: String,
        enum: ['active', 'banned', 'suspended', 'deleted'],
        default: 'active'
    },
    
    // سبب الحظر (إن وجد)
    banReason: {
        type: String,
        trim: true,
        maxlength: 200
    },
    
    // تاريخ انتهاء الحظر
    banExpiresAt: {
        type: Date
    },
    
    // عدد البلاغات
    reportCount: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // آخر عنوان IP
    lastIP: {
        type: String,
        trim: true
    },
    
    // معلومات المتصفح
    userAgent: {
        type: String,
        trim: true
    },
    
    // الدولة المكتشفة من IP
    detectedCountry: {
        type: String,
        trim: true
    },
    
    // إعدادات المستخدم
    settings: {
        // السماح بالمطابقة من نفس الدولة فقط
        sameCountryOnly: {
            type: Boolean,
            default: false
        },
        
        // السماح بالمطابقة حسب الاهتمامات فقط
        interestMatchOnly: {
            type: Boolean,
            default: false
        },
        
        // إخفاء الدولة
        hideCountry: {
            type: Boolean,
            default: false
        },
        
        // السماح بحفظ الإحصائيات
        allowStats: {
            type: Boolean,
            default: true
        }
    },
    
    // إحصائيات الاستخدام
    stats: {
        // أطول محادثة (بالدقائق)
        longestChat: {
            type: Number,
            default: 0
        },
        
        // متوسط مدة المحادثة
        averageChatDuration: {
            type: Number,
            default: 0
        },
        
        // عدد المحادثات المكتملة
        completedChats: {
            type: Number,
            default: 0
        },
        
        // عدد المرات التي تم تخطيها
        timesSkipped: {
            type: Number,
            default: 0
        },
        
        // الدول التي تم التحدث معها
        countriesSpokenTo: [{
            country: String,
            count: Number
        }]
    }
}, {
    // إضافة timestamps تلقائياً
    timestamps: true,
    
    // إعدادات الفهرسة
    collection: 'users'
});

// إنشاء فهارس للبحث السريع
userSchema.index({ socketId: 1 }, { unique: true });
userSchema.index({ country: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ lastSeen: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1 });

// فهرس مركب للبحث بالدولة والاهتمامات
userSchema.index({ country: 1, interests: 1 });

// فهرس للمستخدمين النشطين
userSchema.index({ isOnline: 1, status: 1 });

// Methods للنموذج
userSchema.methods.toJSON = function() {
    const user = this.toObject();
    
    // إخفاء المعلومات الحساسة
    delete user.lastIP;
    delete user.userAgent;
    delete user.banReason;
    
    return user;
};

// دالة لتحديث آخر ظهور
userSchema.methods.updateLastSeen = function() {
    this.lastSeen = new Date();
    return this.save();
};

// دالة لزيادة عداد الاتصالات
userSchema.methods.incrementConnections = function() {
    this.totalConnections += 1;
    return this.save();
};

// دالة لزيادة عداد الرسائل
userSchema.methods.incrementMessages = function(count = 1) {
    this.totalMessages += count;
    return this.save();
};

// دالة لتحديث التقييم
userSchema.methods.updateRating = function(newRating) {
    const totalRating = (this.rating * this.ratingCount) + newRating;
    this.ratingCount += 1;
    this.rating = totalRating / this.ratingCount;
    return this.save();
};

// دالة لحظر المستخدم
userSchema.methods.banUser = function(reason, duration = null) {
    this.status = 'banned';
    this.banReason = reason;
    if (duration) {
        this.banExpiresAt = new Date(Date.now() + duration);
    }
    return this.save();
};

// دالة لإلغاء الحظر
userSchema.methods.unbanUser = function() {
    this.status = 'active';
    this.banReason = undefined;
    this.banExpiresAt = undefined;
    return this.save();
};

// دالة للتحقق من صحة الحساب
userSchema.methods.isAccountValid = function() {
    if (this.status === 'deleted') return false;
    if (this.status === 'banned') {
        // التحقق من انتهاء مدة الحظر
        if (this.banExpiresAt && this.banExpiresAt < new Date()) {
            this.unbanUser();
            return true;
        }
        return false;
    }
    return this.status === 'active';
};

// Static methods للنموذج
userSchema.statics.findOnlineUsers = function() {
    return this.find({ 
        isOnline: true, 
        status: 'active' 
    });
};

userSchema.statics.findByCountry = function(country) {
    return this.find({ 
        country: country, 
        status: 'active' 
    });
};

userSchema.statics.findByInterests = function(interests) {
    return this.find({ 
        interests: { $in: interests }, 
        status: 'active' 
    });
};

userSchema.statics.getActiveStats = function() {
    return this.aggregate([
        { $match: { status: 'active' } },
        {
            $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                onlineUsers: { 
                    $sum: { $cond: ['$isOnline', 1, 0] } 
                },
                totalConnections: { $sum: '$totalConnections' },
                totalMessages: { $sum: '$totalMessages' },
                averageRating: { $avg: '$rating' }
            }
        }
    ]);
};

// Pre middleware - تشغيل قبل الحفظ
userSchema.pre('save', function(next) {
    // تحديث آخر ظهور عند الحفظ
    if (this.isModified('isOnline') && this.isOnline) {
        this.lastSeen = new Date();
    }
    
    // تنظيف الاهتمامات
    if (this.isModified('interests')) {
        this.interests = this.interests
            .filter(interest => interest && interest.trim())
            .map(interest => interest.trim().toLowerCase())
            .slice(0, 10); // الحد الأقصى 10 اهتمامات
    }
    
    next();
});

// Post middleware - تشغيل بعد الحفظ
userSchema.post('save', function(doc) {
    console.log(`💾 تم حفظ بيانات المستخدم: ${doc.socketId}`);
});

// Virtual fields - حقول افتراضية
userSchema.virtual('isNewUser').get(function() {
    return this.totalConnections <= 1;
});

userSchema.virtual('isActiveUser').get(function() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.lastSeen > dayAgo;
});

userSchema.virtual('accountAge').get(function() {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// تصدير النموذج
module.exports = mongoose.model('User', userSchema);
