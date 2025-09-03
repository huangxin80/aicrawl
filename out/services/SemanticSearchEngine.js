"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SemanticSearchEngine = void 0;
/**
 * 语义搜索引擎类
 */
class SemanticSearchEngine {
    extensionUri;
    vectorDatabase = new Map();
    embeddings = new Map();
    isInitialized = false;
    config = {
        dimension: 384,
        maxElements: 10000,
        efConstruction: 200,
        M: 16,
        efSearch: 100,
        enableAutoCleanup: true,
        maxRetentionDays: 30
    };
    chunkerConfig = {
        chunkSize: 512,
        overlap: 50,
        separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ']
    };
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    /**
     * 初始化语义搜索引擎
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            // 初始化向量数据库
            await this.initializeVectorDatabase();
            // 自动清理过期数据
            if (this.config.enableAutoCleanup) {
                await this.cleanupExpiredDocuments();
            }
            this.isInitialized = true;
            console.log('Semantic search engine initialized successfully');
        }
        catch (error) {
            console.error('Failed to initialize semantic search engine:', error);
            throw error;
        }
    }
    /**
     * 添加文档到向量数据库
     */
    async addDocument(content, metadata) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        // 生成文档ID
        const docId = this.generateDocumentId(content, metadata);
        // 分块处理文档内容
        const chunks = await this.chunkText(content);
        for (let i = 0; i < chunks.length; i++) {
            const chunkId = `${docId}_chunk_${i}`;
            const chunk = {
                id: chunkId,
                content: chunks[i],
                metadata: {
                    ...metadata,
                    timestamp: metadata.timestamp || Date.now()
                }
            };
            // 生成嵌入向量
            const embedding = await this.generateEmbedding(chunk.content);
            chunk.embedding = embedding;
            // 存储到向量数据库
            this.vectorDatabase.set(chunkId, chunk);
            this.embeddings.set(chunkId, embedding);
        }
        return docId;
    }
    /**
     * 搜索相似文档
     */
    async search(query, options) {
        const startTime = Date.now();
        if (!this.isInitialized) {
            await this.initialize();
        }
        const limit = options?.limit || 10;
        const threshold = options?.threshold || 0.7;
        // 生成查询向量
        const queryEmbedding = await this.generateEmbedding(query);
        // 计算相似度并排序
        const candidates = [];
        for (const [chunkId, chunk] of this.vectorDatabase) {
            // 应用过滤器
            if (!this.passesFilters(chunk, options?.filters)) {
                continue;
            }
            const embedding = this.embeddings.get(chunkId);
            if (!embedding) {
                continue;
            }
            const similarity = this.cosineSimilarity(queryEmbedding, embedding);
            if (similarity >= threshold) {
                chunk.similarityScore = similarity;
                candidates.push(chunk);
            }
        }
        // 按相似度排序
        candidates.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));
        const searchTime = Date.now() - startTime;
        return {
            chunks: candidates.slice(0, limit),
            totalCount: candidates.length,
            searchTime,
            query
        };
    }
    /**
     * 批量搜索多个查询
     */
    async batchSearch(queries, options) {
        const results = [];
        for (const query of queries) {
            const result = await this.search(query, options);
            results.push(result);
        }
        return results;
    }
    /**
     * 获取文档统计信息
     */
    getStatistics() {
        const totalChunks = this.vectorDatabase.size;
        const uniqueDocuments = new Set();
        for (const chunk of this.vectorDatabase.values()) {
            const docId = chunk.id.split('_chunk_')[0];
            uniqueDocuments.add(docId);
        }
        return {
            totalDocuments: uniqueDocuments.size,
            totalChunks,
            memoryUsage: this.estimateMemoryUsage()
        };
    }
    /**
     * 清理过期文档
     */
    async cleanupExpiredDocuments() {
        const cutoffTime = Date.now() - (this.config.maxRetentionDays * 24 * 60 * 60 * 1000);
        let removedCount = 0;
        for (const [chunkId, chunk] of this.vectorDatabase) {
            if (chunk.metadata.timestamp && chunk.metadata.timestamp < cutoffTime) {
                this.vectorDatabase.delete(chunkId);
                this.embeddings.delete(chunkId);
                removedCount++;
            }
        }
        console.log(`Cleaned up ${removedCount} expired document chunks`);
        return removedCount;
    }
    /**
     * 删除特定文档
     */
    async removeDocument(docId) {
        let removedCount = 0;
        for (const [chunkId] of this.vectorDatabase) {
            if (chunkId.startsWith(`${docId}_chunk_`)) {
                this.vectorDatabase.delete(chunkId);
                this.embeddings.delete(chunkId);
                removedCount++;
            }
        }
        return removedCount;
    }
    /**
     * 清空所有数据
     */
    clear() {
        this.vectorDatabase.clear();
        this.embeddings.clear();
    }
    /**
     * 初始化向量数据库
     */
    async initializeVectorDatabase() {
        // 这里可以初始化持久化存储
        // 目前使用内存存储
        console.log('Vector database initialized with config:', this.config);
    }
    /**
     * 文本分块
     */
    async chunkText(text) {
        const chunks = [];
        const { chunkSize, overlap, separators } = this.chunkerConfig;
        // 简单的文本分块实现
        if (text.length <= chunkSize) {
            return [text];
        }
        let start = 0;
        while (start < text.length) {
            let end = start + chunkSize;
            // 尝试在分隔符处分割
            if (end < text.length) {
                for (const separator of separators) {
                    const sepIndex = text.lastIndexOf(separator, end);
                    if (sepIndex > start) {
                        end = sepIndex + separator.length;
                        break;
                    }
                }
            }
            const chunk = text.substring(start, Math.min(end, text.length));
            chunks.push(chunk.trim());
            start = Math.max(start + chunkSize - overlap, end);
        }
        return chunks.filter(chunk => chunk.length > 0);
    }
    /**
     * 生成嵌入向量 (模拟实现)
     * 实际项目中应该使用真实的embedding模型
     */
    async generateEmbedding(text) {
        // 这是一个简化的实现，实际应该使用真实的embedding模型
        // 比如使用@xenova/transformers.js或调用API
        const embedding = new Array(this.config.dimension);
        // 基于文本内容生成简单的向量表示
        const hash = this.simpleHash(text);
        for (let i = 0; i < this.config.dimension; i++) {
            embedding[i] = Math.sin(hash * (i + 1)) * Math.cos(hash * (i + 2));
        }
        // 归一化向量
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        for (let i = 0; i < embedding.length; i++) {
            embedding[i] /= norm;
        }
        return embedding;
    }
    /**
     * 计算余弦相似度
     */
    cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) {
            throw new Error('Vectors must have the same length');
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) {
            return 0;
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    /**
     * 检查是否通过过滤器
     */
    passesFilters(chunk, filters) {
        if (!filters) {
            return true;
        }
        if (filters.type && chunk.metadata.type !== filters.type) {
            return false;
        }
        if (filters.url && chunk.metadata.url !== filters.url) {
            return false;
        }
        if (filters.timeRange && chunk.metadata.timestamp) {
            const timestamp = chunk.metadata.timestamp;
            if (timestamp < filters.timeRange.start || timestamp > filters.timeRange.end) {
                return false;
            }
        }
        return true;
    }
    /**
     * 生成文档ID
     */
    generateDocumentId(content, metadata) {
        const hash = this.simpleHash(content + JSON.stringify(metadata));
        return `doc_${hash}_${Date.now()}`;
    }
    /**
     * 简单哈希函数
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash);
    }
    /**
     * 估算内存使用量
     */
    estimateMemoryUsage() {
        let size = 0;
        for (const chunk of this.vectorDatabase.values()) {
            size += JSON.stringify(chunk).length * 2; // UTF-16编码
        }
        for (const embedding of this.embeddings.values()) {
            size += embedding.length * 8; // 64位浮点数
        }
        return size;
    }
    /**
     * 清理资源
     */
    dispose() {
        this.clear();
        this.isInitialized = false;
    }
}
exports.SemanticSearchEngine = SemanticSearchEngine;
//# sourceMappingURL=SemanticSearchEngine.js.map