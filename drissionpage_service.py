#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrissionPage 爬虫服务 - Plan B 后端
提供 HTTP API 接口供 Node.js 调用
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import time
import uuid
from datetime import datetime
import traceback
import threading
import logging

try:
    from DrissionPage import ChromiumPage, ChromiumOptions
    DRISSIONPAGE_AVAILABLE = True
except ImportError:
    DRISSIONPAGE_AVAILABLE = False
    print("警告: DrissionPage 未安装，请运行: pip install DrissionPage")

app = Flask(__name__)
CORS(app)

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DrissionPageCrawler:
    def __init__(self):
        self.sessions = {}  # 存储活跃的浏览器会话
        self.catch_dir = "D:\\crawler\\crawler\\catch"
        self.ensure_catch_directory()
    
    def ensure_catch_directory(self):
        """确保catch目录存在"""
        if not os.path.exists(self.catch_dir):
            os.makedirs(self.catch_dir, exist_ok=True)
            logger.info(f"创建catch目录: {self.catch_dir}")
    
    def create_browser_options(self):
        """创建浏览器配置 - 增强反检测"""
        co = ChromiumOptions()
        
        # 基础设置
        co.headless(False)  # 可见模式，便于调试
        co.no_imgs()       # 不加载图片，提升速度
        co.no_js()         # 可选：禁用JavaScript（根据需要开启）
        co.mute()          # 静音
        
        # 增强反检测参数
        co.set_argument('--disable-blink-features=AutomationControlled')
        co.set_argument('--disable-web-security')
        co.set_argument('--ignore-certificate-errors')
        co.set_argument('--ignore-ssl-errors')
        co.set_argument('--allow-running-insecure-content')
        co.set_argument('--no-sandbox')
        co.set_argument('--disable-dev-shm-usage')
        co.set_argument('--disable-gpu')
        co.set_argument('--disable-extensions')
        co.set_argument('--disable-plugins')
        co.set_argument('--disable-images')  # DrissionPage特有
        
        # 用户代理
        co.set_user_agent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        # 设置窗口大小
        co.set_window_size(1920, 1080)
        
        return co
    
    def create_session(self) -> str:
        """创建新的浏览器会话"""
        if not DRISSIONPAGE_AVAILABLE:
            raise Exception("DrissionPage 未安装")
        
        session_id = str(uuid.uuid4())
        co = self.create_browser_options()
        
        try:
            page = ChromiumPage(addr_or_opts=co)
            self.sessions[session_id] = {
                'page': page,
                'created_at': datetime.now(),
                'last_used': datetime.now()
            }
            logger.info(f"创建浏览器会话: {session_id}")
            return session_id
        except Exception as e:
            logger.error(f"创建浏览器会话失败: {str(e)}")
            raise
    
    def close_session(self, session_id: str):
        """关闭浏览器会话"""
        if session_id in self.sessions:
            try:
                self.sessions[session_id]['page'].quit()
                del self.sessions[session_id]
                logger.info(f"关闭浏览器会话: {session_id}")
            except Exception as e:
                logger.error(f"关闭会话失败: {str(e)}")
    
    def get_page(self, session_id: str):
        """获取页面对象"""
        if session_id not in self.sessions:
            raise Exception(f"会话不存在: {session_id}")
        
        session = self.sessions[session_id]
        session['last_used'] = datetime.now()
        return session['page']
    
    def save_js_file(self, content: str, url: str) -> str:
        """保存JS文件到本地"""
        try:
            from urllib.parse import urlparse
            import os
            
            # 生成安全文件名
            parsed_url = urlparse(url)
            hostname = parsed_url.hostname or 'unknown'
            hostname = hostname.replace('.', '_').replace(':', '_')
            
            timestamp = int(time.time() * 1000)
            filename = f"{hostname}_{timestamp}_drissionpage.js"
            
            filepath = os.path.join(self.catch_dir, filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            
            logger.info(f"保存JS文件: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"保存文件失败: {str(e)}")
            return ""
    
    def enhanced_page_analysis(self, page) -> dict:
        """增强版页面分析"""
        try:
            # 获取页面基本信息
            title = page.title
            url = page.url
            
            # 获取页面内容
            try:
                text_content = page.ele('tag:body').text if page.ele('tag:body', timeout=2) else ""
            except:
                text_content = ""
            
            try:
                html_content = page.html
            except:
                html_content = ""
            
            # 检测JavaScript框架
            js_frameworks = []
            if 'react' in html_content.lower() or page.ele('[data-reactroot]', timeout=1):
                js_frameworks.append('React')
            if 'vue' in html_content.lower() or page.ele('[data-v-]', timeout=1):
                js_frameworks.append('Vue')
            if 'angular' in html_content.lower() or page.ele('[ng-app]', timeout=1):
                js_frameworks.append('Angular')
            
            # 内容分析
            content_score = 0
            if text_content:
                content_score += min(len(text_content) / 100, 50)
            if html_content:
                content_score += min(len(html_content) / 1000, 30)
            
            # 检测加载指示器
            loading_indicators = []
            loading_selectors = ['.loading', '.spinner', '.skeleton', '[class*="loading"]']
            for selector in loading_selectors:
                if page.ele(selector, timeout=1):
                    loading_indicators.append(selector)
            
            return {
                'title': title,
                'url': url,
                'text_length': len(text_content) if text_content else 0,
                'html_length': len(html_content) if html_content else 0,
                'has_content': len(text_content) > 50 if text_content else False,
                'js_frameworks': js_frameworks,
                'is_js_app': len(js_frameworks) > 0,
                'content_score': content_score,
                'loading_indicators': loading_indicators,
                'is_stable': len(loading_indicators) == 0
            }
        except Exception as e:
            logger.error(f"页面分析失败: {str(e)}")
            return {
                'title': '',
                'url': url if 'url' in locals() else '',
                'text_length': 0,
                'html_length': 0,
                'has_content': False,
                'js_frameworks': [],
                'is_js_app': False,
                'content_score': 0,
                'loading_indicators': [],
                'is_stable': False,
                'error': str(e)
            }
    
    def smart_wait(self, page, max_wait_time: int = 15) -> dict:
        """智能等待机制"""
        logger.info("开始DrissionPage智能等待...")
        
        start_time = time.time()
        last_content_length = 0
        stable_count = 0
        
        while (time.time() - start_time) < max_wait_time:
            try:
                # 分析当前页面状态
                analysis = self.enhanced_page_analysis(page)
                current_content_length = analysis['text_length']
                
                # 检查内容稳定性
                if abs(current_content_length - last_content_length) < 50:
                    stable_count += 1
                else:
                    stable_count = 0
                
                last_content_length = current_content_length
                
                # 如果内容稳定且没有加载指示器
                if stable_count >= 3 and analysis['is_stable'] and analysis['has_content']:
                    logger.info("页面内容已稳定")
                    break
                
                # 如果检测到JS框架但内容不足，尝试触发
                if analysis['is_js_app'] and not analysis['has_content']:
                    logger.info("检测到JS应用，尝试触发内容...")
                    self.trigger_js_content(page)
                
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"智能等待过程中出错: {str(e)}")
                break
        
        final_analysis = self.enhanced_page_analysis(page)
        logger.info(f"智能等待完成，最终得分: {final_analysis['content_score']}")
        return final_analysis
    
    def trigger_js_content(self, page):
        """触发JavaScript内容"""
        try:
            # 滚动页面
            page.scroll.to_bottom()
            time.sleep(1)
            page.scroll.to_top()
            time.sleep(1)
            
            # 尝试点击常见的加载按钮
            load_buttons = ['button:contains("加载")', 'button:contains("更多")', '.load-more', '.show-more']
            for selector in load_buttons:
                try:
                    btn = page.ele(selector, timeout=1)
                    if btn:
                        btn.click()
                        time.sleep(2)
                        break
                except:
                    continue
                    
        except Exception as e:
            logger.error(f"触发JS内容失败: {str(e)}")
    
    def capture_files_and_urls(self, session_id: str, target_url: str) -> dict:
        """捕获文件和URL - DrissionPage版本"""
        try:
            page = self.get_page(session_id)
            
            # 导航到目标页面
            logger.info(f"DrissionPage访问: {target_url}")
            page.get(target_url)
            
            # 智能等待
            analysis = self.smart_wait(page)
            
            # 收集JavaScript文件
            js_files = []
            try:
                # DrissionPage获取所有script标签
                scripts = page.eles('tag:script')
                for i, script in enumerate(scripts):
                    src = script.attr('src')
                    if src and (src.endswith('.js') or 'javascript' in src):
                        try:
                            # 获取JS文件内容（需要另外请求）
                            js_response = page.get(src, retry=2, interval=1)
                            if js_response and hasattr(js_response, 'text'):
                                content = js_response.text
                                local_path = self.save_js_file(content, src)
                                
                                js_files.append({
                                    'url': src,
                                    'content': content,
                                    'size': len(content),
                                    'local_path': local_path,
                                    'method': 'GET',
                                    'timestamp': int(time.time() * 1000)
                                })
                        except Exception as e:
                            logger.error(f"获取JS文件失败 {src}: {str(e)}")
            except Exception as e:
                logger.error(f"收集JS文件失败: {str(e)}")
            
            # 收集所有URL（基于页面链接）
            urls = []
            try:
                # 获取所有链接
                links = page.eles('tag:a')
                for link in links:
                    href = link.attr('href')
                    if href:
                        urls.append({
                            'url': href,
                            'method': 'GET',
                            'status': 200,  # DrissionPage无法直接获取状态码
                            'content_type': 'text/html',
                            'url_type': 'other',
                            'is_api': '/api/' in href.lower() or '/v1/' in href.lower(),
                            'timestamp': int(time.time() * 1000)
                        })
            except Exception as e:
                logger.error(f"收集URL失败: {str(e)}")
            
            return {
                'success': True,
                'files': js_files,
                'urls': urls,
                'page_analysis': analysis,
                'routes': [],  # DrissionPage暂不支持SPA路由检测
                'engine': 'DrissionPage'
            }
            
        except Exception as e:
            logger.error(f"DrissionPage捕获失败: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'files': [],
                'urls': [],
                'page_analysis': {},
                'routes': [],
                'engine': 'DrissionPage'
            }

# 创建爬虫实例
crawler = DrissionPageCrawler()

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({
        'status': 'healthy',
        'drissionpage_available': DRISSIONPAGE_AVAILABLE,
        'active_sessions': len(crawler.sessions),
        'timestamp': datetime.now().isoformat()
    })

@app.route('/session/create', methods=['POST'])
def create_session():
    """创建浏览器会话"""
    try:
        session_id = crawler.create_session()
        return jsonify({
            'success': True,
            'session_id': session_id
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/session/<session_id>/close', methods=['POST'])
def close_session(session_id):
    """关闭浏览器会话"""
    try:
        crawler.close_session(session_id)
        return jsonify({
            'success': True
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/crawl', methods=['POST'])
def crawl_website():
    """爬取网站 - 主要API接口"""
    try:
        data = request.get_json()
        target_url = data.get('url')
        
        if not target_url:
            return jsonify({
                'success': False,
                'error': 'URL is required'
            }), 400
        
        # 创建临时会话
        session_id = crawler.create_session()
        
        try:
            # 执行爬取
            result = crawler.capture_files_and_urls(session_id, target_url)
            
            return jsonify(result)
            
        finally:
            # 清理会话
            crawler.close_session(session_id)
            
    except Exception as e:
        logger.error(f"爬取失败: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e),
            'files': [],
            'urls': [],
            'page_analysis': {},
            'routes': [],
            'engine': 'DrissionPage'
        }), 500

@app.route('/test', methods=['POST'])
def test_connection():
    """测试连接和DrissionPage功能"""
    try:
        data = request.get_json()
        test_url = data.get('url', 'https://httpbin.org/html')
        
        if not DRISSIONPAGE_AVAILABLE:
            return jsonify({
                'success': False,
                'error': 'DrissionPage not available'
            })
        
        # 快速测试
        session_id = crawler.create_session()
        
        try:
            page = crawler.get_page(session_id)
            page.get(test_url, timeout=10)
            
            analysis = crawler.enhanced_page_analysis(page)
            
            return jsonify({
                'success': True,
                'message': 'DrissionPage working correctly',
                'test_url': test_url,
                'analysis': analysis
            })
            
        finally:
            crawler.close_session(session_id)
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/sessions', methods=['GET'])
def list_sessions():
    """列出活跃会话"""
    sessions_info = {}
    for sid, session in crawler.sessions.items():
        sessions_info[sid] = {
            'created_at': session['created_at'].isoformat(),
            'last_used': session['last_used'].isoformat()
        }
    
    return jsonify({
        'active_sessions': len(crawler.sessions),
        'sessions': sessions_info
    })

def cleanup_old_sessions():
    """清理超时的会话"""
    while True:
        try:
            current_time = datetime.now()
            timeout_sessions = []
            
            for session_id, session in crawler.sessions.items():
                if (current_time - session['last_used']).seconds > 300:  # 5分钟超时
                    timeout_sessions.append(session_id)
            
            for session_id in timeout_sessions:
                logger.info(f"清理超时会话: {session_id}")
                crawler.close_session(session_id)
                
        except Exception as e:
            logger.error(f"清理会话失败: {str(e)}")
        
        time.sleep(60)  # 每分钟检查一次

# 启动清理线程
cleanup_thread = threading.Thread(target=cleanup_old_sessions, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    print("🚀 DrissionPage 爬虫服务启动中...")
    print(f"📁 文件保存目录: {crawler.catch_dir}")
    print(f"🔧 DrissionPage 可用: {DRISSIONPAGE_AVAILABLE}")
    
    if not DRISSIONPAGE_AVAILABLE:
        print("⚠️  请安装 DrissionPage: pip install DrissionPage")
    
    app.run(host='127.0.0.1', port=5000, debug=False, threaded=True) 