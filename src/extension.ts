/**
 * JS爬虫分析器 - VS Code扩展主入口文件
 */
import * as vscode from 'vscode';
import { CrawlerChatViewProvider } from './webview/CrawlerChatView';

/**
 * 插件激活时调用
 * @param context - VS Code扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('JS爬虫分析器插件已激活!');

    /**
     * 创建聊天视图提供程序
     */
    const chatViewProvider = new CrawlerChatViewProvider(context.extensionUri);

    /**
     * 注册聊天视图
     */
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CrawlerChatViewProvider.viewType, 
            chatViewProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

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
        vscode.window.showInformationMessage(
            `浏览器模式已切换为: ${modeText}\n${newMode ? '注意：请确保浏览器已启动并开启远程调试 (--remote-debugging-port=9222)' : ''}`
        );
        
        // 通知聊天视图更新配置
        chatViewProvider.updateBrowserConfig();
    });

    context.subscriptions.push(clearChatCommand, toggleBrowserModeCommand);
}

/**
 * 插件停用时调用
 */
export function deactivate() {
    console.log('JS爬虫分析器插件已停用');
} 