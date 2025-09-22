#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gemini API聊天后端
用于处理VS Code扩展的聊天请求，支持文件上传和多媒体分析
"""

import sys
import json
import argparse
import re
import os
import mimetypes
from pathlib import Path
from google import genai
from google.genai import types

# 设置标准输出编码为UTF-8
if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

class GeminiChatBackend:
    def __init__(self, api_key="AIzaSyDMjRqKCyLafmxyMxDUDxW2WX1-8EJ_8dI"):
        """
        初始化Gemini客户端
        @param api_key: Google Gemini API密钥
        """
        try:
            # 使用新的导入方式的API初始化方法
            self.client = genai.Client(api_key=api_key)
            self.model_name = 'models/gemini-2.5-flash'
        except Exception as e:
            raise Exception(f"Gemini客户端初始化失败: {str(e)}")
    
    def upload_file(self, file_path, display_name=None):
        """
        上传文件到Gemini API
        @param file_path: 文件路径
        @param display_name: 显示名称（可选）
        @return: 上传结果包含文件信息
        """
        try:
            # 检查文件是否存在
            if not os.path.exists(file_path):
                return {
                    "success": False,
                    "error": f"文件不存在: {file_path}",
                    "file_info": None
                }
            
            # 获取文件信息
            file_size = os.path.getsize(file_path)
            if file_size > 2 * 1024 * 1024 * 1024:  # 2GB限制
                return {
                    "success": False,
                    "error": "文件大小超过2GB限制",
                    "file_info": None
                }
            
            # 如果没有提供显示名称，使用文件名
            if display_name is None:
                display_name = os.path.basename(file_path)
            
            # 确定文件MIME类型，对不支持的类型进行转换
            file_extension = os.path.splitext(file_path)[1].lower()

            # Gemini不支持的文件类型列表，需要转换为文本
            unsupported_extensions = [
                '.json', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',  # JavaScript相关
                '.py', '.pyx', '.pyw',  # Python
                '.java', '.kt', '.scala',  # JVM语言
                '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',  # C/C++
                '.cs', '.vb',  # .NET
                '.go', '.rs',  # Go和Rust
                '.rb', '.php', '.swift',  # 其他语言
                '.sh', '.bash', '.zsh', '.fish',  # Shell脚本
                '.yml', '.yaml', '.toml', '.ini', '.cfg',  # 配置文件
                '.xml', '.html', '.htm', '.css', '.scss', '.sass',  # 标记和样式
                '.vue', '.svelte',  # 前端框架文件
                '.sql', '.graphql',  # 查询语言
                '.r', '.m', '.lua', '.pl', '.dart',  # 其他语言
                '.md', '.rst', '.tex',  # 文档格式
                '.dockerfile', '.makefile',  # 特殊文件
                '.env', '.gitignore', '.editorconfig'  # 配置文件
            ]

            if file_extension in unsupported_extensions or file_extension.startswith('.'):
                # 处理没有扩展名或不在列表中但可能是代码文件的情况
                try:
                    # 尝试以文本方式读取文件
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    # 添加文件类型说明
                    file_type_name = file_extension[1:].upper() if file_extension else 'UNKNOWN'
                    file_header = f"# File: {os.path.basename(file_path)}\n# Type: {file_type_name} source code\n# Path: {file_path}\n\n"
                    full_content = file_header + content

                    temp_txt_path = file_path + '.txt'
                    with open(temp_txt_path, 'w', encoding='utf-8') as f:
                        f.write(full_content)

                    uploaded_file = self.client.files.upload(file=temp_txt_path)
                    os.remove(temp_txt_path)  # 删除临时文件
                    mime_type = "text/plain"
                except UnicodeDecodeError:
                    # 如果不能作为文本读取，尝试直接上传
                    try:
                        uploaded_file = self.client.files.upload(file=file_path)
                        mime_type = uploaded_file.mime_type
                    except Exception as upload_error:
                        # 如果还是失败，返回错误
                        raise Exception(f"文件类型不支持或无法读取: {file_extension}")
            else:
                # 正常上传其他文件（图片、视频等）
                uploaded_file = self.client.files.upload(file=file_path)
                mime_type = uploaded_file.mime_type
            
            return {
                "success": True,
                "error": None,
                "file_info": {
                    "name": uploaded_file.name,
                    "uri": uploaded_file.uri,
                    "display_name": display_name,
                    "mime_type": mime_type,
                    "size_bytes": file_size,
                    "state": "ACTIVE"
                }
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"文件上传失败: {str(e)}",
                "file_info": None
            }
    
    def analyze_file(self, file_path, prompt="请分析这个文件的内容", custom_analysis=None):
        """
        上传并分析文件内容
        @param file_path: 文件路径
        @param prompt: 分析提示词
        @param custom_analysis: 自定义分析类型
        @return: 分析结果
        """
        try:
            # 首先上传文件
            upload_result = self.upload_file(file_path)
            if not upload_result["success"]:
                return upload_result
            
            file_info = upload_result["file_info"]
            
            # 根据文件类型自动选择分析策略
            analysis_prompt = self._generate_analysis_prompt(file_info, prompt, custom_analysis)
            
            # 生成分析内容，使用上传的文件对象
            # 重新获取文件对象用于分析
            uploaded_file_obj = self.client.files.get(name=file_info["name"])
            
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[analysis_prompt, uploaded_file_obj]
            )
            
            # 格式化响应
            formatted_response = self.format_analysis_response(response.text)
            clean_response = self.clean_response_text(formatted_response)
            
            # 注意：不立即删除文件，让用户手动管理或等待48小时自动过期
            # 如果需要立即清理，可以在返回结果后手动调用delete_file
            
            return {
                "success": True,
                "response": clean_response,
                "error": None,
                "file_info": file_info,
                "analysis_type": self._detect_file_type(file_info["mime_type"])
            }
            
        except Exception as e:
            return {
                "success": False,
                "response": None,
                "error": f"文件分析失败: {str(e)}",
                "file_info": None,
                "analysis_type": None
            }
    
    def list_files(self):
        """
        列出所有已上传的文件
        @return: 文件列表
        """
        try:
            files_list = []
            for file_info in self.client.files.list():
                files_list.append({
                    "name": file_info.name,
                    "uri": file_info.uri,
                    "display_name": getattr(file_info, 'display_name', 'Unknown'),
                    "mime_type": file_info.mime_type,
                    "size_bytes": getattr(file_info, 'size_bytes', 0),
                    "create_time": getattr(file_info, 'create_time', 'Unknown'),
                    "state": getattr(file_info, 'state', 'Unknown')
                })
            
            return {
                "success": True,
                "files": files_list,
                "count": len(files_list),
                "error": None
            }
        except Exception as e:
            return {
                "success": False,
                "files": [],
                "count": 0,
                "error": f"获取文件列表失败: {str(e)}"
            }
    
    def delete_file(self, file_name):
        """
        删除已上传的文件
        @param file_name: 文件名称
        @return: 删除结果
        """
        try:
            self.client.files.delete(name=file_name)
            return {
                "success": True,
                "error": None,
                "message": f"文件 {file_name} 已成功删除"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"删除文件失败: {str(e)}",
                "message": None
            }
    
    def _generate_analysis_prompt(self, file_info, user_prompt, custom_analysis):
        """
        根据文件类型生成分析提示词
        @param file_info: 文件信息
        @param user_prompt: 用户提示词
        @param custom_analysis: 自定义分析类型
        @return: 分析提示词
        """
        file_type = self._detect_file_type(file_info["mime_type"])
        
        if custom_analysis:
            return f"""作为专业的文件分析专家，请按照以下要求分析文件：

