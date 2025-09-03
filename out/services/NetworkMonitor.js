"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkMonitor = void 0;
/**
 * 网络监控器类
 */
class NetworkMonitor {
    extensionUri;
    sessions = new Map();
    activeSession = null;
    isMonitoring = false;
    eventCallbacks = new Map();
    sessionId = 0;
    config = {
        captureRequestBody: true,
        captureResponseBody: true,
        maxBodySize: 1024 * 1024, // 1MB
        filterPatterns: ['*.js', '*.json', '/api/*', '/v*/*'],
        autoAnalyze: true,
        maxSessionDuration: 30 * 60 * 1000, // 30分钟
        enableTiming: true
    };
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    /**
     * 开始网络监控
     */
    async startMonitoring(options) {
        if (this.isMonitoring) {
            await this.stopMonitoring();
        }
        // 应用配置
        if (options?.config) {
            this.config = { ...this.config, ...options.config };
        }
        // 创建新的监控会话
        const sessionId = `session_${++this.sessionId}_${Date.now()}`;
        const session = {
            id: sessionId,
            startTime: Date.now(),
            requests: [],
            responses: [],
            tabId: options?.tabId
        };
        this.sessions.set(sessionId, session);
        this.activeSession = session;
        this.isMonitoring = true;
        // 开始监控
        await this.initializeNetworkCapture(options?.tabId);
        // 设置自动停止监控
        setTimeout(() => {
            if (this.activeSession?.id === sessionId) {
                this.stopMonitoring();
            }
        }, this.config.maxSessionDuration);
        console.log(`Network monitoring started for session: ${sessionId}`);
        this.emitEvent('monitoring-started', { sessionId, session });
        return sessionId;
    }
    /**
     * 停止网络监控
     */
    async stopMonitoring() {
        if (!this.isMonitoring || !this.activeSession) {
            return null;
        }
        const session = this.activeSession;
        session.endTime = Date.now();
        // 停止网络捕获
        await this.stopNetworkCapture(session.tabId);
        // 分析结果
        if (this.config.autoAnalyze) {
            await this.analyzeSession(session.id);
        }
        this.isMonitoring = false;
        this.activeSession = null;
        console.log(`Network monitoring stopped for session: ${session.id}`);
        this.emitEvent('monitoring-stopped', { session });
        return session;
    }
    /**
     * 获取监控会话
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    /**
     * 获取所有会话
     */
    getAllSessions() {
        return Array.from(this.sessions.values());
    }
    /**
     * 删除会话
     */
    deleteSession(sessionId) {
        return this.sessions.delete(sessionId);
    }
    /**
     * 分析网络会话
     */
    async analyzeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }
        const analysis = {
            totalRequests: session.requests.length,
            totalResponses: session.responses.length,
            totalSize: 0,
            avgResponseTime: 0,
            errorCount: 0,
            resourceTypes: {},
            statusCodes: {},
            domains: {},
            timeline: [],
            suspiciousRequests: [],
            apiEndpoints: []
        };
        // 分析请求和响应
        const responseTimes = [];
        const apiEndpointsMap = new Map();
        for (const request of session.requests) {
            // 域名统计
            try {
                const domain = new URL(request.url).hostname;
                analysis.domains[domain] = (analysis.domains[domain] || 0) + 1;
            }
            catch (e) {
                // 忽略无效URL
            }
            // 资源类型统计
            const resourceType = request.resourceType || 'other';
            analysis.resourceTypes[resourceType] = (analysis.resourceTypes[resourceType] || 0) + 1;
            // 查找对应响应
            const response = session.responses.find(r => r.requestId === request.id);
            if (response) {
                // 响应时间
                const responseTime = response.timestamp - request.timestamp;
                responseTimes.push(responseTime);
                // 响应大小
                analysis.totalSize += response.size || 0;
                // 状态码统计
                analysis.statusCodes[response.status.toString()] =
                    (analysis.statusCodes[response.status.toString()] || 0) + 1;
                // 错误统计
                if (response.status >= 400) {
                    analysis.errorCount++;
                }
                // API端点分析
                if (this.isApiRequest(request.url)) {
                    const apiKey = `${request.method} ${this.normalizeApiUrl(request.url)}`;
                    if (!apiEndpointsMap.has(apiKey)) {
                        apiEndpointsMap.set(apiKey, {
                            url: this.normalizeApiUrl(request.url),
                            method: request.method,
                            count: 0,
                            avgResponseTime: 0,
                            statusCodes: {},
                            parameters: new Set(),
                            headers: new Set(),
                            responseTypes: new Set()
                        });
                    }
                    const endpoint = apiEndpointsMap.get(apiKey);
                    endpoint.count++;
                    endpoint.statusCodes[response.status.toString()] =
                        (endpoint.statusCodes[response.status.toString()] || 0) + 1;
                    // 收集参数和头部信息
                    Object.keys(request.headers).forEach(h => endpoint.headers.add(h));
                    if (response.mimeType) {
                        endpoint.responseTypes.add(response.mimeType);
                    }
                }
                // 时间线条目
                analysis.timeline.push({
                    timestamp: request.timestamp,
                    type: 'request',
                    url: request.url
                });
                analysis.timeline.push({
                    timestamp: response.timestamp,
                    type: 'response',
                    url: response.url,
                    duration: responseTime,
                    status: response.status
                });
            }
            // 检测可疑请求
            if (this.isSuspiciousRequest(request)) {
                analysis.suspiciousRequests.push(request);
            }
        }
        // 计算平均响应时间
        if (responseTimes.length > 0) {
            analysis.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }
        // 计算API端点平均响应时间
        for (const [, endpoint] of apiEndpointsMap) {
            const endpointResponses = session.responses.filter(r => {
                const req = session.requests.find(req => req.id === r.requestId);
                return req && this.normalizeApiUrl(req.url) === endpoint.url && req.method === endpoint.method;
            });
            if (endpointResponses.length > 0) {
                const times = endpointResponses.map(r => {
                    const req = session.requests.find(req => req.id === r.requestId);
                    return req ? r.timestamp - req.timestamp : 0;
                });
                endpoint.avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
            }
        }
        analysis.apiEndpoints = Array.from(apiEndpointsMap.values());
        // 按时间排序时间线
        analysis.timeline.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`Session ${sessionId} analyzed:`, analysis);
        this.emitEvent('session-analyzed', { sessionId, analysis });
        return analysis;
    }
    /**
     * 搜索网络请求
     */
    searchRequests(sessionId, options) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return [];
        }
        return session.requests.filter(request => {
            if (options.url && !request.url.includes(options.url)) {
                return false;
            }
            if (options.method && request.method !== options.method) {
                return false;
            }
            if (options.timeRange) {
                if (request.timestamp < options.timeRange.start ||
                    request.timestamp > options.timeRange.end) {
                    return false;
                }
            }
            // 检查响应状态码和内容类型
            if (options.status || options.contentType) {
                const response = session.responses.find(r => r.requestId === request.id);
                if (!response) {
                    return false;
                }
                if (options.status && response.status !== options.status) {
                    return false;
                }
                if (options.contentType && !response.mimeType?.includes(options.contentType)) {
                    return false;
                }
            }
            return true;
        });
    }
    /**
     * 导出会话数据
     */
    exportSession(sessionId, format = 'json') {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (format === 'har') {
            return this.exportToHAR(session);
        }
        return JSON.stringify(session, null, 2);
    }
    /**
     * 注册事件监听器
     */
    on(event, callback) {
        if (!this.eventCallbacks.has(event)) {
            this.eventCallbacks.set(event, []);
        }
        this.eventCallbacks.get(event).push(callback);
    }
    /**
     * 移除事件监听器
     */
    off(event, callback) {
        const callbacks = this.eventCallbacks.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    /**
     * 获取监控状态
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            activeSession: this.activeSession?.id || null,
            totalSessions: this.sessions.size,
            config: this.config
        };
    }
    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    /**
     * 初始化网络捕获
     */
    async initializeNetworkCapture(tabId) {
        // 模拟网络捕获初始化
        // 实际实现中应该调用Chrome扩展API
        console.log(`Network capture initialized for tab: ${tabId || 'all'}`);
    }
    /**
     * 停止网络捕获
     */
    async stopNetworkCapture(tabId) {
        console.log(`Network capture stopped for tab: ${tabId || 'all'}`);
    }
    /**
     * 触发事件
     */
    emitEvent(event, data) {
        const callbacks = this.eventCallbacks.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                }
                catch (error) {
                    console.error(`Error in event callback for ${event}:`, error);
                }
            });
        }
    }
    /**
     * 检查是否为API请求
     */
    isApiRequest(url) {
        const apiPatterns = ['/api/', '/v1/', '/v2/', '/v3/', '.json', 'graphql'];
        return apiPatterns.some(pattern => url.includes(pattern));
    }
    /**
     * 规范化API URL（移除查询参数和动态ID）
     */
    normalizeApiUrl(url) {
        try {
            const urlObj = new URL(url);
            let pathname = urlObj.pathname;
            // 将数字ID替换为占位符
            pathname = pathname.replace(/\/\d+/g, '/{id}');
            return `${urlObj.origin}${pathname}`;
        }
        catch (e) {
            return url.split('?')[0];
        }
    }
    /**
     * 检测可疑请求
     */
    isSuspiciousRequest(request) {
        // 检测反爬虫相关的可疑请求
        const suspiciousPatterns = [
            'bot', 'crawl', 'spider', 'scrape',
            'captcha', 'verify', 'challenge',
            'fingerprint', 'detection'
        ];
        const url = request.url.toLowerCase();
        const headers = JSON.stringify(request.headers).toLowerCase();
        return suspiciousPatterns.some(pattern => url.includes(pattern) || headers.includes(pattern));
    }
    /**
     * 导出为HAR格式
     */
    exportToHAR(session) {
        const har = {
            log: {
                version: '1.2',
                creator: {
                    name: 'Crawler Network Monitor',
                    version: '1.0.0'
                },
                pages: [{
                        startedDateTime: new Date(session.startTime).toISOString(),
                        id: session.id,
                        title: session.title || 'Unknown',
                        pageTimings: {
                            onContentLoad: -1,
                            onLoad: -1
                        }
                    }],
                entries: session.requests.map(request => {
                    const response = session.responses.find(r => r.requestId === request.id);
                    return {
                        pageref: session.id,
                        startedDateTime: new Date(request.timestamp).toISOString(),
                        time: response ? response.timestamp - request.timestamp : -1,
                        request: {
                            method: request.method,
                            url: request.url,
                            httpVersion: 'HTTP/1.1',
                            headers: Object.entries(request.headers).map(([name, value]) => ({
                                name, value
                            })),
                            queryString: [],
                            cookies: [],
                            headersSize: -1,
                            bodySize: request.body?.length || -1,
                            postData: request.body ? {
                                mimeType: 'application/json',
                                text: request.body
                            } : undefined
                        },
                        response: response ? {
                            status: response.status,
                            statusText: response.statusText,
                            httpVersion: 'HTTP/1.1',
                            headers: Object.entries(response.headers).map(([name, value]) => ({
                                name, value
                            })),
                            cookies: [],
                            content: {
                                size: response.size,
                                mimeType: response.mimeType || 'application/octet-stream',
                                text: response.body || ''
                            },
                            redirectURL: '',
                            headersSize: -1,
                            bodySize: response.size,
                            transferSize: response.size
                        } : {
                            status: 0,
                            statusText: '',
                            httpVersion: 'HTTP/1.1',
                            headers: [],
                            cookies: [],
                            content: { size: 0, mimeType: '', text: '' },
                            redirectURL: '',
                            headersSize: -1,
                            bodySize: -1,
                            transferSize: -1
                        },
                        cache: {},
                        timings: response?.timing ? {
                            blocked: -1,
                            dns: response.timing.dnsEnd - response.timing.dnsStart,
                            connect: response.timing.connectEnd - response.timing.connectStart,
                            send: response.timing.sendEnd - response.timing.sendStart,
                            wait: response.timing.receiveHeadersEnd - response.timing.sendEnd,
                            receive: response.timestamp - (response.timing.requestTime + response.timing.receiveHeadersEnd),
                            ssl: response.timing.sslEnd - response.timing.sslStart
                        } : {
                            blocked: -1,
                            dns: -1,
                            connect: -1,
                            send: -1,
                            wait: -1,
                            receive: -1,
                            ssl: -1
                        }
                    };
                })
            }
        };
        return JSON.stringify(har, null, 2);
    }
    /**
     * 清理资源
     */
    dispose() {
        if (this.isMonitoring) {
            this.stopMonitoring();
        }
        this.sessions.clear();
        this.eventCallbacks.clear();
    }
}
exports.NetworkMonitor = NetworkMonitor;
//# sourceMappingURL=NetworkMonitor.js.map