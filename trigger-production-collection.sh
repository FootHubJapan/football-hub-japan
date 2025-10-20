#!/bin/bash

# 本番環境で包括的データ収集を実行するスクリプト

PROD_URL="https://football-hub-japan-ubzb.onrender.com"

echo "========================================="
echo "Football Hub Japan - データ収集実行"
echo "========================================="
echo ""

# ステップ1: 現在のデータベース状態を確認
echo "📊 現在のデータベース状態を確認中..."
echo ""
curl -s "$PROD_URL/api/database/comprehensive-status" | jq '{
  totalPlayers: .totalPlayers,
  totalTeams: .totalTeams,
  totalLeagues: .totalLeagues,
  lastUpdate: .lastUpdate,
  leagueBreakdown: .leagueBreakdown
}'
echo ""

# ステップ2: 包括的データ収集を実行
echo "========================================="
echo "🚀 包括的データ収集を実行中..."
echo "========================================="
echo ""
echo "対象リーグ:"
echo "  - Premier League"
echo "  - La Liga"
echo "  - Serie A ← 優先取得"
echo "  - Bundesliga ← 優先取得"
echo "  - Ligue 1 ← 優先取得"
echo "  - J1 League ← 優先取得"
echo "  - Eredivisie"
echo "  - Primeira Liga"
echo ""
echo "所要時間: 約20-40分"
echo ""
echo "実行中..."
echo ""

# 包括的収集を実行
curl -X POST "$PROD_URL/api/execute-direct-api-collection" \
  -H "Content-Type: application/json" \
  -s | jq '{
  success: .success,
  message: .message,
  playersCollected: .playersCollected,
  timestamp: .timestamp
}'

echo ""
echo "========================================="
echo "✅ データ収集リクエストを送信しました"
echo "========================================="
echo ""
echo "次のステップ:"
echo ""
echo "1. 数分後にデータベース状態を確認:"
echo "   curl -s $PROD_URL/api/database/comprehensive-status | jq '.totalPlayers'"
echo ""
echo "2. データ収集の進捗を監視（Renderダッシュボード）:"
echo "   https://dashboard.render.com/"
echo ""
echo "3. 期待される結果:"
echo "   - Serie A: 400-500名"
echo "   - Ligue 1: 400-500名"
echo "   - Bundesliga: 400-500名"
echo "   - J1 League: 400-500名"
echo "   合計: 2000-3000名"
echo ""
echo "4. 完了確認（20-40分後）:"
echo "   curl -s $PROD_URL/api/database/comprehensive-status | jq"
echo ""

