/**
 * 简单反爬虫检测系统 - 基于 User-Agent
 * 只有特定的 user-agent 才能获取数据（针对爬虫）
 * 正常浏览器不受限制
 */

class SimpleAntiCrawler {
    constructor() {
        // 允许的爬虫 user-agent 关键词
        this.allowedCrawlers = [
            'SteelDataCrawler',  // 自定义爬虫标识
            'DataCollector',     // 数据收集器标识
            'PriceBot'           // 价格机器人标识
        ];
        this.isValidUser = this.checkUserAgent();
    }

    // 检查是否是正常浏览器
    isNormalBrowser() {
        const userAgent = navigator.userAgent;
        
        // 检测常见浏览器 - 改进的检测逻辑
        const browserPatterns = [
            // Chrome (包括基于Chromium的浏览器)
            /Chrome\/\d+/i,
            /Chromium\/\d+/i,
            
            // Firefox
            /Firefox\/\d+/i,
            /Mozilla.*Firefox/i,
            
            // Safari
            /Safari\/\d+/i,
            /Version\/.*Safari/i,
            
            // Edge
            /Edge\/\d+/i,
            /Edg\/\d+/i,  // 新版Edge
            
            // Opera
            /Opera\/\d+/i,
            /OPR\/\d+/i,   // 新版Opera
            
            // Internet Explorer
            /MSIE \d+/i,
            /Trident\/\d+/i,
            
            // 移动浏览器
            /Mobile.*Safari/i,
            /Android.*Chrome/i,
            /iPhone.*Safari/i,
            /iPad.*Safari/i
        ];
        
        // 额外检查：包含Mozilla且不是明显的爬虫
        const hasMozilla = /Mozilla\/\d+\.\d+/i.test(userAgent);
        const hasWebKit = /WebKit/i.test(userAgent);
        const hasGecko = /Gecko/i.test(userAgent);
        
        // 如果匹配任何浏览器模式，或者有典型的浏览器特征
        return browserPatterns.some(pattern => pattern.test(userAgent)) ||
               (hasMozilla && (hasWebKit || hasGecko));
    }

    // 检查是否是可疑的爬虫
    isSuspiciousCrawler() {
        const userAgent = navigator.userAgent;
        
        // 常见爬虫特征
        const crawlerPatterns = [
            /python/i,
            /requests/i,
            /urllib/i,
            /axios/i,
            /node/i,
            /bot/i,
            /spider/i,
            /crawler/i,
            /scraper/i,
            /curl/i,
            /wget/i,
            /php/i,
            /java/i,
            /go-http/i,
            /okhttp/i
        ];
        
        return crawlerPatterns.some(pattern => pattern.test(userAgent));
    }

    // 检查是否是有效的授权爬虫
    isAuthorizedCrawler() {
        const userAgent = navigator.userAgent;
        return this.allowedCrawlers.some(crawler => 
            userAgent.includes(crawler)
        );
    }

    // 检查 user-agent 权限
    checkUserAgent() {
        // 如果是正常浏览器，总是允许访问
        if (this.isNormalBrowser()) {
            return true;
        }
        
        // 如果是可疑爬虫，检查是否有授权
        if (this.isSuspiciousCrawler()) {
            return this.isAuthorizedCrawler();
        }
        
        // 其他情况（可能是一些特殊的客户端），默认允许
        return true;
    }

    // 获取数据权限等级
    getDataAccessLevel() {
        // 正常浏览器：完整访问
        if (this.isNormalBrowser()) {
            return 'full';
        }
        
        // 授权爬虫：完整访问
        if (this.isAuthorizedCrawler()) {
            return 'full';
        }
        
        // 可疑爬虫但未授权：限制访问
        if (this.isSuspiciousCrawler()) {
            return 'blocked';
        }
        
        // 其他情况：默认完整访问
        return 'full';
    }

    // 获取访问状态描述
    getAccessStatus() {
        if (this.isNormalBrowser()) {
            return {
                type: 'browser',
                message: '✅ 检测到正常浏览器，可正常访问所有数据'
            };
        }
        
        if (this.isAuthorizedCrawler()) {
            return {
                type: 'authorized_crawler',
                message: '✅ 检测到授权爬虫，可获取完整数据'
            };
        }
        
        if (this.isSuspiciousCrawler()) {
            return {
                type: 'blocked_crawler',
                message: '❌ 检测到未授权爬虫，访问被限制'
            };
        }
        
        return {
            type: 'unknown',
            message: '✅ 未知客户端，默认允许访问'
        };
    }

    // 获取允许的 user-agent 列表（用于提示）
    getAllowedUserAgents() {
        return this.allowedCrawlers;
    }
}

// 创建全局实例
window.antiCrawler = new SimpleAntiCrawler();

// 数据访问控制函数
window.getDataWithAuth = function(data) {
    const accessLevel = window.antiCrawler.getDataAccessLevel();
    
    if (accessLevel === 'full') {
        // 完整数据 - 正常浏览器或授权爬虫
        return data;
    } else if (accessLevel === 'blocked') {
        // 阻止访问 - 未授权爬虫
        if (Array.isArray(data)) {
            return [];
        } else if (typeof data === 'object') {
            return {};
        }
        return null;
    }
    
    return data;
};

// 检测函数
window.checkCrawlerAuth = () => {
    const status = window.antiCrawler.getAccessStatus();
    return {
        isValid: window.antiCrawler.isValidUser,
        isBrowser: window.antiCrawler.isNormalBrowser(),
        isCrawler: window.antiCrawler.isSuspiciousCrawler(),
        isAuthorized: window.antiCrawler.isAuthorizedCrawler(),
        accessLevel: window.antiCrawler.getDataAccessLevel(),
        statusType: status.type,
        message: status.message,
        allowedUA: window.antiCrawler.getAllowedUserAgents(),
        currentUA: navigator.userAgent
    };
};