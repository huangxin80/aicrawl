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
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * 增强版JS爬虫分析器 - VS Code扩展主入口文件
 * 集成浏览器控制、网络监控、语义搜索等功能
 */
const vscode = __importStar(require("vscode"));
const CrawlerChatView_1 = require("./webview/CrawlerChatView");
const EnhancedCrawlerService_1 = require("./services/EnhancedCrawlerService");
const BrowserController_1 = require("./services/BrowserController");
/**
 * 插件激活时调用
 * @param context - VS Code扩展上下文
 */
function activate(context) {
    console.log('增强版JS爬虫分析器插件已激活!');
    // 初始化增强服务
    const enhancedCrawlerService = new EnhancedCrawlerService_1.EnhancedCrawlerService(context.extensionUri);
    const browserController = new BrowserController_1.BrowserController(context.extensionUri);
    /**
     * 创建聊天视图提供程序
     */
    const chatViewProvider = new CrawlerChatView_1.CrawlerChatViewProvider(context.extensionUri);
    /**
     * 注册聊天视图
     */
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(CrawlerChatView_1.CrawlerChatViewProvider.viewType, chatViewProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        }
    }));
    /**
     * 注册清除聊天命令
     */
    const clearChatCommand = vscode.commands.registerCommand('crawler-analyzer.clearChat', () => {
        chatViewProvider.clearChat();
    });
    /**
     * 注册浏览器控制命令
     */
    const showBrowserTabsCommand = vscode.commands.registerCommand('crawler-analyzer.showBrowserTabs', async () => {
        try {
            await browserController.initialize();
            const browserState = await browserController.getWindowsAndTabs();
            const message = `🌐 浏览器状态：\n窗口数：${browserState.windowCount}\n标签页数：${browserState.tabCount}\n\n窗口详情：\n${browserState.windows.map(window => `窗口 ${window.windowId}:\n${window.tabs.map(tab => `  - ${tab.title} (${tab.url})`).join('\n')}`).join('\n\n')}`;
            vscode.window.showInformationMessage(message);
        }
        catch (error) {
            vscode.window.showErrorMessage(`获取浏览器信息失败: ${error}`);
        }
    });
    /**
     * 注册截图命令
     */
    const takeScreenshotCommand = vscode.commands.registerCommand('crawler-analyzer.takeScreenshot', async () => {
        try {
            await browserController.initialize();
            const screenshot = await browserController.screenshot({
                fullPage: true,
                format: 'png'
            });
            // 保存截图到工作区
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) {
                const workspaceUri = vscode.workspace.workspaceFolders[0].uri;
                const screenshotPath = vscode.Uri.joinPath(workspaceUri, `screenshot_${Date.now()}.png`);
                // 将base64转换为buffer并保存
                const buffer = Buffer.from(screenshot, 'base64');
                await vscode.workspace.fs.writeFile(screenshotPath, buffer);
                vscode.window.showInformationMessage(`截图已保存: ${screenshotPath.fsPath}`);
            }
            else {
                vscode.window.showWarningMessage('未找到工作区，无法保存截图');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`截图失败: ${error}`);
        }
    });
    /**
     * 注册增强分析命令
     */
    const enhancedAnalysisCommand = vscode.commands.registerCommand('crawler-analyzer.enhancedAnalysis', async () => {
        const url = await vscode.window.showInputBox({
            prompt: '输入要分析的网站URL',
            placeHolder: 'https://example.com'
        });
        if (!url) {
            return;
        }
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '正在进行增强分析...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: '初始化服务...' });
                await enhancedCrawlerService.initialize();
                progress.report({ message: '分析网站...' });
                const result = await enhancedCrawlerService.analyzeSite(url, {
                    analysisDepth: 'comprehensive',
                    includeScreenshots: true
                });
                progress.report({ message: '生成报告...' });
                const report = enhancedCrawlerService.exportAnalysisResult(result, 'markdown');
                // 创建并显示报告文档
                const doc = await vscode.workspace.openTextDocument({
                    content: report,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`增强分析失败: ${error}`);
        }
    });
    // 注册所有命令
    context.subscriptions.push(clearChatCommand, showBrowserTabsCommand, takeScreenshotCommand, enhancedAnalysisCommand);
    // 资源清理
    context.subscriptions.push({
        dispose: () => {
            enhancedCrawlerService.dispose();
            browserController.dispose();
        }
    });
}
/**
 * 插件停用时调用
 */
function deactivate() {
    console.log('JS爬虫分析器插件已停用');
}
//# sourceMappingURL=extension.js.map