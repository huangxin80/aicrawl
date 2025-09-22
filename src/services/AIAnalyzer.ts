/**
 * AI分析器 - 使用Google Gemini API分析JS反爬机制
 * 混合版本 - 支持直接Gemini API和Python后端聊天
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import { JSFileInfo } from './CrawlerService';

export interface AnalysisResult {
    summary: string;
    antiCrawlerTechniques: AntiCrawlerTechnique[];
    recommendations: string[];
    crawlerStructure: CrawlerStructure;
    algorithms: Algorithm[];
    confidence: number;
}

export interface AntiCrawlerTechnique {
    name: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    location: string;
    bypass: string;
}

export interface CrawlerStructure {
    requiredHeaders: Record<string, string>;
    cookieRequirements: string[];
    javascriptExecution: boolean;
    dynamicContent: boolean;
    apiEndpoints: string[];
}

export interface Algorithm {
    name: string;
    type: string;
    description: string;
    implementation: string;
}

/**
 * 文件上传结果接口
 */
export interface FileUploadResult {
    success: boolean;
    error?: string;
    file_info?: {
        name: string;
        uri: string;
        display_name: string;
        mime_type: string;
        size_bytes: number;
        state: string;
    };
}

/**
 * 文件分析结果接口
 */
export interface FileAnalysisResult {
    success: boolean;
    error?: string;
    response?: string;
    file_info?: {
        name: string;
        uri: string;
        display_name: string;
        mime_type: string;
        size_bytes: number;
        state: string;
    };
    analysis_type?: string;
}

/**
 * 文件列表结果接口
 */
export interface FileListResult {
    success: boolean;
    error?: string;
    files: Array<{
        name: string;
        uri: string;
        display_name: string;
        mime_type: string;
        size_bytes: number;
        create_time: string;
        state: string;
    }>;
    count: number;
}

/**
 * Python聊天响应接口
 */
export interface PythonChatResponse {
    success: boolean;
    response: string | null;
    error: string | null;
}

export class AIAnalyzer {
    private genAI: GoogleGenerativeAI | null = null;
    private apiKey: string = '';
    private pythonPath: string = 'python';
    private _extensionUri?: vscode.Uri;

    constructor(extensionUri?: vscode.Uri) {
        this._extensionUri = extensionUri;
        
        // 尝试从配置中获取API Key
        this.loadApiKey();
        
        // 检测Python路径
        this.detectPythonPath();
    }

