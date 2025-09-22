/**
 * Playwright爬虫服务 - 负责浏览器控制和JS文件捕获
 * 单引擎版本 - 专注于Playwright功能
 */
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export interface JSFileInfo {
    url: string;
    content: string;
    size: number;
    headers: Record<string, string>;
    method: string;
    timestamp: number;
    localPath?: string; // 本地文件路径
}

/**
 * URL信息接口 - 用于存储捕获的所有URL信息
 */
export interface URLInfo {
    /** 请求URL */
    url: string;
    /** HTTP方法 */
    method: string;
    /** 响应状态码 */
    status: number;
    /** 响应状态文本 */
    statusText: string;
    /** 请求头 */
    requestHeaders: Record<string, string>;
    /** 响应头 */
    responseHeaders: Record<string, string>;
    /** 内容类型 */
    contentType: string;
    /** 响应大小（字节） */
    size: number;
    /** 是否是API接口（路径包含/api/或/v1/等） */
    isAPI: boolean;
    /** URL类型（js, css, image, api, other） */
    urlType: 'js' | 'css' | 'image' | 'api' | 'other';
    /** 时间戳 */
    timestamp: number;
}

export interface DebugBreakpoint {
    url: string;
    lineNumber: number;
    condition?: string;
}

/**
 * 页面状态检测结果
 */
export interface PageStateResult {
    hasContent: boolean;
    isJSRendered: boolean;
    isStable: boolean;
    contentScore: number;
    errors: string[];
    loadingIndicators: string[];
}

/**
 * SPA路由信息
 */
export interface SPARouteInfo {
    url: string;
    title: string;
    contentLength: number;
    timestamp: number;
}

export interface CrawlerConfig {
    /** 是否连接到现有的本地浏览器实例 */
    useExistingBrowser?: boolean;
    /** 现有浏览器的调试端口（默认9222） */
    debugPort?: number;
    /** 现有浏览器的WebSocket端点URL */
    wsEndpoint?: string;
    /** 是否启用详细日志 */
    verbose?: boolean;
    /** 是否使用真实的用户浏览器数据 */
    useRealUserData?: boolean;
    /** 自定义用户数据目录路径 */
    customUserDataDir?: string;
}

export class CrawlerService {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private capturedFiles: JSFileInfo[] = [];
    private capturedUrls: URLInfo[] = [];
    private visitedRoutes: SPARouteInfo[] = [];
    private config: CrawlerConfig;
    
    // 固定的catch文件夹路径
    private readonly catchDir = 'D:\\crawler\\crawler\\catch';

    constructor(config: CrawlerConfig = {}) {
        this.config = {
            useExistingBrowser: false,
            debugPort: 9222,
            verbose: false,
            useRealUserData: false,
            ...config
        };
        // 初始化时确保catch目录存在
        this.ensureCatchDirectory();
        
        if (this.config.verbose) {
            console.log('CrawlerService配置:', this.config);
        }
    }

    /**
     * 确保catch目录存在（不清理现有文件）
     */
    private ensureCatchDirectory() {
        const catchPath = this.catchDir;
        console.log(`确保catch目录存在: ${catchPath}`);
        
        if (!fs.existsSync(catchPath)) {
            fs.mkdirSync(catchPath, { recursive: true });
            console.log(`创建catch目录: ${catchPath}`);
        } else {
            console.log(`catch目录已存在: ${catchPath}`);
        }
    }