{custom_analysis}

用户具体要求：{user_prompt}

请提供详细的分析结果。"""
        
        # 根据文件类型生成默认提示词
        type_prompts = {
            "image": f"""作为专业的图像分析专家，请分析这张图片：

1. **图像内容描述**：详细描述图像中的主要内容、物体、人物等
2. **技术信息**：分析图像的质量、构图、色彩等技术特征
3. **应用建议**：根据图像内容提供可能的应用场景或改进建议

用户要求：{user_prompt}""",
            
            "video": f"""作为专业的视频分析专家，请分析这个视频：

1. **视频内容概述**：描述视频的主要内容和场景
2. **关键信息提取**：识别视频中的重要信息和关键帧
3. **应用分析**：分析视频的用途和改进建议

用户要求：{user_prompt}""",
            
            "audio": f"""作为专业的音频分析专家，请分析这个音频文件：

1. **音频内容识别**：识别音频中的语音、音乐或其他声音内容
2. **内容转录**：如果包含语音，请提供转录文本
3. **音质分析**：分析音频质量和特征

用户要求：{user_prompt}""",
            
            "document": f"""作为专业的文档分析专家，请分析这个文档：

1. **文档结构分析**：分析文档的结构和布局
2. **内容提取**：提取文档中的关键信息和数据
3. **内容总结**：提供文档内容的简洁总结

用户要求：{user_prompt}""",
            
            "code": f"""作为专业的代码分析专家，请分析这个代码文件：

1. **代码结构分析**：分析代码的结构、函数和类
2. **功能说明**：解释代码的主要功能和逻辑
3. **代码质量评估**：评估代码质量并提供改进建议

用户要求：{user_prompt}"""
        }
        
        return type_prompts.get(file_type, f"""请分析这个文件的内容：

{user_prompt}

