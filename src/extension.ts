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

    context.subscriptions.push(clearChatCommand);
}

/**
 * 插件停用时调用
 */
export function deactivate() {
    console.log('JS爬虫分析器插件已停用');
} 