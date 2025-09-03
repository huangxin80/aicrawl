/**
 * AI分析器 - 使用Google Gemini API分析JS反爬机制
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
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
        }
    }

    /**
     * 设置API Key
     * @param apiKey - Google API Key
     */
    setApiKey(apiKey: string) {
        this.apiKey = apiKey;
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    /**
     * 使用Python后端进行聊天对话
     * @param message - 用户消息
     * @returns Promise<string> - AI响应
     */
    async chatWithPython(message: string): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                // 获取Python脚本路径 - 支持多种路径获取方式
                let workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                
                // 如果没有工作区，尝试使用扩展的URI路径
                if (!workspaceRoot) {
                    workspaceRoot = path.dirname(this._extensionUri?.fsPath || __dirname);
                    // 如果扩展URI也不可用，使用当前工作目录
                    if (!workspaceRoot || workspaceRoot === path.dirname(__dirname)) {
                        workspaceRoot = process.cwd();
                    }
                }
                
                // 多种可能的Python脚本路径
                const possiblePaths = [
                    path.join(workspaceRoot, 'gemeni.py'),
                    path.join(workspaceRoot, 'crawler', 'gemeni.py'),
                    path.join(process.cwd(), 'gemeni.py'),
                    'D:\\crawler\\crawler\\gemeni.py' // 直接使用已知正确路径作为备选
                ];
                
                console.log('工作区路径:', workspaceRoot);
                console.log('扩展URI:', this._extensionUri?.fsPath);
                console.log('当前工作目录:', process.cwd());
                console.log('尝试的路径:', possiblePaths);
                
                let pythonScriptPath = '';
                // 检查所有可能的路径
                for (const testPath of possiblePaths) {
                    if (fs.existsSync(testPath)) {
                        pythonScriptPath = testPath;
                        console.log('找到Python脚本:', pythonScriptPath);
                        break;
                    }
                }
                
                if (!pythonScriptPath) {
                    throw new Error(`Python脚本不存在。尝试了以下路径: ${possiblePaths.join(', ')}. 请确保gemeni.py文件在正确的位置。`);
                }
                
                // 构建命令
                const args = ['--mode', 'chat', '--message', message];
                console.log('执行命令:', this.pythonPath, [pythonScriptPath, ...args]);
                
                // 执行Python脚本
                const pythonProcess = child_process.spawn(this.pythonPath, [pythonScriptPath, ...args], {
                    cwd: path.dirname(pythonScriptPath),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: true // 在Windows上可能需要shell
                });

                let stdout = '';
                let stderr = '';

                pythonProcess.stdout.on('data', (data) => {
                    const output = data.toString('utf8');
                    console.log('Python stdout:', output);
                    stdout += output;
                });

                pythonProcess.stderr.on('data', (data) => {
                    const error = data.toString('utf8');
                    console.log('Python stderr:', error);
                    stderr += error;
                });

                pythonProcess.on('close', (code) => {
                    console.log('Python进程退出，退出码:', code);
                    console.log('完整stdout:', stdout);
                    console.log('完整stderr:', stderr);
                    
                    if (code === 0) {
                        try {
                            // 清理输出，移除可能的额外字符
                            const cleanStdout = stdout.trim();
                            console.log('清理后的stdout:', cleanStdout);
                            
                            const response: PythonChatResponse = JSON.parse(cleanStdout);
                            console.log('解析后的响应对象:', response);
                            
                            if (response.success && response.response) {
                                console.log('最终响应:', response.response);
                                resolve(response.response);
                            } else {
                                console.log('响应失败:', response.error);
                                reject(new Error(response.error || '未知错误'));
                            }
                        } catch (parseError) {
                            console.log('JSON解析失败:', parseError);
                            reject(new Error(`JSON解析错误: ${parseError}. 原始输出: ${stdout}`));
                        }
                    } else {
                        reject(new Error(`Python脚本执行失败 (退出码: ${code}): ${stderr || '无错误信息'}`));
                    }
                });

                pythonProcess.on('error', (error) => {
                    console.log('Python进程启动错误:', error);
                    reject(new Error(`无法启动Python进程: ${error.message}. 请确保已安装Python并且可以通过命令行访问。`));
                });

                // 设置超时
                setTimeout(() => {
                    pythonProcess.kill();
                    reject(new Error('Python脚本执行超时'));
                }, 30000); // 30秒超时

            } catch (error: any) {
                console.log('chatWithPython异常:', error);
                reject(new Error(`聊天失败: ${error.message}`));
            }
        });
    }

    /**
     * 使用Python后端分析JS文件
     * @param jsFiles - 捕获的JS文件列表
     * @param url - 网站URL
     * @returns Promise<AnalysisResult> - 分析结果
     */
    async analyzeJSFilesWithPython(jsFiles: JSFileInfo[], url: string): Promise<AnalysisResult> {
        return new Promise((resolve, reject) => {
            try {
                // 获取Python脚本路径 - 支持多种路径获取方式
                let workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                
                // 如果没有工作区，尝试使用扩展的URI路径
                if (!workspaceRoot) {
                    workspaceRoot = path.dirname(this._extensionUri?.fsPath || __dirname);
                    // 如果扩展URI也不可用，使用当前工作目录
                    if (!workspaceRoot || workspaceRoot === path.dirname(__dirname)) {
                        workspaceRoot = process.cwd();
                    }
                }
                
                // 多种可能的Python脚本路径
                const possiblePaths = [
                    path.join(workspaceRoot, 'gemeni.py'),
                    path.join(workspaceRoot, 'crawler', 'gemeni.py'),
                    path.join(process.cwd(), 'gemeni.py'),
                    'D:\\crawler\\crawler\\gemeni.py' // 直接使用已知正确路径作为备选
                ];
                
                let pythonScriptPath = '';
                // 检查所有可能的路径
                for (const testPath of possiblePaths) {
                    if (fs.existsSync(testPath)) {
                        pythonScriptPath = testPath;
                        break;
                    }
                }
                
                if (!pythonScriptPath) {
                    throw new Error(`Python脚本不存在。尝试了以下路径: ${possiblePaths.join(', ')}. 请确保gemeni.py文件在正确的位置。`);
                }
                
                const tempInputFile = path.join(path.dirname(pythonScriptPath), 'temp_analysis_input.json');
                
                // 准备分析数据
                const analysisData = {
                    url: url,
                    js_files: this.prepareAnalysisContent(jsFiles)
                };
                
                // 写入临时文件
                fs.writeFileSync(tempInputFile, JSON.stringify(analysisData, null, 2));
                
                // 构建命令
                const args = ['--mode', 'analyze', '--input-file', tempInputFile];
                
                // 执行Python脚本
                const pythonProcess = child_process.spawn(this.pythonPath, [pythonScriptPath, ...args], {
                    cwd: workspaceRoot,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let stdout = '';
                let stderr = '';

                pythonProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    // 清理临时文件
                    try {
                        fs.unlinkSync(tempInputFile);
                    } catch (e) {
                        // 忽略删除错误
                    }
                    
                    if (code === 0) {
                        try {
                            const response: PythonChatResponse = JSON.parse(stdout);
                            if (response.success && response.response) {
                                // 尝试解析分析结果JSON
                                const jsonMatch = response.response.match(/\{[\s\S]*\}/);
                                if (jsonMatch) {
                                    const analysisResult = JSON.parse(jsonMatch[0]) as AnalysisResult;
                                    resolve(analysisResult);
                                } else {
                                    resolve(this.createDefaultAnalysis(response.response));
                                }
                            } else {
                                reject(new Error(response.error || '分析失败'));
                            }
                        } catch (parseError) {
                            reject(new Error(`结果解析错误: ${parseError}`));
                        }
                    } else {
                        reject(new Error(`Python分析脚本执行失败 (退出码: ${code}): ${stderr}`));
                    }
                });

                pythonProcess.on('error', (error) => {
                    reject(new Error(`无法启动Python进程: ${error.message}`));
                });

            } catch (error: any) {
                reject(new Error(`分析失败: ${error.message}`));
            }
        });
    }

    /**
     * 分析JS文件中的反爬机制
     * @param jsFiles - 捕获的JS文件列表
     * @returns 分析结果
     */
    async analyzeJSFiles(jsFiles: JSFileInfo[]): Promise<AnalysisResult> {
        if (!this.genAI) {
            throw new Error('请先配置Google API Key');
        }

        try {
            // 准备分析内容
            const analysisContent = this.prepareAnalysisContent(jsFiles);
            
            // 使用Gemini Pro模型
            const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
            
            const prompt = `
作为一个专业的爬虫分析专家，请分析以下JavaScript代码中的反爬虫机制。

${analysisContent}

请提供以下分析：

1. **反爬虫技术总结**：识别所有使用的反爬虫技术
2. **算法分析**：分析使用的算法（如加密、混淆、验证等）
3. **爬虫构造建议**：如何构建能够绕过这些机制的爬虫
4. **必需的请求结构**：Headers、Cookies、API调用等要求

请以JSON格式返回结果，包含以下字段：
{
    "summary": "总体分析摘要",
    "antiCrawlerTechniques": [
        {
            "name": "技术名称",
            "description": "描述",
            "severity": "严重程度(low/medium/high)",
            "location": "代码位置",
            "bypass": "绕过方法"
        }
    ],
    "recommendations": ["建议1", "建议2"],
    "crawlerStructure": {
        "requiredHeaders": {},
        "cookieRequirements": [],
        "javascriptExecution": true/false,
        "dynamicContent": true/false,
        "apiEndpoints": []
    },
    "algorithms": [
        {
            "name": "算法名称",
            "type": "算法类型",
            "description": "描述",
            "implementation": "实现细节"
        }
    ],
    "confidence": 0.85
}
`;

            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();
            
            // 解析JSON结果
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysisResult = JSON.parse(jsonMatch[0]) as AnalysisResult;
                return analysisResult;
            }
            
            // 如果无法解析JSON，返回默认结果
            return this.createDefaultAnalysis(text);
            
        } catch (error: any) {
            console.error('AI分析出错:', error);
            throw new Error(`AI分析失败: ${error.message}`);
        }
    }

    /**
     * 从本地catch文件夹分析JS文件
     * @param localFiles - 从本地读取的JS文件列表
     * @returns 分析结果
     */
    async analyzeLocalJSFiles(localFiles: JSFileInfo[]): Promise<AnalysisResult> {
        if (!this.genAI) {
            throw new Error('请先配置Google API Key');
        }

        try {
            // 准备分析内容 - 使用真实的文件内容
            let analysisContent = '从本地catch文件夹捕获的JavaScript文件：\n\n';
            
            localFiles.forEach((file, index) => {
                analysisContent += `\n=== 文件 ${index + 1} ===\n`;
                analysisContent += `文件名: ${path.basename(file.localPath || file.url)}\n`;
                analysisContent += `大小: ${file.size} bytes\n`;
                analysisContent += `路径: ${file.localPath}\n`;
                analysisContent += `\n--- 文件内容开始 ---\n`;
                
                // 限制每个文件的内容长度，但要确保AI能看到关键代码
                const maxFileContent = 10000; // 每个文件最多10KB内容
                if (file.content.length > maxFileContent) {
                    analysisContent += file.content.substring(0, maxFileContent);
                    analysisContent += '\n... [内容已截断] ...\n';
                } else {
                    analysisContent += file.content;
                }
                
                analysisContent += `\n--- 文件内容结束 ---\n\n`;
            });
            
            // 使用Gemini Pro模型进行深度分析
            const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
            
            const prompt = `
你是一个专业的JavaScript反爬虫分析专家。请仔细分析以下从网站捕获的JavaScript文件内容，识别其中的反爬虫机制。

${analysisContent}

请进行深度分析并提供：

1. **反爬虫技术识别**：
   - 仔细检查每个文件中的代码
   - 识别所有反爬虫技术（如debugger检测、webdriver检测、指纹识别、时间检测等）
   - 标注具体的代码位置和实现方式

2. **算法分析**：
   - 分析使用的加密、混淆、验证算法
   - 识别token生成、签名验证等机制
   - 分析数据加密和解密的流程

3. **严重程度评估**：
   - 根据实际代码评估每个反爬技术的严重程度
   - 不要随意标记，要基于代码的实际影响

4. **绕过方法**：
   - 为每个识别到的反爬技术提供具体的绕过方法
   - 提供实际可行的解决方案

请以JSON格式返回详细的分析结果：
{
    "summary": "总体分析摘要（描述发现的主要反爬机制）",
    "antiCrawlerTechniques": [
        {
            "name": "技术名称",
            "description": "详细描述",
            "severity": "low/medium/high（基于实际影响）",
            "location": "具体的文件名和代码位置",
            "bypass": "具体的绕过方法"
        }
    ],
    "recommendations": ["具体建议1", "具体建议2"],
    "crawlerStructure": {
        "requiredHeaders": {"必需的请求头": "值"},
        "cookieRequirements": ["必需的cookie"],
        "javascriptExecution": true/false,
        "dynamicContent": true/false,
        "apiEndpoints": ["发现的API端点"]
    },
    "algorithms": [
        {
            "name": "算法名称",
            "type": "算法类型（加密/混淆/验证等）",
            "description": "算法描述",
            "implementation": "实现细节"
        }
    ],
    "confidence": 0.0-1.0
}

注意：
- 如果没有发现反爬机制，antiCrawlerTechniques数组应该为空
- 只报告实际存在的技术，不要猜测或假设
- 基于代码内容提供准确的分析
`;

            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();
            
            // 解析JSON结果
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysisResult = JSON.parse(jsonMatch[0]) as AnalysisResult;
                return analysisResult;
            }
            
            // 如果无法解析JSON，返回默认结果
            return this.createDefaultAnalysis(text);
            
        } catch (error: any) {
            console.error('AI分析出错:', error);
            throw new Error(`AI分析失败: ${error.message}`);
        }
    }

    /**
     * 准备分析内容
     * @param jsFiles - JS文件列表
     * @returns 格式化的分析内容
     */
    private prepareAnalysisContent(jsFiles: JSFileInfo[]): string {
        let content = '捕获的JavaScript文件分析：\n\n';
        
        // 限制分析的文件数量和内容长度
        const maxFiles = 5;
        const maxContentLength = 5000;
        
        jsFiles.slice(0, maxFiles).forEach((file, index) => {
            content += `\n=== 文件 ${index + 1}: ${file.url} ===\n`;
            content += `大小: ${file.size} bytes\n`;
            content += `方法: ${file.method}\n`;
            
            // 截取关键代码部分
            const codeSnippet = this.extractKeyCode(file.content, maxContentLength);
            content += `代码片段:\n${codeSnippet}\n`;
            
            // 添加检测到的模式
            const patterns = this.detectPatterns(file.content);
            if (patterns.length > 0) {
                content += `检测到的模式: ${patterns.join(', ')}\n`;
            }
            
            content += '\n';
        });
        
        return content;
    }

    /**
     * 提取关键代码
     * @param content - 完整代码内容
     * @param maxLength - 最大长度
     * @returns 关键代码片段
     */
    private extractKeyCode(content: string, maxLength: number): string {
        // 查找包含反爬关键词的代码段
        const keywords = [
            'debugger', 'devtools', 'console', 'navigator',
            'webdriver', 'phantom', 'selenium', 'toString',
            'encrypt', 'decrypt', 'token', 'sign', 'verify',
            'fingerprint', 'canvas', 'audio', 'webgl'
        ];
        
        let keySegments: string[] = [];
        
        for (const keyword of keywords) {
            const regex = new RegExp(`[^\n]*${keyword}[^\n]*`, 'gi');
            const matches = content.match(regex);
            if (matches) {
                keySegments.push(...matches.slice(0, 3));
            }
        }
        
        // 如果找到关键段，返回它们
        if (keySegments.length > 0) {
            return keySegments.join('\n...\n').substring(0, maxLength);
        }
        
        // 否则返回开头部分
        return content.substring(0, maxLength);
    }

    /**
     * 检测代码模式
     * @param content - 代码内容
     * @returns 检测到的模式列表
     */
    private detectPatterns(content: string): string[] {
        const patterns: string[] = [];
        
        const patternMap: Record<string, RegExp> = {
            '调试器检测': /debugger|devtools/gi,
            'WebDriver检测': /navigator\.webdriver|phantom|selenium/gi,
            '控制台检测': /console\.(clear|log|dir)/gi,
            '函数toString检测': /Function\.prototype\.toString/gi,
            'Canvas指纹': /canvas|toDataURL|getImageData/gi,
            'WebGL指纹': /webgl|WebGLRenderingContext/gi,
            '音频指纹': /AudioContext|OscillatorNode/gi,
            '时间检测': /performance\.now|Date\.now/gi,
            '代理检测': /Proxy|Reflect/gi,
            '加密算法': /crypto|encrypt|decrypt|md5|sha|aes/gi,
            'Cookie验证': /document\.cookie|setCookie/gi,
            'Token生成': /token|jwt|sign|verify/gi,
            'User-Agent检测': /userAgent|navigator\.userAgent/gi,
            '屏幕检测': /screen\.(width|height)|window\.(inner|outer)/gi
        };
        
        for (const [name, regex] of Object.entries(patternMap)) {
            if (regex.test(content)) {
                patterns.push(name);
            }
        }
        
        return patterns;
    }

    /**
     * 创建默认分析结果
     * @param rawText - 原始AI响应文本
     * @returns 默认分析结果
     */
    private createDefaultAnalysis(rawText: string): AnalysisResult {
        return {
            summary: rawText.substring(0, 500),
            antiCrawlerTechniques: [
                {
                    name: '基础检测',
                    description: '检测到JavaScript反爬机制',
                    severity: 'medium',
                    location: '多处',
                    bypass: '需要进一步分析'
                }
            ],
            recommendations: [
                '使用Playwright或Puppeteer模拟真实浏览器',
                '确保所有必需的Headers和Cookies',
                '执行JavaScript代码',
                '模拟用户行为'
            ],
            crawlerStructure: {
                requiredHeaders: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'zh-CN,zh;q=0.9'
                },
                cookieRequirements: [],
                javascriptExecution: true,
                dynamicContent: true,
                apiEndpoints: []
            },
            algorithms: [],
            confidence: 0.5
        };
    }
} 