请提供详细的分析结果。""")
    
    def _detect_file_type(self, mime_type):
        """
        根据MIME类型检测文件类型
        @param mime_type: MIME类型
        @return: 文件类型分类
        """
        if mime_type.startswith('image/'):
            return 'image'
        elif mime_type.startswith('video/'):
            return 'video'
        elif mime_type.startswith('audio/'):
            return 'audio'
        elif mime_type in ['application/pdf', 'text/plain', 'application/msword',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']:
            return 'document'
        elif mime_type in ['text/x-python', 'text/javascript', 'text/html', 'text/css',
                          'application/json', 'text/x-java-source', 'text/x-c++src',
                          'application/javascript', 'text/x-typescript']:
            return 'code'
        elif mime_type == 'text/plain':
            # 对于转换后的文本文件，尝试从内容判断
            return 'code'  # 默认将转换的文本视为代码
        else:
            return 'unknown'
    
    def chat(self, message, model_name="gemini-2.5-flash"):
        """
        发送聊天消息到Gemini API
        @param message: 用户消息
        @param model_name: 使用的模型名称
        @return: API响应文本
        """
        try:
            # 设置较短的超时时间避免长时间等待
            import socket
            socket.setdefaulttimeout(30)  # 30秒超时
            
            # 简化prompt，重点是清晰的段落结构
            enhanced_message = f"""作为专业的爬虫分析专家，请以简洁清晰的方式回答问题。

格式要求：
1. 每个要点用独立段落表达
2. 段落间用空行分隔
3. 每个段落首行空两格
4. 内容简洁专业，避免冗余

用户问题：{message}

请提供分段清晰的专业回答。"""
            
            # 使用新的API调用方式
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[{"text": enhanced_message}]
            )
            
            # 获取原始响应
            raw_response = response.text
            
            # 应用cursor IDE风格的格式化
            formatted_response = self.format_analysis_response(raw_response)
            
            # 清理响应文本，确保没有格式问题
            clean_response = self.clean_response_text(formatted_response)
            
            return {
                "success": True,
                "response": clean_response,
                "error": None
            }
        except Exception as e:
            error_msg = str(e)
            if "timeout" in error_msg.lower():
                error_msg = "API请求超时，请检查网络连接"
            elif "api_key" in error_msg.lower():
                error_msg = "API Key无效或过期"
            elif "quota" in error_msg.lower():
                error_msg = "API配额已用完"
            return {
                "success": False,
                "response": None,
                "error": error_msg
            }
    
    def clean_response_text(self, text):
        """
        清理和格式化响应文本，使其更加工整美观
        """
        if text is None:
            return ""
        
        # 移除可能的控制字符
        cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', str(text))
        
        # 优化markdown格式
        cleaned = self.format_markdown_response(cleaned)
        
        return cleaned.strip()
    
    def format_markdown_response(self, text):
        """
        格式化响应文本，重点是段落清晰分离和首行缩进
        """
        # 按双换行符分割段落
        paragraphs = re.split(r'\n\s*\n', text.strip())
        formatted_paragraphs = []
        
        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue
                
            # 处理标题（保持原样）
            if paragraph.startswith('#'):
                formatted_paragraphs.append(paragraph)
            
            # 处理列表项（保持原样）
            elif any(paragraph.startswith(marker) for marker in ['- ', '* ', '• ', '1. ', '2. ', '3. ', '4. ', '5. ']):
                formatted_paragraphs.append(paragraph)
            
            # 处理代码块（保持原样）
            elif '```' in paragraph:
                formatted_paragraphs.append(paragraph)
            
            # 普通段落：首行缩进两个全角空格
            else:
                # 为段落添加首行缩进
                indented_paragraph = f"　　{paragraph}"
                formatted_paragraphs.append(indented_paragraph)
        
        # 用双换行符连接段落，确保段落间有明显分离
        return '\n\n'.join(formatted_paragraphs)
    
    def format_analysis_response(self, content):
        """
        简化的分析结果格式化，去除花哨元素
        """
        # 移除过多的emoji
        content = re.sub(r'[🔍📊🔧🕷️🔒🕵️‍♂️⚠️✨🎨🎯]', '', content)
        
        # 保留重要的技术术语加粗，但移除过度装饰
        return content
    
    def analyze_js(self, js_files_data, url):
        """
        分析JavaScript文件的反爬机制
        @param js_files_data: JS文件数据
        @param url: 网站URL
        @return: 分析结果
        """
        analysis_prompt = f"""
作为一个专业的爬虫分析专家，请分析网站 {url} 的JavaScript反爬虫机制。

{js_files_data}

请提供以下分析：

