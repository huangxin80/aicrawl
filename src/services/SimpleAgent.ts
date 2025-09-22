/**
 * 简化测试版智能代理
 * 专门测试自然语言查询到API检测的完整流程
 */

import { CrawlerService, CrawlerConfig } from './CrawlerService';
import { AIAnalyzer } from './AIAnalyzer';

export interface SimpleAgentResult {
    query: string;
    intent: string;
    targetUrl: string;
    crawlResults: any;
    apiResults: any[];
    summary: string;
    success: boolean;
}

export class SimpleIntelligentAgent {
    private crawler: CrawlerService;
    private aiAnalyzer: AIAnalyzer;

    constructor() {
        const crawlerConfig: CrawlerConfig = {
            useRealUserData: true,
            verbose: true,
            useExistingBrowser: false
        };
        
        this.crawler = new CrawlerService(crawlerConfig);
        this.aiAnalyzer = new AIAnalyzer();
    }

    /**
     * 获取AIAnalyzer实例，供其他组件使用
     */
    getAIAnalyzer(): AIAnalyzer {
        return this.aiAnalyzer;
    }

    /**
     * 处理自然语言查询的主要入口
     */
    async processQuery(query: string): Promise<SimpleAgentResult> {
        console.log(`🤖 简化代理处理查询: "${query}"`);

        try {
            // 步骤1：分析用户意图
            const intent = await this.analyzeIntent(query);
            console.log('🎯 用户意图:', intent);

            // 步骤2：根据意图类型执行不同处理
            if (intent.type === 'chat' || intent.type === 'help') {
                // 普通聊天或帮助请求
                const chatResponse = await this.handleChatQuery(query, intent);
                return chatResponse;
            } else {
                // 网站分析请求
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

        } catch (error: any) {
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
     * 处理普通聊天查询
     */
    private async handleChatQuery(query: string, intent: any): Promise<SimpleAgentResult> {
        let response = '';

        if (intent.type === 'help' || query.includes('帮助') || query.includes('help')) {
            response = `🤖 **智能爬虫分析助手**

我可以帮助您：

📍 **网站分析**：
• "访问小红书，告诉我搜索的API接口是什么"
• "分析淘宝的反爬虫机制"
• "模拟在京东上搜索商品的操作"

🔍 **支持的网站**：
• 小红书 (xiaohongshu.com)
• 淘宝 (taobao.com) 
• 京东 (jd.com)
• 或直接输入任何网站URL

💡 **功能特色**：
• 自动抓取JavaScript文件和网络请求
• 智能识别API接口
• 检测反爬虫机制
• 提供绕过建议

📝 **其他用法**：
• 输入"分析catch文件"来分析已抓取的文件
• 点击📎按钮上传文件进行AI分析
• 直接输入网站URL快速获取文件

请告诉我您需要分析什么网站？`;

        } else if (query.includes('你好') || query.includes('hello')) {
            response = `👋 您好！我是智能爬虫分析助手。

我可以帮您：
• 🕸️ 分析网站结构和API接口
• 🛡️ 检测反爬虫机制
• 📊 提供爬虫构建建议

您可以：
1. 直接说"访问小红书"或其他网站名称
2. 输入完整的网站URL
3. 询问"如何分析某某网站"

需要我分析哪个网站吗？`;

        } else if (query.includes('功能') || query.includes('能做什么')) {
            response = `🚀 **我的核心功能**：

🔍 **网站分析**：
• 访问目标网站并自动抓取JavaScript文件
• 监控所有网络请求，识别API接口
• 分析单页应用(SPA)的路由结构

🛡️ **反爬检测**：
• 识别各种反爬虫技术
• 提供具体的绕过建议
• 分析加密和混淆算法

📊 **智能总结**：
• AI驱动的分析报告
• 爬虫构建建议
• 技术实现方案

💾 **文件管理**：
• 自动保存JS文件到本地catch文件夹
• 支持文件上传分析
• 历史记录管理

试试说："分析小红书的搜索接口"？`;

        } else if (query.includes('分析') && !this.containsWebsiteName(query)) {
            response = `🤔 我理解您想进行分析，但需要更具体的信息：

**如果您想分析网站**，请告诉我：
• 网站名称（如：小红书、淘宝、京东）
• 或直接输入网站URL
• 例如："分析小红书的API接口"

**如果您想分析文件**，可以：
• 输入"分析catch文件"分析已抓取的文件
• 点击📎按钮上传文件进行分析

请告诉我您具体想分析什么？`;

        } else {
            // 尝试通过AI分析器生成响应
            try {
                response = await this.aiAnalyzer.quickAnalyze(`
用户问题：${query}

请作为一个专业的爬虫分析助手回答这个问题。如果问题与网站爬取、API分析、反爬虫技术相关，请提供专业建议。
如果是普通聊天，请友好回应并引导用户使用网站分析功能。

回答要求：
- 使用中文
- 保持专业但友好的语调  
- 如果适合，推荐用户尝试分析具体网站
- 控制在200字以内
                `);
            } catch (error) {
                response = `💬 我是专门的爬虫分析助手，擅长：

• 🕸️ 网站结构分析
• 🔍 API接口识别  
• 🛡️ 反爬虫检测

如果您需要分析网站，请告诉我网站名称或URL。
比如："分析小红书"或"访问https://example.com"

有什么网站需要我帮您分析吗？`;
            }
        }

        return {
            query,
            intent: 'chat',
            targetUrl: '',
            crawlResults: null,
            apiResults: [],
            summary: response,
            success: true
        };
    }

    /**
     * 检查查询是否包含网站名称
     */
    private containsWebsiteName(query: string): boolean {
        const websites = ['小红书', '淘宝', '京东', 'xiaohongshu', 'taobao', 'jd'];
        return websites.some(site => query.includes(site)) || 
               /https?:\/\/[^\s]+/.test(query);
    }

    /**
     * 分析用户意图
     */
    private async analyzeIntent(query: string): Promise<any> {
        const intent: any = {
            type: 'chat',
            target: '未知',
            websiteUrl: null,
            actionType: 'browse'
        };

        // 首先检查是否是帮助请求
        if (query.includes('帮助') || query.includes('help') ||
            query.includes('功能') || query.includes('能做什么')) {
            intent.type = 'help';
            return intent;
        }

        // 检查是否是普通对话（没有网站相关的关键词）
        const chatKeywords = ['你好', 'hello', 'hi', '您好', '早上好', '晚上好', '下午好'];
        const analyzeKeywords = ['访问', '分析', '爬取', '抓取', '检测', 'API', '接口', '反爬'];

        // 如果包含聊天关键词且不包含分析关键词，则为普通对话
        const hasChat = chatKeywords.some(word => query.toLowerCase().includes(word));
        const hasAnalyze = analyzeKeywords.some(word => query.toLowerCase().includes(word));

        if (hasChat && !hasAnalyze) {
            intent.type = 'chat';
            return intent;
        }

        // 检查是否是URL
        const urlMatch = query.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            intent.type = 'analyze_website';
            intent.websiteUrl = urlMatch[0];
            intent.target = new URL(urlMatch[0]).hostname;
            // 进一步分析查询类型
            if (query.includes('API') || query.includes('接口') || query.includes('api')) {
                intent.type = 'find_api';
            } else if (query.includes('反爬') || query.includes('防爬')) {
                intent.type = 'detect_anti_crawler';
            } else if (query.includes('搜索')) {
                intent.type = 'find_api';
                intent.actionType = 'search';
            }
            return intent;
        }

        // 检查是否包含特定网站名称并且有分析意图
        const websitePatterns = [
            { name: '小红书', url: 'https://www.xiaohongshu.com' },
            { name: '淘宝', url: 'https://www.taobao.com' },
            { name: '京东', url: 'https://www.jd.com' },
            { name: 'xiaohongshu', url: 'https://www.xiaohongshu.com' },
            { name: 'taobao', url: 'https://www.taobao.com' },
            { name: 'jd', url: 'https://www.jd.com' }
        ];

        for (const site of websitePatterns) {
            if (query.toLowerCase().includes(site.name)) {
                // 只有在有明确的分析意图时才识别为网站分析
                if (hasAnalyze) {
                    intent.type = 'analyze_website';
                    intent.target = site.name;
                    intent.websiteUrl = site.url;

                    // 进一步分析查询类型
                    if (query.includes('API') || query.includes('接口') || query.includes('api')) {
                        intent.type = 'find_api';
                    } else if (query.includes('反爬') || query.includes('防爬')) {
                        intent.type = 'detect_anti_crawler';
                    } else if (query.includes('搜索')) {
                        intent.type = 'find_api';
                        intent.actionType = 'search';
                    }
                    return intent;
                }
            }
        }

        // 如果没有明确的网站和分析意图，默认为聊天
        return intent;
    }

    /**
     * 执行分析
     */
    private async executeAnalysis(intent: any): Promise<any> {
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
    private filterRelevantApis(apis: any[], intent: any): any[] {
        if (intent.type === 'find_api' && intent.actionType === 'search') {
            // 搜索相关API
            return apis.filter(api => 
                api.url.toLowerCase().includes('search') ||
                api.url.toLowerCase().includes('query') ||
                api.url.toLowerCase().includes('搜索') ||
                (api.method === 'POST' && api.url.includes('/api'))
            );
        }

        // 返回所有API
        return apis.slice(0, 20); // 限制数量
    }

    /**
     * 生成AI总结
     */
    private async generateSummary(intent: any, crawlResults: any, apis: any[]): Promise<string> {
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
${apis.slice(0, 5).map((api: any, index: number) => 
    `${index + 1}. [${api.method}] ${api.url} (${api.status})`
).join('\n')}

请生成一个简洁的分析总结，重点回答用户的原始需求。
            `;

            return await this.aiAnalyzer.quickAnalyze(prompt);
        } catch (error: any) {
            return `分析完成：发现${apis.length}个API接口，${crawlResults.files.length}个JS文件。具体详情请查看上述结果。`;
        }
    }

    /**
     * 清理资源
     */
    async cleanup(): Promise<void> {
        if (this.crawler) {
            await this.crawler.cleanup();
        }
    }
}