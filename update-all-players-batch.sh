#!/bin/bash
# 全選手をバッチで更新するスクリプト
BATCH_SIZE=50
TOTAL_BATCHES=10

for i in $(seq 1 $TOTAL_BATCHES); do
    echo "=========================================="
    echo "バッチ $i/$TOTAL_BATCHES を実行中..."
    echo "=========================================="
    node update-all-players-with-career.js $BATCH_SIZE
    echo "バッチ $i 完了。次のバッチまで30秒待機..."
    sleep 30
done
echo "全バッチ完了！"