    /**
     * 检测系统中的Python路径
     */
    private detectPythonPath() {
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
            } catch (error) {
                // 继续尝试下一个路径
                continue;
            }
        }
        console.log(`使用Python路径: ${this.pythonPath}`);
    }

    /**
     * 从配置加载API Key
     */
    private loadApiKey() {
        const config = vscode.workspace.getConfiguration('crawler-analyzer');
        this.apiKey = config.get('googleApiKey') || '';
        if (this.apiKey) {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            console.log('Google Gemini API已初始化');
        } else {
            console.log('未找到Google API Key，请在设置中配置');
        }
    }

    /**
     * 设置API Key
     * @param apiKey - Google Gemini API Key
     */
    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
        this.genAI = new GoogleGenerativeAI(apiKey);
        console.log('API Key已更新');
    }

    /**
     * 分析JavaScript文件的反爬机制
     * @param jsFiles - JS文件信息数组
     * @returns 分析结果
     */
    async analyzeJSFiles(jsFiles: JSFileInfo[]): Promise<AnalysisResult> {
        if (!this.genAI) {
            throw new Error('Google Gemini API未配置，请先设置API Key');
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            
            // 构建分析prompt
            const prompt = this.buildAnalysisPrompt(jsFiles);
            
            console.log('开始AI分析...');
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // 解析响应
            return this.parseAnalysisResponse(text);

        } catch (error: any) {
            console.error('AI分析失败:', error);
            throw new Error(`AI分析失败: ${error.message}`);
        }
    }

    /**
     * 分析本地JS文件（从catch目录读取）
     * @param localFiles - 本地JS文件信息数组
     * @returns 分析结果
     */
    async analyzeLocalJSFiles(localFiles: JSFileInfo[]): Promise<AnalysisResult> {
        return this.analyzeJSFiles(localFiles);
    }

    /**
     * 构建分析prompt
     * @param jsFiles - JS文件数组
     * @returns 分析prompt
     */
    private buildAnalysisPrompt(jsFiles: JSFileInfo[]): string {
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
    private parseAnalysisResponse(responseText: string): AnalysisResult {
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
                    parsed.antiCrawlerTechniques.map((tech: any) => ({
                        name: tech.name || '未知技术',
                        description: tech.description || '无描述',
                        severity: ['low', 'medium', 'high'].includes(tech.severity) ? 
                            tech.severity : 'medium',
                        location: tech.location || '位置未知',
                        bypass: tech.bypass || '无绕过建议'
                    })) : [],
                algorithms: Array.isArray(parsed.algorithms) ? 
                    parsed.algorithms.map((algo: any) => ({
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

        } catch (error: any) {
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
    async quickAnalyze(codeSnippet: string): Promise<string> {
        if (!this.genAI) {
            throw new Error('Google Gemini API未配置，请先设置API Key');
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            
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

        } catch (error: any) {
            console.error('快速分析失败:', error);
            throw new Error(`快速分析失败: ${error.message}`);
        }
    }

    /**
     * 使用Python后端进行聊天
     * @param message - 用户消息
     * @returns Python响应
     */
    async chatWithPython(message: string): Promise<string> {
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
                            const response: PythonChatResponse = JSON.parse(stdout.trim());
                            if (response.success && response.response) {
                                resolve(response.response);
                            } else {
                                reject(new Error(response.error || 'Python响应为空'));
                            }
                        } catch (parseError: any) {
                            console.error('解析Python响应失败:', parseError);
                            reject(new Error(`解析响应失败: ${parseError.message}\n原始输出: ${stdout}`));
                        }
                    } else {
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
                
            } catch (error: any) {
                console.error('调用Python脚本时出错:', error);
                reject(new Error(`调用Python脚本失败: ${error.message}`));
            }
        });
    }

    /**
     * 上传文件到Gemini API
     * @param filePath - 文件路径
     * @param displayName - 显示名称（可选）
     * @returns 上传结果
     */
    async uploadFile(filePath: string, displayName?: string): Promise<FileUploadResult> {
        return new Promise((resolve, reject) => {
            try {
                console.log('开始上传文件到Gemini API...');
                
                const scriptPath = path.join(__dirname, '..', '..', 'gemeni.py');
                const args = ['--mode', 'upload', '--file-path', filePath];
                
                if (displayName) {
                    args.push('--display-name', displayName);
                }
                
                if (this.apiKey) {
                    args.push('--api-key', this.apiKey);
                }
                
                console.log(`执行文件上传命令: ${this.pythonPath} ${scriptPath} ${args.join(' ')}`);
                
                const child = child_process.spawn(this.pythonPath, [scriptPath, ...args], {
                    cwd: process.cwd(),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false
                });
                
                let stdout = '';
                let stderr = '';
                
                child.stdout.on('data', (data) => {
                    stdout += data.toString('utf8');
                });
                
                child.stderr.on('data', (data) => {
                    stderr += data.toString('utf8');
                    console.log('Python stderr:', data.toString());
                });
                
                child.on('close', (code) => {
                    console.log(`文件上传脚本退出，代码: ${code}`);
                    
                    if (code === 0) {
                        try {
                            const response: FileUploadResult = JSON.parse(stdout.trim());
                            resolve(response);
                        } catch (parseError: any) {
                            console.error('解析文件上传响应失败:', parseError);
                            reject(new Error(`解析响应失败: ${parseError.message}`));
                        }
                    } else {
                        reject(new Error(`文件上传失败 (退出码: ${code}): ${stderr}`));
                    }
                });
                
                child.on('error', (error) => {
                    console.error('执行文件上传脚本时出错:', error);
                    reject(new Error(`文件上传失败: ${error.message}`));
                });
                
                setTimeout(() => {
                    child.kill('SIGTERM');
                    reject(new Error('文件上传超时'));
                }, 60000); // 60秒超时
                
            } catch (error: any) {
                console.error('调用文件上传脚本时出错:', error);
                reject(new Error(`文件上传失败: ${error.message}`));
            }
        });
    }

    /**
     * 分析文件内容
     * @param filePath - 文件路径
     * @param prompt - 分析提示词
     * @param customAnalysis - 自定义分析要求
     * @returns 分析结果
     */
    async analyzeFile(filePath: string, prompt: string = '请分析这个文件的内容', customAnalysis?: string): Promise<FileAnalysisResult> {
        return new Promise((resolve, reject) => {
            try {
                console.log('开始分析文件...');
                
                const scriptPath = path.join(__dirname, '..', '..', 'gemeni.py');
                const args = ['--mode', 'file-analyze', '--file-path', filePath, '--message', prompt];
                
                if (customAnalysis) {
                    args.push('--custom-analysis', customAnalysis);
                }
                
                if (this.apiKey) {
                    args.push('--api-key', this.apiKey);
                }
                
                console.log(`执行文件分析命令: ${this.pythonPath} ${scriptPath} ${args.join(' ')}`);
                
                const child = child_process.spawn(this.pythonPath, [scriptPath, ...args], {
                    cwd: process.cwd(),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false
                });
                
                let stdout = '';
                let stderr = '';
                
                child.stdout.on('data', (data) => {
                    stdout += data.toString('utf8');
                });
                
                child.stderr.on('data', (data) => {
                    stderr += data.toString('utf8');
                    console.log('Python stderr:', data.toString());
                });
                
                child.on('close', (code) => {
                    console.log(`文件分析脚本退出，代码: ${code}`);
                    
                    if (code === 0) {
                        try {
                            const response: FileAnalysisResult = JSON.parse(stdout.trim());
                            resolve(response);
                        } catch (parseError: any) {
                            console.error('解析文件分析响应失败:', parseError);
                            reject(new Error(`解析响应失败: ${parseError.message}`));
                        }
                    } else {
                        reject(new Error(`文件分析失败 (退出码: ${code}): ${stderr}`));
                    }
                });
                
                child.on('error', (error) => {
                    console.error('执行文件分析脚本时出错:', error);
                    reject(new Error(`文件分析失败: ${error.message}`));
                });
                
                setTimeout(() => {
                    child.kill('SIGTERM');
                    reject(new Error('文件分析超时'));
                }, 120000); // 120秒超时，分析可能需要更长时间
                
            } catch (error: any) {
                console.error('调用文件分析脚本时出错:', error);
                reject(new Error(`文件分析失败: ${error.message}`));
            }
        });
    }

    /**
     * 列出已上传的文件
     * @returns 文件列表
     */
    async listFiles(): Promise<FileListResult> {
        return new Promise((resolve, reject) => {
            try {
                console.log('获取文件列表...');
                
                const scriptPath = path.join(__dirname, '..', '..', 'gemeni.py');
                const args = ['--mode', 'list-files'];
                
                if (this.apiKey) {
                    args.push('--api-key', this.apiKey);
                }
                
                const child = child_process.spawn(this.pythonPath, [scriptPath, ...args], {
                    cwd: process.cwd(),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false
                });
                
                let stdout = '';
                let stderr = '';
                
                child.stdout.on('data', (data) => {
                    stdout += data.toString('utf8');
                });
                
                child.stderr.on('data', (data) => {
                    stderr += data.toString('utf8');
                });
                
                child.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const response: FileListResult = JSON.parse(stdout.trim());
                            resolve(response);
                        } catch (parseError: any) {
                            reject(new Error(`解析响应失败: ${parseError.message}`));
                        }
                    } else {
                        reject(new Error(`获取文件列表失败 (退出码: ${code}): ${stderr}`));
                    }
                });
                
                child.on('error', (error) => {
                    reject(new Error(`获取文件列表失败: ${error.message}`));
                });
                
                setTimeout(() => {
                    child.kill('SIGTERM');
                    reject(new Error('获取文件列表超时'));
                }, 30000);
                
            } catch (error: any) {
                reject(new Error(`获取文件列表失败: ${error.message}`));
            }
        });
    }

    /**
     * 删除已上传的文件
     * @param fileName - 文件名称
     * @returns 删除结果
     */
    async deleteFile(fileName: string): Promise<{success: boolean; error?: string; message?: string}> {
        return new Promise((resolve, reject) => {
            try {
                console.log('删除文件...');
                
                const scriptPath = path.join(__dirname, '..', '..', 'gemeni.py');
                const args = ['--mode', 'delete-file', '--file-name', fileName];
                
                if (this.apiKey) {
                    args.push('--api-key', this.apiKey);
                }
                
                const child = child_process.spawn(this.pythonPath, [scriptPath, ...args], {
                    cwd: process.cwd(),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false
                });
                
                let stdout = '';
                let stderr = '';
                
                child.stdout.on('data', (data) => {
                    stdout += data.toString('utf8');
                });
                
                child.stderr.on('data', (data) => {
                    stderr += data.toString('utf8');
                });
                
                child.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const response = JSON.parse(stdout.trim());
                            resolve(response);
                        } catch (parseError: any) {
                            reject(new Error(`解析响应失败: ${parseError.message}`));
                        }
                    } else {
                        reject(new Error(`删除文件失败 (退出码: ${code}): ${stderr}`));
                    }
                });
                
                child.on('error', (error) => {
                    reject(new Error(`删除文件失败: ${error.message}`));
                });
                
                setTimeout(() => {
                    child.kill('SIGTERM');
                    reject(new Error('删除文件超时'));
                }, 30000);
                
            } catch (error: any) {
                reject(new Error(`删除文件失败: ${error.message}`));
            }
        });
    }

    /**
     * 获取当前API状态
     * @returns API配置状态
     */
    getStatus(): { configured: boolean; hasKey: boolean } {
        return {
            configured: this.genAI !== null,
            hasKey: this.apiKey.length > 0
        };
    }

    /**
     * 测试API连接
     * @returns 连接测试结果
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        if (!this.genAI) {
            return {
                success: false,
                message: '请先配置Google Gemini API Key'
            };
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent('请回复"API连接成功"');
            const response = await result.response;
            const text = response.text();
            
            return {
                success: true,
                message: `API连接成功，响应: ${text.substring(0, 100)}`
            };

        } catch (error: any) {
            return {
                success: false,
                message: `API连接失败: ${error.message}`
            };
        }
    }
}