/**
 * 通用JavaScript库 - 用于所有测试页面
 */

// 全局配置
window.TestSite = {
    version: '1.0.0',
    startTime: Date.now(),

    // 页面跟踪
    trackPageView: function(page) {
        console.log(`页面访问: ${page} - ${new Date().toISOString()}`);

        // 模拟发送统计数据
        this.sendAnalytics('pageview', {
            page: page,
            userAgent: navigator.userAgent,
            timestamp: Date.now(),
            referrer: document.referrer
        });
    },

    // 模拟数据发送
    sendAnalytics: function(event, data) {
        // 模拟异步请求
        setTimeout(() => {
            fetch('/api/analytics', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Analytics-Key': 'analytics_key_12345'
                },
                body: JSON.stringify({
                    event: event,
                    data: data
                })
            }).catch(() => {
                // 忽略错误，这只是测试
            });
        }, Math.random() * 1000);
    },

    // 基础防护检测 - 已禁用
    basicProtection: function() {
        /*
        // 只检测WebDriver
        if (navigator.webdriver) {
            console.warn('检测到WebDriver');
        }

        return !navigator.webdriver;
        */
        // 反爬虫检测已禁用 - 总是返回 true
        return true;
    }
};

// 页面加载完成时初始化
document.addEventListener('DOMContentLoaded', function() {
    const pageName = document.title || 'unknown';
    window.TestSite.trackPageView(pageName);

    // 基础保护检查 - 已禁用
    // window.TestSite.basicProtection();
});

// 鼠标跟踪（用于检测真实用户行为）- 已禁用
/*
let mouseTracker = {
    movements: 0,
    clicks: 0,
    startTime: Date.now(),

    init: function() {
        document.addEventListener('mousemove', () => {
            this.movements++;
        });

        document.addEventListener('click', () => {
            this.clicks++;
        });
    },

    getActivity: function() {
        const duration = Date.now() - this.startTime;
        return {
            movements: this.movements,
            clicks: this.clicks,
            duration: duration,
            movementsPerSecond: this.movements / (duration / 1000)
        };
    }
};

mouseTracker.init();
*/

// 模拟鼠标活动数据 - 反爬虫检测已禁用
let mouseTracker = {
    movements: 100,
    clicks: 10,
    startTime: Date.now(),
    
    getActivity: function() {
        const duration = Date.now() - this.startTime;
        return {
            movements: this.movements,
            clicks: this.clicks,
            duration: duration,
            movementsPerSecond: 0.5
        };
    }
};

// 导出全局函数
window.getMouseActivity = () => mouseTracker.getActivity();