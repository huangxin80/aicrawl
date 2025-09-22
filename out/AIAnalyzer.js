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
exports.AIAnalyzer = void 0;
/**
 * AI分析器 - 使用Google Gemini API分析JS反爬机制
 * 混合版本 - 支持直接Gemini API和Python后端聊天
 */
const generative_ai_1 = require("@google/generative-ai");
const vscode = __importStar(require("vscode"));
const child_process = __importStar(require("child_process"));
const path = __importStar(require("path"));
class AIAnalyzer {
    constructor(extensionUri) {
        this.genAI = null;
        this.apiKey = '';
        this.pythonPath = 'python';
        this._extensionUri = extensionUri;
        // 尝试从配置中获取API Key
        this.loadApiKey();
        // 检测Python路径
        this.detectPythonPath();
    }
    /**
     * 检测系统中的Python路径
     */
    detectPythonPath() {
        const possiblePaths = ['python', 'py', 'python3', 'python.exe'];
        for (const pythonCmd of possiblePaths) {
            try {
                const result = child_process.execSync(`${pythonCmd} --version`, {
                    encoding: 'utf8',
                    timeout: 5000,
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                if (result.includes('Python')) {
                    this.pythonPath = pythonCmd;
                    console.log(`检测到Python路径: ${pythonCmd}, 版本: ${result.trim()}`);
                    break;
                }
            }
            catch (error) {
                // 继续尝试下一个路径
                continue;
            }
        }
        console.log(`使用Python路径: ${this.pythonPath}`);
    }
    /**
     * 从配置加载API Key
     */
    loadApiKey() {
        const config = vscode.workspace.getConfiguration('crawler-analyzer');
        this.apiKey = config.get('googleApiKey') || '';
        if (this.apiKey) {
            this.genAI = new generative_ai_1.GoogleGenerativeAI(this.apiKey);
            console.log('Google Gemini API已初始化');
        }
        else {
            console.log('未找到Google API Key，请在设置中配置');
        }
    }
    /**
     * 设置API Key
     * @param apiKey - Google Gemini API Key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        console.log('API Key已更新');
    }
    /**
     * 分析JavaScript文件的反爬机制
     * @param jsFiles - JS文件信息数组
     * @returns 分析结果
     */
    async analyzeJSFiles(jsFiles) {
        if (!this.genAI) {
            throw new Error('Google Gemini API未配置，请先设置API Key');
        }
        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
            // 构建分析prompt
            const prompt = this.buildAnalysisPrompt(jsFiles);
            console.log('开始AI分析...');
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            // 解析响应
            return this.parseAnalysisResponse(text);
        }
        catch (error) {
            console.error('AI分析失败:', error);
            throw new Error(`AI分析失败: ${error.message}`);
        }
    }
    /**
     * 分析本地JS文件（从catch目录读取）
     * @param localFiles - 本地JS文件信息数组
     * @returns 分析结果
     */
    async analyzeLocalJSFiles(localFiles) {
        return this.analyzeJSFiles(localFiles);
    }
    /**
     * 构建分析prompt
     * @param jsFiles - JS文件数组
     * @returns 分析prompt
     */
    buildAnalysisPrompt(jsFiles) {
        let prompt = `请分析以下JavaScript文件中的反爬虫机制和算法：

**分析要求：**
1. 识别各种反爬技术（如debugger检测、WebDriver检测、指纹识别等）
2. 分析加密算法和混淆技术
3. 提供绕过建议和爬虫构建建议
4. 评估反爬机制的严重程度

**文件信息：**
共${jsFiles.length}个JavaScript文件

`;
        // 添加每个文件的内容（限制长度避免token超限）
        jsFiles.forEach((file, index) => {
            const fileContent = file.content.length > 8000 ?
                file.content.substring(0, 8000) + '\n... (内容过长，已截断)' :
                file.content;
            prompt += `\n**文件 ${index + 1}:**\n`;
            prompt += `URL: ${file.url}\n`;
            prompt += `大小: ${(file.size / 1024).toFixed(1)} KB\n`;
            prompt += `内容:\n\`\`\`javascript\n${fileContent}\n\`\`\`\n`;
        });
        prompt += `\n\n**请按照以下JSON格式返回分析结果：**
\`\`\`json
{
    "summary": "分析摘要",
    "antiCrawlerTechniques": [
        {
            "name": "技术名称",
            "description": "技术描述",
            "severity": "high|medium|low",
            "location": "代码位置",
            "bypass": "绕过方法"
        }
    ],
    "algorithms": [
        {
            "name": "算法名称",
            "type": "算法类型（如加密、哈希、混淆等）",
            "description": "算法描述",
            "implementation": "实现细节"
        }
    ],
    "crawlerStructure": {
        "requiredHeaders": {"header名": "header值"},
        "cookieRequirements": ["必需的cookie"],
        "javascriptExecution": true|false,
        "dynamicContent": true|false,
        "apiEndpoints": ["API端点"]
    },
    "recommendations": ["具体建议1", "具体建议2"],
    "confidence": 0.95
}
\`\`\``;
        return prompt;
    }
    /**
     * 解析AI分析响应
     * @param responseText - AI返回的文本
     * @returns 解析后的分析结果
     */
    parseAnalysisResponse(responseText) {
        try {
            // 尝试提取JSON部分
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) {
                throw new Error('未找到JSON格式的分析结果');
            }
            const jsonText = jsonMatch[1];
            const parsed = JSON.parse(jsonText);
            // 验证和标准化结果
            return {
                summary: parsed.summary || '无分析摘要',
                antiCrawlerTechniques: Array.isArray(parsed.antiCrawlerTechniques) ?
                    parsed.antiCrawlerTechniques.map((tech) => ({
                        name: tech.name || '未知技术',
                        description: tech.description || '无描述',
                        severity: ['low', 'medium', 'high'].includes(tech.severity) ?
                            tech.severity : 'medium',
                        location: tech.location || '位置未知',
                        bypass: tech.bypass || '无绕过建议'
                    })) : [],
                algorithms: Array.isArray(parsed.algorithms) ?
                    parsed.algorithms.map((algo) => ({
                        name: algo.name || '未知算法',
                        type: algo.type || '未知类型',
                        description: algo.description || '无描述',
                        implementation: algo.implementation || '实现未知'
                    })) : [],
                crawlerStructure: {
                    requiredHeaders: parsed.crawlerStructure?.requiredHeaders || {},
                    cookieRequirements: Array.isArray(parsed.crawlerStructure?.cookieRequirements) ?
                        parsed.crawlerStructure.cookieRequirements : [],
                    javascriptExecution: Boolean(parsed.crawlerStructure?.javascriptExecution),
                    dynamicContent: Boolean(parsed.crawlerStructure?.dynamicContent),
                    apiEndpoints: Array.isArray(parsed.crawlerStructure?.apiEndpoints) ?
                        parsed.crawlerStructure.apiEndpoints : []
                },
                recommendations: Array.isArray(parsed.recommendations) ?
                    parsed.recommendations : ['请检查分析结果'],
                confidence: typeof parsed.confidence === 'number' ?
                    Math.max(0, Math.min(1, parsed.confidence)) : 0.5
            };
        }
        catch (error) {
            console.error('解析AI响应失败:', error);
            // 提供回退结果
            return {
                summary: '分析过程中出现错误，无法解析AI响应',
                antiCrawlerTechniques: [],
                algorithms: [],
                crawlerStructure: {
                    requiredHeaders: {},
                    cookieRequirements: [],
                    javascriptExecution: false,
                    dynamicContent: false,
                    apiEndpoints: []
                },
                recommendations: [
                    '请检查API Key是否正确配置',
                    '确认网络连接正常',
                    '可能需要重新分析文件'
                ],
                confidence: 0.1
            };
        }
    }
    /**
     * 快速文本分析（用于简单的代码片段分析）
     * @param codeSnippet - 代码片段
     * @returns 简单的分析结果
     */
    async quickAnalyze(codeSnippet) {
        if (!this.genAI) {
            throw new Error('Google Gemini API未配置，请先设置API Key');
        }
        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
            const prompt = `请快速分析以下JavaScript代码片段，识别可能的反爬机制：

\`\`\`javascript
${codeSnippet.substring(0, 4000)}
\`\`\`

请简要说明：
1. 主要功能
2. 是否包含反爬技术
3. 潜在的绕过方法

请用中文回答，控制在300字以内。`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        }
        catch (error) {
            console.error('快速分析失败:', error);
            throw new Error(`快速分析失败: ${error.message}`);
        }
    }
    /**
     * 使用Python后端进行聊天
     * @param message - 用户消息
     * @returns Python响应
     */
    async chatWithPython(message) {
        return new Promise((resolve, reject) => {
            try {
                console.log('开始调用Python聊天后端...');
                // 构建Python脚本路径
                // 使用扩展的绝对路径构建Python脚本路径
                const scriptPath = path.join(__dirname, '..', '..', 'gemeni.py');
                console.log(`Python脚本路径: ${scriptPath}`);
                // 构建命令参数
                const args = ['--mode', 'chat', '--message', message];
                // 如果有API Key，传递给Python脚本
                if (this.apiKey) {
                    args.push('--api-key', this.apiKey);
                }
                console.log(`执行命令: ${this.pythonPath} ${scriptPath} ${args.join(' ')}`);
                // 执行Python脚本
                const child = child_process.spawn(this.pythonPath, [scriptPath, ...args], {
                    cwd: process.cwd(),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false
                });
                let stdout = '';
                let stderr = '';
                // 收集输出
                child.stdout.on('data', (data) => {
                    stdout += data.toString('utf8');
                });
                child.stderr.on('data', (data) => {
                    stderr += data.toString('utf8');
                    console.log('Python stderr:', data.toString());
                });
                // 处理进程结束
                child.on('close', (code) => {
                    console.log(`Python脚本退出，代码: ${code}`);
                    console.log('Python stdout:', stdout);
                    console.log('Python stderr:', stderr);
                    if (code === 0) {
                        try {
                            // 解析JSON响应
                            const response = JSON.parse(stdout.trim());
                            if (response.success && response.response) {
                                resolve(response.response);
                            }
                            else {
                                reject(new Error(response.error || 'Python响应为空'));
                            }
                        }
                        catch (parseError) {
                            console.error('解析Python响应失败:', parseError);
                            reject(new Error(`解析响应失败: ${parseError.message}\n原始输出: ${stdout}`));
                        }
                    }
                    else {
                        reject(new Error(`Python脚本执行失败 (退出码: ${code}): ${stderr}`));
                    }
                });
                // 处理进程错误
                child.on('error', (error) => {
                    console.error('执行Python脚本时出错:', error);
                    reject(new Error(`执行Python脚本失败: ${error.message}`));
                });
                // 设置超时
                setTimeout(() => {
                    child.kill('SIGTERM');
                    reject(new Error('Python脚本执行超时'));
                }, 45000); // 45秒超时（给Python脚本30秒，留15秒缓冲）
            }
            catch (error) {
                console.error('调用Python脚本时出错:', error);
                reject(new Error(`调用Python脚本失败: ${error.message}`));
            }
        });
    }
    /**
     * 获取当前API状态
     * @returns API配置状态
     */
    getStatus() {
        return {
            configured: this.genAI !== null,
            hasKey: this.apiKey.length > 0
        };
    }
    /**
     * 测试API连接
     * @returns 连接测试结果
     */
    async testConnection() {
        if (!this.genAI) {
            return {
                success: false,
                message: '请先配置Google Gemini API Key'
            };
        }
        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent('请回复"API连接成功"');
            const response = await result.response;
            const text = response.text();
            return {
                success: true,
                message: `API连接成功，响应: ${text.substring(0, 100)}`
            };
        }
        catch (error) {
            return {
                success: false,
                message: `API连接失败: ${error.message}`
            };
        }
    }
}
exports.AIAnalyzer = AIAnalyzer;
