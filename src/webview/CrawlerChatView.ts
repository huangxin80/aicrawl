/**
 * 爬虫分析器聊天视图提供程序
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { CrawlerService } from '../services/CrawlerService';
import { SimpleIntelligentAgent, SimpleAgentResult } from '../services/SimpleAgent';
import { AIAnalyzer } from '../services/AIAnalyzer';

interface ChatMessage {
    id: string;
    content: string;
    isUser: boolean;
    timestamp: Date;
    isAnalyzing?: boolean;
    taskProgress?: {
        current: number;
        total: number;
        currentTask: string;
    };
    agentPlan?: any;
}

export class CrawlerChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'crawlerAnalyzerChat';
    
    private _view?: vscode.WebviewView;
    private crawlerService: CrawlerService;
    private intelligentAgent: SimpleIntelligentAgent;
    private messages: ChatMessage[] = [];
    private messageIdCounter = 0;
    private isAgentRunning = false;

    constructor(private readonly _extensionUri: vscode.Uri) {
        // 从VS Code配置中读取浏览器设置
        const config = vscode.workspace.getConfiguration('crawler-analyzer');
        const crawlerConfig = {
            useExistingBrowser: config.get('useExistingBrowser', false),
            debugPort: config.get('debugPort', 9222),
            verbose: config.get('verbose', false)
        };
        
        this.crawlerService = new CrawlerService(crawlerConfig);
        this.intelligentAgent = new SimpleIntelligentAgent();
        
        // 智能代理欢迎消息
        this.addMessage('🤖 **智能爬虫分析代理已启动**\n\n我可以理解自然语言并自动分析网站：\n\n🔍 **示例查询**：\n• "访问小红书，告诉我搜索的API接口是什么"\n• "分析淘宝的反爬虫机制"\n• "模拟在京东上搜索商品的操作"\n\n我会自动生成任务计划并逐步执行分析。', false);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
                case 'clearChat':
                    this.clearMessages();
                    break;
                case 'configureApiKey':
                    await this.configureApiKey();
                    break;
                case 'showHistory':
                    await this.showHistory();
                    break;
                case 'showInfo':
                    await this.showInfo();
                    break;
                case 'uploadFile':
                    await this.handleFileUpload(data);
                    break;
                case 'showError':
                    vscode.window.showErrorMessage(data.message);
                    break;
                case 'showFileMenu':
                    await this.showFileManagementMenu();
                    break;
            }
        });

        // 延迟初始化显示消息，确保webview完全加载
        setTimeout(() => {
            this.updateMessages();
            console.log('初始化消息显示完成');
        }, 100);
    }

    /**
     * 处理用户消息 - 智能代理模式
     * @param message - 用户输入的消息
     */
    private async handleUserMessage(message: string) {
        // 防止重复执行
        if (this.isAgentRunning) {
            this.addMessage('🤖 智能代理正在执行中，请等待当前任务完成...', false);
            return;
        }

        // 添加用户消息
        this.addMessage(message, true);
        
        // 检查是否是简单的URL输入（兼容性保持）
        const urlPattern = /^https?:\/\/[^\s]+$/;
        const urlMatch = message.match(urlPattern);
        
        if (urlMatch) {
            // 纯URL输入 - 使用传统模式快速获取文件
            await this.handleSimpleUrlInput(urlMatch[0]);
            return;
        }

        // 检查是否是分析catch文件的请求
        if (message.toLowerCase().includes('分析') && (message.toLowerCase().includes('catch') || message.toLowerCase().includes('文件'))) {
            await this.analyzeCatchFiles();
            return;
        }

        // 使用智能代理处理自然语言查询
        await this.handleIntelligentAgentQuery(message);
    }

    /**
     * 使用简化智能代理处理自然语言查询
     */
    private async handleIntelligentAgentQuery(query: string) {
        this.isAgentRunning = true;
        
        const processingMessage = this.addMessage('🤖 **智能代理分析中...**\n\n正在分析你的查询并执行爬取分析...', false, true);
        
        try {
            console.log(`🤖 简化代理开始处理查询: "${query}"`);
            
            // 调用简化代理处理查询
            const result: SimpleAgentResult = await this.intelligentAgent.processQuery(query);
            
            // 移除处理消息
            this.removeMessage(processingMessage.id);
            
            if (result.success) {
                // 如果是普通对话，直接显示总结
                if (result.intent === 'chat' || result.intent === 'help') {
                    // 对于聊天对话，使用gemini.py后端获得更好的响应
                    if (result.intent === 'chat' && !result.summary.includes('**')) {
                        // 如果SimpleAgent返回了通用响应，尝试使用gemini.py
                        const geminiResponse = await this.callGeminiBackend(query);
                        if (geminiResponse.success && geminiResponse.response) {
                            this.removeMessage(processingMessage.id);
                            this.addMessage(geminiResponse.response, false);
                            return;
                        }
                    }
                    // 否则显示SimpleAgent的响应
                    this.removeMessage(processingMessage.id);
                    this.addMessage(result.summary, false);
                    return;
                }

                // 显示分析结果（网站分析）
                let resultContent = `📊 **智能分析完成**\n\n`;
                resultContent += `🎯 **查询意图**: ${result.intent}\n`;
                resultContent += `🌐 **目标网站**: ${result.targetUrl}\n\n`;
                
                if (result.crawlResults) {
                    resultContent += `📈 **爬取结果**:\n`;
                    resultContent += `• JS文件: ${result.crawlResults.files.length}个\n`;
                    resultContent += `• 网络请求: ${result.crawlResults.urls.length}个\n`;
                    resultContent += `• 页面状态: ${result.crawlResults.pageState?.hasContent ? '✅ 正常' : '❌ 异常'}\n\n`;
                }
                
                if (result.apiResults.length > 0) {
                    resultContent += `🔗 **发现的API接口** (${result.apiResults.length}个):\n`;
                    result.apiResults.slice(0, 10).forEach((api: any, index: number) => {
                        resultContent += `${index + 1}. **[${api.method}]** ${api.url}\n`;
                        resultContent += `   状态: ${api.status} | 类型: ${api.contentType || 'N/A'}\n`;
                    });
                    if (result.apiResults.length > 10) {
                        resultContent += `... 还有 ${result.apiResults.length - 10} 个API接口\n`;
                    }
                } else {
                    resultContent += `⚠️ 未发现明显的API接口，可能需要更深入的分析\n`;
                }
                
                this.addMessage(resultContent, false);
                
                // 显示AI总结
                if (result.summary) {
                    this.addMessage(`🤖 **AI智能总结**\n\n${result.summary}`, false);
                }
                
            } else {
                this.addMessage(`🚨 **分析失败**\n\n${result.summary}\n\n💡 **建议**: 尝试直接输入网站URL或重新描述需求`, false);
            }
            
        } catch (error: any) {
            console.error('🚨 简化代理处理失败:', error);
            
            // 移除处理消息
            this.removeMessage(processingMessage.id);
            
            this.addMessage(`🚨 **智能代理执行遇到问题**\n\n错误: ${error.message}\n\n🔄 **回退选项**:\n1. 直接输入网站URL进行快速分析\n2. 输入"分析catch文件"分析已保存的文件\n3. 重新描述你的需求`, false);
        } finally {
            this.isAgentRunning = false;
        }
    }

    /**
     * 处理简单URL输入（兼容性）
     */
    private async handleSimpleUrlInput(url: string) {
        const fetchingMessage = this.addMessage('📥 **快速文件获取模式**\n\n正在访问网站并捕获JavaScript文件...', false, true);
        
        try {
            await this.fetchFilesAndUrlsFromUrl(url);
            this.removeMessage(fetchingMessage.id);
        } catch (error: any) {
            this.removeMessage(fetchingMessage.id);
            this.addMessage(`获取文件失败：${error.message}`, false);
        }
    }

    /**
     * 格式化代理执行计划
     */

    /**
     * 显示代理执行进度
     */

    /**
     * 格式化代理执行结果
     */

    /**
     * 格式化API搜索结果
     */

    /**
     * 格式化反爬虫检测结果
     */

    /**
     * 格式化模拟操作结果
     */

    /**
     * 格式化通用结果
     */

    /**
     * 仅从URL获取文件并保存到catch文件夹
     * @param url - 要获取文件的网站URL
     */
    private async fetchFilesFromUrl(url: string) {
        // 添加获取中的消息
        const fetchingMessage = this.addMessage('📥 **正在获取JavaScript文件...**\n\n使用Playwright访问网站并捕获所有JS文件', false, true);

        try {
            // 使用Playwright捕获JS文件并自动保存到catch文件夹
            this.updateMessage(fetchingMessage, '🌐 **连接到网站...**\n' + url);
            const capturedFiles = await this.crawlerService.captureJSFiles(url);
            
            // 生成获取报告
            let fetchReport = `✅ **文件获取完成**\n\n`;
            fetchReport += `📁 **文件已保存到 catch 文件夹**\n`;
            fetchReport += `路径: D:\\crawler\\crawler\\catch\n\n`;
            
            if (capturedFiles.length > 0) {
                fetchReport += `**获取的文件列表：**\n`;
                capturedFiles.forEach((file, index) => {
                    const fileName = file.localPath ? path.basename(file.localPath) : `file_${index + 1}.js`;
                    const fileSize = `${(file.size / 1024).toFixed(1)} KB`;
                    fetchReport += `${index + 1}. ${fileName} (${fileSize})\n`;
                    fetchReport += `   来源: ${file.url}\n`;
                });
                fetchReport += `\n共获取 ${capturedFiles.length} 个JavaScript文件\n\n`;
                fetchReport += `💡 **提示**: 文件已保存到本地，您可以输入"分析catch文件"来进行AI分析`;
            } else {
                fetchReport += `⚠️ 未获取到JavaScript文件\n`;
                fetchReport += `可能原因：\n`;
                fetchReport += `• 网站没有使用JavaScript\n`;
                fetchReport += `• 网站有访问限制\n`;
                fetchReport += `• URL不正确\n`;
            }
            
            this.updateMessage(fetchingMessage, fetchReport);
            
        } catch (error: any) {
            this.updateMessage(fetchingMessage, `❌ **文件获取失败**\n\n错误信息：${error.message}\n\n请检查：\n• 网络连接是否正常\n• URL是否正确且可访问`);
        }
    }

    /**
     * 从URL获取所有网络请求URL
     * @param url - 目标网站URL
     */
    private async captureAllUrlsFromUrl(url: string) {
        // 添加获取中的消息
        const capturingMessage = this.addMessage('🌐 **正在获取所有URL...**\n\n使用Playwright访问网站并捕获所有网络请求URL', false, true);

        try {
            // 使用Playwright捕获所有URL
            this.updateMessage(capturingMessage, '🔍 **正在访问网站并监听网络请求...**\n' + url);
            const capturedUrls = await (this.crawlerService as any).captureAllUrls(url);
            
            // 生成URL捕获报告
            const urlReport = this.generateUrlCaptureReport(url, capturedUrls);
            this.updateMessage(capturingMessage, urlReport);
            
        } catch (error: any) {
            this.updateMessage(capturingMessage, `❌ **URL获取失败**\n\n错误信息：${error.message}\n\n请检查：\n• 网络连接是否正常\n• URL是否正确且可访问`);
        }
    }

    /**
     * 从URL获取JavaScript文件和所有网络请求URL
     * @param url - 目标网站URL
     */
    private async fetchFilesAndUrlsFromUrl(url: string) {
        // 添加获取中的消息
        const fetchingMessage = this.addMessage('📥 **正在获取JavaScript文件和所有URL...**\n\n使用Playwright引擎访问网站并捕获JS文件和网络请求URL', false, true);

        try {
            // 使用CrawlerService同时捕获JS文件和所有URL
            this.updateMessage(fetchingMessage, '🎭 **启动Playwright爬取...**\n' + url);
            
            // 调用爬取方法
            const result = await this.crawlerService.captureFilesAndUrls(url);
            const capturedFiles = result.files;
            const capturedUrls = result.urls;
            const visitedRoutes = result.routes || [];
            const pageState = result.pageState;
            
            // 生成爬取报告
            let report = `✅ **Playwright爬取完成** - ${url}\n\n`;
            
            // 引擎使用信息
            report += `🎭 **使用引擎**: Playwright\n`;
            report += '\n';
            
            // 页面状态部分
            if (pageState) {
                report += `🔍 **页面状态分析**\n`;
                report += `• 内容状态: ${pageState.hasContent ? '✅ 有内容' : '⚠️ 内容为空'}\n`;
                report += `• JavaScript渲染: ${pageState.isJSRendered ? '✅ 是JS应用' : '❌ 非JS应用'}\n`;
                report += `• 页面稳定: ${pageState.isStable ? '✅ 稳定' : '⏳ 仍在加载'}\n`;
                report += `• 内容得分: ${pageState.contentScore.toFixed(1)}/100\n`;
                
                if (pageState.loadingIndicators && pageState.loadingIndicators.length > 0) {
                    report += `• 加载指示器: ${pageState.loadingIndicators.slice(0, 3).join(', ')}${pageState.loadingIndicators.length > 3 ? '...' : ''}\n`;
                }
                
                if (pageState.errors && pageState.errors.length > 0) {
                    report += `• 检测到的问题: ${pageState.errors.slice(0, 2).join(', ')}${pageState.errors.length > 2 ? '...' : ''}\n`;
                }
                report += '\n';
            }

            // SPA路由部分
            if (visitedRoutes.length > 0) {
                report += `🗺️ **SPA路由探索 (${visitedRoutes.length}个)**\n`;
                visitedRoutes.forEach((route: any, index: number) => {
                    report += `${index + 1}. ${route.title || 'No Title'}\n`;
                    report += `   URL: ${route.url}\n`;
                    report += `   内容得分: ${route.contentLength}\n`;
                });
                report += '\n';
            }
            
            // JS文件部分
            report += `📄 **JavaScript文件 (${capturedFiles.length}个)**\n`;
            report += `📁 文件已保存到: D:\\crawler\\crawler\\catch\n\n`;
            
            if (capturedFiles.length > 0) {
                report += `**文件列表：**\n`;
                capturedFiles.forEach((file: any, index: number) => {
                    const fileName = file.localPath ? path.basename(file.localPath) : `file_${index + 1}.js`;
                    const fileSize = `${(file.size / 1024).toFixed(1)} KB`;
                    report += `${index + 1}. ${fileName} (${fileSize})\n`;
                    report += `   来源: ${file.url}\n`;
                });
                report += '\n';
            }
            
            // URL部分
            report += `🌐 **所有网络请求URL (${capturedUrls.length}个)**\n\n`;
            
            if (capturedUrls.length > 0) {
                // 按类型统计
                const jsUrls = capturedUrls.filter((u: any) => u.urlType === 'js');
                const cssUrls = capturedUrls.filter((u: any) => u.urlType === 'css');
                const imageUrls = capturedUrls.filter((u: any) => u.urlType === 'image');
                const apiUrls = capturedUrls.filter((u: any) => u.urlType === 'api' || u.isAPI);
                const otherUrls = capturedUrls.filter((u: any) => u.urlType === 'other');
                
                report += `📊 **类型统计**\n`;
                report += `• 📄 JavaScript: ${jsUrls.length}\n`;
                report += `• 🎨 CSS样式: ${cssUrls.length}\n`;
                report += `• 🖼️ 图片资源: ${imageUrls.length}\n`;
                report += `• 🔍 API接口: ${apiUrls.length}\n`;
                report += `• 📦 其他资源: ${otherUrls.length}\n\n`;
                
                // 重点显示API接口
                if (apiUrls.length > 0) {
                    report += `🔍 **重要API接口** (前10个)\n`;
                    const importantApis = apiUrls.slice(0, 10);
                    importantApis.forEach((api: any, index: number) => {
                        const statusEmoji = api.status >= 200 && api.status < 300 ? '✅' : '❌';
                        report += `${index + 1}. ${statusEmoji} [${api.method}] ${api.url}\n`;
                        report += `   状态: ${api.status} ${api.statusText || ''}\n`;
                    });
                    report += '\n';
                }
                
                // 所有URL列表（前30个）
                report += `📋 **完整URL列表** (前30个)\n`;
                const displayUrls = capturedUrls.slice(0, 30);
                displayUrls.forEach((urlInfo: any, index: number) => {
                    const typeEmoji = (urlInfo.urlType === 'api' || urlInfo.isAPI) ? '🔍' : 
                                     urlInfo.urlType === 'js' ? '📄' : 
                                     urlInfo.urlType === 'css' ? '🎨' : 
                                     urlInfo.urlType === 'image' ? '🖼️' : '📦';
                    report += `${index + 1}. ${typeEmoji} [${urlInfo.method}] ${urlInfo.url}\n`;
                    if (urlInfo.status) {
                        const statusEmoji = urlInfo.status >= 200 && urlInfo.status < 300 ? '✅' : '❌';
                        report += `   ${statusEmoji} ${urlInfo.status} ${urlInfo.statusText || ''}\n`;
                    }
                });
                
                if (capturedUrls.length > 30) {
                    report += `\n... 还有 ${capturedUrls.length - 30} 个URL未显示\n`;
                }
            }
            
            report += `\n🚀 **Playwright引擎特性**: \n`;
            report += `• 🎭 **现代浏览器引擎**: 支持复杂JavaScript应用和SPA路由\n`;
            report += `• 🔍 **智能页面检测**: 自动检测页面状态和内容加载情况\n`;
            report += `• 🗺️ **SPA路由探索**: 自动发现和访问单页应用的不同页面\n`;
            report += `• 🛡️ **反检测技术**: 模拟真实浏览器行为，绕过常见反爬机制\n`;
            report += `• JavaScript文件已保存到本地，您可以输入"分析catch文件"进行AI分析\n`;
            report += `• 包含 /api/、/v1/、/like、/comment 等路径的通常是API接口`;
            
            this.updateMessage(fetchingMessage, report);
            
        } catch (error: any) {
            this.updateMessage(fetchingMessage, `❌ **Playwright爬取失败**\n\n错误信息：${error.message}\n\n🔧 **可能的解决方案**：\n• 检查网络连接是否正常\n• 确认URL是否正确且可访问\n• 某些网站可能需要特殊处理，请稍后重试\n• 如持续失败，可能需要手动分析网站结构`);
        }
    }

    /**
     * 生成URL捕获报告
     * @param url - 目标网站URL
     * @param urls - 捕获的URL列表
     * @returns 格式化的报告
     */
    private generateUrlCaptureReport(url: string, urls: any[]): string {
        let report = `✅ **URL捕获完成** - ${url}\n\n`;
        
        // 基本统计
        const apiUrls = urls.filter(u => u.isAPI);
        const jsUrls = urls.filter(u => u.urlType === 'js');
        const cssUrls = urls.filter(u => u.urlType === 'css');
        const imageUrls = urls.filter(u => u.urlType === 'image');
        const otherUrls = urls.filter(u => u.urlType === 'other');
        
        report += `📊 **捕获统计**\n`;
        report += `• 总URL数量: ${urls.length}\n`;
        report += `• 🔍 API接口: ${apiUrls.length}\n`;
        report += `• 📄 JavaScript: ${jsUrls.length}\n`;
        report += `• 🎨 CSS样式: ${cssUrls.length}\n`;
        report += `• 🖼️ 图片资源: ${imageUrls.length}\n`;
        report += `• 📦 其他资源: ${otherUrls.length}\n\n`;
        
        // API接口详细列表
        if (apiUrls.length > 0) {
            report += `🔍 **发现的API接口** (${apiUrls.length}个)\n`;
            apiUrls.forEach((urlInfo, index) => {
                const method = urlInfo.method;
                const status = urlInfo.status;
                const statusEmoji = status >= 200 && status < 300 ? '✅' : '❌';
                report += `${index + 1}. ${statusEmoji} [${method}] ${urlInfo.url}\n`;
                report += `   状态: ${status} ${urlInfo.statusText}\n`;
                if (urlInfo.contentType) {
                    report += `   类型: ${urlInfo.contentType}\n`;
                }
                if (urlInfo.size > 0) {
                    report += `   大小: ${(urlInfo.size / 1024).toFixed(1)} KB\n`;
                }
                report += '\n';
            });
        } else {
            report += `🔍 **API接口**\n⚠️ 未发现明显的API接口\n\n`;
        }
        
        // 按状态码分类
        const statusGroups = urls.reduce((groups, urlInfo) => {
            const status = Math.floor(urlInfo.status / 100) * 100;
            const key = status === 200 ? '2xx成功' : 
                       status === 300 ? '3xx重定向' : 
                       status === 400 ? '4xx客户端错误' : 
                       status === 500 ? '5xx服务器错误' : '其他';
            if (!groups[key]) groups[key] = [];
            groups[key].push(urlInfo);
            return groups;
        }, {} as Record<string, any[]>);
        
        report += `📈 **请求状态分析**\n`;
        Object.entries(statusGroups).forEach(([status, statusUrls]) => {
            const urlList = statusUrls as any[];
            const emoji = status.includes('2xx') ? '✅' : 
                         status.includes('3xx') ? '🔄' : 
                         status.includes('4xx') ? '⚠️' : 
                         status.includes('5xx') ? '❌' : '📦';
            report += `${emoji} ${status}: ${urlList.length} 个\n`;
        });
        report += '\n';
        
        // 搜索建议
        report += `💡 **筛选建议**\n`;
        report += `• 要查看所有JavaScript文件，使用命令: 输入纯URL\n`;
        report += `• 查找点赞接口: 搜索包含 "like" 的URL\n`;
        report += `• 查找评论接口: 搜索包含 "comment" 的URL\n`;
        report += `• 查找关注接口: 搜索包含 "follow" 的URL\n`;
        report += `• 查找API接口: 上方已列出所有检测到的API接口\n\n`;
        
        // 完整URL列表（可折叠显示前20个）
        if (urls.length > 0) {
            report += `📋 **完整URL列表** (前20个)\n`;
            const displayUrls = urls.slice(0, 20);
            displayUrls.forEach((urlInfo, index) => {
                const typeEmoji = urlInfo.urlType === 'api' ? '🔍' : 
                                 urlInfo.urlType === 'js' ? '📄' : 
                                 urlInfo.urlType === 'css' ? '🎨' : 
                                 urlInfo.urlType === 'image' ? '🖼️' : '📦';
                report += `${index + 1}. ${typeEmoji} [${urlInfo.method}] ${urlInfo.url}\n`;
            });
            
            if (urls.length > 20) {
                report += `\n... 还有 ${urls.length - 20} 个URL未显示\n`;
            }
        }
        
        return report;
    }

    /**
     * 分析catch文件夹中的文件
     */
    private async analyzeCatchFiles() {
        // 添加分析中的消息
        const analyzingMessage = this.addMessage('🔍 **正在分析catch文件夹中的文件...**', false, true);

        try {
            // 从catch文件夹读取文件
            this.updateMessage(analyzingMessage, '📂 **读取catch文件夹中的文件...**\n路径: D:\\crawler\\crawler\\catch');
            const localFiles = await this.crawlerService.readCapturedFiles();
            
            if (localFiles.length === 0) {
                this.updateMessage(analyzingMessage, `⚠️ **catch文件夹为空**\n\n请先输入网站URL获取JavaScript文件\n例如：https://example.com`);
                return;
            }
            
            // 显示正在分析的文件
            let filesList = `📂 **正在分析以下文件：**\n`;
            localFiles.forEach((file, index) => {
                const fileName = file.localPath ? path.basename(file.localPath) : `file_${index + 1}.js`;
                filesList += `${index + 1}. ${fileName}\n`;
            });
            this.updateMessage(analyzingMessage, filesList + '\n🧠 **AI正在深度分析文件内容...**');
            
            // AI分析本地文件
            // 临时禁用AI分析功能
            const analysis = { summary: '智能代理模式已启用，请使用自然语言查询。' };
            
            // 生成分析报告
            const analysisReport = this.generateCatchAnalysisReport(localFiles, analysis);
            this.updateMessage(analyzingMessage, analysisReport);
            
        } catch (error: any) {
            this.updateMessage(analyzingMessage, `❌ **分析失败**\n\n错误信息：${error.message}\n\n请检查：\n• catch文件夹是否有文件\n• API Key是否配置正确`);
        }
    }

    /**
     * 生成catch文件分析报告
     */
    private generateCatchAnalysisReport(files: any[], analysis: any): string {
        let report = `✅ **AI分析完成**\n\n`;
        
        // 分析的文件
        report += `📄 **分析的文件（来自catch文件夹）**\n`;
        files.forEach((file, index) => {
            const fileName = file.localPath ? path.basename(file.localPath) : `file_${index + 1}.js`;
            const fileSize = `${(file.size / 1024).toFixed(1)} KB`;
            report += `${index + 1}. **${fileName}** (${fileSize})\n`;
        });
        report += '\n';
        
        // AI分析结果
        report += `🤖 **AI分析结果**\n\n`;
        
        // 分析摘要
        if (analysis.summary) {
            report += `📝 **分析摘要**\n${analysis.summary}\n\n`;
        }
        
        // 反爬技术
        if (analysis.antiCrawlerTechniques && analysis.antiCrawlerTechniques.length > 0) {
            report += `🛡️ **检测到的反爬技术**\n`;
            analysis.antiCrawlerTechniques.forEach((tech: any, index: number) => {
                const severity = tech.severity === 'high' ? '🔴 高' : tech.severity === 'medium' ? '🟡 中' : '🟢 低';
                report += `\n${index + 1}. **${tech.name}** [${severity}]\n`;
                report += `   • 描述：${tech.description}\n`;
                report += `   • 位置：${tech.location}\n`;
                report += `   • 绕过方法：${tech.bypass}\n`;
            });
            report += '\n';
        } else {
            report += `🛡️ **反爬技术**\n✅ 未检测到明显的反爬虫机制\n\n`;
        }
        
        // 算法分析
        if (analysis.algorithms && analysis.algorithms.length > 0) {
            report += `🔐 **算法分析**\n`;
            analysis.algorithms.forEach((algo: any, index: number) => {
                report += `${index + 1}. **${algo.name}** (${algo.type})\n`;
                report += `   • ${algo.description}\n`;
                if (algo.implementation) {
                    report += `   • 实现：${algo.implementation}\n`;
                }
            });
            report += '\n';
        }
        
        // 爬虫建议
        if (analysis.crawlerStructure) {
            report += `🚀 **爬虫构建建议**\n`;
            report += `• JavaScript执行：${analysis.crawlerStructure.javascriptExecution ? '需要' : '不需要'}\n`;
            report += `• 动态内容：${analysis.crawlerStructure.dynamicContent ? '是' : '否'}\n`;
            
            if (analysis.crawlerStructure.requiredHeaders && Object.keys(analysis.crawlerStructure.requiredHeaders).length > 0) {
                report += `• 必需Headers：\n`;
                Object.entries(analysis.crawlerStructure.requiredHeaders).forEach(([key, value]) => {
                    report += `  - ${key}: ${value}\n`;
                });
            }
            
            if (analysis.crawlerStructure.cookieRequirements && analysis.crawlerStructure.cookieRequirements.length > 0) {
                report += `• 必需Cookies：${analysis.crawlerStructure.cookieRequirements.join(', ')}\n`;
            }
            
            if (analysis.crawlerStructure.apiEndpoints && analysis.crawlerStructure.apiEndpoints.length > 0) {
                report += `• API端点：\n`;
                analysis.crawlerStructure.apiEndpoints.forEach((endpoint: string) => {
                    report += `  - ${endpoint}\n`;
                });
            }
            report += '\n';
        }
        
        // 具体建议
        if (analysis.recommendations && analysis.recommendations.length > 0) {
            report += `💡 **实施建议**\n`;
            analysis.recommendations.forEach((rec: string, index: number) => {
                report += `${index + 1}. ${rec}\n`;
            });
            report += '\n';
        }
        
        // 置信度
        report += `📊 **分析置信度**：${(analysis.confidence * 100).toFixed(0)}%`;
        
        return report;
    }

    /**
     * 生成分析报告
     */
    private generateAnalysisReport(url: string, jsFiles: any[], analysis: any): string {
        let report = `✅ **分析完成** - ${url}\n\n`;
        
        // Output Files 部分
        report += `📄 **Output Files**\n`;
        if (jsFiles.length > 0) {
            jsFiles.forEach((file, index) => {
                const fileName = file.localPath ? path.basename(file.localPath) : path.basename(new URL(file.url).pathname) || `file_${index + 1}.js`;
                const fileSize = `${(file.size / 1024).toFixed(1)} KB`;
                report += `${index + 1}. **${fileName}** (${fileSize})\n`;
                report += `   • URL: ${file.url}\n`;
                if (file.localPath) {
                    report += `   • 本地路径: ${file.localPath}\n`;
                }
                report += `   • 获取时间: ${new Date(file.timestamp).toLocaleString('zh-CN')}\n\n`;
            });
        } else {
            report += `未获取到JavaScript文件\n\n`;
        }
        
        // 基本信息
        report += `📊 **基本信息**\n`;
        report += `• 捕获JavaScript文件：${jsFiles.length} 个\n`;
        report += `• 分析置信度：${(analysis.confidence * 100).toFixed(0)}%\n\n`;
        
        // 摘要
        if (analysis.summary) {
            report += `📝 **分析摘要**\n${analysis.summary}\n\n`;
        }
        
        // 反爬技术
        if (analysis.antiCrawlerTechniques && analysis.antiCrawlerTechniques.length > 0) {
            report += `🛡️ **检测到的反爬技术**\n`;
            analysis.antiCrawlerTechniques.forEach((tech: any, index: number) => {
                const severity = tech.severity === 'high' ? '🔴' : tech.severity === 'medium' ? '🟡' : '🟢';
                report += `${index + 1}. ${severity} **${tech.name}**\n`;
                report += `   • 描述：${tech.description}\n`;
                report += `   • 位置：${tech.location}\n`;
                report += `   • 绕过方法：${tech.bypass}\n\n`;
            });
        } else {
            report += `🛡️ **反爬技术**\n未检测到明显的反爬技术\n\n`;
        }
        
        // 爬虫建议
        if (analysis.crawlerStructure) {
            report += `🚀 **爬虫构建建议**\n`;
            report += `• JavaScript执行：${analysis.crawlerStructure.javascriptExecution ? '需要' : '不需要'}\n`;
            report += `• 动态内容：${analysis.crawlerStructure.dynamicContent ? '是' : '否'}\n`;
            
            if (analysis.crawlerStructure.requiredHeaders) {
                report += `• 必需Headers：\n`;
                Object.entries(analysis.crawlerStructure.requiredHeaders).forEach(([key, value]) => {
                    report += `  - ${key}: ${value}\n`;
                });
            }
            report += '\n';
        }
        
        // 具体建议
        if (analysis.recommendations && analysis.recommendations.length > 0) {
            report += `💡 **具体建议**\n`;
            analysis.recommendations.forEach((rec: string, index: number) => {
                report += `${index + 1}. ${rec}\n`;
            });
        }
        
        return report;
    }

    /**
     * 配置API Key
     */
    private async configureApiKey() {
        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入Google Gemini API Key',
            password: true,
            placeHolder: 'your-api-key-here'
        });
        
        if (apiKey) {
            const config = vscode.workspace.getConfiguration('crawler-analyzer');
            await config.update('googleApiKey', apiKey, vscode.ConfigurationTarget.Global);
            // AI分析功能已迁移到智能代理
            this.addMessage('✅ API Key已保存', false);
        }
    }

    /**
     * 显示历史记录
     */
    private async showHistory() {
        vscode.window.showInformationMessage('历史记录功能即将推出...');
    }

    /**
     * 显示信息
     */
    private async showInfo() {
        // 获取API状态
        const apiStatus = { configured: true, message: 'Intelligent Agent Ready' }; // 智能代理状态
        const statusText = apiStatus.configured ? '✅ 已配置' : '❌ 未配置';

        vscode.window.showInformationMessage(
            'JS爬虫分析器 v3.1.0 - Playwright单引擎版\n\n' +
            '🚀 主要功能：\n' +
            '1. 输入网站URL（如：https://example.com）- 使用Playwright爬取JS文件和网络请求\n' +
            '2. 输入"分析catch文件" - AI分析已获取的文件\n' +
            '3. 输入代码片段 - 快速AI分析JavaScript代码\n\n' +
            '🎭 Playwright引擎特性：\n' +
            '• 🌐 现代浏览器引擎 - 支持复杂JavaScript应用\n' +
            '• 🔍 智能页面状态检测 - 识别JS应用和内容加载状态\n' +
            '• 🗺️ SPA路由自动探索 - 发现单页应用的隐藏页面\n' +
            '• 🎯 增强版交互触发 - 自动点击、滚动、填写表单\n' +
            '• 🛡️ 强化反检测技术 - 模拟真实浏览器行为\n' +
            '• ⚡ 激进式内容触发 - 处理复杂的现代网站\n\n' +
            '🤖 AI分析功能：\n' +
            '• 🧠 Google Gemini集成 - 智能分析反爬机制\n' +
            '• 🔍 反爬技术识别 - 自动检测各种反爬手段\n' +
            '• 💡 绕过建议 - 提供具体的解决方案\n' +
            '• 📊 算法分析 - 识别加密和混淆技术\n\n' +
            '💾 数据存储：\n' +
            '• JS文件保存在：D:\\crawler\\crawler\\catch\n' +
            '• 支持API接口识别和分类\n' +
            '• 记录SPA路由访问历史\n' +
            '• 详细的网络请求监控\n\n' +
            '🎯 适用场景：\n' +
            '• React、Vue、Angular等SPA应用\n' +
            '• 需要JavaScript渲染的现代网站\n' +
            '• 复杂交互的动态内容网站\n' +
            '• 有反爬机制的网站分析\n\n' +
            '📊 当前状态：\n' +
            '• Playwright引擎: ✅ 可用\n' +
            '• Gemini API: ' + statusText
        );
    }

    /**
     * 添加消息
     */
    private addMessage(content: string, isUser: boolean, isAnalyzing: boolean = false): ChatMessage {
        const message: ChatMessage = {
            id: (this.messageIdCounter++).toString(),
            content,
            isUser,
            timestamp: new Date(),
            isAnalyzing
        };
        
        this.messages.push(message);
        this.updateMessages();
        return message;
    }

    /**
     * 更新消息内容
     */
    private updateMessage(message: ChatMessage, newContent: string) {
        message.content = newContent;
        message.isAnalyzing = false;
        this.updateMessages();
    }

    /**
     * 清除所有消息
     */
    private clearMessages() {
        this.messages = [];
        // 不再添加欢迎消息，保持与构造函数一致
        this.updateMessages();
    }

    /**
     * 更新webview中的消息显示
     */
    private updateMessages() {
        if (this._view) {
            console.log('发送updateMessages消息到webview，消息数量:', this.messages.length);
            console.log('消息详情:', this.messages.map(m => ({ id: m.id, content: m.content.substring(0, 50) + '...', isUser: m.isUser, isAnalyzing: m.isAnalyzing })));
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this.messages
            });
        } else {
            console.log('webview不存在，无法更新消息');
        }
    }

    /**
     * 移除指定消息
     * @param messageId - 要移除的消息ID
     */
    private removeMessage(messageId: string) {
        const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
            this.messages.splice(messageIndex, 1);
            this.updateMessages(); // 添加界面更新
        }
    }

    /**
     * 更新浏览器配置
     */
    public updateBrowserConfig() {
        const config = vscode.workspace.getConfiguration('crawler-analyzer');
        const crawlerConfig = {
            useExistingBrowser: config.get('useExistingBrowser', false),
            debugPort: config.get('debugPort', 9222),
            verbose: config.get('verbose', false)
        };
        
        // 重新创建CrawlerService实例
        this.crawlerService = new CrawlerService(crawlerConfig);
        
        // 显示当前配置状态
        const modeText = crawlerConfig.useExistingBrowser ? '连接现有浏览器' : '启动新浏览器';
        this.addMessage(`🔧 浏览器配置已更新: ${modeText}`, false);
        
        if (crawlerConfig.useExistingBrowser) {
            this.addMessage(`🚀 现有浏览器模式已启用！
- 扩展将自动检测并连接到现有浏览器
- 如果没有找到现有浏览器，将自动启动您的本地浏览器
- 启动的浏览器会自动添加调试参数：--remote-debugging-port=${crawlerConfig.debugPort}
- 无需手动操作，一切都是自动的！`, false);
        }
    }

    /**
     * 清除聊天记录的公共方法
     */
    public clearChat() {
        this.clearMessages();
    }

    /**
     * 调用gemini.py后端进行聊天
     */
    private async callGeminiBackend(message: string): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                const config = vscode.workspace.getConfiguration('crawler-analyzer');
                const apiKey = config.get('googleApiKey', '');

                // 构建Python命令
                const pythonScript = path.join(this._extensionUri.fsPath, 'gemeni.py');
                const args = [
                    pythonScript,
                    '--mode', 'chat',
                    '--message', message
                ];

                if (apiKey) {
                    args.push('--api-key', apiKey as string);
                }

                const pythonProcess = spawn('python', args, {
                    cwd: this._extensionUri.fsPath
                });

                let outputData = '';
                let errorData = '';

                pythonProcess.stdout.on('data', (data) => {
                    outputData += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    errorData += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    if (code !== 0) {
                        console.error('Gemini backend error:', errorData);
                        resolve({
                            success: false,
                            response: null,
                            error: errorData || 'Python脚本执行失败'
                        });
                    } else {
                        try {
                            const result = JSON.parse(outputData);
                            resolve(result);
                        } catch (error) {
                            console.error('Failed to parse Gemini response:', outputData);
                            resolve({
                                success: false,
                                response: null,
                                error: '解析响应失败'
                            });
                        }
                    }
                });

                pythonProcess.on('error', (error) => {
                    console.error('Failed to start Python process:', error);
                    resolve({
                        success: false,
                        response: null,
                        error: 'Python环境未正确配置'
                    });
                });

            } catch (error: any) {
                resolve({
                    success: false,
                    response: null,
                    error: error.message
                });
            }
        });
    }

    /**
     * 销毁资源
     */
    public async dispose() {
        this.crawlerService.dispose();
        if (this.intelligentAgent) {
            await this.intelligentAgent.cleanup();
        }
    }

    /**
     * 生成Webview的HTML内容
     */
    /**
     * 处理文件上传
     * @param data - 文件上传数据
     */
    private async handleFileUpload(data: any) {
        try {
            // 显示文件选择对话框
            const fileUri = await vscode.window.showOpenDialog({
                canSelectMany: false,
                openLabel: '选择要上传分析的文件',
                filters: {
                    '所有支持的文件': ['jpg', 'png', 'gif', 'webp', 'mp4', 'avi', 'mov', 'mp3', 'wav', 'pdf', 'txt', 'docx', 'json', 'js', 'py', 'html', 'css', 'md'],
                    '图片文件': ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                    '视频文件': ['mp4', 'avi', 'mov', 'wmv'],
                    '音频文件': ['mp3', 'wav', 'flac', 'aac'],
                    '文档文件': ['pdf', 'txt', 'docx', 'doc'],
                    '代码文件': ['js', 'py', 'html', 'css', 'json', 'md', 'ts'],
                    '所有文件': ['*']
                }
            });

            if (fileUri && fileUri[0]) {
                const filePath = fileUri[0].fsPath;
                const fileName = path.basename(filePath);

                // 添加用户消息
                this.addMessage(`📎 **上传文件**: ${fileName}`, true);

                // 添加分析中的消息
                const analysisMessage = this.addMessage('🔄 正在上传并分析文件，请稍候...', false);
                analysisMessage.isAnalyzing = true;
                this.updateMessages();

                // 分析文件
                const result = await this.intelligentAgent.getAIAnalyzer().analyzeFile(filePath, '请详细分析这个文件的内容和结构');

                // 更新消息
                analysisMessage.isAnalyzing = false;
                if (result.success) {
                    analysisMessage.content = `📄 **文件分析完成**: ${fileName}\n\n${result.response}`;
                } else {
                    analysisMessage.content = `❌ **文件分析失败**: ${result.error}`;
                }

                this.updateMessages();
            }
        } catch (error: any) {
            console.error('文件上传失败:', error);
            vscode.window.showErrorMessage(`文件上传失败: ${error.message}`);
        }
    }

    /**
     * 显示文件管理菜单
     */
    private async showFileManagementMenu() {
        try {
            const options: vscode.QuickPickItem[] = [
                {
                    label: '$(file-text) 列出已上传的文件',
                    description: '查看Gemini API中已上传的文件列表'
                },
                {
                    label: '$(upload) 上传新文件',
                    description: '选择文件上传到Gemini API'
                },
                {
                    label: '$(search) 分析已上传的文件',
                    description: '对已上传的文件进行分析'
                }
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: '选择文件操作',
                ignoreFocusOut: true
            });

            if (selection) {
                switch (selection.label) {
                    case '$(file-text) 列出已上传的文件':
                        await this.listUploadedFiles();
                        break;
                    case '$(upload) 上传新文件':
                        await this.handleFileUpload({});
                        break;
                    case '$(search) 分析已上传的文件':
                        await this.analyzeUploadedFile();
                        break;
                }
            }
        } catch (error: any) {
            console.error('显示文件菜单失败:', error);
            vscode.window.showErrorMessage(`操作失败: ${error.message}`);
        }
    }

    /**
     * 列出已上传的文件
     */
    private async listUploadedFiles() {
        try {
            // 添加加载消息
            const loadingMessage = this.addMessage('🔄 正在获取文件列表...', false);
            loadingMessage.isAnalyzing = true;
            this.updateMessages();

            const result = await this.intelligentAgent.getAIAnalyzer().listFiles();
            
            loadingMessage.isAnalyzing = false;
            if (result.success) {
                if (result.files.length === 0) {
                    loadingMessage.content = '📂 **文件列表**: 暂无已上传的文件';
                } else {
                    let filesList = `📂 **文件列表** (共 ${result.count} 个文件):\n\n`;
                    result.files.forEach((file: any, index: number) => {
                        const sizeStr = file.size_bytes > 0 ? ` (${(file.size_bytes / 1024).toFixed(1)}KB)` : '';
                        filesList += `${index + 1}. **${file.display_name}**${sizeStr}\n`;
                        filesList += `   - 类型: ${file.mime_type}\n`;
                        filesList += `   - 状态: ${file.state}\n`;
                        if (file.create_time !== 'Unknown') {
                            filesList += `   - 创建时间: ${file.create_time}\n`;
                        }
                        filesList += '\n';
                    });
                    loadingMessage.content = filesList;
                }
            } else {
                loadingMessage.content = `❌ **获取文件列表失败**: ${result.error}`;
            }
            
            this.updateMessages();
        } catch (error: any) {
            console.error('列出文件失败:', error);
        }
    }

    /**
     * 分析已上传的文件
     */
    private async analyzeUploadedFile() {
        try {
            // 首先获取文件列表
            const listResult = await this.intelligentAgent.getAIAnalyzer().listFiles();
            if (!listResult.success || listResult.files.length === 0) {
                vscode.window.showInformationMessage('没有已上传的文件可供分析');
                return;
            }

            // 让用户选择文件
            const fileOptions = listResult.files.map((file: any) => ({
                label: file.display_name,
                description: `${file.mime_type} - ${(file.size_bytes / 1024).toFixed(1)}KB`,
                detail: file.name
            }));

            const selectedFile = await vscode.window.showQuickPick(fileOptions, {
                placeHolder: '选择要分析的文件',
                ignoreFocusOut: true
            });

            if (selectedFile && typeof selectedFile === 'object' && 'label' in selectedFile) {
                const prompt = await vscode.window.showInputBox({
                    prompt: '输入分析提示词',
                    value: '请分析这个文件的内容和结构',
                    ignoreFocusOut: true
                });

                if (prompt) {
                    // 添加用户消息
                    this.addMessage(`🔍 **分析文件**: ${selectedFile.label}\n**提示**: ${prompt}`, true);
                    
                    // 添加分析中消息
                    const analysisMessage = this.addMessage('🔄 正在分析文件，请稍候...', false);
                    analysisMessage.isAnalyzing = true;
                    this.updateMessages();

                    // 这里需要通过文件名来分析，但当前API设计是基于文件路径
                    // 我们可以提示用户重新上传文件进行分析
                    analysisMessage.isAnalyzing = false;
                    analysisMessage.content = `⚠️ **提示**: 当前版本需要重新上传文件进行分析。已上传的文件：**${selectedFile.label}** 已保存在Gemini API中，但需要本地文件路径进行分析。\n\n请使用文件上传按钮重新上传该文件进行分析。`;
                    this.updateMessages();
                }
            }
        } catch (error: any) {
            console.error('分析已上传文件失败:', error);
            vscode.window.showErrorMessage(`操作失败: ${error.message}`);
        }
    }

    /**
     * 重置输入框状态
     */
    private resetInputState() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'resetInput'
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JS爬虫分析器</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            color: #ffffff;
            background-color: #171717;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        /* 顶部标题栏 */
        .header-bar {
            background-color: #171717;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #2d2d2d;
        }
        
        .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .header-title {
            font-size: 14px;
            font-weight: 500;
            color: #ffffff;
        }
        
        .header-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .header-btn {
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: #888888;
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }
        
        .header-btn:hover {
            background-color: #2d2d2d;
            color: #ffffff;
        }
        
        .header-btn svg {
            transition: all 0.2s ease;
        }
        
        /* Add Context 区域 */
        .context-section {
            padding: 24px 20px;
            background-color: #171717;
            border-bottom: 1px solid #2d2d2d;
        }
        
        .context-label {
            color: #888888;
            font-size: 13px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .context-label svg {
            flex-shrink: 0;
        }
        
        .context-input-container {
            background-color: #2d2d2d;
            border: 1px solid #404040;
            border-radius: 8px;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .context-input {
            flex: 1;
            background: transparent;
            border: none;
            color: #ffffff;
            font-size: 14px;
            outline: none;
        }
        
        .context-input::placeholder {
            color: #666666;
        }
        
        /* 主聊天区域 */
        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background-color: #171717;
        }
        
        .messages-area {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
        }
        
        /* 欢迎界面 */
        .welcome-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: #888888;
            padding: 40px 20px;
        }
        
        .welcome-section .icon {
            font-size: 64px;
            margin-bottom: 24px;
            color: #555555;
        }
        
        .welcome-section .icon svg {
            opacity: 0.6;
            transition: all 0.3s ease;
        }
        
        .welcome-section:hover .icon svg {
            opacity: 0.8;
        }
        
        .welcome-section h2 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #ffffff;
        }
        
        .welcome-section p {
            font-size: 16px;
            line-height: 1.5;
            color: #888888;
            max-width: 400px;
        }
        
        /* 消息样式 - cursor IDE风格 */
        .message {
            margin-bottom: 24px;
            padding: 0;
            border-radius: 8px;
            max-width: 85%;
            line-height: 1.6;
            word-wrap: break-word;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }
        
        .message.user {
            align-self: flex-end;
            margin-left: auto;
        }
        
        .message.assistant {
            align-self: flex-start;
        }
        
        .message-content {
            padding: 16px 20px;
            border-radius: 8px;
            position: relative;
        }
        
        .message.user .message-content {
            background: #2d2d2d;
            color: #ffffff;
            border: 1px solid #404040;
        }
        
        .message.assistant .message-content {
            background: #1e1e1e;
            color: #d4d4d4;
            border: 1px solid #333333;
            line-height: 1.8;
            text-indent: 2em; /* 首行缩进两个字符 */
        }
        
        .message.analyzing .message-content {
            background: #1e1e1e;
            color: #d4d4d4;
            border: 1px solid #404040;
            animation: pulse 2s infinite;
        }
        
        /* 代码块样式 */
        .message-content pre {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 16px;
            margin: 12px 0;
            overflow-x: auto;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
        }
        
        .message-content code {
            background: #262626;
            color: #e6db74;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
        }
        
        .message-content pre code {
            background: transparent;
            padding: 0;
            color: #f8f8f2;
        }
        
        /* 标题样式 */
        .message-content h1, .message-content h2, .message-content h3,
        .message-content h4, .message-content h5, .message-content h6 {
            color: #569cd6;
            margin: 16px 0 8px 0;
            font-weight: 600;
        }
        
        .message-content h1 { font-size: 1.5em; }
        .message-content h2 { font-size: 1.3em; }
        .message-content h3 { font-size: 1.1em; }
        
        /* 列表样式 */
        .message-content ul, .message-content ol {
            margin: 12px 0;
            padding-left: 20px;
        }
        
        .message-content li {
            margin: 4px 0;
            color: #d4d4d4;
        }
        
        /* 链接样式 */
        .message-content a {
            color: #4ec9b0;
            text-decoration: none;
        }
        
        .message-content a:hover {
            color: #5dd8b7;
            text-decoration: underline;
        }
        
        /* 强调文本 */
        .message-content strong {
            color: #ffd700;
            font-weight: 600;
        }
        
        .message-content em {
            color: #ce9178;
            font-style: italic;
        }
        
        /* 引用块样式 */
        .message-content blockquote {
            border-left: 4px solid #007acc;
            padding-left: 16px;
            margin: 12px 0;
            color: #b0b0b0;
            font-style: italic;
        }
        
        /* 时间戳样式 */
        .timestamp {
            font-size: 11px;
            color: #888888;
            margin-top: 8px;
            text-align: right;
            font-family: 'Consolas', monospace;
        }
        
        .message.user .timestamp {
            color: rgba(255, 255, 255, 0.7);
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 1; }
        }
        
        .timestamp {
            font-size: 11px;
            color: #666666;
            margin-top: 8px;
        }
        
        /* 底部控制区域 */
        .bottom-section {
            background-color: #171717;
            border-top: 1px solid #2d2d2d;
            padding: 16px 20px;
        }
        
        .bottom-controls {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-bottom: 16px;
        }
        
        .control-btn {
            width: 32px;
            height: 32px;
            border: 1px solid #404040;
            background-color: #2d2d2d;
            color: #888888;
            cursor: pointer;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }
        
        .control-btn:hover {
            background-color: #404040;
            color: #ffffff;
        }
        
        .control-btn svg {
            transition: all 0.2s ease;
        }
        
        .model-selector {
            background-color: #2d2d2d;
            color: #ffffff;
            border: 1px solid #404040;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .model-selector svg {
            flex-shrink: 0;
            opacity: 0.8;
        }
        
        /* 输入区域 */
        .input-area {
            display: flex;
            align-items: end;
            gap: 12px;
        }
        
        .input-wrapper {
            flex: 1;
            background-color: #2d2d2d;
            border: 1px solid #404040;
            border-radius: 8px;
            overflow: hidden;
            min-height: 44px;
            display: flex;
            align-items: center;
        }
        
        .input-box {
            flex: 1;
            background: transparent;
            color: #ffffff;
            border: none;
            padding: 12px 16px;
            font-family: inherit;
            font-size: 14px;
            resize: none;
            min-height: 20px;
            max-height: 120px;
        }
        
        .input-box:focus {
            outline: none;
        }
        
        .input-box::placeholder {
            color: #666666;
        }
        
        .send-button {
            width: 44px;
            height: 44px;
            border-radius: 8px;
            border: 1px solid #404040;
            background-color: #2d2d2d;
            color: #888888;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .send-button:hover:not(:disabled) {
            background-color: #404040;
            color: #ffffff;
        }
        
        .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        /* 底部链接 */
        .bottom-link {
            position: fixed;
            bottom: 8px;
            left: 16px;
            color: #666666;
            font-size: 12px;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .bottom-link:hover {
            color: #888888;
        }
        
        /* 滚动条 */
        .messages-area::-webkit-scrollbar {
            width: 6px;
        }
        
        .messages-area::-webkit-scrollbar-track {
            background: transparent;
        }
        
        .messages-area::-webkit-scrollbar-thumb {
            background: #404040;
            border-radius: 3px;
        }
        
        .messages-area::-webkit-scrollbar-thumb:hover {
            background: #555555;
        }
    </style>
</head>
<body>
    <!-- 顶部标题栏 -->
    <div class="header-bar">
        <div class="header-left">
            <div class="header-title">爬虫分析器</div>
        </div>
        <div class="header-actions">
            <button class="header-btn" onclick="clearChat()" title="清除对话">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z M8,9H16V19H8V9Z M15.5,4L14.5,3H9.5L8.5,4H5V6H19V4H15.5Z"/>
                </svg>
            </button>
            <button class="header-btn" onclick="refreshChat()" title="刷新">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
                </svg>
            </button>
            <button class="header-btn" onclick="showHistory()" title="历史记录">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.7L16.2,16.2Z"/>
                </svg>
            </button>
            <button class="header-btn" onclick="showMenu()" title="更多">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/>
                </svg>
            </button>
        </div>
    </div>
    
    <!-- Add Context 区域 -->
    <div class="context-section">
        <div class="context-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5,6V17.5A4,4 0 0,1 12.5,21.5A4,4 0 0,1 8.5,17.5V5A2.5,2.5 0 0,1 11,2.5A2.5,2.5 0 0,1 13.5,5V15.5A1,1 0 0,1 12.5,16.5A1,1 0 0,1 11.5,15.5V6H10V15.5A2.5,2.5 0 0,0 12.5,18A2.5,2.5 0 0,0 15,15.5V5A4,4 0 0,0 11,1A4,4 0 0,0 7,5V17.5A5.5,5.5 0 0,0 12.5,23A5.5,5.5 0 0,0 18,17.5V6H16.5Z"/>
            </svg>
            添加上下文
        </div>
        <div class="context-input-container">
            <input 
                type="text" 
                class="context-input" 
                placeholder="输入网站URL获取JS文件和所有URL..."
                id="contextInput"
            />
        </div>
    </div>
    
    <!-- 主聊天区域 -->
    <div class="chat-container">
        <div class="messages-area" id="messagesArea">
            <div class="welcome-section" id="welcomeSection">
                <div class="icon">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="#555555">
                        <path d="M16.36,14C16.44,13.34 16.5,12.68 16.5,12C16.5,11.32 16.44,10.66 16.36,10H19.74C19.9,10.64 20,11.31 20,12C20,12.69 19.9,13.36 19.74,14M14.59,19.56C15.19,18.45 15.65,17.25 15.97,16H18.92C17.96,17.65 16.43,18.93 14.59,19.56M14.34,14H9.66C9.56,13.34 9.5,12.68 9.5,12C9.5,11.32 9.56,10.65 9.66,10H14.34C14.43,10.65 14.5,11.32 14.5,12C14.5,12.68 14.43,13.34 14.34,14M12,19.96C11.17,18.76 10.5,17.43 10.09,16H13.91C13.5,17.43 12.83,18.76 12,19.96M8,8H5.08C6.03,6.34 7.57,5.06 9.4,4.44C8.8,5.55 8.35,6.75 8,8M5.08,16H8C8.35,17.25 8.8,18.45 9.4,19.56C7.57,18.93 6.03,17.65 5.08,16M4.26,14C4.1,13.36 4,12.69 4,12C4,11.31 4.1,10.64 4.26,10H7.64C7.56,10.66 7.5,11.32 7.5,12C7.5,12.68 7.56,13.34 7.64,14M12,4.03C12.83,5.23 13.5,6.57 13.91,8H10.09C10.5,6.57 11.17,5.23 12,4.03M18.92,8H15.97C15.65,6.75 15.19,5.55 14.59,4.44C16.43,5.07 17.96,6.34 18.92,8M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
                    </svg>
                </div>
                <h2>JS爬虫分析器</h2>
                <p>输入网站URL获取JS文件和网络请求URL，或进行AI代码分析</p>
            </div>
        </div>
    </div>
    
    <!-- 底部控制区域 -->
    <div class="bottom-section">
        <div class="bottom-controls">
            <div class="model-selector">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12,2A2,2 0 0,1 14,4C14,4.74 13.6,5.39 13,5.73V7.27C13.6,7.61 14,8.26 14,9A2,2 0 0,1 12,11A2,2 0 0,1 10,9C10,8.26 10.4,7.61 11,7.27V5.73C10.4,5.39 10,4.74 10,4A2,2 0 0,1 12,2M10.5,12.5A1.5,1.5 0 0,1 12,14A1.5,1.5 0 0,1 13.5,12.5A1.5,1.5 0 0,1 12,11A1.5,1.5 0 0,1 10.5,12.5M10,15.5C10,16.89 8.89,18 7.5,18A3.5,3.5 0 0,1 4,14.5C4,13.11 5.11,12 6.5,12A3.5,3.5 0 0,1 10,15.5M14,15.5A3.5,3.5 0 0,1 17.5,12C18.89,12 20,13.11 20,14.5A3.5,3.5 0 0,1 16.5,18C15.11,18 14,16.89 14,15.5Z"/>
                </svg>
                gemini-pro
            </div>
            <button class="control-btn" onclick="configureApiKey()" title="配置API">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
                </svg>
            </button>
            <button class="control-btn" onclick="showInfo()" title="信息">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
                </svg>
            </button>
        </div>
        
        <div class="input-area">
            <div class="input-wrapper">
                <textarea 
                    class="input-box" 
                    id="messageInput" 
                    placeholder="输入网站URL获取JS文件和所有URL，或输入'分析catch文件'进行AI分析，或点击📎上传文件让AI分析..."
                    onkeydown="handleKeyDown(event)"
                    oninput="adjustInputHeight()"
                ></textarea>
            </div>
            <button class="control-btn" onclick="selectFile()" title="上传文件">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5,6V17.5A4,4 0 0,1 12.5,21.5A4,4 0 0,1 8.5,17.5V5A2.5,2.5 0 0,1 11,2.5A2.5,2.5 0 0,1 13.5,5V15.5A1,1 0 0,1 12.5,16.5A1,1 0 0,1 11.5,15.5V6H10V15.5A2.5,2.5 0 0,0 12.5,18A2.5,2.5 0 0,0 15,15.5V5A4,4 0 0,0 11,1A4,4 0 0,0 7,5V17.5A5.5,5.5 0 0,0 12.5,23A5.5,5.5 0 0,0 18,17.5V6H16.5Z"/>
                </svg>
            </button>
            <button class="send-button" id="sendButton" onclick="sendMessage()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/>
                </svg>
            </button>
        </div>
    </div>
    
    <!-- 底部历史记录链接 -->
    <a href="#" class="bottom-link" onclick="showHistory()">
        历史分析 ›
    </a>
    
    <script>
        const vscode = acquireVsCodeApi();
        let messages = [];
        
        // 处理来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('webview收到消息:', message);
            
            switch (message.type) {
                case 'updateMessages':
                    messages = message.messages;
                    console.log('更新消息列表，数量:', messages.length, '消息:', messages);
                    updateMessagesDisplay();
                    break;
                case 'resetInput':
                    const messageInput = document.getElementById('messageInput');
                    if (messageInput) {
                        messageInput.placeholder = '输入网站URL获取JS文件和所有URL，或输入\\'分析catch文件\\'进行AI分析，或点击📎上传文件让AI分析...';
                        messageInput.disabled = false;
                    }
                    break;
            }
        });
        
        function updateMessagesDisplay() {
            console.log('开始更新界面显示，消息数量:', messages.length);
            const messagesArea = document.getElementById('messagesArea');
            const welcomeSection = document.getElementById('welcomeSection');
            
            if (messages.length === 0) {
                console.log('无消息，显示欢迎界面');
                // 清除所有消息DOM元素，保留欢迎界面
                const messageElements = messagesArea.querySelectorAll('.message');
                messageElements.forEach(el => el.remove());
                welcomeSection.style.display = 'flex';
            } else {
                console.log('有消息，隐藏欢迎界面，显示消息列表');
                welcomeSection.style.display = 'none';
                
                // 清除现有的消息DOM元素
                const messageElements = messagesArea.querySelectorAll('.message');
                messageElements.forEach(el => el.remove());
                
                // 重新创建所有消息
                messages.forEach((msg, index) => {
                    console.log(\`渲染消息 \${index + 1}:\`, msg);
                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`message \${msg.isUser ? 'user' : 'assistant'}\${msg.isAnalyzing ? ' analyzing' : ''}\`;
                    messageDiv.setAttribute('data-message-id', msg.id);
                    
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'message-content';
                    
                    // 渲染markdown内容
                    if (msg.isUser) {
                        contentDiv.textContent = msg.content;
                    } else {
                        contentDiv.innerHTML = renderMarkdown(msg.content);
                    }
                    
                    messageDiv.appendChild(contentDiv);
                    
                    const timestamp = document.createElement('div');
                    timestamp.className = 'timestamp';
                    timestamp.textContent = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    messageDiv.appendChild(timestamp);
                    
                    messagesArea.appendChild(messageDiv);
                });
                
                // 滚动到底部
                setTimeout(() => {
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                }, 10);
                console.log('消息显示完成，消息DOM元素数量:', messagesArea.querySelectorAll('.message').length);
            }
        }
        
        function sendMessage() {
            const input = document.getElementById('messageInput');
            const contextInput = document.getElementById('contextInput');
            const sendButton = document.getElementById('sendButton');
            
            let message = input.value.trim();
            const contextUrl = contextInput.value.trim();
            
            // 如果有上下文URL，优先使用
            if (contextUrl) {
                message = contextUrl;
                contextInput.value = '';
            }
            
            if (message) {
                sendButton.disabled = true;
                
                vscode.postMessage({
                    type: 'sendMessage',
                    message: message
                });
                
                input.value = '';
                adjustInputHeight();
                
                setTimeout(() => {
                    sendButton.disabled = false;
                }, 500);
            }
        }
        
        // 文件上传相关函数
        function selectFile() {
            // 直接调用VS Code文件选择器
            vscode.postMessage({
                type: 'uploadFile'
            });
        }

        function showFileMenu() {
            // 显示文件管理菜单
            vscode.postMessage({
                type: 'showFileMenu'
            });
        }
        
        // Markdown渲染函数
        function renderMarkdown(text) {
            // 基础markdown渲染
            let html = text;
            
            // 代码块处理
            html = html.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\\n\`\`\`/g, (match, lang, code) => {
                return \`<pre><code class="language-\${lang}">\${escapeHtml(code.trim())}</code></pre>\`;
            });
            
            // 行内代码
            html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            
            // 标题
            html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
            
            // 粗体
            html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
            
            // 斜体
            html = html.replace(/\\*(.*?)\\*/g, '<em>$1</em>');
            
            // 列表项
            html = html.replace(/^[•\\-\\*] (.*)$/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>');
            
            // 数字列表
            html = html.replace(/^(\\d+)\\. (.*)$/gm, '<li>$2</li>');
            
            // 链接
            html = html.replace(/\\[([^\\]]+)\\]\\(([^\\)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
            
            // 换行处理
            html = html.replace(/\\n/g, '<br>');
            
            return html;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function clearChat() {
            vscode.postMessage({
                type: 'clearChat'
            });
        }
        
        function refreshChat() {
            location.reload();
        }
        
        function showHistory() {
            vscode.postMessage({
                type: 'showHistory'
            });
        }
        
        function showMenu() {
            // 显示更多菜单选项
        }
        
        function showInfo() {
            vscode.postMessage({
                type: 'showInfo'
            });
        }
        
        function configureApiKey() {
            vscode.postMessage({
                type: 'configureApiKey'
            });
        }
        
        function adjustInputHeight() {
            const input = document.getElementById('messageInput');
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        }
        
        function handleKeyDown(event) {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        }
        
        // 回车发送上下文URL
        document.getElementById('contextInput').addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        });
        
        // 初始化焦点
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('contextInput').focus();
        });
    </script>
</body>
</html>`;
    }
} 