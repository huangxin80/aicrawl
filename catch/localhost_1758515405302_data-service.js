/**
 * 数据服务 - 通过 JS 动态提供页面数据
 * 需要正确的 user-agent 才能获取完整数据
 */

class DataService {
    constructor() {
        this.pricesData = this.getPricesData();
        this.newsData = this.getNewsData();
        this.suppliersData = this.getSuppliersData();
    }

    // 钢铁价格数据
    getPricesData() {
        return {
            rebar: {
                name: '螺纹钢',
                price: 4280,
                change: '+30',
                changePercent: '+0.7%',
                volume: '15,680吨',
                market: '上海',
                specs: 'HRB400E Φ20mm'
            },
            hotRolled: {
                name: '热轧板卷',
                price: 4150,
                change: '-15',
                changePercent: '-0.4%',
                volume: '12,450吨',
                market: '天津',
                specs: 'Q235B 3.0*1500*C'
            },
            coldRolled: {
                name: '冷轧板卷',
                price: 4680,
                change: '+45',
                changePercent: '+1.0%',
                volume: '8,320吨',
                market: '广州',
                specs: 'DC01 1.0*1250*C'
            },
            mediumPlate: {
                name: '中厚板',
                price: 4320,
                change: '+20',
                changePercent: '+0.5%',
                volume: '9,870吨',
                market: '北京',
                specs: 'Q235B 20*2200*9000'
            },
            wireRod: {
                name: '线材',
                price: 4190,
                change: '+10',
                changePercent: '+0.2%',
                volume: '11,200吨',
                market: '沈阳',
                specs: 'HPB300 Φ8mm'
            },
            angleSteel: {
                name: '角钢',
                price: 4250,
                change: '+25',
                changePercent: '+0.6%',
                volume: '6,550吨',
                market: '武汉',
                specs: 'Q235B 50*50*5'
            }
        };
    }

    // 新闻数据
    getNewsData() {
        return [
            {
                id: 1,
                title: '钢铁行业迎来新一轮涨价潮',
                summary: '受原材料成本上升影响，各大钢厂纷纷上调产品价格...',
                content: '近期，受铁矿石价格持续上涨、焦炭供应紧张等因素影响，国内主要钢铁企业纷纷上调产品价格。业内专家预测，这轮涨价潮可能持续到下个月。',
                date: '2024-03-15',
                category: '市场动态',
                author: '钢铁观察'
            },
            {
                id: 2,
                title: '环保政策推动钢铁行业转型升级',
                summary: '新的环保标准要求钢铁企业加大技术改造投入...',
                content: '生态环境部发布新的钢铁行业超低排放标准，要求企业在2024年底前完成相关改造。这将推动行业向绿色、低碳方向发展。',
                date: '2024-03-14',
                category: '政策解读',
                author: '环保快报'
            },
            {
                id: 3,
                title: '春季建筑旺季带动钢材需求增长',
                summary: '随着气温回暖，建筑工程陆续复工，钢材需求显著提升...',
                content: '进入3月以来，全国各地建筑工程陆续复工，基础设施建设项目加快推进，带动钢材需求大幅增长。预计4-5月需求将达到峰值。',
                date: '2024-03-13',
                category: '需求分析',
                author: '建材周刊'
            },
            {
                id: 4,
                title: '钢铁出口政策调整，影响企业布局',
                summary: '国家调整钢铁产品出口政策，企业需重新规划海外市场策略...',
                content: '商务部宣布调整部分钢铁产品的出口政策，将对企业的海外业务产生重要影响。专家建议企业提前做好应对准备。',
                date: '2024-03-12',
                category: '政策解读',
                author: '贸易观察'
            }
        ];
    }

    // 供应商数据
    getSuppliersData() {
        return [
            {
                id: 1,
                name: '华东钢铁集团',
                location: '上海市',
                products: ['螺纹钢', '热轧板卷', '中厚板'],
                capacity: '年产能500万吨',
                contact: '021-12345678',
                certification: ['ISO9001', 'ISO14001'],
                priceRange: '4200-4500元/吨'
            },
            {
                id: 2,
                name: '北方特钢有限公司',
                location: '天津市',
                products: ['冷轧板卷', '镀锌板', '彩涂板'],
                capacity: '年产能300万吨',
                contact: '022-87654321',
                certification: ['ISO9001', 'TS16949'],
                priceRange: '4600-4900元/吨'
            },
            {
                id: 3,
                name: '南方钢铁实业',
                location: '广州市',
                products: ['线材', '角钢', '槽钢'],
                capacity: '年产能200万吨',
                contact: '020-98765432',
                certification: ['ISO9001', 'CE认证'],
                priceRange: '4100-4400元/吨'
            }
        ];
    }

    // 获取价格数据（带权限控制）
    getPrices() {
        return window.getDataWithAuth(this.pricesData);
    }

    // 获取新闻数据（带权限控制）
    getNews() {
        return window.getDataWithAuth(this.newsData);
    }

    // 获取供应商数据（带权限控制）
    getSuppliers() {
        return window.getDataWithAuth(this.suppliersData);
    }

    // 获取访问提示信息
    getAccessInfo() {
        const authInfo = window.checkCrawlerAuth();
        let message = authInfo.message;
        
        // 根据不同状态显示不同的提示信息
        if (authInfo.statusType === 'blocked_crawler') {
            message += '\n\n💡 如需获取数据，请在爬虫中使用包含以下关键词的 User-Agent：';
        }
        
        return {
            message: message,
            statusType: authInfo.statusType,
            isBrowser: authInfo.isBrowser,
            isCrawler: authInfo.isCrawler,
            isAuthorized: authInfo.isAuthorized,
            allowedUA: authInfo.allowedUA,
            currentAccess: authInfo.accessLevel,
            currentUA: authInfo.currentUA,
            showUAHelp: authInfo.statusType === 'blocked_crawler'
        };
    }
}

// 创建全局数据服务实例
window.dataService = new DataService(); 