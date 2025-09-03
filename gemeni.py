#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gemini API聊天后端
用于处理VS Code扩展的聊天请求
"""

import sys
import json
import argparse
import re
from google import genai

class GeminiChatBackend:
    def __init__(self, api_key="AIzaSyDMjRqKCyLafmxyMxDUDxW2WX1-8EJ_8dI"):
        """
        初始化Gemini客户端
        @param api_key: Google Gemini API密钥
        """
        self.client = genai.Client(api_key=api_key)
        
    def chat(self, message, model="gemini-2.5-flash"):
        """
        发送聊天消息到Gemini API
        @param message: 用户消息
        @param model: 使用的模型
        @return: API响应文本
        """
        try:
            response = self.client.models.generate_content(
                model=model, 
                contents=message
            )
            # 清理响应文本，确保没有格式问题
            clean_response = self.clean_response_text(response.text)
            return {
                "success": True,
                "response": clean_response,
                "error": None
            }
        except Exception as e:
            return {
                "success": False,
                "response": None,
                "error": str(e)
            }
    
    def clean_response_text(self, text):
        """
        清理响应文本，移除可能影响JSON格式的字符
        """
        if text is None:
            return ""
        # 移除可能的控制字符和多余的空白
        cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', str(text))
        return cleaned.strip()
    
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
        return self.chat(analysis_prompt, "gemini-pro")

def output_json(data):
    """
    安全地输出JSON数据
    """
    try:
        # 使用ensure_ascii=True避免编码问题，然后手动处理中文
        json_str = json.dumps(data, ensure_ascii=True, indent=2, separators=(',', ': '))
        # 确保JSON格式正确
        json.loads(json_str)  # 验证JSON格式
        print(json_str)
        sys.stdout.flush()  # 强制刷新输出缓冲区
    except Exception as e:
        # 如果JSON序列化失败，输出简化的错误信息
        error_data = {
            "success": False,
            "response": None,
            "error": f"JSON序列化错误: {str(e)}"
        }
        print(json.dumps(error_data, ensure_ascii=True, indent=2))
        sys.stdout.flush()

def main():
    parser = argparse.ArgumentParser(description='Gemini Chat Backend')
    parser.add_argument('--mode', choices=['chat', 'analyze'], default='chat', 
                       help='运行模式：chat(聊天) 或 analyze(分析)')
    parser.add_argument('--message', type=str, help='聊天消息')
    parser.add_argument('--input-file', type=str, help='输入JSON文件路径')
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
            # 分析模式
            if args.input_file:
                with open(args.input_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                result = backend.analyze_js(data.get('js_files', ''), data.get('url', ''))
            else:
                result = {"success": False, "error": "分析模式需要提供输入文件"}
        
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