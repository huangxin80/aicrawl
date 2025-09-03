"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlerChatViewProvider = void 0;
/**
 * 爬虫分析器聊天视图提供程序
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const CrawlerService_1 = require("../services/CrawlerService");
const AIAnalyzer_1 = require("../services/AIAnalyzer");
class CrawlerChatViewProvider {
    _extensionUri;
    static viewType = 'crawlerAnalyzerChat';
    _view;
    crawlerService;
    aiAnalyzer;
    messages = [];
    messageIdCounter = 0;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        this.crawlerService = new CrawlerService_1.CrawlerService();
        this.aiAnalyzer = new AIAnalyzer_1.AIAnalyzer(_extensionUri);
        // 添加欢迎消息 - 已注释掉用户不需要的提示组件
        // this.addMessage('👋 你好！我是JS爬虫分析器助手。\n\n发送一个网站URL，我会帮你分析其反爬机制。\n\n例如：https://example.com', false);
    }
    resolveWebviewView(webviewView, context, _token) {
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
            }
        });
        // 延迟初始化显示消息，确保webview完全加载
        setTimeout(() => {
            this.updateMessages();
            console.log('初始化消息显示完成');
        }, 100);
    }
    /**
     * 处理用户消息
     * @param message - 用户输入的消息
     */
    async handleUserMessage(message) {
        // 添加用户消息
        this.addMessage(message, true);
        // 添加"正在思考"的消息
        const thinkingMessage = this.addMessage('正在思考中...', false, true);
        try {
            // 检查是否是URL
            const urlPattern = /https?:\/\/[^\s]+/;
            const urlMatch = message.match(urlPattern);
            if (urlMatch && urlMatch[0] === message.trim()) {
                // 纯URL输入 - 同时获取JS文件和所有URL
                const url = urlMatch[0];
                await this.fetchFilesAndUrlsFromUrl(url);
                // 移除思考消息
                this.removeMessage(thinkingMessage.id);
            }
            else if (message.toLowerCase().includes('分析') && (message.toLowerCase().includes('catch') || message.toLowerCase().includes('文件'))) {
                // 分析catch文件夹中的文件
                await this.analyzeCatchFiles();
                // 移除思考消息
                this.removeMessage(thinkingMessage.id);
            }
            else {
                // 普通聊天模式 - 使用Python后端
                try {
                    console.log('开始调用Python后端...');
                    const aiResponse = await this.aiAnalyzer.chatWithPython(message);
                    console.log('Python后端返回响应:', aiResponse);
                    // 移除思考消息并添加AI回复（合并操作以避免竞态条件）
                    const messageIndex = this.messages.findIndex(msg => msg.id === thinkingMessage.id);
                    if (messageIndex !== -1) {
                        this.messages.splice(messageIndex, 1);
                        console.log('已移除思考消息');
                    }
                    // 添加AI回复
                    const aiMessage = {
                        id: (this.messageIdCounter++).toString(),
                        content: aiResponse,
                        isUser: false,
                        timestamp: new Date(),
                        isAnalyzing: false
                    };
                    this.messages.push(aiMessage);
                    console.log('已添加AI回复到界面，消息数量:', this.messages.length);
                    // 统一更新界面
                    this.updateMessages();
                    console.log('已更新界面显示');
                }
                catch (error) {
                    console.log('Python后端调用出错:', error);
                    // 移除思考消息并添加错误信息（合并操作）
                    const messageIndex = this.messages.findIndex(msg => msg.id === thinkingMessage.id);
                    if (messageIndex !== -1) {
                        this.messages.splice(messageIndex, 1);
                    }
                    const errorMessage = {
                        id: (this.messageIdCounter++).toString(),
                        content: `抱歉，聊天功能暂时不可用：${error.message}\n\n您可以：\n1. 输入网站URL获取JS文件\n2. 输入"分析catch文件"来分析已获取的文件`,
                        isUser: false,
                        timestamp: new Date(),
                        isAnalyzing: false
                    };
                    this.messages.push(errorMessage);
                    this.updateMessages();
                }
            }
        }
        catch (error) {
            // 移除思考消息
            this.removeMessage(thinkingMessage.id);
            // 显示通用错误信息
            this.addMessage(`处理消息时出现错误：${error.message}`, false);
        }
    }
    /**
     * 仅从URL获取文件并保存到catch文件夹
     * @param url - 要获取文件的网站URL
     */
    async fetchFilesFromUrl(url) {
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
            }
            else {
                fetchReport += `⚠️ 未获取到JavaScript文件\n`;
                fetchReport += `可能原因：\n`;
                fetchReport += `• 网站没有使用JavaScript\n`;
                fetchReport += `• 网站有访问限制\n`;
                fetchReport += `• URL不正确\n`;
            }
            this.updateMessage(fetchingMessage, fetchReport);
        }
        catch (error) {
            this.updateMessage(fetchingMessage, `❌ **文件获取失败**\n\n错误信息：${error.message}\n\n请检查：\n• 网络连接是否正常\n• URL是否正确且可访问`);
        }
    }
    /**
     * 从URL获取所有网络请求URL
     * @param url - 目标网站URL
     */
    async captureAllUrlsFromUrl(url) {
        // 添加获取中的消息
        const capturingMessage = this.addMessage('🌐 **正在获取所有URL...**\n\n使用Playwright访问网站并捕获所有网络请求URL', false, true);
        try {
            // 使用Playwright捕获所有URL
            this.updateMessage(capturingMessage, '🔍 **正在访问网站并监听网络请求...**\n' + url);
            const capturedUrls = await this.crawlerService.captureAllUrls(url);
            // 生成URL捕获报告
            const urlReport = this.generateUrlCaptureReport(url, capturedUrls);
            this.updateMessage(capturingMessage, urlReport);
        }
        catch (error) {
            this.updateMessage(capturingMessage, `❌ **URL获取失败**\n\n错误信息：${error.message}\n\n请检查：\n• 网络连接是否正常\n• URL是否正确且可访问`);
        }
    }
    /**
     * 从URL同时获取JavaScript文件和所有网络请求URL
     * @param url - 目标网站URL
     */
    async fetchFilesAndUrlsFromUrl(url) {
        // 添加获取中的消息
        const fetchingMessage = this.addMessage('📥 **正在获取JavaScript文件和所有URL...**\n\n使用智能双引擎系统（Playwright + DrissionPage）访问网站并同时捕获JS文件和网络请求URL', false, true);
        try {
            // 使用修改后的CrawlerService同时捕获JS文件和所有URL
            this.updateMessage(fetchingMessage, '🧠 **启动智能双引擎爬取...**\n' + url);
            // 调用智能双引擎爬取方法
            const result = await this.crawlerService.captureFilesAndUrls(url);
            const capturedFiles = result.files;
            const capturedUrls = result.urls;
            const visitedRoutes = result.routes || [];
            const usedEngine = result.engine || 'Unknown'; // 使用的引擎
            const pageState = result.pageState;
            // 生成智能双引擎报告
            let report = `✅ **智能双引擎爬取完成** - ${url}\n\n`;
            // 引擎使用信息
            const engineEmoji = usedEngine === 'Playwright' ? '🎭' : usedEngine === 'DrissionPage' ? '🐍' : '❓';
            report += `${engineEmoji} **使用引擎**: ${usedEngine}\n`;
            if (usedEngine === 'DrissionPage') {
                report += `💡 **引擎切换说明**: Playwright无法处理此网站，自动切换到DrissionPage引擎\n`;
            }
            report += '\n';
            // 页面状态部分
            if (pageState) {
                report += `🔍 **页面状态分析** (${usedEngine}引擎)\n`;
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
                visitedRoutes.forEach((route, index) => {
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
                capturedFiles.forEach((file, index) => {
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
                const jsUrls = capturedUrls.filter((u) => u.urlType === 'js');
                const cssUrls = capturedUrls.filter((u) => u.urlType === 'css');
                const imageUrls = capturedUrls.filter((u) => u.urlType === 'image');
                const apiUrls = capturedUrls.filter((u) => u.urlType === 'api' || u.isAPI);
                const otherUrls = capturedUrls.filter((u) => u.urlType === 'other');
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
                    importantApis.forEach((api, index) => {
                        const statusEmoji = api.status >= 200 && api.status < 300 ? '✅' : '❌';
                        report += `${index + 1}. ${statusEmoji} [${api.method}] ${api.url}\n`;
                        report += `   状态: ${api.status} ${api.statusText || ''}\n`;
                    });
                    report += '\n';
                }
                // 所有URL列表（前30个）
                report += `📋 **完整URL列表** (前30个)\n`;
                const displayUrls = capturedUrls.slice(0, 30);
                displayUrls.forEach((urlInfo, index) => {
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
            report += `\n🚀 **智能双引擎系统优势**: \n`;
            report += `• 🎭 **Plan A (Playwright)**: 强大的现代浏览器引擎，支持复杂JS应用和SPA路由\n`;
            report += `• 🐍 **Plan B (DrissionPage)**: 专业Python爬虫库，处理特殊网站和反检测\n`;
            report += `• 🧠 **智能切换**: 自动检测第一引擎失败，无缝切换到备用引擎\n`;
            report += `• 📊 **质量保证**: 双重保障确保爬取成功率，适应各种复杂网站\n`;
            report += `• JavaScript文件已保存到本地，您可以输入"分析catch文件"进行AI分析\n`;
            report += `• 包含 /api/、/v1/、/like、/comment 等路径的通常是API接口`;
            this.updateMessage(fetchingMessage, report);
        }
        catch (error) {
            this.updateMessage(fetchingMessage, `❌ **双引擎爬取失败**\n\n错误信息：${error.message}\n\n🔧 **可能的解决方案**：\n• 检查网络连接是否正常\n• 确认URL是否正确且可访问\n• 某些网站可能需要特殊处理，请稍后重试\n• 如持续失败，可能需要手动分析网站结构`);
        }
    }
    /**
     * 生成URL捕获报告
     * @param url - 目标网站URL
     * @param urls - 捕获的URL列表
     * @returns 格式化的报告
     */
    generateUrlCaptureReport(url, urls) {
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
        }
        else {
            report += `🔍 **API接口**\n⚠️ 未发现明显的API接口\n\n`;
        }
        // 按状态码分类
        const statusGroups = urls.reduce((groups, urlInfo) => {
            const status = Math.floor(urlInfo.status / 100) * 100;
            const key = status === 200 ? '2xx成功' :
                status === 300 ? '3xx重定向' :
                    status === 400 ? '4xx客户端错误' :
                        status === 500 ? '5xx服务器错误' : '其他';
            if (!groups[key])
                groups[key] = [];
            groups[key].push(urlInfo);
            return groups;
        }, {});
        report += `📈 **请求状态分析**\n`;
        Object.entries(statusGroups).forEach(([status, statusUrls]) => {
            const urlList = statusUrls;
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
    async analyzeCatchFiles() {
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
            const analysis = await this.aiAnalyzer.analyzeLocalJSFiles(localFiles);
            // 生成分析报告
            const analysisReport = this.generateCatchAnalysisReport(localFiles, analysis);
            this.updateMessage(analyzingMessage, analysisReport);
        }
        catch (error) {
            this.updateMessage(analyzingMessage, `❌ **分析失败**\n\n错误信息：${error.message}\n\n请检查：\n• catch文件夹是否有文件\n• API Key是否配置正确`);
        }
    }
    /**
     * 生成catch文件分析报告
     */
    generateCatchAnalysisReport(files, analysis) {
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
            analysis.antiCrawlerTechniques.forEach((tech, index) => {
                const severity = tech.severity === 'high' ? '🔴 高' : tech.severity === 'medium' ? '🟡 中' : '🟢 低';
                report += `\n${index + 1}. **${tech.name}** [${severity}]\n`;
                report += `   • 描述：${tech.description}\n`;
                report += `   • 位置：${tech.location}\n`;
                report += `   • 绕过方法：${tech.bypass}\n`;
            });
            report += '\n';
        }
        else {
            report += `🛡️ **反爬技术**\n✅ 未检测到明显的反爬虫机制\n\n`;
        }
        // 算法分析
        if (analysis.algorithms && analysis.algorithms.length > 0) {
            report += `🔐 **算法分析**\n`;
            analysis.algorithms.forEach((algo, index) => {
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
                analysis.crawlerStructure.apiEndpoints.forEach((endpoint) => {
                    report += `  - ${endpoint}\n`;
                });
            }
            report += '\n';
        }
        // 具体建议
        if (analysis.recommendations && analysis.recommendations.length > 0) {
            report += `💡 **实施建议**\n`;
            analysis.recommendations.forEach((rec, index) => {
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
    generateAnalysisReport(url, jsFiles, analysis) {
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
        }
        else {
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
            analysis.antiCrawlerTechniques.forEach((tech, index) => {
                const severity = tech.severity === 'high' ? '🔴' : tech.severity === 'medium' ? '🟡' : '🟢';
                report += `${index + 1}. ${severity} **${tech.name}**\n`;
                report += `   • 描述：${tech.description}\n`;
                report += `   • 位置：${tech.location}\n`;
                report += `   • 绕过方法：${tech.bypass}\n\n`;
            });
        }
        else {
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
            analysis.recommendations.forEach((rec, index) => {
                report += `${index + 1}. ${rec}\n`;
            });
        }
        return report;
    }
    /**
     * 配置API Key
     */
    async configureApiKey() {
        const apiKey = await vscode.window.showInputBox({
            prompt: '请输入Google Gemini API Key',
            password: true,
            placeHolder: 'your-api-key-here'
        });
        if (apiKey) {
            const config = vscode.workspace.getConfiguration('crawler-analyzer');
            await config.update('googleApiKey', apiKey, vscode.ConfigurationTarget.Global);
            this.aiAnalyzer.setApiKey(apiKey);
            this.addMessage('✅ API Key已保存', false);
        }
    }
    /**
     * 显示历史记录
     */
    async showHistory() {
        vscode.window.showInformationMessage('历史记录功能即将推出...');
    }
    /**
     * 显示信息
     */
    async showInfo() {
        // 获取引擎状态
        let engineStatus = '检测中...';
        try {
            const status = await this.crawlerService.getEngineStatus();
            const playwrightStatus = status.playwright ? '✅' : '❌';
            const drissionPageStatus = status.drissionPage ? '✅' : '❌';
            engineStatus = `🎭 Playwright: ${playwrightStatus} | 🐍 DrissionPage: ${drissionPageStatus}`;
        }
        catch (e) {
            engineStatus = '状态检测失败';
        }
        vscode.window.showInformationMessage('JS爬虫分析器 v3.0.0 - 智能双引擎版\n\n' +
            '🚀 主要功能：\n' +
            '1. 输入网站URL（如：https://example.com）- 智能双引擎爬取JS文件和网络请求\n' +
            '2. 输入"分析catch文件" - AI分析已获取的文件\n\n' +
            '🧠 智能双引擎架构：\n' +
            '• 🎭 Plan A (Playwright) - 现代浏览器引擎，支持复杂JS应用\n' +
            '• 🐍 Plan B (DrissionPage) - 专业Python爬虫，处理特殊网站\n' +
            '• 🔄 自动切换 - 第一引擎失败时自动使用备用引擎\n' +
            '• 📈 成功率提升 - 双重保障确保更高的爬取成功率\n\n' +
            '✨ 增强功能：\n' +
            '• 🔍 智能页面状态检测 - 识别JS应用和内容加载状态\n' +
            '• 🗺️ SPA路由自动探索 - 发现单页应用的隐藏页面\n' +
            '• 🎯 增强版交互触发 - 自动点击、滚动、填写表单\n' +
            '• 🛡️ 强化反检测技术 - 模拟真实浏览器行为\n' +
            '• ⚡ 激进式内容触发 - 处理复杂的现代网站\n' +
            '• 📊 详细页面诊断 - 提供问题分析和解决建议\n\n' +
            '💾 数据存储：\n' +
            '• JS文件保存在：D:\\crawler\\crawler\\catch\n' +
            '• 支持API接口识别和分类\n' +
            '• 记录SPA路由访问历史\n' +
            '• 引擎使用情况追踪\n\n' +
            '🎯 适用场景：\n' +
            '• React、Vue、Angular等SPA应用\n' +
            '• 需要JavaScript渲染的现代网站\n' +
            '• 复杂交互的动态内容网站\n' +
            '• 有反爬机制的网站分析\n' +
            '• Playwright无法处理的特殊网站\n\n' +
            '📊 当前引擎状态：\n' + engineStatus);
    }
    /**
     * 添加消息
     */
    addMessage(content, isUser, isAnalyzing = false) {
        const message = {
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
    updateMessage(message, newContent) {
        message.content = newContent;
        message.isAnalyzing = false;
        this.updateMessages();
    }
    /**
     * 清除所有消息
     */
    clearMessages() {
        this.messages = [];
        // 不再添加欢迎消息，保持与构造函数一致
        this.updateMessages();
    }
    /**
     * 更新webview中的消息显示
     */
    updateMessages() {
        if (this._view) {
            console.log('发送updateMessages消息到webview，消息数量:', this.messages.length);
            console.log('消息详情:', this.messages.map(m => ({ id: m.id, content: m.content.substring(0, 50) + '...', isUser: m.isUser, isAnalyzing: m.isAnalyzing })));
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this.messages
            });
        }
        else {
            console.log('webview不存在，无法更新消息');
        }
    }
    /**
     * 移除指定消息
     * @param messageId - 要移除的消息ID
     */
    removeMessage(messageId) {
        const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
            this.messages.splice(messageIndex, 1);
            this.updateMessages(); // 添加界面更新
        }
    }
    /**
     * 清除聊天记录的公共方法
     */
    clearChat() {
        this.clearMessages();
    }
    /**
     * 销毁资源
     */
    dispose() {
        this.crawlerService.dispose();
    }
    /**
     * 生成Webview的HTML内容
     */
    _getHtmlForWebview(webview) {
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
        
        /* 消息样式 */
        .message {
            margin-bottom: 16px;
            padding: 16px 20px;
            border-radius: 12px;
            max-width: 80%;
            line-height: 1.6;
            word-wrap: break-word;
            white-space: pre-wrap;
            font-size: 14px;
        }
        
        .message.user {
            background-color: #2d2d2d;
            color: #ffffff;
            align-self: flex-end;
            margin-left: auto;
            border: 1px solid #404040;
        }
        
        .message.assistant {
            background-color: #1a1a1a;
            color: #ffffff;
            align-self: flex-start;
            border: 1px solid #2d2d2d;
        }
        
        .message.analyzing {
            background-color: #1a1a1a;
            color: #ffffff;
            align-self: flex-start;
            border: 1px solid #404040;
            animation: pulse 2s infinite;
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
                placeholder="输入网站URL同时获取JS文件和所有URL..."
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
                <p>输入网站URL同时获取JS文件和所有网络请求URL</p>
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
                    placeholder="输入网站URL获取JS文件和所有URL，或输入'分析catch文件'进行AI分析..."
                    onkeydown="handleKeyDown(event)"
                    oninput="adjustInputHeight()"
                ></textarea>
            </div>
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
                    contentDiv.textContent = msg.content;
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
exports.CrawlerChatViewProvider = CrawlerChatViewProvider;
//# sourceMappingURL=CrawlerChatView.js.map