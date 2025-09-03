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
exports.BrowserController = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
/**
 * 浏览器控制器类
 */
class BrowserController {
    extensionUri;
    nativeMessagingProcess = null;
    messageHandlers = new Map();
    requestId = 0;
    isConnected = false;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.setupMessageHandlers();
    }
    /**
     * 初始化Chrome原生消息主机连接
     */
    async initialize() {
        try {
            // 检查是否已连接
            if (this.isConnected && this.nativeMessagingProcess) {
                return true;
            }
            // 启动原生消息主机
            const scriptPath = path.join(this.extensionUri.fsPath, 'scripts', 'chrome-native-host.js');
            this.nativeMessagingProcess = (0, child_process_1.spawn)('node', [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return new Promise((resolve) => {
                this.nativeMessagingProcess.stdout?.on('data', (data) => {
                    this.handleNativeMessage(data);
                });
                this.nativeMessagingProcess.stderr?.on('data', (data) => {
                    console.error('Native messaging error:', data.toString());
                });
                this.nativeMessagingProcess.on('close', () => {
                    this.isConnected = false;
                    this.nativeMessagingProcess = null;
                });
                // 发送连接测试消息
                setTimeout(() => {
                    this.sendNativeMessage({
                        action: 'ping'
                    }).then(() => {
                        this.isConnected = true;
                        resolve(true);
                    }).catch(() => {
                        resolve(false);
                    });
                }, 1000);
            });
        }
        catch (error) {
            console.error('Failed to initialize browser controller:', error);
            return false;
        }
    }
    /**
     * 获取所有浏览器窗口和标签页
     */
    async getWindowsAndTabs() {
        const response = await this.sendNativeMessage({
            action: 'get_windows_and_tabs'
        });
        return {
            windowCount: response.windowCount || 0,
            tabCount: response.tabCount || 0,
            windows: response.windows || []
        };
    }
    /**
     * 导航到指定URL
     */
    async navigate(url, options) {
        const response = await this.sendNativeMessage({
            action: 'chrome_navigate',
            url,
            newWindow: options?.newWindow || false,
            width: options?.width || 1280,
            height: options?.height || 720,
            tabId: options?.tabId
        });
        return response.tab;
    }
    /**
     * 关闭标签页或窗口
     */
    async closeTabs(options) {
        await this.sendNativeMessage({
            action: 'chrome_close_tabs',
            tabIds: options.tabIds || [],
            windowIds: options.windowIds || []
        });
    }
    /**
     * 截图功能
     */
    async screenshot(options = {}) {
        const response = await this.sendNativeMessage({
            action: 'chrome_screenshot',
            format: options.format || 'png',
            quality: options.quality || 90,
            fullPage: options.fullPage || false,
            selector: options.selector,
            viewport: options.viewport
        });
        return response.screenshot; // base64编码的图片数据
    }
    /**
     * 获取页面内容
     */
    async getPageContent(tabId) {
        const response = await this.sendNativeMessage({
            action: 'chrome_get_web_content',
            tabId,
            includeHtml: true,
            includeText: true,
            includeMetadata: true
        });
        return {
            html: response.html || '',
            text: response.text || '',
            title: response.title || '',
            url: response.url || '',
            metadata: response.metadata || {},
            interactiveElements: response.interactiveElements || []
        };
    }
    /**
     * 获取可交互元素
     */
    async getInteractiveElements(tabId) {
        const response = await this.sendNativeMessage({
            action: 'chrome_get_interactive_elements',
            tabId
        });
        return response.elements || [];
    }
    /**
     * 点击元素
     */
    async clickElement(selector, options) {
        await this.sendNativeMessage({
            action: 'chrome_click_element',
            selector,
            tabId: options?.tabId,
            waitTime: options?.waitTime || 1000
        });
    }
    /**
     * 填充表单
     */
    async fillForm(selector, value, options) {
        await this.sendNativeMessage({
            action: 'chrome_fill_or_select',
            selector,
            value,
            tabId: options?.tabId,
            clear: options?.clear !== false
        });
    }
    /**
     * 模拟键盘输入
     */
    async keyboard(key, options) {
        await this.sendNativeMessage({
            action: 'chrome_keyboard',
            key,
            tabId: options?.tabId,
            modifiers: options?.modifiers || []
        });
    }
    /**
     * 开始网络监控
     */
    async startNetworkMonitoring(tabId) {
        await this.sendNativeMessage({
            action: 'chrome_network_capture_start',
            tabId
        });
    }
    /**
     * 停止网络监控
     */
    async stopNetworkMonitoring(tabId) {
        const response = await this.sendNativeMessage({
            action: 'chrome_network_capture_stop',
            tabId
        });
        return {
            requests: response.requests || [],
            responses: response.responses || []
        };
    }
    /**
     * 注入脚本
     */
    async injectScript(script, options) {
        const response = await this.sendNativeMessage({
            action: 'chrome_inject_script',
            script,
            tabId: options?.tabId,
            allFrames: options?.allFrames || false
        });
        return response.result;
    }
    /**
     * 发送原生消息
     */
    async sendNativeMessage(message) {
        return new Promise((resolve, reject) => {
            if (!this.nativeMessagingProcess || !this.isConnected) {
                reject(new Error('Native messaging not connected'));
                return;
            }
            const requestId = ++this.requestId;
            const messageWithId = {
                ...message,
                requestId
            };
            // 注册响应处理器
            this.messageHandlers.set(requestId.toString(), (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                }
                else {
                    resolve(response.data);
                }
            });
            // 发送消息
            const messageStr = JSON.stringify(messageWithId) + '\n';
            this.nativeMessagingProcess.stdin?.write(messageStr);
            // 设置超时
            setTimeout(() => {
                this.messageHandlers.delete(requestId.toString());
                reject(new Error('Message timeout'));
            }, 30000);
        });
    }
    /**
     * 处理原生消息响应
     */
    handleNativeMessage(data) {
        try {
            const messages = data.toString().split('\n').filter(line => line.trim());
            for (const message of messages) {
                const parsed = JSON.parse(message);
                if (parsed.requestId) {
                    const handler = this.messageHandlers.get(parsed.requestId.toString());
                    if (handler) {
                        handler(parsed);
                        this.messageHandlers.delete(parsed.requestId.toString());
                    }
                }
            }
        }
        catch (error) {
            console.error('Error parsing native message:', error);
        }
    }
    /**
     * 设置消息处理器
     */
    setupMessageHandlers() {
        // 可以在这里添加特定的消息处理逻辑
    }
    /**
     * 清理资源
     */
    dispose() {
        if (this.nativeMessagingProcess) {
            this.nativeMessagingProcess.kill();
            this.nativeMessagingProcess = null;
        }
        this.messageHandlers.clear();
        this.isConnected = false;
    }
}
exports.BrowserController = BrowserController;
//# sourceMappingURL=BrowserController.js.map