    /**
     * 保存JS文件到本地
     * @param content - 文件内容
     * @param url - 文件URL
     * @returns 本地文件路径
     */
    private saveFileToLocal(content: string, url: string): string {
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
        } catch (error) {
            console.error(`保存文件失败: ${localPath}`, error);
            return '';
        }
    }

    /**
     * 同时捕获目标URL的JS文件和所有网络请求URL
     * @param targetUrl - 目标网站URL
     * @returns 包含文件和URL的对象
     */
    async captureFilesAndUrls(targetUrl: string): Promise<{files: JSFileInfo[], urls: URLInfo[], routes: SPARouteInfo[], pageState?: PageStateResult}> {
        try {
            console.log(`🎯 开始Playwright爬取: ${targetUrl}`);
            
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

            return {
                files: this.capturedFiles,
                urls: this.capturedUrls,
                routes: this.visitedRoutes,
                pageState
            };

        } catch (error) {
            console.error('Playwright爬取失败:', error);
            throw error;
        }
    }

    /**
     * 捕获目标URL的所有JS文件
     * @param targetUrl - 目标网站URL
     * @returns 捕获的JS文件信息数组
     */
    async captureJSFiles(targetUrl: string): Promise<JSFileInfo[]> {
        try {
            const result = await this.captureFilesAndUrls(targetUrl);
            return result.files;
        } catch (error) {
            console.error('捕获JS文件时出错:', error);
            throw error;
        }
    }

    /**
     * 捕获目标URL的所有网络请求URL
     * @param targetUrl - 目标网站URL
     * @returns 捕获的URL信息数组
     */
    async captureAllUrls(targetUrl: string): Promise<URLInfo[]> {
        try {
            const result = await this.captureFilesAndUrls(targetUrl);
            return result.urls;
        } catch (error) {
            console.error('捕获URL时出错:', error);
            throw error;
        }
    }

    /**
     * 增强版页面状态检测 - 检测页面内容和JavaScript渲染状态
     * @param maxWaitTime - 最大等待时间（毫秒）
     * @returns 页面状态检测结果
     */
    private async detectPageState(maxWaitTime: number = 15000): Promise<PageStateResult> {
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

        const result: PageStateResult = {
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
                    const hasReact = !!(window as any).React || document.querySelector('[data-reactroot], #react-root, #root [data-react]');
                    const hasVue = !!(window as any).Vue || document.querySelector('[data-v-]');
                    const hasAngular = !!(window as any).ng || document.querySelector('[ng-app], [ng-controller]');
                    
                    // 5. 异步操作检测
                    const pendingRequests = (performance as any)?.getEntriesByType?.('navigation')?.[0]?.loadEventEnd === 0;
                    
                    // 6. JavaScript渲染内容检测
                    const scriptElements = document.querySelectorAll('script').length;
                    const dynamicElements = document.querySelectorAll('[data-v-], [data-react], [ng-]').length;
                    
                    // 7. 内容复杂度评分
                    let contentScore = 0;
                    contentScore += Math.min(textContent.length / 100, 50); // 文本长度得分
                    contentScore += Math.min(visibleElements / 10, 30); // 元素数量得分
                    contentScore += Math.min(htmlContent.length / 1000, 20); // HTML长度得分
                    
                    // 8. 错误检测
                    const errors: string[] = [];
                    if (textContent.length < 10) errors.push('页面文本内容过少');
                    if (visibleElements < 5) errors.push('页面DOM元素过少');
                    if (documentReady !== 'complete' && Date.now() - (window as any).__pageStartTime > 10000) {
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
                result.isJSRendered = Boolean(pageState.hasReact || pageState.hasVue || pageState.hasAngular || pageState.dynamicElements > 0);
                result.errors = pageState.errors;
                result.loadingIndicators = pageState.loadingElements.map(le => le.selector);

                // 稳定性检测：内容得分连续几次检测没有大幅变化
                if (Math.abs(pageState.contentScore - lastContentScore) < 5) {
                    stableCount++;
                } else {
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

            } catch (error: any) {
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
    private async enhancedIntelligentWait(url?: string): Promise<PageStateResult> {
            if (!this.page) {
            throw new Error('页面未初始化');
        }

        console.log(`🤖 开始增强版智能等待... ${url ? `URL: ${url}` : ''}`);

        try {
            // 注入页面加载时间戳（用于后续检测）
            await this.page.addInitScript(() => {
                (window as any).__pageStartTime = Date.now();
            });

            // 1. 基础等待 - 确保DOM基本结构加载
            try {
                await this.page.waitForSelector('body', { timeout: 5000 });
                console.log('✅ 基础DOM结构已加载');
            } catch (e) {
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
                } catch (e) {
                    console.log('📸 截图失败:', e);
                }
            }

            return pageState;

        } catch (error: any) {
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
    private async triggerJSContent(): Promise<void> {
        if (!this.page) return;

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

        } catch (error: any) {
            console.log('⚠️ 触发JS内容时出错:', error.message);
        }
    }

    /**
     * 激进式内容触发 - 用于处理复杂的SPA应用
     */
    private async aggressiveContentTrigger(): Promise<void> {
        if (!this.page) return;

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
                } catch (e) {
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
            } catch (e) {
                console.log('⚠️ 悬停主内容区域失败');
            }

            // 4. 触发键盘事件（某些应用监听键盘事件）
            await this.page.keyboard.press('Tab');
            await this.page.waitForTimeout(500);
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(500);

        } catch (error: any) {
            console.log('⚠️ 激进式内容触发时出错:', error.message);
        }
    }

    /**
     * SPA路由导航处理 - 处理单页应用的路由跳转
     * @param targetSelector - 要点击的目标选择器
     * @param expectedUrlPattern - 期望的URL模式（可选）
     * @param maxWaitTime - 最大等待时间
     */
    async navigateInSPA(targetSelector: string, expectedUrlPattern?: string, maxWaitTime: number = 10000): Promise<SPARouteInfo | null> {
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
            let routeInfo: SPARouteInfo | null = null;
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
            } else {
                console.log(`✅ SPA导航成功完成: ${routeInfo.url}`);
            }

            return routeInfo;

        } catch (error: any) {
            console.error(`❌ SPA导航失败: ${error.message}`);
            return null;
        }
    }

    /**
     * 增强版动态内容触发 - 替代原有的triggerDynamicContent
     */
    private async triggerDynamicContent() {
        if (!this.page) return;

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

        } catch (error: any) {
            console.log('⚠️ 触发动态内容时出错:', error.message);
        }
    }

    /**
     * 执行滚动触发
     */
    private async performScrollTrigger(): Promise<void> {
        if (!this.page) return;

        console.log('📜 执行滚动触发...');
        
        try {
            // 滚动到页面底部触发懒加载
            await this.page.evaluate(() => {
                const scrollHeight = document.body.scrollHeight;
                const viewportHeight = window.innerHeight;
                const scrollSteps = Math.ceil(scrollHeight / viewportHeight);
                
                return new Promise<void>((resolve) => {
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

        } catch (e) {
            console.log('⚠️ 滚动触发失败:', e);
        }
    }

    /**
     * 执行交互元素触发
     */
    private async performInteractiveElementsTrigger(): Promise<void> {
        if (!this.page) return;

        console.log('🎯 执行交互元素触发...');

        try {
            // 查找并点击各种可能触发内容的元素
            const interactiveSelectors = [
                'button:visible:not([disabled])',
                'a[href*="#"]:visible',  // 哈希链接，可能是SPA路由
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
                        } catch (clickError) {
                            console.log(`❌ 点击第 ${i + 1} 个元素失败:`, clickError);
                        }
                    }

                } catch (e) {
                    console.log(`⚠️ 处理 ${selector} 时出错:`, e);
                }
            }

        } catch (error: any) {
            console.log('⚠️ 交互元素触发失败:', error.message);
        }
    }

    /**
     * 探索SPA路由
     */
    private async exploreSPARoutes(): Promise<void> {
        if (!this.page) return;

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

                } catch (e) {
                    console.log(`⚠️ 探索路由 ${selector} 时出错:`, e);
                }
            }

        } catch (error: any) {
            console.log('⚠️ SPA路由探索失败:', error.message);
        }
    }

    /**
     * 执行表单交互
     */
    private async performFormInteraction(): Promise<void> {
        if (!this.page) return;

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
                } catch (e) {
                    console.log(`⚠️ 搜索框交互失败 ${selector}:`, e);
                }
            }

        } catch (error: any) {
            console.log('⚠️ 表单交互失败:', error.message);
        }
    }

    /**
     * 获取已访问的SPA路由信息
     * @returns 访问过的路由列表
     */
    getVisitedRoutes(): SPARouteInfo[] {
        return this.visitedRoutes;
    }

    /**
     * 清空访问过的路由记录
     */
    clearVisitedRoutes(): void {
        this.visitedRoutes = [];
    }

    /**
     * 判断URL是否是API接口
     * @param url - 要检查的URL
     * @returns 是否是API接口
     */
    private isApiUrl(url: string): boolean {
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
    private getUrlType(url: string, contentType: string): 'js' | 'css' | 'image' | 'api' | 'other' {
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
     * 设置综合网络拦截器（同时捕获JS文件和所有URL）
     */
    private async setupCombinedInterceptors() {
        if (!this.page) return;

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
                } catch (err) {
                    // 某些响应可能无法获取body
                    const contentLength = responseHeaders['content-length'];
                    size = contentLength ? parseInt(contentLength, 10) : 0;
                }

                const urlType = this.getUrlType(url, contentType);

                // 捕获所有URL信息
                const urlInfo: URLInfo = {
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
                    
                    const fileInfo: JSFileInfo = {
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

            } catch (error) {
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
    filterApiUrls(urls?: URLInfo[]): URLInfo[] {
        const urlList = urls || this.capturedUrls;
        return urlList.filter(urlInfo => urlInfo.isAPI);
    }

    /**
     * 按URL类型分组
     * @param urls - URL列表（可选，默认使用当前捕获的URL）
     * @returns 按类型分组的URL
     */
    groupUrlsByType(urls?: URLInfo[]): Record<string, URLInfo[]> {
        const urlList = urls || this.capturedUrls;
        return urlList.reduce((groups, urlInfo) => {
            const type = urlInfo.urlType;
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(urlInfo);
            return groups;
        }, {} as Record<string, URLInfo[]>);
    }

    /**
     * 按关键词搜索URL
     * @param keyword - 搜索关键词
     * @param urls - URL列表（可选，默认使用当前捕获的URL）
     * @returns 匹配的URL列表
     */
    searchUrls(keyword: string, urls?: URLInfo[]): URLInfo[] {
        const urlList = urls || this.capturedUrls;
        const lowerKeyword = keyword.toLowerCase();
        return urlList.filter(urlInfo => 
            urlInfo.url.toLowerCase().includes(lowerKeyword)
        );
    }

    /**
     * 启动浏览器 - 增强反检测能力
     */
    private async launchBrowser() {
        // 关闭现有浏览器
        await this.closeBrowser();

        if (this.config.useExistingBrowser) {
            await this.connectToExistingBrowser();
        } else {
            await this.launchNewBrowser();
        }
    }

    /**
     * 连接到现有的本地浏览器实例
     */
    private async connectToExistingBrowser() {
        try {
            let wsEndpoint = this.config.wsEndpoint;
            
            // 如果没有指定WebSocket端点，尝试连接或启动浏览器
            if (!wsEndpoint) {
                const debugPort = this.config.debugPort || 9222;
                if (this.config.verbose) {
                    console.log(`尝试连接到本地浏览器调试端口: ${debugPort}`);
                }
                
                // 首先尝试连接现有浏览器
                let endpointResult = await this.getBrowserWebSocketEndpoint(debugPort);
                
                // 如果无法连接，尝试启动用户的本地浏览器
                if (!endpointResult) {
                    if (this.config.verbose) {
                        console.log('未找到现有浏览器实例，尝试启动本地浏览器...');
                    }
                    await this.launchUserBrowserWithDebug(debugPort);
                    
                    // 等待浏览器启动完成
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // 再次尝试连接
                    endpointResult = await this.getBrowserWebSocketEndpoint(debugPort);
                }
                
                wsEndpoint = endpointResult || undefined;
                if (this.config.verbose && wsEndpoint) {
                    console.log(`获取到WebSocket端点: ${wsEndpoint}`);
                }
            }
            
            if (!wsEndpoint) {
                throw new Error(`无法获取浏览器WebSocket端点。可能的原因：
1. 浏览器启动失败
2. 调试端口${this.config.debugPort || 9222}被占用
3. 防火墙阻止了连接`);
            }
            
            // 连接到现有浏览器
            this.browser = await chromium.connectOverCDP(wsEndpoint);
            
            if (this.config.verbose) {
                console.log('成功连接到现有浏览器实例');
            }
            
            // 设置浏览器上下文和页面
            await this.setupBrowserContext();
            
        } catch (error: any) {
            console.error('连接现有浏览器失败:', error.message);
            if (this.config.verbose) {
                console.log('回退到启动新浏览器实例');
            }
            // 回退到启动新浏览器
            await this.launchNewBrowser();
        }
    }

    /**
     * 启动用户的本地浏览器并添加调试参数
     */
    private async launchUserBrowserWithDebug(debugPort: number): Promise<void> {
        const { spawn } = require('child_process');
        
        try {
            let selectedBrowser: {name: string, path: string};
            let userDataDir: string;
            
            // 根据配置选择浏览器启动方式
            if (this.config.useRealUserData) {
                // 使用真实用户数据
                const userDataBrowsers = await this.detectUserDataDirectories();
                
                if (userDataBrowsers.length === 0) {
                    throw new Error('未找到可用的真实用户数据目录');
                }
                
                const realDataBrowser = userDataBrowsers[0];
                selectedBrowser = { name: realDataBrowser.name, path: realDataBrowser.path };
                
                // 使用自定义路径或真实用户数据目录
                userDataDir = this.config.customUserDataDir || realDataBrowser.dataDir;
                
                if (this.config.verbose) {
                    console.log(`使用真实用户数据: ${realDataBrowser.name}`);
                    console.log(`数据目录: ${userDataDir}`);
                }
                
            } else {
                // 使用常规检测
                const browserPaths = await this.detectBrowserPaths();
                
                if (browserPaths.length === 0) {
                    throw new Error('未找到可用的浏览器');
                }
                
                selectedBrowser = browserPaths[0];
                // 使用临时目录
                userDataDir = require('path').join(require('os').tmpdir(), 'crawler-browser-profile');
            }
            
            if (this.config.verbose) {
                console.log(`启动浏览器: ${selectedBrowser.name} at ${selectedBrowser.path}`);
            }
            
            // 准备启动参数 - 根据是否使用真实数据调整
            const args = [
                `--remote-debugging-port=${debugPort}`,
                `--user-data-dir=${userDataDir}`,
                
                // 基础反检测参数
                '--no-first-run',
                '--disable-default-apps',
                '--disable-popup-blocking',
                '--disable-translate',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ];
            
            // 如果使用真实用户数据，减少一些可能干扰的参数
            if (this.config.useRealUserData) {
                // 使用真实数据时的温和参数
                args.push(
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--no-sandbox',
                    '--disable-dev-shm-usage'
                );
                
                if (this.config.verbose) {
                    console.log('使用真实用户数据模式，应用温和的反检测参数');
                }
            } else {
                // 临时数据时的完整隐蔽参数
                args.push(
                    // 增强反检测参数
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-ipc-flooding-protection',
                    '--disable-web-security',
                    '--disable-features=TranslateUI',
                    '--disable-extensions-except',
                    '--disable-extensions',
                    '--disable-component-extensions-with-background-pages',
                    '--no-default-browser-check',
                    '--no-pings',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu-sandbox',
                    '--disable-background-networking',
                    '--disable-sync',
                    '--disable-prompt-on-repost',
                    '--disable-client-side-phishing-detection',
                    '--disable-component-update',
                    '--disable-domain-reliability',
                    '--disable-features=AudioServiceOutOfProcess',
                    '--disable-features=ImprovedCookieControls',
                    '--disable-features=LazyFrameLoading',
                    '--disable-features=GlobalMediaControls',
                    '--disable-hang-monitor',
                    '--disable-plugins-discovery',
                    '--disable-print-preview',
                    '--disable-notifications',
                    '--mute-audio',
                    
                    // 隐蔽性参数
                    '--incognito',
                    '--disable-logging',
                    '--silent-debugger-extension-api',
                    '--autoplay-policy=user-gesture-required',
                    '--disable-restore-session-state',
                    '--disable-ipc-flooding-protection',
                    
                    // 性能优化
                    '--max_old_space_size=4096',
                    '--memory-pressure-off',
                    '--disable-background-networking'
                );
            }
            
            // 启动浏览器进程
            const browserProcess = spawn(selectedBrowser.path, args, {
                detached: true,
                stdio: 'ignore'
            });
            
            // 分离进程，让浏览器独立运行
            browserProcess.unref();
            
            if (this.config.verbose) {
                console.log(`浏览器启动命令: ${selectedBrowser.path} ${args.join(' ')}`);
            }
            
        } catch (error: any) {
            console.error('启动本地浏览器失败:', error.message);
            throw error;
        }
    }

    /**
     * 检测用户真实的浏览器数据目录
     */
    private async detectUserDataDirectories(): Promise<Array<{name: string, path: string, dataDir: string}>> {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const userDataDirs: Array<{name: string, path: string, dataDir: string}> = [];
        
        if (os.platform() === 'win32') {
            const localAppData = process.env.LOCALAPPDATA;
            
            // Chrome用户数据目录
            const chromeUserData = path.join(localAppData, 'Google', 'Chrome', 'User Data');
            const chromeExePaths = [
                path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
            ];
            
            for (const exePath of chromeExePaths) {
                try {
                    if (fs.existsSync(exePath) && fs.existsSync(chromeUserData)) {
                        userDataDirs.push({
                            name: 'Google Chrome (真实数据)',
                            path: exePath,
                            dataDir: chromeUserData
                        });
                        break;
                    }
                } catch (error) {
                    // 忽略错误，继续检查下一个路径
                }
            }
            
            // Edge用户数据目录
            const edgeUserData = path.join(localAppData, 'Microsoft', 'Edge', 'User Data');
            const edgeExePaths = [
                path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
                path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
            ];
            
            for (const exePath of edgeExePaths) {
                try {
                    if (fs.existsSync(exePath) && fs.existsSync(edgeUserData)) {
                        userDataDirs.push({
                            name: 'Microsoft Edge (真实数据)',
                            path: exePath,
                            dataDir: edgeUserData
                        });
                        break;
                    }
                } catch (error) {
                    // 忽略错误，继续检查下一个路径
                }
            }
        }
        
        if (this.config.verbose) {
            console.log('检测到的用户数据目录:', userDataDirs);
        }
        
        return userDataDirs;
    }

    /**
     * 检测系统中可用的浏览器路径
     */
    private async detectBrowserPaths(): Promise<Array<{name: string, path: string}>> {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const browsers: Array<{name: string, path: string}> = [];
        
        if (os.platform() === 'win32') {
            // Windows浏览器路径
            const possiblePaths = [
                // Chrome
                {
                    name: 'Google Chrome',
                    paths: [
                        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
                        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
                        process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
                    ]
                },
                // Edge
                {
                    name: 'Microsoft Edge',
                    paths: [
                        process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
                        process.env.PROGRAMFILES + '\\Microsoft\\Edge\\Application\\msedge.exe',
                        process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe'
                    ]
                },
                // Firefox (备用)
                {
                    name: 'Mozilla Firefox',
                    paths: [
                        process.env.PROGRAMFILES + '\\Mozilla Firefox\\firefox.exe',
                        process.env['PROGRAMFILES(X86)'] + '\\Mozilla Firefox\\firefox.exe'
                    ]
                }
            ];
            
            // 检查每个可能的路径
            for (const browser of possiblePaths) {
                for (const browserPath of browser.paths) {
                    try {
                        if (fs.existsSync(browserPath)) {
                            browsers.push({
                                name: browser.name,
                                path: browserPath
                            });
                            break; // 找到一个就跳出内层循环
                        }
                    } catch (error) {
                        // 忽略文件系统错误
                    }
                }
            }
        }
        
        if (this.config.verbose) {
            console.log('检测到的浏览器:', browsers);
        }
        
        return browsers;
    }

    /**
     * 设置浏览器上下文和页面（用于连接现有浏览器）
     */
    private async setupBrowserContext() {
        if (!this.browser) {
            throw new Error('浏览器实例不存在');
        }
        
        // 检查是否已有上下文
        const contexts = this.browser.contexts();
        
        if (contexts.length > 0) {
            // 使用现有上下文
            this.context = contexts[0];
            if (this.config.verbose) {
                console.log('使用现有浏览器上下文');
            }
            
            // 检查是否已有页面
            const pages = this.context.pages();
            if (pages.length > 0) {
                // 使用现有页面
                this.page = pages[0];
                if (this.config.verbose) {
                    console.log('使用现有页面');
                }
            } else {
                // 在现有上下文中创建新页面
                this.page = await this.context.newPage();
                if (this.config.verbose) {
                    console.log('在现有上下文中创建新页面');
                }
            }
        } else {
            // 创建新的上下文和页面 - 使用增强的反检测设置
            this.context = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                ignoreHTTPSErrors: true,
                acceptDownloads: false,
                hasTouch: false,
                isMobile: false,
                locale: 'zh-CN',
                timezoneId: 'Asia/Shanghai',
                colorScheme: 'light',
                reducedMotion: 'no-preference',
                bypassCSP: true,
                javaScriptEnabled: true,
                httpCredentials: undefined,
                serviceWorkers: 'block',
                // 增强的反检测设置
                extraHTTPHeaders: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Cache-Control': 'max-age=0',
                    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1'
                },
                // 权限设置
                permissions: ['geolocation', 'notifications'],
                geolocation: { latitude: 39.9042, longitude: 116.4074 } // 北京坐标
            });
            
            this.page = await this.context.newPage();
            
            if (this.config.verbose) {
                console.log('创建新的浏览器上下文和页面');
            }
        }
        
        // 为页面添加反检测脚本
        await this.addAntiDetectionScripts();
        
        // 添加额外的页面级反检测措施
        await this.addPageLevelProtection();
    }

    /**
     * 添加页面级反检测保护
     */
    private async addPageLevelProtection() {
        if (!this.page) return;
        
        // 1. 设置真实的视口和屏幕尺寸
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        
        // 2. 模拟真实的鼠标移动
        await this.page.mouse.move(100, 100);
        await this.page.waitForTimeout(100);
        await this.page.mouse.move(200, 150);
        
        // 3. 添加随机的用户行为监听器
        await this.page.addInitScript(() => {
            // 模拟真实的性能时间
            Object.defineProperty(window.performance, 'timing', {
                get: () => ({
                    navigationStart: Date.now() - Math.random() * 1000,
                    loadEventEnd: Date.now() + Math.random() * 2000,
                    domContentLoadedEventEnd: Date.now() + Math.random() * 1500
                })
            });
            
            // 模拟真实的连接信息
            Object.defineProperty(navigator, 'connection', {
                get: () => ({
                    effectiveType: '4g',
                    rtt: 100,
                    downlink: 10,
                    saveData: false
                })
            });
            
            // 添加真实的事件监听器
            let mouseMoveCount = 0;
            document.addEventListener('mousemove', () => {
                mouseMoveCount++;
            });
            
            // 模拟真实的滚动行为
            let scrollCount = 0;
            window.addEventListener('scroll', () => {
                scrollCount++;
            });
            
            // 隐藏自动化相关的全局变量
            Object.defineProperty(window, '_$webDriver_asynchronous_executor_', {
                get: () => undefined
            });
            
            Object.defineProperty(window, '_$webDriver_script_func_', {
                get: () => undefined
            });
        });
        
        // 4. 设置合理的请求拦截和修改
        await this.page.route('**/*', async (route) => {
            const request = route.request();
            const headers = request.headers();
            
            // 添加更真实的请求头
            headers['Accept'] = headers['Accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
            headers['Accept-Language'] = headers['Accept-Language'] || 'zh-CN,zh;q=0.9,en;q=0.8';
            headers['Cache-Control'] = 'no-cache';
            headers['Pragma'] = 'no-cache';
            
            // 移除可能暴露自动化的请求头
            delete headers['playwright'];
            delete headers['automation'];
            
            await route.continue({ headers });
        });
    }

    /**
     * 添加增强版反检测脚本
     */
    private async addAntiDetectionScripts() {
        if (!this.page) return;
        
        // 超级增强版反检测脚本注入
        await this.page.addInitScript(() => {
            // 1. 移除webdriver相关属性
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // 2. 修复window.chrome对象
            Object.defineProperty(window, 'chrome', {
                get: () => ({
                    runtime: {},
                    loadTimes: () => {},
                    csi: () => {},
                    app: {}
                }),
                configurable: true
            });
            
            // 3. 修复permissions API
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({
                    query: () => Promise.resolve({ state: 'granted' })
                })
            });
            
            // 4. 修复languages属性
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en-US', 'en']
            });
            
            // 5. 修复plugins数组，模拟真实浏览器
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    const plugins = [
                        {
                            name: 'Chrome PDF Plugin',
                            filename: 'internal-pdf-viewer',
                            description: 'Portable Document Format',
                            length: 1
                        },
                        {
                            name: 'Chrome PDF Viewer',
                            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                            description: '',
                            length: 1
                        },
                        {
                            name: 'Native Client',
                            filename: 'internal-nacl-plugin',
                            description: '',
                            length: 2
                        }
                    ];
                    (plugins as any).refresh = () => {};
                    return plugins;
                }
            });
            
            // 6. 修复mimeTypes
            Object.defineProperty(navigator, 'mimeTypes', {
                get: () => {
                    const mimeTypes = [
                        {
                            type: 'application/pdf',
                            suffixes: 'pdf',
                            description: 'Portable Document Format',
                            enabledPlugin: navigator.plugins[0]
                        }
                    ];
                    return mimeTypes;
                }
            });
            
            // 7. 修复硬件信息
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8
            });
            
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8
            });
            
            // 8. 修复userAgent相关
            Object.defineProperty(navigator, 'platform', {
                get: () => 'Win32'
            });
            
            Object.defineProperty(navigator, 'vendor', {
                get: () => 'Google Inc.'
            });
            
            Object.defineProperty(navigator, 'vendorSub', {
                get: () => ''
            });
            
            // 9. 修复Notification权限
            Object.defineProperty(window, 'Notification', {
                get: () => ({
                    permission: 'default',
                    requestPermission: () => Promise.resolve('default')
                })
            });
            
            // 10. 修复外观相关
            Object.defineProperty(navigator, 'cookieEnabled', {
                get: () => true
            });
            
            Object.defineProperty(navigator, 'onLine', {
                get: () => true
            });
            
            // 11. 隐藏自动化检测标记
            try {
                delete (window as any).Buffer;
                delete (window as any).emit;
                delete (window as any).spawn;
            } catch (e) {}
            
            // 12. 修复iframe检测
            Object.defineProperty(window, 'outerHeight', {
                get: () => window.innerHeight
            });
            
            Object.defineProperty(window, 'outerWidth', {
                get: () => window.innerWidth
            });
            
            // 13. 修复Image对象的toString方法
            const originalImageToString = HTMLImageElement.prototype.toString;
            HTMLImageElement.prototype.toString = function() {
                return originalImageToString.call(this);
            };
            
            // 14. 修复Function.toString检测
            const originalToString = Function.prototype.toString;
            Function.prototype.toString = function() {
                if (this === (window.navigator as any).webdriver) {
                    return 'function webdriver() { [native code] }';
                }
                return originalToString.call(this);
            };
            
            // 15. 模拟鼠标和键盘事件
            window.addEventListener('load', () => {
                // 模拟真实用户的随机行为
                setTimeout(() => {
                    document.dispatchEvent(new MouseEvent('mousemove', {
                        bubbles: true,
                        clientX: Math.random() * window.innerWidth,
                        clientY: Math.random() * window.innerHeight
                    }));
                }, Math.random() * 1000);
            });
            
            // 16. 修复WebGL指纹（简化版本）
            try {
                const originalGetContext = HTMLCanvasElement.prototype.getContext;
                (HTMLCanvasElement.prototype as any).getContext = function(contextType: string, ...args: any[]) {
                    const context = originalGetContext.call(this, contextType, ...args);
                    if ((contextType === 'webgl' || contextType === 'webgl2') && context) {
                        const webglContext = context as any;
                        const originalGetParameter = webglContext.getParameter.bind(webglContext);
                        webglContext.getParameter = function(parameter: number) {
                            if (parameter === 37445) return 'Intel Inc.';
                            if (parameter === 37446) return 'Intel(R) HD Graphics 620';
                            return originalGetParameter(parameter);
                        };
                    }
                    return context;
                };
            } catch (e) {}
            
            // 17. 修复Battery API
            Object.defineProperty(navigator, 'getBattery', {
                get: () => () => Promise.resolve({
                    charging: true,
                    chargingTime: 0,
                    dischargingTime: Infinity,
                    level: 1
                })
            });
            
            // 18. 设置真实的时区
            try {
                Intl.DateTimeFormat().resolvedOptions().timeZone = 'Asia/Shanghai';
            } catch (e) {}
            
            console.log('🔧 Super Anti-Detection Scripts Loaded');
        });
    }

    /**
     * 获取浏览器的WebSocket调试端点
     */
    private async getBrowserWebSocketEndpoint(port: number): Promise<string | null> {
        try {
            const response = await fetch(`http://localhost:${port}/json/version`);
            const data = await response.json();
            return data.webSocketDebuggerUrl;
        } catch (error) {
            if (this.config.verbose) {
                console.log(`无法从端口${port}获取WebSocket端点:`, (error as Error).message);
            }
            return null;
        }
    }

    /**
     * 启动新的浏览器实例
     */
    private async launchNewBrowser() {

        // 启动新浏览器 - 增强反检测设置 + SSL/网络优化
        this.browser = await chromium.launch({
            headless: false, // 设置为false以便调试
            devtools: false, // 关闭开发者工具以避免检测
            slowMo: 50,      // 减少延迟提高性能
            args: [
                // 核心反检测参数
                '--disable-blink-features=AutomationControlled', // 关键：禁用自动化控制特征
                '--disable-web-security',                         // 禁用Web安全
                '--disable-features=VizDisplayCompositor',
                '--disable-features=IsolateOrigins,site-per-process',
                
                // SSL和证书相关 - 基于搜索结果优化
                '--ignore-certificate-errors',           // 忽略证书错误
                '--ignore-ssl-errors',                   // 忽略SSL错误  
                '--ignore-certificate-errors-spki-list', // 忽略证书固定错误
                '--ignore-urlfetcher-cert-requests',     // 忽略URL获取器证书请求
                '--allow-running-insecure-content',      // 允许不安全内容
                '--allow-cross-origin-auth-prompt',      // 允许跨域认证提示
                
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
                '--max_old_space_size=4096',     // 增加内存限制
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
            bypassCSP: true,         // 绕过内容安全策略
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
            (window as any).chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };

            // 覆盖permissions API
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters: any) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission } as PermissionStatus) :
                    originalQuery(parameters)
            );

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
            Function.prototype.toString = function() {
                if (this === (window.navigator as any).webdriver) {
                    return 'function webdriver() { [native code] }';
                }
                return originalToString.call(this);
            };

            // 添加真实的performance.timing
            if (!(window as any).performance.timing) {
                (window as any).performance.timing = {
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
    private async smartNavigate(url: string, maxRetries = 3): Promise<void> {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`尝试导航到页面 (${attempt}/${maxRetries}): ${url}`);
            
            try {
                // 尝试多种等待策略 - 基于搜索结果优化
                const strategies = [
                    { name: '快速DOM', waitUntil: 'domcontentloaded' as const, timeout: 12000 },
                    { name: '完整加载', waitUntil: 'load' as const, timeout: 18000 },
                    { name: '网络空闲', waitUntil: 'networkidle' as const, timeout: 25000 },
                    { name: '提交状态', waitUntil: 'commit' as const, timeout: 8000 }  // 最宽松的策略
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
                            } else if (status === 404) {
                                throw new Error(`页面不存在 (404): ${url}`);
                            } else if (status >= 500) {
                                console.log(`⚠️ 服务器错误 ${status}，尝试下一个策略...`);
                                continue;
                            } else if (status === 429) {
                                console.log(`⏱️ 请求频率限制，等待更长时间...`);
                                await this.page.waitForTimeout(5000);
                                continue;
                            }
                        }

                        navigated = true;
                        console.log(`✅ 页面导航成功，使用策略: ${strategy.name}`);
                        break;

                    } catch (strategyError: any) {
                        console.log(`❌ 策略 ${strategy.name} 失败: ${strategyError.message}`);
                        
                        // 分析错误类型并应用对应处理
                        if (strategyError.message.includes('SSL') || strategyError.message.includes('certificate')) {
                            console.log(`🔒 SSL证书问题，已应用证书忽略设置`);
                        } else if (strategyError.message.includes('net::ERR_')) {
                            console.log(`🌐 网络连接问题: ${strategyError.message}`);
                        } else if (strategyError.message.includes('timeout')) {
                            console.log(`⏰ 超时问题，尝试更宽松的策略...`);
                        }
                        continue;
                    }
                }

                if (!navigated) {
                    throw new Error('所有导航策略都失败了');
                }

                return; // 成功导航，退出重试循环

            } catch (error: any) {
                lastError = error;
                console.error(`💥 导航尝试 ${attempt} 失败:`, error.message);

                // 重试前的特殊处理
                if (attempt < maxRetries) {
                    const waitTime = this.calculateRetryDelay(attempt, error.message);
                    console.log(`⏳ 等待 ${waitTime/1000} 秒后重试...`);
                    
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
    private calculateRetryDelay(attempt: number, errorMessage: string): number {
        let baseDelay = attempt * 2000; // 基础延迟

        // 根据错误类型调整延迟
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            baseDelay *= 3; // 频率限制时延长等待
        } else if (errorMessage.includes('timeout')) {
            baseDelay *= 1.5; // 超时时适度延长
        } else if (errorMessage.includes('SSL') || errorMessage.includes('certificate')) {
            baseDelay *= 2; // SSL问题时延长等待
        }

        // 添加随机性避免同时重试
        const randomDelay = Math.random() * 1000;
        return Math.min(baseDelay + randomDelay, 10000); // 最大10秒
    }

    /**
     * 处理反检测措施
     */
    private async handleAntiDetection(): Promise<void> {
        if (!this.page) return;

        try {
            console.log(`🛡️ 应用额外的反检测措施...`);
            
            // 随机鼠标移动
            await this.page.mouse.move(
                Math.random() * 800 + 100,
                Math.random() * 600 + 100
            );
            
            // 随机等待
            await this.page.waitForTimeout(1000 + Math.random() * 2000);
            
            // 模拟页面交互
            await this.page.evaluate(() => {
                // 模拟滚动
                window.scrollTo(0, Math.random() * 100);
            });

        } catch (e) {
            console.log(`⚠️ 反检测措施应用失败:`, e);
        }
    }

    /**
     * 为SSL问题重启浏览器
     */
    private async restartBrowserForSSLIssues(): Promise<void> {
        try {
            console.log(`🔄 因SSL问题重启浏览器...`);
            await this.closeBrowser();
            await this.launchBrowser();
            console.log(`✅ 浏览器重启完成`);
        } catch (error: any) {
            console.error(`❌ 浏览器重启失败:`, error.message);
            throw error;
        }
    }

    /**
     * 判断是否是JavaScript文件
     * @param url - 文件URL
     * @param contentType - Content-Type header
     * @returns 是否是JS文件
     */
    private isJavaScriptFile(url: string, contentType: string): boolean {
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
    async debugWithBreakpoints(debugData: {
        url: string;
        jsFileUrl: string;
        breakpoints: DebugBreakpoint[];
    }): Promise<any> {
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
            const debugInfo: any[] = [];
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

        } catch (error: any) {
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
    async readCapturedFiles(): Promise<JSFileInfo[]> {
        const files: JSFileInfo[] = [];
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
            } catch (error) {
                console.error(`无法读取文件 ${filePath}:`, error);
            }
        }
        
        console.log(`成功读取 ${files.length} 个文件`);
        return files;
    }

    /**
     * 清理资源
     */
    async cleanup() {
        await this.closeBrowser();
    }

    /**
     * 关闭浏览器
     */
    private async closeBrowser() {
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
    async diagnosticNetworkIssues(url: string): Promise<{
        accessible: boolean;
        loadTime?: number;
        errors: string[];
        suggestions: string[];
        details: any;
        pageState?: PageStateResult;
    }> {
        const result = {
            accessible: false,
            loadTime: 0,
            errors: [] as string[],
            suggestions: [] as string[],
            details: {} as any,
            pageState: undefined as PageStateResult | undefined
        };

        const startTime = Date.now();
        
        try {
            console.log(`🔍 开始网络诊断: ${url}`);

            // 启动诊断用的浏览器实例
            await this.launchBrowser();

            if (!this.page) {
                throw new Error('浏览器启动失败');
            }

            // 监听网络事件
            const networkEvents: any[] = [];
            const consoleErrors: string[] = [];
            const jsErrors: string[] = [];

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
                    const response = await this.page!.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 10000
                    });
                    return response;
                },
                // 策略2：降级加载测试
                async () => {
                    console.log('📊 策略2：降级加载测试');
                    const response = await this.page!.goto(url, {
                        waitUntil: 'commit',
                        timeout: 15000
                    });
                    return response;
                },
                // 策略3：最小化等待
                async () => {
                    console.log('📊 策略3：最小化等待');
                    const response = await this.page!.goto(url, {
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
                } catch (error: any) {
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
                } catch (e: any) {
                    result.errors.push(`获取页面信息失败: ${e.message}`);
                }

                // 分析问题并提供建议
                this.analyzeDiagnosticResults(result);

            } else {
                result.accessible = false;
                result.errors.push('所有连接策略都失败了');
            }

        } catch (error: any) {
            result.accessible = false;
            result.errors.push(`诊断过程出错: ${error.message}`);
        } finally {
            // 清理诊断资源
            try {
                await this.closeBrowser();
            } catch (e) {
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
    private analyzeDiagnosticResults(result: any): void {
        const { details, pageState } = result;

        // 分析响应状态
        if (details.response) {
            const status = details.response.status;
            if (status === 403) {
                result.suggestions.push('🚫 网站可能有反爬机制，建议：1) 增加随机延迟 2) 使用更真实的User-Agent 3) 考虑使用代理');
            } else if (status === 404) {
                result.suggestions.push('❓ URL不存在，请检查URL是否正确');
            } else if (status >= 500) {
                result.suggestions.push('⚠️ 服务器错误，建议稍后重试或检查目标网站状态');
            } else if (status === 429) {
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
            } else if (!pageState.hasContent && !pageState.isJSRendered) {
                result.suggestions.push('📄 页面内容为空且非JS应用，可能的原因：1) 页面加载失败 2) 需要特殊参数 3) 反爬机制');
            } else if (pageState.loadingIndicators.length > 0) {
                result.suggestions.push(`⏳ 检测到加载指示器(${pageState.loadingIndicators.join(', ')})，页面可能仍在加载中`);
            }

            if (pageState.errors.length > 0) {
                result.suggestions.push(`⚠️ 页面状态错误: ${pageState.errors.join(', ')}`);
            }
        }

        // 分析网络事件
        if (details.networkEvents?.length > 0) {
            const failedRequests = details.networkEvents.filter((e: any) => e.type === 'failed');
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
    async quickAccessibilityCheck(url: string): Promise<{success: boolean, message: string, pageState?: PageStateResult}> {
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
            } else if (!pageState.hasContent) {
                message = `⚠️ 网站可访问但内容为空 (${response.status()}) - ${pageState.isJSRendered ? 'JavaScript应用可能需要更多时间渲染' : '可能是静态页面问题'}`;
            } else {
                message = `✅ 网站可访问且有内容 (${response.status()})`;
            }

            return { success, message, pageState };

        } catch (error: any) {
            return { 
                success: false, 
                message: `❌ 访问失败: ${error.message}` 
            };
        } finally {
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
    }
}