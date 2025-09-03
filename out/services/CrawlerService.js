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
exports.CrawlerService = void 0;
/**
 * Playwright爬虫服务 - 负责浏览器控制和JS文件捕获
 * 增强版 - 支持更复杂的现代网站 + Python DrissionPage Plan B
 */
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const child_process_1 = require("child_process");
class CrawlerService {
    browser = null;
    context = null;
    page = null;
    capturedFiles = [];
    capturedUrls = []; // 新增：捕获的所有URL
    visitedRoutes = []; // 新增：访问过的SPA路由
    // Python后端相关
    pythonServiceProcess = null;
    pythonServiceUrl = 'http://127.0.0.1:5000';
    isPythonServiceRunning = false;
    // 固定的catch文件夹路径
    catchDir = 'D:\\crawler\\crawler\\catch';
    constructor() {
        // 启动时检查Python后端
        this.checkPythonBackend();
    }
    /**
     * 检查Python后端是否可用
     */
    async checkPythonBackend() {
        try {
            console.log('🔍 检查Python后端状态...');
            const isRunning = await this.testPythonBackend();
            if (!isRunning) {
                console.log('🚀 启动Python后端服务...');
                await this.startPythonService();
            }
            else {
                this.isPythonServiceRunning = true;
                console.log('✅ Python后端已在运行');
            }
        }
        catch (error) {
            console.error('⚠️ Python后端检查失败:', error);
        }
    }
    /**
     * 测试Python后端连接
     */
    async testPythonBackend() {
        return new Promise((resolve) => {
            const req = http.get(`${this.pythonServiceUrl}/health`, { timeout: 3000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result.status === 'healthy');
                    }
                    catch {
                        resolve(false);
                    }
                });
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
        });
    }
    /**
     * 启动Python服务
     */
    async startPythonService() {
        return new Promise((resolve, reject) => {
            try {
                // 查找Python脚本
                const possiblePaths = [
                    path.join(process.cwd(), 'drissionpage_service.py'),
                    'D:\\crawler\\crawler\\drissionpage_service.py'
                ];
                let pythonScriptPath = '';
                for (const testPath of possiblePaths) {
                    if (fs.existsSync(testPath)) {
                        pythonScriptPath = testPath;
                        break;
                    }
                }
                if (!pythonScriptPath) {
                    reject(new Error('Python服务脚本不存在'));
                    return;
                }
                console.log(`🐍 启动Python服务: ${pythonScriptPath}`);
                // 启动Python进程
                this.pythonServiceProcess = (0, child_process_1.spawn)('python', [pythonScriptPath], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: true
                });
                let startupOutput = '';
                this.pythonServiceProcess.stdout?.on('data', (data) => {
                    const output = data.toString();
                    startupOutput += output;
                    console.log('Python服务输出:', output);
                });
                this.pythonServiceProcess.stderr?.on('data', (data) => {
                    console.log('Python服务错误:', data.toString());
                });
                // 等待服务启动
                setTimeout(async () => {
                    const isRunning = await this.testPythonBackend();
                    if (isRunning) {
                        this.isPythonServiceRunning = true;
                        console.log('✅ Python后端服务启动成功');
                        resolve();
                    }
                    else {
                        console.error('❌ Python后端服务启动失败');
                        reject(new Error('Python服务启动超时'));
                    }
                }, 5000);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * 调用Python后端爬取网站
     */
    async crawlWithPython(targetUrl) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({ url: targetUrl });
            const options = {
                hostname: '127.0.0.1',
                port: 5000,
                path: '/crawl',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 60000 // 60秒超时
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result);
                    }
                    catch (parseError) {
                        reject(new Error(`Python后端响应解析失败: ${parseError}`));
                    }
                });
            });
            req.on('error', (error) => {
                reject(new Error(`Python后端请求失败: ${error.message}`));
            });
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Python后端请求超时'));
            });
            req.write(postData);
            req.end();
        });
    }
    /**
     * 智能选择爬虫引擎并执行
     */
    async smartCrawl(targetUrl) {
        console.log(`🧠 开始智能爬取: ${targetUrl}`);
        let playwrightResult = null;
        let playwrightError = null;
        // Plan A: 尝试Playwright
        try {
            console.log('🎭 Plan A: 使用Playwright引擎...');
            // 重置捕获的文件和URL
            this.capturedFiles = [];
            this.capturedUrls = [];
            this.visitedRoutes = [];
            // 确保catch目录存在
            this.ensureCatchDirectory();
            // 启动浏览器
            await this.launchBrowser();
            if (!this.page) {
                throw new Error('Playwright页面初始化失败');
            }
            // 设置综合拦截器
            await this.setupCombinedInterceptors();
            // 导航到目标页面
            await this.smartNavigate(targetUrl);
            // 使用增强版智能等待
            const pageState = await this.enhancedIntelligentWait(targetUrl);
            // 执行页面交互
            await this.triggerDynamicContent();
            playwrightResult = {
                files: this.capturedFiles,
                urls: this.capturedUrls,
                routes: this.visitedRoutes,
                engine: 'Playwright',
                pageState
            };
            // 检查结果质量
            const hasContent = pageState.hasContent;
            const hasFiles = this.capturedFiles.length > 0;
            const hasUrls = this.capturedUrls.length > 0;
            if (hasContent || hasFiles || hasUrls) {
                console.log(`✅ Playwright成功完成爬取 - 内容:${hasContent}, 文件:${hasFiles}, URL:${hasUrls}`);
                return playwrightResult;
            }
            else {
                throw new Error('Playwright爬取结果为空，质量不足');
            }
        }
        catch (error) {
            playwrightError = error;
            console.log(`❌ Playwright爬取失败: ${error.message}`);
            // 清理Playwright资源
            try {
                await this.closeBrowser();
            }
            catch (e) {
                console.log('清理Playwright资源时出错');
            }
        }
        // Plan B: 尝试Python DrissionPage
        if (this.isPythonServiceRunning) {
            try {
                console.log('🐍 Plan B: 使用DrissionPage引擎...');
                const pythonResult = await this.crawlWithPython(targetUrl);
                if (pythonResult.success) {
                    console.log(`✅ DrissionPage成功完成爬取 - 文件:${pythonResult.files.length}, URL:${pythonResult.urls.length}`);
                    return {
                        files: pythonResult.files,
                        urls: pythonResult.urls,
                        routes: pythonResult.routes,
                        engine: 'DrissionPage',
                        pageState: pythonResult.page_analysis ? {
                            hasContent: pythonResult.page_analysis.has_content || false,
                            isJSRendered: pythonResult.page_analysis.is_js_app || false,
                            isStable: pythonResult.page_analysis.is_stable || false,
                            contentScore: pythonResult.page_analysis.content_score || 0,
                            errors: pythonResult.page_analysis.error ? [pythonResult.page_analysis.error] : [],
                            loadingIndicators: pythonResult.page_analysis.loading_indicators || []
                        } : undefined
                    };
                }
                else {
                    throw new Error(pythonResult.error || 'DrissionPage爬取失败');
                }
            }
            catch (error) {
                console.log(`❌ DrissionPage爬取失败: ${error.message}`);
            }
        }
        else {
            console.log('⚠️ Python后端不可用，跳过Plan B');
        }
        // 如果两种方法都失败，返回Playwright的部分结果（如果有）或错误
        if (playwrightResult) {
            console.log('🔄 返回Playwright的部分结果...');
            return playwrightResult;
        }
        else {
            throw new Error(`所有爬取引擎都失败了。Playwright错误: ${playwrightError?.message}`);
        }
    }
    /**
     * 确保catch目录存在（不清理现有文件）
     */
    ensureCatchDirectory() {
        const catchPath = this.catchDir;
        console.log(`确保catch目录存在: ${catchPath}`);
        if (!fs.existsSync(catchPath)) {
            fs.mkdirSync(catchPath, { recursive: true });
            console.log(`创建catch目录: ${catchPath}`);
        }
        else {
            console.log(`catch目录已存在: ${catchPath}`);
        }
    }
    /**
     * 保存JS文件到本地
     * @param content - 文件内容
     * @param url - 文件URL
     * @returns 本地文件路径
     */
    saveFileToLocal(content, url) {
        // 确保catch目录存在
        this.ensureCatchDirectory();
        // 生成安全的文件名
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        let filename = path.basename(pathname) || 'index.js';
        // 确保是JS文件扩展名
        if (!filename.endsWith('.js') && !filename.endsWith('.mjs') && !filename.endsWith('.jsx')) {
            filename += '.js';
        }
        // 生成唯一文件名，避免冲突
        const timestamp = Date.now();
        const hostname = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
        const safeFilename = `${hostname}_${timestamp}_${filename}`;
        const localPath = path.join(this.catchDir, safeFilename);
        try {
            fs.writeFileSync(localPath, content, 'utf-8');
            console.log(`文件已保存到: ${localPath}`);
            return localPath;
        }
        catch (error) {
            console.error(`保存文件失败: ${localPath}`, error);
            return '';
        }
    }
    /**
     * 同时捕获目标URL的JS文件和所有网络请求URL - 使用智能引擎选择
     * @param targetUrl - 目标网站URL
     * @returns 包含文件和URL的对象
     */
    async captureFilesAndUrls(targetUrl) {
        try {
            console.log(`🎯 开始智能双引擎爬取: ${targetUrl}`);
            return await this.smartCrawl(targetUrl);
        }
        catch (error) {
            console.error('智能爬取失败:', error);
            throw error;
        }
    }
    /**
     * 捕获目标URL的所有JS文件 - 使用智能引擎选择
     * @param targetUrl - 目标网站URL
     * @returns 捕获的JS文件信息数组
     */
    async captureJSFiles(targetUrl) {
        try {
            const result = await this.captureFilesAndUrls(targetUrl);
            return result.files;
        }
        catch (error) {
            console.error('捕获JS文件时出错:', error);
            throw error;
        }
    }
    /**
     * 捕获目标URL的所有网络请求URL - 使用智能引擎选择
     * @param targetUrl - 目标网站URL
     * @returns 捕获的URL信息数组
     */
    async captureAllUrls(targetUrl) {
        try {
            const result = await this.captureFilesAndUrls(targetUrl);
            return result.urls;
        }
        catch (error) {
            console.error('捕获URL时出错:', error);
            throw error;
        }
    }
    /**
     * 增强版页面状态检测 - 检测页面内容和JavaScript渲染状态
     * @param maxWaitTime - 最大等待时间（毫秒）
     * @returns 页面状态检测结果
     */
    async detectPageState(maxWaitTime = 15000) {
        if (!this.page) {
            return {
                hasContent: false,
                isJSRendered: false,
                isStable: false,
                contentScore: 0,
                errors: ['页面未初始化'],
                loadingIndicators: []
            };
        }
        console.log('🔍 开始增强版页面状态检测...');
        const startTime = Date.now();
        let lastContentScore = 0;
        let stableCount = 0;
        const requiredStableCount = 3;
        const result = {
            hasContent: false,
            isJSRendered: false,
            isStable: false,
            contentScore: 0,
            errors: [],
            loadingIndicators: []
        };
        while (Date.now() - startTime < maxWaitTime) {
            try {
                // 检测页面状态
                const pageState = await this.page.evaluate(() => {
                    // 1. 基本文档状态
                    const documentReady = document.readyState;
                    // 2. 内容量化检测
                    const body = document.body;
                    const textContent = body?.innerText || '';
                    const htmlContent = body?.innerHTML || '';
                    const visibleElements = document.querySelectorAll('*').length;
                    // 3. 加载指示器检测
                    const loadingSelectors = [
                        '[class*="loading"]', '[class*="spinner"]', '[class*="skeleton"]',
                        '[id*="loading"]', '[id*="spinner"]', '.loading', '.spinner',
                        '[aria-label*="loading" i]', '[aria-label*="加载" i]',
                        '.ant-spin', '.el-loading-mask', '.v-progress-circular'
                    ];
                    const loadingElements = loadingSelectors
                        .map(selector => document.querySelectorAll(selector))
                        .map((nodeList, index) => ({ selector: loadingSelectors[index], count: nodeList.length }))
                        .filter(item => item.count > 0);
                    // 4. React/Vue等框架检测
                    const hasReact = !!window.React || document.querySelector('[data-reactroot], #react-root, #root [data-react]');
                    const hasVue = !!window.Vue || document.querySelector('[data-v-]');
                    const hasAngular = !!window.ng || document.querySelector('[ng-app], [ng-controller]');
                    // 5. 异步操作检测
                    const pendingRequests = performance?.getEntriesByType?.('navigation')?.[0]?.loadEventEnd === 0;
                    // 6. JavaScript渲染内容检测
                    const scriptElements = document.querySelectorAll('script').length;
                    const dynamicElements = document.querySelectorAll('[data-v-], [data-react], [ng-]').length;
                    // 7. 内容复杂度评分
                    let contentScore = 0;
                    contentScore += Math.min(textContent.length / 100, 50); // 文本长度得分
                    contentScore += Math.min(visibleElements / 10, 30); // 元素数量得分
                    contentScore += Math.min(htmlContent.length / 1000, 20); // HTML长度得分
                    // 8. 错误检测
                    const errors = [];
                    if (textContent.length < 10)
                        errors.push('页面文本内容过少');
                    if (visibleElements < 5)
                        errors.push('页面DOM元素过少');
                    if (documentReady !== 'complete' && Date.now() - window.__pageStartTime > 10000) {
                        errors.push('文档加载状态异常');
                    }
                    return {
                        documentReady,
                        textLength: textContent.length,
                        htmlLength: htmlContent.length,
                        visibleElements,
                        loadingElements,
                        hasReact,
                        hasVue,
                        hasAngular,
                        pendingRequests,
                        scriptElements,
                        dynamicElements,
                        contentScore,
                        errors,
                        // 简单的"空白页"检测
                        isBlankPage: textContent.trim().length < 10 && visibleElements < 10
                    };
                });
                // 更新检测结果
                result.contentScore = pageState.contentScore;
                result.hasContent = !pageState.isBlankPage && pageState.textLength > 50;
                result.isJSRendered = pageState.hasReact || pageState.hasVue || pageState.hasAngular || pageState.dynamicElements > 0;
                result.errors = pageState.errors;
                result.loadingIndicators = pageState.loadingElements.map(le => le.selector);
                // 稳定性检测：内容得分连续几次检测没有大幅变化
                if (Math.abs(pageState.contentScore - lastContentScore) < 5) {
                    stableCount++;
                }
                else {
                    stableCount = 0;
                }
                lastContentScore = pageState.contentScore;
                // 判断页面是否稳定
                const isStable = stableCount >= requiredStableCount &&
                    pageState.loadingElements.length === 0 &&
                    pageState.documentReady === 'complete';
                result.isStable = isStable;
                console.log(`📊 页面状态: 内容得分=${pageState.contentScore.toFixed(1)}, 稳定=${isStable}, JS渲染=${result.isJSRendered}, 加载指示器=${pageState.loadingElements.length}个`);
                // 如果页面稳定且有内容，提前结束检测
                if (isStable && result.hasContent) {
                    console.log('✅ 页面检测完成：稳定且有内容');
                    break;
                }
                // 特殊情况：如果是明显的JS应用但还在加载
                if (result.isJSRendered && pageState.loadingElements.length > 0) {
                    console.log('⏳ 检测到JS应用正在加载，继续等待...');
                }
                await this.page.waitForTimeout(1000); // 等待1秒后重新检测
            }
            catch (error) {
                result.errors.push(`检测过程出错: ${error.message}`);
                console.log('⚠️ 页面状态检测出错:', error.message);
                break;
            }
        }
        const totalTime = Date.now() - startTime;
        console.log(`🏁 页面状态检测结束，耗时: ${totalTime}ms`);
        console.log(`📋 最终结果: 有内容=${result.hasContent}, JS渲染=${result.isJSRendered}, 稳定=${result.isStable}, 得分=${result.contentScore.toFixed(1)}`);
        return result;
    }
    /**
     * 增强版智能等待 - 包含页面状态检测和JavaScript渲染等待
     * @param url - 当前页面URL（用于日志）
     */
    async enhancedIntelligentWait(url) {
        if (!this.page) {
            throw new Error('页面未初始化');
        }
        console.log(`🤖 开始增强版智能等待... ${url ? `URL: ${url}` : ''}`);
        try {
            // 注入页面加载时间戳（用于后续检测）
            await this.page.addInitScript(() => {
                window.__pageStartTime = Date.now();
            });
            // 1. 基础等待 - 确保DOM基本结构加载
            try {
                await this.page.waitForSelector('body', { timeout: 5000 });
                console.log('✅ 基础DOM结构已加载');
            }
            catch (e) {
                console.log('⚠️ 等待body元素超时，继续处理...');
            }
            // 2. 执行页面状态检测
            const pageState = await this.detectPageState(15000);
            // 3. 根据检测结果进行额外处理
            if (!pageState.hasContent && pageState.isJSRendered) {
                console.log('🔄 检测到JS应用但内容不足，尝试触发更多内容...');
                await this.triggerJSContent();
                // 再次检测
                const secondCheck = await this.detectPageState(8000);
                Object.assign(pageState, secondCheck);
            }
            // 4. 如果仍然没有内容，尝试更激进的方法
            if (!pageState.hasContent) {
                console.log('🚀 内容不足，尝试激进式内容触发...');
                await this.aggressiveContentTrigger();
                // 最终检测
                const finalCheck = await this.detectPageState(5000);
                Object.assign(pageState, finalCheck);
            }
            // 5. 页面截图（用于调试）
            if (!pageState.hasContent) {
                try {
                    const screenshotPath = path.join(this.catchDir, `debug_${Date.now()}.png`);
                    await this.page.screenshot({
                        path: screenshotPath,
                        fullPage: true
                    });
                    console.log(`📸 调试截图已保存: ${screenshotPath}`);
                }
                catch (e) {
                    console.log('📸 截图失败:', e);
                }
            }
            return pageState;
        }
        catch (error) {
            console.log('❌ 增强版智能等待过程中出错:', error.message);
            return {
                hasContent: false,
                isJSRendered: false,
                isStable: false,
                contentScore: 0,
                errors: [error.message],
                loadingIndicators: []
            };
        }
    }
    /**
     * 触发JavaScript内容渲染
     */
    async triggerJSContent() {
        if (!this.page)
            return;
        console.log('🎯 开始触发JavaScript内容渲染...');
        try {
            // 1. 模拟用户滚动
            await this.page.evaluate(() => {
                window.scrollTo(0, window.innerHeight);
            });
            await this.page.waitForTimeout(1000);
            await this.page.evaluate(() => {
                window.scrollTo(0, 0);
            });
            await this.page.waitForTimeout(1000);
            // 2. 触发常见的JS事件
            await this.page.evaluate(() => {
                // 触发resize事件（很多JS应用监听这个事件）
                window.dispatchEvent(new Event('resize'));
                // 触发load事件
                window.dispatchEvent(new Event('load'));
                // 触发DOMContentLoaded事件
                document.dispatchEvent(new Event('DOMContentLoaded'));
                // 模拟鼠标移动
                document.dispatchEvent(new MouseEvent('mousemove', {
                    clientX: window.innerWidth / 2,
                    clientY: window.innerHeight / 2
                }));
            });
            // 3. 等待React/Vue等框架常见的渲染
            const frameworkPromises = [
                // React相关
                this.page.waitForFunction(() => {
                    return document.querySelector('[data-reactroot], #react-root, #root > div') !== null;
                }, { timeout: 3000 }).catch(() => false),
                // Vue相关
                this.page.waitForFunction(() => {
                    return document.querySelector('[data-v-]') !== null;
                }, { timeout: 3000 }).catch(() => false),
                // 通用内容等待
                this.page.waitForFunction(() => {
                    return document.body.innerText.length > 100;
                }, { timeout: 5000 }).catch(() => false)
            ];
            // 等待任一框架内容出现，或者超时
            await Promise.race(frameworkPromises);
        }
        catch (error) {
            console.log('⚠️ 触发JS内容时出错:', error.message);
        }
    }
    /**
     * 激进式内容触发 - 用于处理复杂的SPA应用
     */
    async aggressiveContentTrigger() {
        if (!this.page)
            return;
        console.log('💪 开始激进式内容触发...');
        try {
            // 1. 点击可能的"开始"、"进入"按钮
            const entrySelectors = [
                'button[class*="start"]', 'button[class*="enter"]', 'button[class*="continue"]',
                'a[class*="start"]', 'a[class*="enter"]', 'a[class*="continue"]',
                '.start-btn', '.enter-btn', '.continue-btn',
                '[data-testid*="start"]', '[data-testid*="enter"]'
            ];
            for (const selector of entrySelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        console.log(`🎯 点击可能的入口元素: ${selector}`);
                        await element.click();
                        await this.page.waitForTimeout(2000);
                        break;
                    }
                }
                catch (e) {
                    // 忽略点击错误，继续尝试下一个
                }
            }
            // 2. 执行多次滚动触发懒加载
            for (let i = 0; i < 3; i++) {
                await this.page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await this.page.waitForTimeout(1500);
                await this.page.evaluate(() => {
                    window.scrollTo(0, window.innerHeight * Math.random());
                });
                await this.page.waitForTimeout(1000);
            }
            // 3. 模拟鼠标悬停在主要区域
            try {
                const mainContent = await this.page.$('main, .main, #main, .content, #content');
                if (mainContent) {
                    await mainContent.hover();
                    await this.page.waitForTimeout(1000);
                }
            }
            catch (e) {
                console.log('⚠️ 悬停主内容区域失败');
            }
            // 4. 触发键盘事件（某些应用监听键盘事件）
            await this.page.keyboard.press('Tab');
            await this.page.waitForTimeout(500);
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(500);
        }
        catch (error) {
            console.log('⚠️ 激进式内容触发时出错:', error.message);
        }
    }
    /**
     * SPA路由导航处理 - 处理单页应用的路由跳转
     * @param targetSelector - 要点击的目标选择器
     * @param expectedUrlPattern - 期望的URL模式（可选）
     * @param maxWaitTime - 最大等待时间
     */
    async navigateInSPA(targetSelector, expectedUrlPattern, maxWaitTime = 10000) {
        if (!this.page) {
            throw new Error('页面未初始化');
        }
        console.log(`🔄 开始SPA导航: 点击 ${targetSelector}`);
        try {
            // 记录导航前的状态
            const beforeUrl = this.page.url();
            const beforeTitle = await this.page.title();
            // 等待目标元素出现并点击
            await this.page.waitForSelector(targetSelector, { timeout: 5000 });
            const element = await this.page.$(targetSelector);
            if (!element) {
                console.log(`❌ 未找到目标元素: ${targetSelector}`);
                return null;
            }
            // 点击元素
            await element.click();
            console.log(`✅ 已点击元素: ${targetSelector}`);
            // 等待页面变化
            let routeInfo = null;
            const startTime = Date.now();
            while (Date.now() - startTime < maxWaitTime) {
                const currentUrl = this.page.url();
                const currentTitle = await this.page.title();
                // 检查URL是否发生变化
                const urlChanged = currentUrl !== beforeUrl;
                const urlMatches = expectedUrlPattern ?
                    new RegExp(expectedUrlPattern).test(currentUrl) : true;
                if (urlChanged && urlMatches) {
                    console.log(`🎯 SPA路由变化检测到: ${beforeUrl} -> ${currentUrl}`);
                    // 等待新页面内容稳定
                    const pageState = await this.enhancedIntelligentWait(currentUrl);
                    routeInfo = {
                        url: currentUrl,
                        title: currentTitle,
                        contentLength: pageState.contentScore,
                        timestamp: Date.now()
                    };
                    // 记录访问过的路由
                    this.visitedRoutes.push(routeInfo);
                    break;
                }
                // 即使URL没有变化，也检查内容是否更新（某些SPA不改变URL）
                if (!urlChanged) {
                    await this.page.waitForTimeout(1000);
                    const pageState = await this.detectPageState(3000);
                    if (pageState.isStable && pageState.hasContent) {
                        console.log('📄 检测到内容更新（URL未变化）');
                        routeInfo = {
                            url: currentUrl,
                            title: currentTitle,
                            contentLength: pageState.contentScore,
                            timestamp: Date.now()
                        };
                        break;
                    }
                }
                await this.page.waitForTimeout(500);
            }
            if (!routeInfo) {
                console.log('⏰ SPA导航等待超时');
            }
            else {
                console.log(`✅ SPA导航成功完成: ${routeInfo.url}`);
            }
            return routeInfo;
        }
        catch (error) {
            console.error(`❌ SPA导航失败: ${error.message}`);
            return null;
        }
    }
    /**
     * 增强版动态内容触发 - 替代原有的triggerDynamicContent
     */
    async triggerDynamicContent() {
        if (!this.page)
            return;
        console.log('🚀 开始增强版动态内容触发...');
        try {
            // 1. 滚动触发懒加载
            await this.performScrollTrigger();
            // 2. 点击可交互元素
            await this.performInteractiveElementsTrigger();
            // 3. SPA路由探索
            await this.exploreSPARoutes();
            // 4. 表单和输入框交互
            await this.performFormInteraction();
        }
        catch (error) {
            console.log('⚠️ 触发动态内容时出错:', error.message);
        }
    }
    /**
     * 执行滚动触发
     */
    async performScrollTrigger() {
        if (!this.page)
            return;
        console.log('📜 执行滚动触发...');
        try {
            // 滚动到页面底部触发懒加载
            await this.page.evaluate(() => {
                const scrollHeight = document.body.scrollHeight;
                const viewportHeight = window.innerHeight;
                const scrollSteps = Math.ceil(scrollHeight / viewportHeight);
                return new Promise((resolve) => {
                    let currentStep = 0;
                    const scrollInterval = setInterval(() => {
                        window.scrollTo(0, currentStep * viewportHeight);
                        currentStep++;
                        if (currentStep > scrollSteps) {
                            clearInterval(scrollInterval);
                            // 滚动回顶部
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, 800);
                });
            });
            await this.page.waitForTimeout(2000);
        }
        catch (e) {
            console.log('⚠️ 滚动触发失败:', e);
        }
    }
    /**
     * 执行交互元素触发
     */
    async performInteractiveElementsTrigger() {
        if (!this.page)
            return;
        console.log('🎯 执行交互元素触发...');
        try {
            // 查找并点击各种可能触发内容的元素
            const interactiveSelectors = [
                'button:visible:not([disabled])',
                'a[href*="#"]:visible', // 哈希链接，可能是SPA路由
                '.tab:visible', '.tabs button:visible', '[role="tab"]:visible',
                '.load-more:visible', '.show-more:visible',
                '[data-toggle]:visible', '[data-show]:visible',
                '.expand:visible', '.collapse:visible'
            ];
            for (const selector of interactiveSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    const visibleElements = [];
                    // 检查元素是否真正可见
                    for (const element of elements) {
                        const isVisible = await element.isVisible();
                        if (isVisible) {
                            visibleElements.push(element);
                        }
                    }
                    console.log(`发现 ${visibleElements.length} 个可见的 ${selector} 元素`);
                    // 限制点击数量，避免无限循环
                    const maxClicks = Math.min(3, visibleElements.length);
                    for (let i = 0; i < maxClicks; i++) {
                        try {
                            await visibleElements[i].click();
                            await this.page.waitForTimeout(1500);
                            console.log(`✅ 点击了第 ${i + 1} 个 ${selector} 元素`);
                        }
                        catch (clickError) {
                            console.log(`❌ 点击第 ${i + 1} 个元素失败:`, clickError);
                        }
                    }
                }
                catch (e) {
                    console.log(`⚠️ 处理 ${selector} 时出错:`, e);
                }
            }
        }
        catch (error) {
            console.log('⚠️ 交互元素触发失败:', error.message);
        }
    }
    /**
     * 探索SPA路由
     */
    async exploreSPARoutes() {
        if (!this.page)
            return;
        console.log('🗺️ 开始探索SPA路由...');
        try {
            // 查找可能的路由链接
            const routeSelectors = [
                'a[href^="#"]', // 哈希路由
                'a[href^="/"]', // 相对路径路由
                '[data-route]', // 自定义路由属性
                '.nav-link', '.menu-item', '.router-link'
            ];
            for (const selector of routeSelectors) {
                try {
                    const links = await this.page.$$(selector);
                    const maxRoutes = Math.min(2, links.length); // 限制探索的路由数量
                    for (let i = 0; i < maxRoutes; i++) {
                        const link = links[i];
                        const href = await link.getAttribute('href');
                        const text = await link.textContent();
                        console.log(`🔍 尝试SPA路由: ${text || href}`);
                        // 使用SPA导航方法
                        const routeInfo = await this.navigateInSPA(selector, undefined, 5000);
                        if (routeInfo) {
                            console.log(`✅ 成功访问路由: ${routeInfo.url}`);
                            // 等待当前路由的内容稳定，然后继续
                            await this.page.waitForTimeout(2000);
                        }
                        // 避免在同一个页面停留太久
                        if (i < maxRoutes - 1) {
                            await this.page.goBack(); // 返回上一页
                            await this.page.waitForTimeout(1000);
                        }
                    }
                }
                catch (e) {
                    console.log(`⚠️ 探索路由 ${selector} 时出错:`, e);
                }
            }
        }
        catch (error) {
            console.log('⚠️ SPA路由探索失败:', error.message);
        }
    }
    /**
     * 执行表单交互
     */
    async performFormInteraction() {
        if (!this.page)
            return;
        console.log('📝 执行表单交互...');
        try {
            // 查找搜索框和输入框
            const searchSelectors = [
                'input[type="search"]:visible',
                'input[placeholder*="搜索" i]:visible',
                'input[placeholder*="search" i]:visible',
                '.search-input:visible',
                '#search:visible'
            ];
            for (const selector of searchSelectors) {
                try {
                    const searchInput = await this.page.$(selector);
                    if (searchInput) {
                        console.log(`🔍 发现搜索框: ${selector}`);
                        // 输入测试搜索词
                        await searchInput.fill('test');
                        await this.page.waitForTimeout(1000);
                        // 尝试提交搜索
                        await searchInput.press('Enter');
                        await this.page.waitForTimeout(2000);
                        // 清空输入框
                        await searchInput.fill('');
                        break;
                    }
                }
                catch (e) {
                    console.log(`⚠️ 搜索框交互失败 ${selector}:`, e);
                }
            }
        }
        catch (error) {
            console.log('⚠️ 表单交互失败:', error.message);
        }
    }
    /**
     * 获取已访问的SPA路由信息
     * @returns 访问过的路由列表
     */
    getVisitedRoutes() {
        return this.visitedRoutes;
    }
    /**
     * 清空访问过的路由记录
     */
    clearVisitedRoutes() {
        this.visitedRoutes = [];
    }
    /**
     * 判断URL是否是API接口
     * @param url - 要检查的URL
     * @returns 是否是API接口
     */
    isApiUrl(url) {
        const apiPatterns = [
            '/api/',
            '/v1/',
            '/v2/',
            '/v3/',
            '/rest/',
            '/graphql',
            '/rpc/',
            '/json',
            '/ajax',
            '/action',
            '/service',
            '/endpoint',
            '.json',
            '/like',
            '/comment',
            '/follow',
            '/favorite',
            '/share'
        ];
        const lowercaseUrl = url.toLowerCase();
        return apiPatterns.some(pattern => lowercaseUrl.includes(pattern));
    }
    /**
     * 获取URL类型
     * @param url - URL
     * @param contentType - 内容类型
     * @returns URL类型
     */
    getUrlType(url, contentType) {
        const lowercaseUrl = url.toLowerCase();
        // 检查是否是API
        if (this.isApiUrl(url)) {
            return 'api';
        }
        // 检查文件扩展名
        if (lowercaseUrl.includes('.js') || lowercaseUrl.includes('.mjs') || lowercaseUrl.includes('.jsx')) {
            return 'js';
        }
        if (lowercaseUrl.includes('.css')) {
            return 'css';
        }
        if (lowercaseUrl.includes('.jpg') || lowercaseUrl.includes('.jpeg') ||
            lowercaseUrl.includes('.png') || lowercaseUrl.includes('.gif') ||
            lowercaseUrl.includes('.webp') || lowercaseUrl.includes('.svg')) {
            return 'image';
        }
        // 检查Content-Type
        if (contentType.includes('javascript')) {
            return 'js';
        }
        if (contentType.includes('css')) {
            return 'css';
        }
        if (contentType.includes('image')) {
            return 'image';
        }
        if (contentType.includes('json') || contentType.includes('application/')) {
            return 'api';
        }
        return 'other';
    }
    /**
     * 设置URL网络拦截器（捕获所有URL）
     */
    async setupUrlInterceptors() {
        if (!this.page)
            return;
        // 拦截所有响应
        this.page.on('response', async (response) => {
            try {
                const url = response.url();
                const contentType = response.headers()['content-type'] || '';
                const method = response.request().method();
                const status = response.status();
                const statusText = response.statusText();
                const requestHeaders = response.request().headers();
                const responseHeaders = response.headers();
                // 计算响应大小（尝试获取内容长度）
                let size = 0;
                try {
                    const buffer = await response.body();
                    size = buffer ? buffer.length : 0;
                }
                catch (err) {
                    // 某些响应可能无法获取body，使用header中的content-length
                    const contentLength = responseHeaders['content-length'];
                    size = contentLength ? parseInt(contentLength, 10) : 0;
                }
                const urlType = this.getUrlType(url, contentType);
                const isAPI = this.isApiUrl(url);
                const urlInfo = {
                    url: url,
                    method: method,
                    status: status,
                    statusText: statusText,
                    requestHeaders: requestHeaders,
                    responseHeaders: responseHeaders,
                    contentType: contentType,
                    size: size,
                    isAPI: isAPI,
                    urlType: urlType,
                    timestamp: Date.now()
                };
                this.capturedUrls.push(urlInfo);
                // 输出日志，特别标注API接口
                if (isAPI) {
                    console.log(`🔍 发现API接口: [${method}] ${url} (${status})`);
                }
                else {
                    console.log(`📄 捕获URL: [${method}] ${url} (${urlType}, ${status})`);
                }
            }
            catch (error) {
                console.error(`处理响应时出错: ${response.url()}`, error);
            }
        });
        // 拦截请求以修改headers
        await this.page.route('**/*', async (route) => {
            const headers = {
                ...route.request().headers(),
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            };
            await route.continue({ headers });
        });
    }
    /**
     * 设置综合网络拦截器（同时捕获JS文件和所有URL）
     */
    async setupCombinedInterceptors() {
        if (!this.page)
            return;
        // 拦截所有响应
        this.page.on('response', async (response) => {
            try {
                const url = response.url();
                const contentType = response.headers()['content-type'] || '';
                const method = response.request().method();
                const status = response.status();
                const statusText = response.statusText();
                const requestHeaders = response.request().headers();
                const responseHeaders = response.headers();
                // 计算响应大小
                let size = 0;
                let content = '';
                try {
                    const buffer = await response.body();
                    size = buffer ? buffer.length : 0;
                    content = buffer ? buffer.toString('utf-8') : '';
                }
                catch (err) {
                    // 某些响应可能无法获取body
                    const contentLength = responseHeaders['content-length'];
                    size = contentLength ? parseInt(contentLength, 10) : 0;
                }
                const urlType = this.getUrlType(url, contentType);
                // 捕获所有URL信息
                const urlInfo = {
                    url: url,
                    method: method,
                    status: status,
                    statusText: statusText,
                    requestHeaders: requestHeaders,
                    responseHeaders: responseHeaders,
                    contentType: contentType,
                    size: size,
                    isAPI: this.isApiUrl(url),
                    urlType: urlType,
                    timestamp: Date.now()
                };
                this.capturedUrls.push(urlInfo);
                // 如果是JavaScript文件，也保存到文件
                if (this.isJavaScriptFile(url, contentType) && content) {
                    // 保存文件到本地
                    const localPath = this.saveFileToLocal(content, url);
                    const fileInfo = {
                        url: url,
                        content: content,
                        size: size,
                        headers: responseHeaders,
                        method: method,
                        timestamp: Date.now(),
                        localPath: localPath
                    };
                    this.capturedFiles.push(fileInfo);
                    console.log(`捕获JS文件: ${url} (${size} bytes) -> 已保存到: ${localPath}`);
                }
                // 输出所有URL日志
                console.log(`捕获URL: [${method}] ${url} (${urlType}, ${status})`);
            }
            catch (error) {
                console.error(`处理响应时出错: ${response.url()}`, error);
            }
        });
        // 拦截请求以修改headers
        await this.page.route('**/*', async (route) => {
            const headers = {
                ...route.request().headers(),
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            };
            await route.continue({ headers });
        });
    }
    /**
     * 筛选API接口URL
     * @param urls - URL列表（可选，默认使用当前捕获的URL）
     * @returns API接口URL列表
     */
    filterApiUrls(urls) {
        const urlList = urls || this.capturedUrls;
        return urlList.filter(urlInfo => urlInfo.isAPI);
    }
    /**
     * 按URL类型分组
     * @param urls - URL列表（可选，默认使用当前捕获的URL）
     * @returns 按类型分组的URL
     */
    groupUrlsByType(urls) {
        const urlList = urls || this.capturedUrls;
        return urlList.reduce((groups, urlInfo) => {
            const type = urlInfo.urlType;
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(urlInfo);
            return groups;
        }, {});
    }
    /**
     * 按关键词搜索URL
     * @param keyword - 搜索关键词
     * @param urls - URL列表（可选，默认使用当前捕获的URL）
     * @returns 匹配的URL列表
     */
    searchUrls(keyword, urls) {
        const urlList = urls || this.capturedUrls;
        const lowerKeyword = keyword.toLowerCase();
        return urlList.filter(urlInfo => urlInfo.url.toLowerCase().includes(lowerKeyword));
    }
    /**
     * 启动浏览器 - 增强反检测能力
     */
    async launchBrowser() {
        // 关闭现有浏览器
        await this.closeBrowser();
        // 启动新浏览器 - 增强反检测设置 + SSL/网络优化
        this.browser = await playwright_1.chromium.launch({
            headless: false, // 设置为false以便调试
            devtools: false, // 关闭开发者工具以避免检测
            slowMo: 50, // 减少延迟提高性能
            args: [
                // 核心反检测参数
                '--disable-blink-features=AutomationControlled', // 关键：禁用自动化控制特征
                '--disable-web-security', // 禁用Web安全
                '--disable-features=VizDisplayCompositor',
                '--disable-features=IsolateOrigins,site-per-process',
                // SSL和证书相关 - 基于搜索结果优化
                '--ignore-certificate-errors', // 忽略证书错误
                '--ignore-ssl-errors', // 忽略SSL错误  
                '--ignore-certificate-errors-spki-list', // 忽略证书固定错误
                '--ignore-urlfetcher-cert-requests', // 忽略URL获取器证书请求
                '--allow-running-insecure-content', // 允许不安全内容
                '--allow-cross-origin-auth-prompt', // 允许跨域认证提示
                // 网络连接优化
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu-sandbox',
                // 性能和稳定性优化
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                // 浏览器功能禁用
                '--disable-extensions',
                '--disable-plugins',
                '--disable-default-apps',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-sync',
                '--disable-translate',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-default-apps',
                '--disable-domain-reliability',
                // 隐私和追踪
                '--metrics-recording-only',
                '--no-default-browser-check',
                '--safebrowsing-disable-auto-update',
                '--password-store=basic',
                '--use-mock-keychain',
                // 网络和DNS优化  
                '--disable-features=VizDisplayCompositor,VizServiceDisplay',
                '--max_old_space_size=4096', // 增加内存限制
                '--disable-site-isolation-trials', // 禁用站点隔离试验
                // 实验性功能
                '--enable-features=NetworkService,NetworkServiceLogging',
                '--enable-logging',
                '--log-level=0'
            ]
        });
        // 创建浏览器上下文 - 模拟真实浏览器环境 + 增强SSL处理
        this.context = await this.browser.newContext({
            ignoreHTTPSErrors: true, // 忽略SSL证书错误
            bypassCSP: true, // 绕过内容安全策略
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
            permissions: ['geolocation', 'notifications'], // 增加权限
            geolocation: { longitude: 116.397477, latitude: 39.908692 }, // 北京坐标
            colorScheme: 'light',
            reducedMotion: 'no-preference',
            forcedColors: 'none',
            // 增强的HTTP头，模拟真实浏览器
            extraHTTPHeaders: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Sec-Ch-Ua': '"Chromium";v="120", "Google Chrome";v="120", "Not A;Brand";v="99"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Cache-Control': 'max-age=0',
                'Connection': 'keep-alive'
            },
            // 添加客户端证书忽略
            clientCertificates: [],
            // 设置更宽松的网络超时
            httpCredentials: undefined,
            // 禁用严格的传输安全
            serviceWorkers: 'block' // 阻止service worker
        });
        this.page = await this.context.newPage();
        // 增强版反检测脚本注入
        await this.page.addInitScript(() => {
            // 移除webdriver属性
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            // 覆盖chrome属性
            window.chrome = {
                runtime: {},
                loadTimes: function () { },
                csi: function () { },
                app: {}
            };
            // 覆盖permissions API
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters));
            // 添加更多navigator属性模拟
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en'],
            });
            // 模拟更真实的屏幕属性
            Object.defineProperty(screen, 'availWidth', {
                get: () => 1920
            });
            Object.defineProperty(screen, 'availHeight', {
                get: () => 1040
            });
            // 修复toString检测
            const originalToString = Function.prototype.toString;
            Function.prototype.toString = function () {
                if (this === window.navigator.webdriver) {
                    return 'function webdriver() { [native code] }';
                }
                return originalToString.call(this);
            };
            // 添加真实的performance.timing
            if (!window.performance.timing) {
                window.performance.timing = {
                    navigationStart: Date.now() - 1000,
                    loadEventEnd: Date.now()
                };
            }
        });
        console.log('浏览器启动完成，已应用增强反检测措施');
    }
    /**
     * 智能页面导航 - 多种等待策略的组合 + 增强错误处理
     * @param url - 目标URL
     * @param maxRetries - 最大重试次数
     */
    async smartNavigate(url, maxRetries = 3) {
        if (!this.page) {
            throw new Error('页面未初始化');
        }
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`尝试导航到页面 (${attempt}/${maxRetries}): ${url}`);
            try {
                // 尝试多种等待策略 - 基于搜索结果优化
                const strategies = [
                    { name: '快速DOM', waitUntil: 'domcontentloaded', timeout: 12000 },
                    { name: '完整加载', waitUntil: 'load', timeout: 18000 },
                    { name: '网络空闲', waitUntil: 'networkidle', timeout: 25000 },
                    { name: '提交状态', waitUntil: 'commit', timeout: 8000 } // 最宽松的策略
                ];
                let navigated = false;
                let response = null;
                for (const strategy of strategies) {
                    try {
                        console.log(`🔄 尝试策略: ${strategy.name} (${strategy.waitUntil}), 超时: ${strategy.timeout}ms`);
                        response = await this.page.goto(url, {
                            waitUntil: strategy.waitUntil,
                            timeout: strategy.timeout
                        });
                        // 检查响应状态
                        if (response) {
                            const status = response.status();
                            console.log(`📡 HTTP状态: ${status} ${response.statusText()}`);
                            // 处理特定的HTTP错误状态
                            if (status === 403) {
                                console.log(`🚫 403错误 - 可能的反爬检测，尝试下一个策略...`);
                                await this.handleAntiDetection();
                                continue;
                            }
                            else if (status === 404) {
                                throw new Error(`页面不存在 (404): ${url}`);
                            }
                            else if (status >= 500) {
                                console.log(`⚠️ 服务器错误 ${status}，尝试下一个策略...`);
                                continue;
                            }
                            else if (status === 429) {
                                console.log(`⏱️ 请求频率限制，等待更长时间...`);
                                await this.page.waitForTimeout(5000);
                                continue;
                            }
                        }
                        navigated = true;
                        console.log(`✅ 页面导航成功，使用策略: ${strategy.name}`);
                        break;
                    }
                    catch (strategyError) {
                        console.log(`❌ 策略 ${strategy.name} 失败: ${strategyError.message}`);
                        // 分析错误类型并应用对应处理
                        if (strategyError.message.includes('SSL') || strategyError.message.includes('certificate')) {
                            console.log(`🔒 SSL证书问题，已应用证书忽略设置`);
                        }
                        else if (strategyError.message.includes('net::ERR_')) {
                            console.log(`🌐 网络连接问题: ${strategyError.message}`);
                        }
                        else if (strategyError.message.includes('timeout')) {
                            console.log(`⏰ 超时问题，尝试更宽松的策略...`);
                        }
                        continue;
                    }
                }
                if (!navigated) {
                    throw new Error('所有导航策略都失败了');
                }
                return; // 成功导航，退出重试循环
            }
            catch (error) {
                lastError = error;
                console.error(`💥 导航尝试 ${attempt} 失败:`, error.message);
                // 重试前的特殊处理
                if (attempt < maxRetries) {
                    const waitTime = this.calculateRetryDelay(attempt, error.message);
                    console.log(`⏳ 等待 ${waitTime / 1000} 秒后重试...`);
                    // 如果是SSL或证书问题，重启浏览器
                    if (error.message.includes('SSL') || error.message.includes('certificate')) {
                        console.log(`🔄 SSL问题检测到，重启浏览器...`);
                        await this.restartBrowserForSSLIssues();
                    }
                    await this.page.waitForTimeout(waitTime);
                }
            }
        }
        // 如果所有重试都失败了
        throw new Error(`页面导航失败，已重试 ${maxRetries} 次。最后错误: ${lastError?.message}`);
    }
    /**
     * 计算重试延迟时间
     * @param attempt - 当前重试次数
     * @param errorMessage - 错误信息
     * @returns 延迟时间（毫秒）
     */
    calculateRetryDelay(attempt, errorMessage) {
        let baseDelay = attempt * 2000; // 基础延迟
        // 根据错误类型调整延迟
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            baseDelay *= 3; // 频率限制时延长等待
        }
        else if (errorMessage.includes('timeout')) {
            baseDelay *= 1.5; // 超时时适度延长
        }
        else if (errorMessage.includes('SSL') || errorMessage.includes('certificate')) {
            baseDelay *= 2; // SSL问题时延长等待
        }
        // 添加随机性避免同时重试
        const randomDelay = Math.random() * 1000;
        return Math.min(baseDelay + randomDelay, 10000); // 最大10秒
    }
    /**
     * 处理反检测措施
     */
    async handleAntiDetection() {
        if (!this.page)
            return;
        try {
            console.log(`🛡️ 应用额外的反检测措施...`);
            // 随机鼠标移动
            await this.page.mouse.move(Math.random() * 800 + 100, Math.random() * 600 + 100);
            // 随机等待
            await this.page.waitForTimeout(1000 + Math.random() * 2000);
            // 模拟页面交互
            await this.page.evaluate(() => {
                // 模拟滚动
                window.scrollTo(0, Math.random() * 100);
            });
        }
        catch (e) {
            console.log(`⚠️ 反检测措施应用失败:`, e);
        }
    }
    /**
     * 为SSL问题重启浏览器
     */
    async restartBrowserForSSLIssues() {
        try {
            console.log(`🔄 因SSL问题重启浏览器...`);
            await this.closeBrowser();
            await this.launchBrowser();
            console.log(`✅ 浏览器重启完成`);
        }
        catch (error) {
            console.error(`❌ 浏览器重启失败:`, error.message);
            throw error;
        }
    }
    /**
     * 智能等待机制 - 等待页面稳定
     */
    async intelligentWait() {
        if (!this.page)
            return;
        try {
            // 等待页面变得稳定
            console.log('🔄 开始智能等待...');
            // 1. 等待基本DOM结构
            try {
                await this.page.waitForSelector('body', { timeout: 5000 });
                console.log('✅ 页面body元素已加载');
            }
            catch (e) {
                console.log('⚠️ 等待body元素超时');
            }
            // 2. 检查页面是否还在加载中
            let loadingStableCount = 0;
            const maxWaitTime = 10000; // 最多等待10秒
            const checkInterval = 1000; // 每秒检查一次
            const startTime = Date.now();
            while (Date.now() - startTime < maxWaitTime) {
                try {
                    const isLoading = await this.page.evaluate(() => {
                        // 检查多个加载指标
                        const hasLoadingElements = document.querySelector('[class*="loading"], [class*="spinner"], [id*="loading"]') !== null;
                        const documentReady = document.readyState === 'complete';
                        const networkActive = performance?.getEntriesByType?.('navigation')?.[0]?.loadEventEnd > 0;
                        return !documentReady || hasLoadingElements;
                    });
                    if (!isLoading) {
                        loadingStableCount++;
                        if (loadingStableCount >= 2) {
                            console.log('✅ 页面已稳定');
                            break;
                        }
                    }
                    else {
                        loadingStableCount = 0; // 重置计数
                    }
                    await this.page.waitForTimeout(checkInterval);
                }
                catch (e) {
                    console.log('⚠️ 页面稳定性检查出错，继续等待');
                    break;
                }
            }
            // 3. 最后的缓冲等待
            await this.page.waitForTimeout(1000);
            console.log('✅ 智能等待完成');
        }
        catch (error) {
            console.log('⚠️ 智能等待过程中出错:', error.message);
        }
    }
    /**
     * 设置网络拦截器
     */
    async setupInterceptors() {
        if (!this.page)
            return;
        // 拦截所有响应
        this.page.on('response', async (response) => {
            const url = response.url();
            const contentType = response.headers()['content-type'] || '';
            // 检查是否是JavaScript文件
            if (this.isJavaScriptFile(url, contentType)) {
                try {
                    const content = await response.text();
                    // 保存文件到本地（保存到catch文件夹）
                    const localPath = this.saveFileToLocal(content, url);
                    this.capturedFiles.push({
                        url: url,
                        content: content,
                        size: content.length,
                        headers: response.headers(),
                        method: response.request().method(),
                        timestamp: Date.now(),
                        localPath: localPath
                    });
                    console.log(`捕获JS文件: ${url} (${content.length} bytes) -> 已保存到: ${localPath}`);
                }
                catch (err) {
                    console.error(`无法读取JS内容: ${url}`, err);
                }
            }
        });
        // 拦截请求以修改headers
        await this.page.route('**/*', async (route) => {
            const headers = {
                ...route.request().headers(),
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            };
            await route.continue({ headers });
        });
    }
    /**
     * 判断是否是JavaScript文件
     * @param url - 文件URL
     * @param contentType - Content-Type header
     * @returns 是否是JS文件
     */
    isJavaScriptFile(url, contentType) {
        // 检查文件扩展名
        const jsExtensions = ['.js', '.mjs', '.jsx', '.ts', '.tsx'];
        const hasJSExtension = jsExtensions.some(ext => url.includes(ext));
        // 检查Content-Type
        const jsContentTypes = [
            'application/javascript',
            'application/x-javascript',
            'text/javascript',
            'application/ecmascript',
            'application/x-ecmascript',
            'text/ecmascript'
        ];
        const hasJSContentType = jsContentTypes.some(type => contentType.includes(type));
        return hasJSExtension || hasJSContentType;
    }
    /**
     * 使用断点进行调试
     * @param debugData - 调试配置数据
     * @returns 调试结果
     */
    async debugWithBreakpoints(debugData) {
        try {
            await this.launchBrowser();
            if (!this.page) {
                throw new Error('页面初始化失败');
            }
            // 启用CDP Session用于调试
            const client = await this.page.context().newCDPSession(this.page);
            // 启用调试器
            await client.send('Debugger.enable');
            await client.send('Runtime.enable');
            // 设置断点
            for (const bp of debugData.breakpoints) {
                await client.send('Debugger.setBreakpointByUrl', {
                    lineNumber: bp.lineNumber - 1, // CDP使用0-based行号
                    url: bp.url,
                    condition: bp.condition
                });
            }
            // 监听断点事件
            const debugInfo = [];
            client.on('Debugger.paused', async (params) => {
                console.log('断点触发:', params);
                // 获取调用栈
                const callFrames = params.callFrames;
                // 获取作用域变量
                const scopeChain = callFrames[0]?.scopeChain || [];
                debugInfo.push({
                    reason: params.reason,
                    location: params.callFrames[0]?.location,
                    scopeChain: scopeChain,
                    timestamp: Date.now()
                });
                // 继续执行
                await client.send('Debugger.resume');
            });
            // 导航到页面 - 使用智能导航
            await this.smartNavigate(debugData.url);
            // 等待一段时间收集调试信息
            await this.page.waitForTimeout(5000);
            return {
                success: true,
                debugInfo: debugInfo,
                capturedFiles: this.capturedFiles
            };
        }
        catch (error) {
            console.error('调试时出错:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * 从catch目录读取所有JS文件
     * @returns 本地JS文件信息数组
     */
    async readCapturedFiles() {
        const files = [];
        const catchPath = this.catchDir;
        console.log(`读取catch目录: ${catchPath}`);
        if (!fs.existsSync(catchPath)) {
            console.log(`catch目录不存在: ${catchPath}`);
            return files;
        }
        const fileList = fs.readdirSync(catchPath);
        console.log(`找到 ${fileList.length} 个文件`);
        for (const fileName of fileList) {
            const filePath = path.join(catchPath, fileName);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const stats = fs.statSync(filePath);
                // 从文件名提取原始信息
                const parts = fileName.split('_');
                const hostname = parts[0];
                const timestamp = parseInt(parts[1]) || Date.now();
                files.push({
                    url: fileName, // 使用文件名作为标识
                    content: content,
                    size: stats.size,
                    headers: {},
                    method: 'GET',
                    timestamp: timestamp,
                    localPath: filePath
                });
                console.log(`成功读取文件: ${fileName}`);
            }
            catch (error) {
                console.error(`无法读取文件 ${filePath}:`, error);
            }
        }
        console.log(`成功读取 ${files.length} 个文件`);
        return files;
    }
    /**
     * 关闭浏览器
     */
    async closeBrowser() {
        if (this.page) {
            await this.page.close();
            this.page = null;
        }
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
    /**
     * 网络连接诊断工具
     * @param url - 要测试的URL
     * @returns 诊断结果
     */
    async diagnosticNetworkIssues(url) {
        const result = {
            accessible: false,
            loadTime: 0,
            errors: [],
            suggestions: [],
            details: {},
            pageState: undefined
        };
        const startTime = Date.now();
        try {
            console.log(`🔍 开始增强版网络诊断: ${url}`);
            // 启动诊断用的浏览器实例
            await this.launchBrowser();
            if (!this.page) {
                throw new Error('浏览器启动失败');
            }
            // 监听网络事件
            const networkEvents = [];
            const consoleErrors = [];
            const jsErrors = [];
            // 监听控制台错误
            this.page.on('console', msg => {
                if (msg.type() === 'error') {
                    consoleErrors.push(msg.text());
                }
            });
            // 监听JavaScript错误
            this.page.on('pageerror', error => {
                jsErrors.push(error.message);
            });
            // 监听网络失败
            this.page.on('requestfailed', request => {
                networkEvents.push({
                    type: 'failed',
                    url: request.url(),
                    method: request.method(),
                    failure: request.failure()?.errorText
                });
            });
            // 监听请求超时
            this.page.on('response', response => {
                if (response.status() >= 400) {
                    networkEvents.push({
                        type: 'error_response',
                        url: response.url(),
                        status: response.status(),
                        statusText: response.statusText()
                    });
                }
            });
            // 尝试多种诊断策略
            const diagnosticStrategies = [
                // 策略1：基础连接测试
                async () => {
                    console.log('📊 策略1：基础连接测试');
                    const response = await this.page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 10000
                    });
                    return response;
                },
                // 策略2：降级加载测试
                async () => {
                    console.log('📊 策略2：降级加载测试');
                    const response = await this.page.goto(url, {
                        waitUntil: 'commit',
                        timeout: 15000
                    });
                    return response;
                },
                // 策略3：最小化等待
                async () => {
                    console.log('📊 策略3：最小化等待');
                    const response = await this.page.goto(url, {
                        timeout: 20000
                    });
                    return response;
                }
            ];
            let lastResponse = null;
            let strategyUsed = '';
            for (let i = 0; i < diagnosticStrategies.length; i++) {
                try {
                    const strategy = diagnosticStrategies[i];
                    lastResponse = await strategy();
                    strategyUsed = `策略${i + 1}`;
                    console.log(`✅ ${strategyUsed} 成功`);
                    break;
                }
                catch (error) {
                    console.log(`❌ 策略${i + 1} 失败: ${error.message}`);
                    result.errors.push(`策略${i + 1}失败: ${error.message}`);
                    continue;
                }
            }
            if (lastResponse) {
                result.accessible = true;
                result.loadTime = Date.now() - startTime;
                // 执行页面状态检测
                try {
                    const pageState = await this.enhancedIntelligentWait(url);
                    result.pageState = pageState;
                    // 获取页面基本信息
                    const pageInfo = await this.page.evaluate(() => ({
                        title: document.title,
                        readyState: document.readyState,
                        url: window.location.href,
                        userAgent: navigator.userAgent,
                        hasContent: document.body ? document.body.innerText.length > 0 : false
                    }));
                    result.details = {
                        ...result.details,
                        response: {
                            status: lastResponse.status(),
                            statusText: lastResponse.statusText(),
                            headers: lastResponse.headers(),
                            url: lastResponse.url()
                        },
                        page: pageInfo,
                        pageState: pageState,
                        strategyUsed,
                        networkEvents,
                        consoleErrors,
                        jsErrors
                    };
                }
                catch (e) {
                    result.errors.push(`获取页面信息失败: ${e.message}`);
                }
                // 分析问题并提供建议
                this.analyzeDiagnosticResults(result);
            }
            else {
                result.accessible = false;
                result.errors.push('所有连接策略都失败了');
            }
        }
        catch (error) {
            result.accessible = false;
            result.errors.push(`诊断过程出错: ${error.message}`);
        }
        finally {
            // 清理诊断资源
            try {
                await this.closeBrowser();
            }
            catch (e) {
                console.log('清理浏览器资源时出错');
            }
        }
        result.loadTime = Date.now() - startTime;
        return result;
    }
    /**
     * 分析诊断结果并提供建议
     * @param result - 诊断结果对象
     */
    analyzeDiagnosticResults(result) {
        const { details, pageState } = result;
        // 分析响应状态
        if (details.response) {
            const status = details.response.status;
            if (status === 403) {
                result.suggestions.push('🚫 网站可能有反爬机制，建议：1) 增加随机延迟 2) 使用更真实的User-Agent 3) 考虑使用代理');
            }
            else if (status === 404) {
                result.suggestions.push('❓ URL不存在，请检查URL是否正确');
            }
            else if (status >= 500) {
                result.suggestions.push('⚠️ 服务器错误，建议稍后重试或检查目标网站状态');
            }
            else if (status === 429) {
                result.suggestions.push('⏱️ 请求过于频繁，建议增加请求间隔');
            }
        }
        // 分析加载时间
        if (result.loadTime > 30000) {
            result.suggestions.push('🐌 页面加载时间过长，建议：1) 检查网络连接 2) 考虑使用headless模式 3) 优化等待策略');
        }
        // 分析页面状态
        if (pageState) {
            if (!pageState.hasContent && pageState.isJSRendered) {
                result.suggestions.push('⚡ 检测到JavaScript应用但内容为空，建议：1) 增加等待时间 2) 触发更多交互 3) 检查是否需要登录');
            }
            else if (!pageState.hasContent && !pageState.isJSRendered) {
                result.suggestions.push('📄 页面内容为空且非JS应用，可能的原因：1) 页面加载失败 2) 需要特殊参数 3) 反爬机制');
            }
            else if (pageState.loadingIndicators.length > 0) {
                result.suggestions.push(`⏳ 检测到加载指示器(${pageState.loadingIndicators.join(', ')})，页面可能仍在加载中`);
            }
            if (pageState.errors.length > 0) {
                result.suggestions.push(`⚠️ 页面状态错误: ${pageState.errors.join(', ')}`);
            }
        }
        // 分析网络事件
        if (details.networkEvents?.length > 0) {
            const failedRequests = details.networkEvents.filter((e) => e.type === 'failed');
            if (failedRequests.length > 0) {
                result.suggestions.push('🌐 检测到网络请求失败，可能的原因：1) 网络连接不稳定 2) DNS解析问题 3) 防火墙阻挡');
            }
        }
        // 分析JavaScript错误
        if (details.jsErrors?.length > 0) {
            result.suggestions.push('⚠️ 页面存在JavaScript错误，可能影响动态内容加载');
        }
        // 提供通用建议
        if (result.suggestions.length === 0 && result.accessible) {
            result.suggestions.push('✅ 页面可以正常访问，如果仍有问题，建议检查具体的业务逻辑');
        }
    }
    /**
     * 快速网站可访问性检查
     * @param url - 目标URL
     * @returns 简单的可访问性结果
     */
    async quickAccessibilityCheck(url) {
        try {
            console.log(`🚀 快速检查: ${url}`);
            await this.launchBrowser();
            if (!this.page) {
                return { success: false, message: '浏览器启动失败' };
            }
            const response = await this.page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            // 执行页面状态检测
            const pageState = await this.detectPageState(8000);
            const success = response !== null && response.status() < 400 && pageState.hasContent;
            let message = '';
            if (!response || response.status() >= 400) {
                message = `❌ 网站访问失败 (${response?.status()})`;
            }
            else if (!pageState.hasContent) {
                message = `⚠️ 网站可访问但内容为空 (${response.status()}) - ${pageState.isJSRendered ? 'JavaScript应用可能需要更多时间渲染' : '可能是静态页面问题'}`;
            }
            else {
                message = `✅ 网站可访问且有内容 (${response.status()})`;
            }
            return { success, message, pageState };
        }
        catch (error) {
            return {
                success: false,
                message: `❌ 访问失败: ${error.message}`
            };
        }
        finally {
            await this.closeBrowser();
        }
    }
    /**
     * 清理资源
     */
    async dispose() {
        // 清理Playwright资源
        await this.closeBrowser();
        this.capturedFiles = [];
        this.capturedUrls = [];
        this.visitedRoutes = [];
        // 清理Python服务
        if (this.pythonServiceProcess) {
            try {
                this.pythonServiceProcess.kill();
                console.log('✅ Python服务已停止');
            }
            catch (error) {
                console.log('停止Python服务时出错:', error);
            }
        }
    }
    /**
     * 获取爬虫引擎状态
     */
    async getEngineStatus() {
        const playwrightStatus = true; // Playwright总是可用的
        const drissionPageStatus = await this.testPythonBackend();
        return {
            playwright: playwrightStatus,
            drissionPage: drissionPageStatus
        };
    }
}
exports.CrawlerService = CrawlerService;
//# sourceMappingURL=CrawlerService.js.map