1. **反爬虫技术总结**：识别所有使用的反爬虫技术
2. **算法分析**：分析使用的算法（如加密、混淆、验证等）
3. **爬虫构造建议**：如何构建能够绕过这些机制的爬虫
4. **必需的请求结构**：Headers、Cookies、API调用等要求

请以JSON格式返回结果，包含以下字段：
{{
    "summary": "总体分析摘要",
    "antiCrawlerTechniques": [
        {{
            "name": "技术名称",
            "description": "描述",
            "severity": "严重程度(low/medium/high)",
            "location": "代码位置",
            "bypass": "绕过方法"
        }}
    ],
    "recommendations": ["建议1", "建议2"],
    "crawlerStructure": {{
        "requiredHeaders": {{}},
        "cookieRequirements": [],
        "javascriptExecution": true,
        "dynamicContent": true,
        "apiEndpoints": []
    }},
    "algorithms": [
        {{
            "name": "算法名称",
            "type": "算法类型",
            "description": "描述",
            "implementation": "实现细节"
        }}
    ],
    "confidence": 0.85
}}
"""
        return self.chat(analysis_prompt)

def output_json(data):
    """
    安全地输出JSON数据
    """
    try:
        # 使用ensure_ascii=False保持中文字符
        json_str = json.dumps(data, ensure_ascii=False, indent=2, separators=(',', ': '))
        # 验证JSON格式
        json.loads(json_str)
        print(json_str)
        sys.stdout.flush()  # 强制刷新输出缓冲区
    except Exception as e:
        # 如果JSON序列化失败，输出简化的错误信息
        error_data = {
            "success": False,
            "response": None,
            "error": f"JSON序列化错误: {str(e)}"
        }
        print(json.dumps(error_data, ensure_ascii=False, indent=2))
        sys.stdout.flush()

def main():
    parser = argparse.ArgumentParser(description='Gemini Chat Backend - 支持聊天、文件分析和JS分析')
    parser.add_argument('--mode', choices=['chat', 'analyze', 'upload', 'file-analyze', 'list-files', 'delete-file'], 
                       default='chat', help='运行模式：chat(聊天)、analyze(JS分析)、upload(上传文件)、file-analyze(文件分析)、list-files(列出文件)、delete-file(删除文件)')
    parser.add_argument('--message', type=str, help='聊天消息或分析提示词')
    parser.add_argument('--input-file', type=str, help='输入JSON文件路径（用于JS分析）')
    parser.add_argument('--file-path', type=str, help='要上传或分析的文件路径')
    parser.add_argument('--file-name', type=str, help='要删除的文件名称')
    parser.add_argument('--display-name', type=str, help='文件显示名称（可选）')
    parser.add_argument('--custom-analysis', type=str, help='自定义分析要求')
    parser.add_argument('--api-key', type=str, help='Google API Key')
    
    args = parser.parse_args()
    
    # 使用自定义API Key（如果提供）
    api_key = args.api_key if args.api_key else "AIzaSyDMjRqKCyLafmxyMxDUDxW2WX1-8EJ_8dI"
    backend = GeminiChatBackend(api_key)
    
    try:
        if args.mode == 'chat':
            # 聊天模式
            if args.message:
                result = backend.chat(args.message)
            elif not sys.stdin.isatty():
                # 从标准输入读取
                message = sys.stdin.read().strip()
                result = backend.chat(message)
            else:
                result = {"success": False, "error": "没有提供消息"}
                
        elif args.mode == 'analyze':
            # JS分析模式
            if args.input_file:
                with open(args.input_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                result = backend.analyze_js(data.get('js_files', ''), data.get('url', ''))
            else:
                result = {"success": False, "error": "JS分析模式需要提供输入文件"}
        
        elif args.mode == 'upload':
            # 文件上传模式
            if args.file_path:
                result = backend.upload_file(args.file_path, args.display_name)
            else:
                result = {"success": False, "error": "上传模式需要提供文件路径"}
                
        elif args.mode == 'file-analyze':
            # 文件分析模式
            if args.file_path:
                prompt = args.message if args.message else "请分析这个文件的内容"
                result = backend.analyze_file(args.file_path, prompt, args.custom_analysis)
            else:
                result = {"success": False, "error": "文件分析模式需要提供文件路径"}
        
        elif args.mode == 'list-files':
            # 列出文件模式
            result = backend.list_files()
            
        elif args.mode == 'delete-file':
            # 删除文件模式
            if args.file_name:
                result = backend.delete_file(args.file_name)
            else:
                result = {"success": False, "error": "删除文件模式需要提供文件名称"}
        
        # 安全输出JSON结果
        output_json(result)
        
    except Exception as e:
        error_result = {
            "success": False,
            "response": None,
            "error": f"执行出错: {str(e)}"
        }
        output_json(error_result)
        sys.exit(1)

if __name__ == "__main__":
    main()