#!/bin/bash

# Football Hub Japan - Production Deployment Script
# 本番環境デプロイ用スクリプト

set -e

echo "🚀 Football Hub Japan - Production Deployment"
echo "=============================================="

# 環境変数の確認
echo "📋 Environment Check:"
echo "- NODE_ENV: ${NODE_ENV:-development}"
echo "- PORT: ${PORT:-3000}"
echo "- API_FOOTBALL_KEY: ${API_FOOTBALL_KEY:+***SET***}"
echo "- FOOTBALL_DATA_API_KEY: ${FOOTBALL_DATA_API_KEY:+***SET***}"
echo "- GEMINI_API_KEY: ${GEMINI_API_KEY:+***SET***}"

# 依存関係のインストール
echo "📦 Installing dependencies..."
npm ci --only=production

# ビルドプロセス（必要に応じて）
echo "🔨 Building application..."
# npm run build  # 必要に応じてビルドスクリプトを実行

# セキュリティチェック
echo "🔒 Security check..."
npm audit --audit-level=moderate || echo "⚠️  Security vulnerabilities found, but continuing..."

# アプリケーションの起動
echo "🚀 Starting application..."
echo "📍 Health check: http://localhost:${PORT:-3000}/health"
echo "📍 Database: http://localhost:${PORT:-3000}/database"
echo "📍 Radar Chart: http://localhost:${PORT:-3000}/radar"
echo "📍 AI Agent: http://localhost:${PORT:-3000}/ai-agent"

exec npm start 