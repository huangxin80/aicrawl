"use strict";
/**
 * 智能浏览器模拟器 - 模拟真实用户操作
 * 与IntelligentAgent配合，执行具体的浏览器自动化任务
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserSimulator = void 0;
class BrowserSimulator {
    page = null;
    browser = null;
    networkRequests = [];
    config;
    constructor(config = {}) {
        this.config = {
            waitTime: 1000,
            humanLike: true,
            captureNetwork: true,
            takeScreenshots: true,
            ...config
        };
    }
    /**
     * 初始化浏览器模拟环境
     */
    async initialize(crawler) {
        // 使用现有的CrawlerService来初始化浏览器
        // 这样可以复用已有的反检测配置
        console.log('🤖 初始化浏览器模拟环境...');
    }
    /**
     * 智能搜索模拟 - 找到搜索框并执行搜索
     */
    async simulateSearch(page, searchTerm) {
        console.log(`🔍 模拟搜索操作: "${searchTerm}"`);
        const startTime = Date.now();
        const steps = [];
        const screenshots = [];
        try {
            // 步骤1: 寻找搜索框
            const searchBox = await this.findSearchInput(page);
            if (!searchBox) {
                return {
                    success: false,
                    steps: [{
                            action: 'find_search_box',
                            result: 'failed',
                            message: '未找到搜索输入框',
                            timestamp: Date.now()
                        }],
                    networkRequests: this.networkRequests,
                    screenshots,
                    error: '未找到搜索输入框',
                    duration: Date.now() - startTime
                };
            }
            steps.push({
                action: 'find_search_box',
                target: await this.getElementInfo(searchBox),
                result: 'success',
                message: '找到搜索输入框',
                timestamp: Date.now()
            });
            // 步骤2: 清空搜索框
            await this.humanLikeClick(searchBox);
            await this.humanLikeType('', { clear: true });
            steps.push({
                action: 'clear_input',
                result: 'success',
                message: '清空搜索框',
                timestamp: Date.now()
            });
            // 步骤3: 输入搜索关键词
            await this.humanLikeType(searchTerm);
            steps.push({
                action: 'input_search_term',
                target: searchTerm,
                result: 'success',
                message: `输入搜索关键词: "${searchTerm}"`,
                timestamp: Date.now()
            });
            // 等待一下，让页面可能的自动建议加载
            await this.humanLikeWait(500);
            // 步骤4: 寻找并点击搜索按钮或按Enter
            const searchButton = await this.findSearchButton(page);
            if (searchButton) {
                await this.humanLikeClick(searchButton);
                steps.push({
                    action: 'click_search_button',
                    target: await this.getElementInfo(searchButton),
                    result: 'success',
                    message: '点击搜索按钮',
                    timestamp: Date.now()
                });
            }
            else {
                // 如果没找到搜索按钮，按Enter键
                await page.keyboard.press('Enter');
                steps.push({
                    action: 'press_enter',
                    result: 'success',
                    message: '按Enter键执行搜索',
                    timestamp: Date.now()
                });
            }
            // 等待搜索结果加载
            await this.waitForSearchResults(page);
            steps.push({
                action: 'wait_search_results',
                result: 'success',
                message: '等待搜索结果加载',
                timestamp: Date.now()
            });
            return {
                success: true,
                steps,
                networkRequests: this.networkRequests,
                screenshots,
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            console.error('🚨 搜索模拟失败:', error);
            steps.push({
                action: 'error_handling',
                result: 'failed',
                message: `搜索模拟失败: ${error.message}`,
                timestamp: Date.now()
            });
            return {
                success: false,
                steps,
                networkRequests: this.networkRequests,
                screenshots,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }
    /**
     * 智能寻找搜索输入框
     */
    async findSearchInput(page) {
        // 多种策略寻找搜索框
        const searchSelectors = [
            'input[type="search"]',
            'input[name*="search"]',
            'input[placeholder*="搜索"]',
            'input[placeholder*="search"]',
            'input[id*="search"]',
            'input[class*="search"]',
            '.search-input input',
            '.search-box input',
            '[role="searchbox"]',
            'input[type="text"]' // 最后尝试文本输入框
        ];
        for (const selector of searchSelectors) {
            try {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    // 检查元素是否可见且可交互
                    const isVisible = await element.isVisible();
                    const isEnabled = await element.isEnabled();
                    if (isVisible && isEnabled) {
                        console.log(`🎯 找到搜索框: ${selector}`);
                        return element;
                    }
                }
            }
            catch (error) {
                continue; // 继续尝试下一个选择器
            }
        }
        return null;
    }
    /**
     * 智能寻找搜索按钮
     */
    async findSearchButton(page) {
        const searchButtonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("搜索")',
            'button:has-text("search")',
            'button[class*="search"]',
            '.search-btn',
            '.search-button',
            '[role="button"]:has-text("搜索")'
        ];
        for (const selector of searchButtonSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    const isVisible = await element.isVisible();
                    const isEnabled = await element.isEnabled();
                    if (isVisible && isEnabled) {
                        console.log(`🎯 找到搜索按钮: ${selector}`);
                        return element;
                    }
                }
            }
            catch (error) {
                continue;
            }
        }
        return null;
    }
    /**
     * 等待搜索结果加载
     */
    async waitForSearchResults(page) {
        try {
            // 等待页面URL变化或内容更新
            await Promise.race([
                page.waitForLoadState('networkidle', { timeout: 10000 }),
                page.waitForSelector('.result, .search-result, [class*="result"]', { timeout: 10000 }),
                page.waitForFunction(() => document.title !== document.title, { timeout: 10000 })
            ]);
        }
        catch (error) {
            console.log('⚠️ 搜索结果等待超时，继续执行...');
        }
    }
    /**
     * 模拟登录操作
     */
    async simulateLogin(page, username, password) {
        console.log('🔑 模拟登录操作...');
        const startTime = Date.now();
        const steps = [];
        try {
            // 寻找登录相关元素
            const loginElements = await this.findLoginElements(page);
            if (!loginElements.usernameField && !loginElements.loginButton) {
                return {
                    success: false,
                    steps: [{
                            action: 'find_login_elements',
                            result: 'failed',
                            message: '未找到登录相关元素',
                            timestamp: Date.now()
                        }],
                    networkRequests: this.networkRequests,
                    screenshots: [],
                    error: '未找到登录相关元素',
                    duration: Date.now() - startTime
                };
            }
            // 如果找到用户名输入框
            if (loginElements.usernameField) {
                await this.humanLikeClick(loginElements.usernameField);
                if (username) {
                    await this.humanLikeType(username);
                }
                steps.push({
                    action: 'input_username',
                    target: username || '(模拟用户名)',
                    result: 'success',
                    message: '输入用户名',
                    timestamp: Date.now()
                });
            }
            // 如果找到密码输入框
            if (loginElements.passwordField) {
                await this.humanLikeClick(loginElements.passwordField);
                if (password) {
                    await this.humanLikeType(password);
                }
                steps.push({
                    action: 'input_password',
                    result: 'success',
                    message: '输入密码',
                    timestamp: Date.now()
                });
            }
            // 点击登录按钮（仅模拟，不实际提交）
            if (loginElements.loginButton) {
                steps.push({
                    action: 'locate_login_button',
                    target: await this.getElementInfo(loginElements.loginButton),
                    result: 'success',
                    message: '找到登录按钮（未实际点击）',
                    timestamp: Date.now()
                });
            }
            return {
                success: true,
                steps,
                networkRequests: this.networkRequests,
                screenshots: [],
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            return {
                success: false,
                steps,
                networkRequests: this.networkRequests,
                screenshots: [],
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }
    /**
     * 寻找登录相关元素
     */
    async findLoginElements(page) {
        const result = {};
        // 寻找用户名输入框
        const usernameSelectors = [
            'input[name="username"]',
            'input[name="user"]',
            'input[name="email"]',
            'input[type="email"]',
            'input[placeholder*="用户名"]',
            'input[placeholder*="邮箱"]',
            'input[placeholder*="手机"]',
            'input[id*="username"]',
            'input[id*="user"]'
        ];
        for (const selector of usernameSelectors) {
            try {
                const element = await page.$(selector);
                if (element && await element.isVisible()) {
                    result.usernameField = element;
                    break;
                }
            }
            catch (error) {
                continue;
            }
        }
        // 寻找密码输入框
        const passwordSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[name="pwd"]'
        ];
        for (const selector of passwordSelectors) {
            try {
                const element = await page.$(selector);
                if (element && await element.isVisible()) {
                    result.passwordField = element;
                    break;
                }
            }
            catch (error) {
                continue;
            }
        }
        // 寻找登录按钮
        const loginButtonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("登录")',
            'button:has-text("登陆")',
            'button:has-text("login")',
            'button:has-text("Login")',
            '.login-btn',
            '.signin-btn'
        ];
        for (const selector of loginButtonSelectors) {
            try {
                const element = await page.$(selector);
                if (element && await element.isVisible()) {
                    result.loginButton = element;
                    break;
                }
            }
            catch (error) {
                continue;
            }
        }
        return result;
    }
    /**
     * 模拟滚动浏览操作
     */
    async simulateScrolling(page, direction = 'down', times = 3) {
        console.log(`📜 模拟滚动浏览 (${direction}, ${times}次)`);
        const startTime = Date.now();
        const steps = [];
        try {
            for (let i = 0; i < times; i++) {
                const scrollDistance = direction === 'down' ? 800 : -800;
                await page.evaluate((distance) => {
                    window.scrollBy(0, distance);
                }, scrollDistance);
                await this.humanLikeWait(1500); // 等待内容加载
                steps.push({
                    action: 'scroll',
                    target: `${direction} ${scrollDistance}px`,
                    result: 'success',
                    message: `滚动${direction === 'down' ? '向下' : '向上'}${Math.abs(scrollDistance)}像素`,
                    timestamp: Date.now()
                });
            }
            return {
                success: true,
                steps,
                networkRequests: this.networkRequests,
                screenshots: [],
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            return {
                success: false,
                steps,
                networkRequests: this.networkRequests,
                screenshots: [],
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }
    /**
     * 人性化点击（随机偏移、延迟等）
     */
    async humanLikeClick(element) {
        if (this.config.humanLike) {
            // 获取元素边界
            const box = await element.boundingBox();
            if (box) {
                // 在元素内随机选择点击位置
                const x = box.x + box.width * (0.3 + Math.random() * 0.4);
                const y = box.y + box.height * (0.3 + Math.random() * 0.4);
                await element.click({ position: { x: x - box.x, y: y - box.y } });
            }
            else {
                await element.click();
            }
        }
        else {
            await element.click();
        }
        await this.humanLikeWait(200, 500);
    }
    /**
     * 人性化输入（模拟真实打字速度）
     */
    async humanLikeType(text, options = {}) {
        if (!this.page)
            return;
        if (options.clear) {
            await this.page.keyboard.press('Control+a');
            await this.humanLikeWait(100);
        }
        if (this.config.humanLike && text.length > 0) {
            // 模拟真实打字速度
            for (const char of text) {
                await this.page.keyboard.type(char);
                await this.humanLikeWait(80, 200); // 每个字符间的随机延迟
            }
        }
        else {
            await this.page.keyboard.type(text);
        }
    }
    /**
     * 人性化等待（随机时间）
     */
    async humanLikeWait(minMs, maxMs) {
        const waitTime = maxMs ?
            Math.random() * (maxMs - minMs) + minMs :
            minMs;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    /**
     * 获取元素信息（用于日志）
     */
    async getElementInfo(element) {
        try {
            const tagName = await element.evaluate(el => el.tagName.toLowerCase());
            const id = await element.evaluate(el => el.id);
            const className = await element.evaluate(el => el.className);
            let info = tagName;
            if (id)
                info += `#${id}`;
            if (className)
                info += `.${className.split(' ')[0]}`;
            return info;
        }
        catch (error) {
            return 'unknown-element';
        }
    }
    /**
     * 设置页面引用
     */
    setPage(page) {
        this.page = page;
        if (this.config.captureNetwork && page) {
            // 监听网络请求
            page.on('request', (request) => {
                this.networkRequests.push({
                    type: 'request',
                    method: request.method(),
                    url: request.url(),
                    headers: request.headers(),
                    timestamp: Date.now()
                });
            });
            page.on('response', (response) => {
                this.networkRequests.push({
                    type: 'response',
                    status: response.status(),
                    url: response.url(),
                    headers: response.headers(),
                    timestamp: Date.now()
                });
            });
        }
    }
    /**
     * 清理网络请求记录
     */
    clearNetworkRequests() {
        this.networkRequests = [];
    }
}
exports.BrowserSimulator = BrowserSimulator;
//# sourceMappingURL=BrowserSimulator.js.map