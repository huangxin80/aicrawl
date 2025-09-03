"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedCrawlerService = exports.CrawlerEngine = void 0;
const BrowserController_1 = require("./BrowserController");
const SemanticSearchEngine_1 = require("./SemanticSearchEngine");
const NetworkMonitor_1 = require("./NetworkMonitor");
/**
 * 爬虫引擎类型
 */
var CrawlerEngine;
(function (CrawlerEngine) {
    CrawlerEngine["PLAYWRIGHT"] = "playwright";
    CrawlerEngine["CHROME_EXTENSION"] = "chrome-extension";
    CrawlerEngine["HYBRID"] = "hybrid";
})(CrawlerEngine || (exports.CrawlerEngine = CrawlerEngine = {}));
/**
 * 增强版爬虫服务类
 */
class EnhancedCrawlerService {
    extensionUri;
    browserController;
    semanticEngine;
    networkMonitor;
    isInitialized = false;
    config = {
        engine: CrawlerEngine.HYBRID,
        enableNetworkMonitoring: true,
        enableSemanticAnalysis: true,
        enableScreenshots: true,
        timeout: 30000,
        captureOptions: {
            jsFiles: true,
            networkRequests: true,
            screenshots: true,
            pageContent: true
        }
    };
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.browserController = new BrowserController_1.BrowserController(extensionUri);
        this.semanticEngine = new SemanticSearchEngine_1.SemanticSearchEngine(extensionUri);
        this.networkMonitor = new NetworkMonitor_1.NetworkMonitor(extensionUri);
    }
    /**
     * 初始化增强版爬虫服务
     */
    async initialize(config) {
        if (this.isInitialized) {
            return;
        }
        if (config) {
            this.config = { ...this.config, ...config };
        }
        try {
            // 初始化各个组件
            if (this.config.engine !== CrawlerEngine.PLAYWRIGHT) {
                await this.browserController.initialize();
            }
            if (this.config.enableSemanticAnalysis) {
                await this.semanticEngine.initialize();
            }
            this.isInitialized = true;
            console.log('Enhanced crawler service initialized successfully');
        }
        catch (error) {
            console.error('Failed to initialize enhanced crawler service:', error);
            throw error;
        }
    }
    /**
     * 执行增强版网站分析
     */
    async analyzeSite(url, options) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        const startTime = Date.now();
        const analysisDepth = options?.analysisDepth || 'detailed';
        try {
            // 1. 开始网络监控
            let networkSessionId = null;
            if (this.config.enableNetworkMonitoring) {
                networkSessionId = await this.networkMonitor.startMonitoring({
                    sessionName: `Analysis_${Date.now()}`
                });
            }
            // 2. 导航到目标页面
            const tab = await this.browserController.navigate(url, {
                width: this.config.viewport?.width,
                height: this.config.viewport?.height
            });
            // 等待页面加载
            await this.sleep(3000);
            // 3. 获取页面内容
            const pageContent = await this.browserController.getPageContent(tab.tabId);
            // 4. 分析JS文件（从页面HTML中提取）
            const jsFiles = await this.extractJSFiles(pageContent.html, url);
            // 5. 截图分析
            const screenshots = {};
            if (this.config.enableScreenshots && options?.includeScreenshots !== false) {
                screenshots.fullPage = await this.browserController.screenshot({
                    fullPage: true,
                    format: 'png'
                });
                if (options?.targetSelectors) {
                    screenshots.elements = [];
                    for (const selector of options.targetSelectors) {
                        try {
                            const elementScreenshot = await this.browserController.screenshot({
                                selector,
                                format: 'png'
                            });
                            screenshots.elements.push({
                                selector,
                                image: elementScreenshot
                            });
                        }
                        catch (error) {
                            console.warn(`Failed to screenshot element ${selector}:`, error);
                        }
                    }
                }
            }
            // 6. 停止网络监控并分析
            let networkSession = null;
            let networkAnalysis = null;
            if (networkSessionId) {
                networkSession = await this.networkMonitor.stopMonitoring();
                if (networkSession) {
                    networkAnalysis = await this.networkMonitor.analyzeSession(networkSession.id);
                }
            }
            // 7. 语义内容分析
            let contentAnalysis = {
                mainContent: pageContent.text,
                keywords: [],
                semanticChunks: [],
                relatedContent: []
            };
            if (this.config.enableSemanticAnalysis && analysisDepth !== 'basic') {
                // 添加页面内容到语义数据库
                const docId = await this.semanticEngine.addDocument(pageContent.text, {
                    url,
                    title: pageContent.title,
                    timestamp: startTime,
                    type: 'html'
                });
                // 提取关键词
                contentAnalysis.keywords = this.extractKeywords(pageContent.text);
                // 搜索相关内容
                if (contentAnalysis.keywords.length > 0) {
                    contentAnalysis.relatedContent = await Promise.all(contentAnalysis.keywords.slice(0, 3).map((keyword) => this.semanticEngine.search(keyword, { limit: 5 })));
                }
            }
            // 8. 检测反爬虫特征
            const antiCrawlerFeatures = await this.detectAntiCrawlerFeatures(pageContent, jsFiles, networkAnalysis);
            // 9. 生成建议
            const recommendations = this.generateRecommendations(antiCrawlerFeatures, networkAnalysis, jsFiles);
            const result = {
                url,
                title: pageContent.title,
                timestamp: startTime,
                jsFiles,
                networkSession: networkSession,
                networkAnalysis: networkAnalysis,
                contentAnalysis,
                screenshots,
                antiCrawlerFeatures,
                recommendations
            };
            console.log(`Site analysis completed for ${url} in ${Date.now() - startTime}ms`);
            return result;
        }
        catch (error) {
            console.error(`Error analyzing site ${url}:`, error);
            throw error;
        }
    }
    /**
     * 批量分析多个URL
     */
    async batchAnalyzeSites(urls, options) {
        const concurrency = options?.concurrency || 3;
        const results = [];
        const total = urls.length;
        let completed = 0;
        // 分批处理URL
        for (let i = 0; i < urls.length; i += concurrency) {
            const batch = urls.slice(i, i + concurrency);
            const promises = batch.map(async (url) => {
                try {
                    options?.progressCallback?.(completed, total, url);
                    const result = await this.analyzeSite(url, {
                        analysisDepth: options?.analysisDepth
                    });
                    completed++;
                    options?.progressCallback?.(completed, total, url);
                    return result;
                }
                catch (error) {
                    completed++;
                    console.error(`Failed to analyze ${url}:`, error);
                    return null;
                }
            });
            const batchResults = await Promise.all(promises);
            results.push(...batchResults.filter(r => r !== null));
            // 批次间延迟
            if (i + concurrency < urls.length) {
                await this.sleep(1000);
            }
        }
        return results;
    }
    /**
     * 搜索已分析的内容
     */
    async searchAnalyzedContent(query, options) {
        if (!this.config.enableSemanticAnalysis) {
            return [];
        }
        const results = await this.semanticEngine.search(query, {
            limit: options?.limit,
            filters: {
                timeRange: options?.timeRange
            }
        });
        return [results];
    }
    /**
     * 获取浏览器窗口和标签页
     */
    async getBrowserState() {
        return await this.browserController.getWindowsAndTabs();
    }
    /**
     * 截图功能
     */
    async takeScreenshot(options) {
        return await this.browserController.screenshot(options);
    }
    /**
     * 获取网络监控统计
     */
    getNetworkStats() {
        return this.networkMonitor.getStatus();
    }
    /**
     * 获取语义搜索统计
     */
    getSemanticStats() {
        return this.semanticEngine.getStatistics();
    }
    /**
     * 导出分析结果
     */
    exportAnalysisResult(result, format = 'json') {
        if (format === 'markdown') {
            return this.generateMarkdownReport(result);
        }
        return JSON.stringify(result, null, 2);
    }
    /**
     * 从HTML中提取JS文件
     */
    async extractJSFiles(html, baseUrl) {
        const jsFiles = [];
        const scriptRegex = /<script[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
        let match;
        while ((match = scriptRegex.exec(html)) !== null) {
            const src = match[1];
            let fullUrl = src;
            // 处理相对URL
            if (!src.startsWith('http') && !src.startsWith('//')) {
                try {
                    fullUrl = new URL(src, baseUrl).href;
                }
                catch (e) {
                    continue;
                }
            }
            jsFiles.push({
                url: fullUrl,
                content: '', // 实际项目中需要获取内容
                size: 0,
                headers: {},
                method: 'GET',
                timestamp: Date.now()
            });
        }
        return jsFiles;
    }
    /**
     * 提取关键词
     */
    extractKeywords(text) {
        // 简单的关键词提取实现
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3)
            .filter(word => !this.isStopWord(word));
        // 计算词频并返回最常见的词
        const wordCount = new Map();
        words.forEach(word => {
            wordCount.set(word, (wordCount.get(word) || 0) + 1);
        });
        return Array.from(wordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }
    /**
     * 检查是否为停用词
     */
    isStopWord(word) {
        const stopWords = new Set([
            'the', 'is', 'at', 'which', 'on', 'and', 'a', 'to', 'as', 'are',
            'was', 'will', 'been', 'be', 'have', 'had', 'were', 'said', 'each',
            'that', 'their', 'time', 'with', 'for', 'from', 'they', 'she', 'or'
        ]);
        return stopWords.has(word);
    }
    /**
     * 检测反爬虫特征
     */
    async detectAntiCrawlerFeatures(pageContent, jsFiles, networkAnalysis) {
        return {
            dynamicLoading: this.detectDynamicLoading(pageContent.html),
            obfuscation: this.detectObfuscation(jsFiles),
            fingerprinting: this.detectFingerprinting(jsFiles, pageContent.html),
            ratelimiting: this.detectRateLimit(networkAnalysis),
            captcha: this.detectCaptcha(pageContent.html),
            jsChallenge: this.detectJSChallenge(jsFiles)
        };
    }
    /**
     * 检测动态加载
     */
    detectDynamicLoading(html) {
        const indicators = [
            'react', 'vue', 'angular', 'spa', 'ajax',
            'fetch(', 'XMLHttpRequest', '$.get', '$.post'
        ];
        return indicators.some(indicator => html.toLowerCase().includes(indicator.toLowerCase()));
    }
    /**
     * 检测代码混淆
     */
    detectObfuscation(jsFiles) {
        return jsFiles.some(file => {
            const content = file.content.toLowerCase();
            const matches = content.match(/\b[a-z]{1,2}\d+[a-z]{1,2}\b/g);
            return content.includes('eval(') ||
                content.includes('obfuscat') ||
                (matches && matches.length > 50);
        });
    }
    /**
     * 检测浏览器指纹
     */
    detectFingerprinting(jsFiles, html) {
        const fingerprintingKeywords = [
            'canvas.getcontext', 'webgl', 'audicontext',
            'navigator.', 'screen.', 'timezone', 'fingerprint'
        ];
        const allContent = html + jsFiles.map(f => f.content).join(' ');
        return fingerprintingKeywords.some(keyword => allContent.toLowerCase().includes(keyword.toLowerCase()));
    }
    /**
     * 检测限流
     */
    detectRateLimit(networkAnalysis) {
        if (!networkAnalysis)
            return false;
        const rateLimitStatuses = ['429', '503', '509'];
        return Object.keys(networkAnalysis.statusCodes).some(status => rateLimitStatuses.includes(status));
    }
    /**
     * 检测验证码
     */
    detectCaptcha(html) {
        const captchaKeywords = [
            'captcha', 'recaptcha', 'hcaptcha', 'verify', 'robot'
        ];
        return captchaKeywords.some(keyword => html.toLowerCase().includes(keyword));
    }
    /**
     * 检测JS挑战
     */
    detectJSChallenge(jsFiles) {
        return jsFiles.some(file => {
            const content = file.content.toLowerCase();
            return content.includes('challenge') ||
                content.includes('proof of work') ||
                content.includes('cloudflare');
        });
    }
    /**
     * 生成建议
     */
    generateRecommendations(features, networkAnalysis, jsFiles) {
        const recommendations = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            delays: { min: 1000, max: 3000 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            proxyUsage: false,
            jsExecution: false,
            sessionManagement: []
        };
        // 根据检测到的特征调整建议
        if (features.dynamicLoading) {
            recommendations.jsExecution = true;
            recommendations.delays = { min: 3000, max: 6000 };
            recommendations.sessionManagement.push('需要等待动态内容加载');
        }
        if (features.ratelimiting) {
            recommendations.delays = { min: 5000, max: 10000 };
            recommendations.proxyUsage = true;
            recommendations.sessionManagement.push('建议使用代理轮换');
        }
        if (features.fingerprinting) {
            recommendations.headers = {
                ...recommendations.headers,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate'
            };
            recommendations.sessionManagement.push('需要模拟真实浏览器环境');
        }
        if (features.captcha) {
            recommendations.sessionManagement.push('可能需要人工处理验证码');
        }
        return recommendations;
    }
    /**
     * 生成Markdown报告
     */
    generateMarkdownReport(result) {
        return `
# 网站分析报告

## 基本信息
- **URL**: ${result.url}
- **标题**: ${result.title}
- **分析时间**: ${new Date(result.timestamp).toLocaleString()}

## 网络分析
- **总请求数**: ${result.networkAnalysis?.totalRequests || 0}
- **总响应数**: ${result.networkAnalysis?.totalResponses || 0}
- **平均响应时间**: ${result.networkAnalysis?.avgResponseTime || 0}ms
- **错误数量**: ${result.networkAnalysis?.errorCount || 0}

## 反爬虫特征
${Object.entries(result.antiCrawlerFeatures)
            .map(([key, value]) => `- **${key}**: ${value ? '✓' : '✗'}`)
            .join('\n')}

## 建议
- **推荐User-Agent**: ${result.recommendations.userAgent}
- **延迟范围**: ${result.recommendations.delays.min}-${result.recommendations.delays.max}ms
- **需要代理**: ${result.recommendations.proxyUsage ? '是' : '否'}
- **需要JS执行**: ${result.recommendations.jsExecution ? '是' : '否'}

## 其他建议
${result.recommendations.sessionManagement.map(rec => `- ${rec}`).join('\n')}
        `.trim();
    }
    /**
     * 睡眠函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * 清理资源
     */
    dispose() {
        this.browserController.dispose();
        this.semanticEngine.dispose();
        this.networkMonitor.dispose();
        this.isInitialized = false;
    }
}
exports.EnhancedCrawlerService = EnhancedCrawlerService;
//# sourceMappingURL=EnhancedCrawlerService.js.map