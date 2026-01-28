#!/bin/bash
LOG_FILE=$(ls -t fix-all-players-api-update-remaining-*.log 2>/dev/null | head -1)
if [ -n "$LOG_FILE" ]; then
    echo "📊 最新の進捗:"
    tail -3 "$LOG_FILE" | grep -E "(進捗|修正完了|更新)" || tail -3 "$LOG_FILE"
    echo ""
    echo "📈 全体の進捗:"
    grep -o "進捗: \[[0-9]*/4276\]" "$LOG_FILE" | tail -1
    echo ""
    echo "✅ 更新された選手数:"
    grep "更新した選手数" "$LOG_FILE" | tail -1 || echo "  まだ完了していません"
fi
