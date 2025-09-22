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
 * JS爬虫分析器 - VS Code扩展主入口文件
 */
const vscode = __importStar(require("vscode"));
const CrawlerChatView_1 = require("./webview/CrawlerChatView");
/**
 * 插件激活时调用
 * @param context - VS Code扩展上下文
 */
function activate(context) {
    console.log('JS爬虫分析器插件已激活!');
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
     * 注册切换浏览器模式命令
     */
    const toggleBrowserModeCommand = vscode.commands.registerCommand('crawler-analyzer.toggleBrowserMode', async () => {
        const config = vscode.workspace.getConfiguration('crawler-analyzer');
        const currentMode = config.get('useExistingBrowser', false);
        const newMode = !currentMode;
        await config.update('useExistingBrowser', newMode, vscode.ConfigurationTarget.Global);
        const modeText = newMode ? '连接现有浏览器' : '启动新浏览器';
        vscode.window.showInformationMessage(`浏览器模式已切换为: ${modeText}\n${newMode ? '注意：请确保浏览器已启动并开启远程调试 (--remote-debugging-port=9222)' : ''}`);
        // 通知聊天视图更新配置
        chatViewProvider.updateBrowserConfig();
    });
    context.subscriptions.push(clearChatCommand, toggleBrowserModeCommand);
}
/**
 * 插件停用时调用
 */
function deactivate() {
    console.log('JS爬虫分析器插件已停用');
}
//# sourceMappingURL=extension.js.map