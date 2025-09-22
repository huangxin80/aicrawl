"use strict";
/**
 * 简化测试版智能代理
 * 专门测试自然语言查询到API检测的完整流程
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleIntelligentAgent = void 0;
const CrawlerService_1 = require("./CrawlerService");
const AIAnalyzer_1 = require("./AIAnalyzer");
class SimpleIntelligentAgent {
    constructor() {
        const crawlerConfig = {
            useRealUserData: true,
            verbose: true,
            useExistingBrowser: false
        };
        this.crawler = new CrawlerService_1.CrawlerService(crawlerConfig);
        this.aiAnalyzer = new AIAnalyzer_1.AIAnalyzer();
    }
    /**
     * 处理自然语言查询的主要入口
     */
    async processQuery(query) {
        console.log(`🤖 简化代理处理查询: "${query}"`);
        try {
            // 步骤1：分析用户意图
            const intent = await this.analyzeIntent(query);
            console.log('🎯 用户意图:', intent);
            // 步骤2：执行爬取和分析
            const results = await this.executeAnalysis(intent);
            return {
                query,
                intent: intent.type,
                targetUrl: intent.websiteUrl || '',
                crawlResults: results.crawlResults,
                apiResults: results.apiResults,
                summary: results.summary,
                success: true
            };
        }
        catch (error) {
            console.error('🚨 代理处理失败:', error);
            return {
                query,
                intent: 'error',
                targetUrl: '',
                crawlResults: null,
                apiResults: [],
                summary: `处理失败: ${error.message}`,
                success: false
            };
        }
    }
    /**
     * 分析用户意图
     */
    async analyzeIntent(query) {
        // 简单的规则匹配，可以后续用AI增强
        const intent = {
            type: 'analyze_website',
            target: '未知',
            websiteUrl: null,
            actionType: 'browse'
        };
        // 检查是否包含特定网站名称
        if (query.includes('小红书')) {
            intent.target = '小红书';
            intent.websiteUrl = 'https://www.xiaohongshu.com';
        }
        else if (query.includes('淘宝')) {
            intent.target = '淘宝';
            intent.websiteUrl = 'https://www.taobao.com';
        }
        else if (query.includes('京东')) {
            intent.target = '京东';
            intent.websiteUrl = 'https://www.jd.com';
        }
        // 检查查询类型
        if (query.includes('API') || query.includes('接口') || query.includes('api')) {
            intent.type = 'find_api';
        }
        else if (query.includes('反爬') || query.includes('防爬')) {
            intent.type = 'detect_anti_crawler';
        }
        else if (query.includes('搜索')) {
            intent.type = 'find_api';
            intent.actionType = 'search';
        }
        return intent;
    }
    /**
     * 执行分析
     */
    async executeAnalysis(intent) {
        if (!intent.websiteUrl) {
            throw new Error('未能识别目标网站URL');
        }
        console.log(`🕷️ 开始分析: ${intent.websiteUrl}`);
        // 执行爬取
        const crawlResults = await this.crawler.captureFilesAndUrls(intent.websiteUrl);
        console.log(`📊 爬取完成: ${crawlResults.files.length}个文件, ${crawlResults.urls.length}个URL`);
        // 过滤API相关URLs
        const allApis = this.crawler.filterApiUrls(crawlResults.urls);
        const relevantApis = this.filterRelevantApis(allApis, intent);
        console.log(`🔗 发现API: 总计${allApis.length}个, 相关${relevantApis.length}个`);
        // 生成AI分析总结
        const summary = await this.generateSummary(intent, crawlResults, relevantApis);
        return {
            crawlResults,
            apiResults: relevantApis,
            summary
        };
    }
    /**
     * 过滤相关API
     */
    filterRelevantApis(apis, intent) {
        if (intent.type === 'find_api' && intent.actionType === 'search') {
            // 搜索相关API
            return apis.filter(api => api.url.toLowerCase().includes('search') ||
                api.url.toLowerCase().includes('query') ||
                api.url.toLowerCase().includes('搜索') ||
                (api.method === 'POST' && api.url.includes('/api')));
        }
        // 返回所有API
        return apis.slice(0, 20); // 限制数量
    }
    /**
     * 生成AI总结
     */
    async generateSummary(intent, crawlResults, apis) {
        try {
            const prompt = `
请为以下爬虫分析结果生成简洁的总结：

用户查询意图: ${intent.type}
目标网站: ${intent.target}
网站URL: ${intent.websiteUrl}

爬取结果:
- JS文件: ${crawlResults.files.length}个
- 网络请求: ${crawlResults.urls.length}个
- 页面状态: ${crawlResults.pageState?.hasContent ? '正常' : '异常'}

发现的API接口: ${apis.length}个
${apis.slice(0, 5).map((api, index) => `${index + 1}. [${api.method}] ${api.url} (${api.status})`).join('\n')}

请生成一个简洁的分析总结，重点回答用户的原始需求。
            `;
            return await this.aiAnalyzer.quickAnalyze(prompt);
        }
        catch (error) {
            return `分析完成：发现${apis.length}个API接口，${crawlResults.files.length}个JS文件。具体详情请查看上述结果。`;
        }
    }
    /**
     * 清理资源
     */
    async cleanup() {
        if (this.crawler) {
            await this.crawler.cleanup();
        }
    }
}
exports.SimpleIntelligentAgent = SimpleIntelligentAgent;
