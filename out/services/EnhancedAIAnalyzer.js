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
exports.EnhancedAIAnalyzer = void 0;
/**
 * 增强版AI分析器 - 集成语义搜索和智能反爬分析
 * 基于mcp-chrome-master项目的AI能力增强现有分析功能
 */
const generative_ai_1 = require("@google/generative-ai");
const vscode = __importStar(require("vscode"));
const SemanticSearchEngine_1 = require("./SemanticSearchEngine");
/**
 * 增强版AI分析器类
 */
class EnhancedAIAnalyzer {
    genAI = null;
    apiKey = '';
    semanticEngine;
    pythonPath = 'python';
    _extensionUri;
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this.semanticEngine = new SemanticSearchEngine_1.SemanticSearchEngine(extensionUri);
        // 加载API Key和初始化
        this.loadApiKey();
        this.detectPythonPath();
        this.initializeSemanticEngine();
    }
    /**
     * 初始化语义引擎
     */
    async initializeSemanticEngine() {
        try {
            await this.semanticEngine.initialize();
        }
        catch (error) {
            console.error('Failed to initialize semantic engine:', error);
        }
    }
    /**
     * 增强版网站分析
     */
    async analyzeWebsite(analysisResult, options) {
        const opts = {
            includeSemanticAnalysis: true,
            includeNetworkInsights: true,
            generateBypassStrategies: true,
            riskAssessment: true,
            ...options
        };
        try {
            // 1. 基础AI分析
            const baseAnalysis = await this.performBaseAnalysis(analysisResult);
            // 2. 语义内容分析
            let semanticAnalysis = this.getEmptySemanticAnalysis();
            if (opts.includeSemanticAnalysis) {
                semanticAnalysis = await this.performSemanticAnalysis(analysisResult);
            }
            // 3. 网络洞察分析
            let networkInsights = this.getEmptyNetworkInsights();
            if (opts.includeNetworkInsights && analysisResult.networkAnalysis) {
                networkInsights = await this.analyzeNetworkInsights(analysisResult.networkAnalysis);
            }
            // 4. 绕过策略生成
            let bypassStrategies = [];
            if (opts.generateBypassStrategies) {
                bypassStrategies = await this.generateBypassStrategies(baseAnalysis.antiCrawlerTechniques || [], analysisResult.antiCrawlerFeatures);
            }
            // 5. 风险评估
            let riskAssessment = this.getEmptyRiskAssessment();
            if (opts.riskAssessment) {
                riskAssessment = await this.performRiskAssessment(baseAnalysis.antiCrawlerTechniques || [], analysisResult);
            }
            const enhancedResult = {
                summary: baseAnalysis.summary || '分析完成',
                antiCrawlerTechniques: baseAnalysis.antiCrawlerTechniques || [],
                recommendations: baseAnalysis.recommendations || [],
                crawlerStructure: baseAnalysis.crawlerStructure || this.buildDefaultCrawlerStructure(),
                algorithms: baseAnalysis.algorithms || [],
                confidence: baseAnalysis.confidence || 0.5,
                semanticAnalysis,
                networkInsights,
                bypassStrategies,
                riskAssessment
            };
            console.log('Enhanced AI analysis completed successfully');
            return enhancedResult;
        }
        catch (error) {
            console.error('Error in enhanced website analysis:', error);
            throw error;
        }
    }
    /**
     * 基础AI分析
     */
    async performBaseAnalysis(analysisResult) {
        if (!this.genAI) {
            throw new Error('Google AI not initialized');
        }
        const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
        const prompt = this.buildAnalysisPrompt(analysisResult);
        try {
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();
            return this.parseAIResponse(text);
        }
        catch (error) {
            console.error('Error in base AI analysis:', error);
            return this.getFallbackAnalysis(analysisResult);
        }
    }
    /**
     * 语义内容分析
     */
    async performSemanticAnalysis(analysisResult) {
        const content = analysisResult.contentAnalysis.mainContent;
        // 将内容添加到语义数据库
        await this.semanticEngine.addDocument(content, {
            url: analysisResult.url,
            title: analysisResult.title,
            timestamp: analysisResult.timestamp,
            type: 'html'
        });
        // 搜索相似内容
        const queries = analysisResult.contentAnalysis.keywords.slice(0, 3);
        const relatedSites = [];
        for (const query of queries) {
            const searchResult = await this.semanticEngine.search(query, {
                limit: 5,
                threshold: 0.7
            });
            relatedSites.push(searchResult);
        }
        // 分析内容复杂度
        const contentComplexity = this.calculateContentComplexity(content);
        // 检测重复内容
        const duplicateContent = await this.findDuplicateContent(content);
        return {
            contentSimilarity: this.calculateContentSimilarity(relatedSites),
            keyTopics: analysisResult.contentAnalysis.keywords,
            contentComplexity,
            duplicateContent,
            relatedSites,
            contentPatterns: this.extractContentPatterns(content),
            linguisticFeatures: this.analyzeLinguisticFeatures(content)
        };
    }
    /**
     * 网络洞察分析
     */
    async analyzeNetworkInsights(networkAnalysis) {
        return {
            trafficPatterns: this.analyzeTrafficPatterns(networkAnalysis),
            apiUsage: this.analyzeApiUsage(networkAnalysis),
            securityHeaders: this.analyzeSecurityHeaders(networkAnalysis),
            performanceMetrics: this.calculatePerformanceMetrics(networkAnalysis),
            resourceDependencies: this.analyzeResourceDependencies(networkAnalysis),
            thirdPartyServices: this.identifyThirdPartyServices(networkAnalysis)
        };
    }
    /**
     * 生成绕过策略
     */
    async generateBypassStrategies(techniques, features) {
        const strategies = [];
        // 基于检测到的技术生成策略
        for (const technique of techniques) {
            const strategy = await this.createBypassStrategy(technique);
            if (strategy) {
                strategies.push(strategy);
            }
        }
        // 添加通用策略
        strategies.push(...this.getCommonBypassStrategies());
        return strategies.sort((a, b) => b.successRate - a.successRate);
    }
    /**
     * 风险评估
     */
    async performRiskAssessment(techniques, analysisResult) {
        const riskScores = {
            legal: this.assessLegalRisk(analysisResult.url),
            technical: this.assessTechnicalRisk(techniques),
            detection: this.assessDetectionRisk(techniques),
            blocking: this.assessBlockingRisk(techniques)
        };
        const overallRisk = this.calculateOverallRisk(riskScores);
        return {
            overallRisk,
            legalRisk: riskScores.legal,
            technicalRisk: riskScores.technical,
            detectionRisk: riskScores.detection,
            blockingRisk: riskScores.blocking,
            recommendations: this.generateRiskRecommendations(riskScores),
            mitigations: this.generateRiskMitigations(techniques)
        };
    }
    /**
     * 构建分析提示词
     */
    buildAnalysisPrompt(analysisResult) {
        return `
请分析以下网站的反爬虫机制并提供详细的分析报告：

网站信息：
- URL: ${analysisResult.url}
- 标题: ${analysisResult.title}

检测到的反爬虫特征：
${Object.entries(analysisResult.antiCrawlerFeatures)
            .map(([key, value]) => `- ${key}: ${value ? '是' : '否'}`)
            .join('\n')}

JavaScript文件数量: ${analysisResult.jsFiles.length}
网络请求数量: ${analysisResult.networkAnalysis?.totalRequests || 0}

请按以下格式提供JSON分析结果：
{
    "summary": "网站反爬虫机制总结",
    "antiCrawlerTechniques": [
        {
            "name": "技术名称",
            "description": "技术描述",
            "severity": "low|medium|high|critical",
            "category": "detection|prevention|obfuscation|behavioral",
            "location": ["位置信息"],
            "indicators": ["指标信息"],
            "confidence": 0.8
        }
    ],
    "recommendations": [
        {
            "title": "建议标题",
            "description": "详细描述",
            "priority": "low|medium|high|critical",
            "category": "headers|timing|behavior|infrastructure",
            "effectiveness": 0.8,
            "complexity": 0.6
        }
    ],
    "confidence": 0.85
}
        `;
    }
    /**
     * 解析AI响应
     */
    parseAIResponse(text) {
        try {
            // 尝试提取JSON
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return this.normalizeAIResponse(parsed);
            }
        }
        catch (error) {
            console.warn('Failed to parse AI response as JSON:', error);
        }
        // 回退到文本解析
        return this.parseTextResponse(text);
    }
    /**
     * 规范化AI响应
     */
    normalizeAIResponse(parsed) {
        return {
            summary: parsed.summary || '分析完成',
            antiCrawlerTechniques: (parsed.antiCrawlerTechniques || []).map((tech) => ({
                ...tech,
                impact: {
                    accessibility: 0.5,
                    complexity: 0.5,
                    detectability: 0.5
                },
                bypass: []
            })),
            recommendations: (parsed.recommendations || []).map((rec) => ({
                ...rec,
                implementation: {
                    steps: rec.steps || [],
                    code: rec.code,
                    configuration: rec.configuration
                }
            })),
            crawlerStructure: this.buildDefaultCrawlerStructure(),
            algorithms: [],
            confidence: parsed.confidence || 0.5
        };
    }
    /**
     * 构建默认爬虫结构
     */
    buildDefaultCrawlerStructure() {
        return {
            requiredHeaders: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            cookieRequirements: [],
            javascriptExecution: {
                required: false,
                complexity: 'simple',
                frameworks: [],
                dynamicContent: false
            },
            apiEndpoints: [],
            authentication: {
                required: false,
                methods: [],
                tokenTypes: [],
                sessionManagement: 'none'
            },
            rateLimit: {
                detected: false,
                type: 'ip',
                limit: 0,
                window: 0,
                headers: []
            }
        };
    }
    // 辅助方法实现
    loadApiKey() {
        const config = vscode.workspace.getConfiguration('crawler-analyzer');
        this.apiKey = config.get('googleApiKey') || '';
        if (this.apiKey) {
            this.genAI = new generative_ai_1.GoogleGenerativeAI(this.apiKey);
        }
    }
    detectPythonPath() {
        // Python路径检测逻辑
        this.pythonPath = 'python';
    }
    calculateContentComplexity(content) {
        // 计算内容复杂度
        return Math.min(content.length / 1000, 10);
    }
    async findDuplicateContent(content) {
        // 查找重复内容
        const searchResult = await this.semanticEngine.search(content.substring(0, 200), {
            limit: 5,
            threshold: 0.9
        });
        return searchResult.chunks;
    }
    calculateContentSimilarity(relatedSites) {
        // 计算内容相似度
        return relatedSites.reduce((acc, site) => acc + (site.chunks[0]?.similarityScore || 0), 0) / relatedSites.length;
    }
    // 其他私有方法的简化实现...
    extractContentPatterns(content) { return []; }
    analyzeLinguisticFeatures(content) { return []; }
    analyzeTrafficPatterns(networkAnalysis) { return []; }
    analyzeApiUsage(networkAnalysis) { return []; }
    analyzeSecurityHeaders(networkAnalysis) {
        return { present: [], missing: [], recommendations: [] };
    }
    calculatePerformanceMetrics(networkAnalysis) {
        return { loadTime: 0, resourceCount: 0, totalSize: 0, criticalPath: [] };
    }
    analyzeResourceDependencies(networkAnalysis) { return []; }
    identifyThirdPartyServices(networkAnalysis) { return []; }
    // 空对象生成方法
    getEmptySemanticAnalysis() {
        return {
            contentSimilarity: 0,
            keyTopics: [],
            contentComplexity: 0,
            duplicateContent: [],
            relatedSites: [],
            contentPatterns: [],
            linguisticFeatures: []
        };
    }
    getEmptyNetworkInsights() {
        return {
            trafficPatterns: [],
            apiUsage: [],
            securityHeaders: { present: [], missing: [], recommendations: [] },
            performanceMetrics: { loadTime: 0, resourceCount: 0, totalSize: 0, criticalPath: [] },
            resourceDependencies: [],
            thirdPartyServices: []
        };
    }
    getEmptyRiskAssessment() {
        return {
            overallRisk: 'medium',
            legalRisk: 0.5,
            technicalRisk: 0.5,
            detectionRisk: 0.5,
            blockingRisk: 0.5,
            recommendations: [],
            mitigations: []
        };
    }
    // 其他方法的简化实现
    async createBypassStrategy(technique) {
        return {
            name: `Bypass ${technique.name}`,
            description: `Strategy to bypass ${technique.name}`,
            difficulty: 'medium',
            successRate: 0.7,
            requirements: [],
            implementation: { tools: [], techniques: [] },
            risks: [],
            alternatives: []
        };
    }
    getCommonBypassStrategies() { return []; }
    assessLegalRisk(url) { return 0.3; }
    assessTechnicalRisk(techniques) { return 0.5; }
    assessDetectionRisk(techniques) { return 0.4; }
    assessBlockingRisk(techniques) { return 0.6; }
    calculateOverallRisk(scores) { return 'medium'; }
    generateRiskRecommendations(scores) { return []; }
    generateRiskMitigations(techniques) { return []; }
    getFallbackAnalysis(analysisResult) {
        return {
            summary: '分析完成（回退模式）',
            antiCrawlerTechniques: [],
            recommendations: [],
            crawlerStructure: this.buildDefaultCrawlerStructure(),
            algorithms: [],
            confidence: 0.3
        };
    }
    parseTextResponse(text) {
        return this.getFallbackAnalysis({});
    }
    /**
     * 清理资源
     */
    dispose() {
        this.semanticEngine.dispose();
    }
}
exports.EnhancedAIAnalyzer = EnhancedAIAnalyzer;
//# sourceMappingURL=EnhancedAIAnalyzer.js.map