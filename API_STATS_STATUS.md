# API統計項目の取得状況

## 確認結果

### ✅ 取得できている項目

1. **キーパス** (`keyPasses`)
   - API-Football: `stats.passes?.key`
   - 取得可能: ✅

2. **ファウル獲得** (`foulsDrawn`)
   - API-Football: `stats.fouls?.drawn`
   - 取得可能: ✅

### ❌ 取得できていない項目（APIに存在しない）

3. **ロングパス** (`longPasses`)
   - API-Football: 該当フィールドなし
   - 取得不可: ❌

4. **クロス** (`crosses`)
   - API-Football: 該当フィールドなし
   - 取得不可: ❌

5. **期待値(xG)** (`expectedGoals`)
   - 試合レベル: 取得可能（`normalizedStats.expectedGoals`）
   - 選手レベル: API-Footballの選手統計APIには存在しない
   - 取得不可: ❌

### ⚠️ 取得できているが、別の値で代用されている項目

6. **空中戦** (`aerialDuels`)
   - 現在の実装: `stats.duels?.won`（対戦勝利と同じ値）
   - 問題: API-Footballには空中戦専用のフィールドが存在しない
   - 状態: ⚠️ 対戦勝利の値が表示されている（実際の空中戦ではない）

7. **チャンス創出** (`chancesCreated`)
   - 現在の実装: `stats.passes?.key`（キーパスと同じ値）
   - 問題: API-Footballにはチャンス創出専用のフィールドが存在しない
   - 状態: ⚠️ キーパスの値が表示されている（実際のチャンス創出ではない）

## コード内の実装箇所

- `index.js:8630`: `keyPasses: playerData.statistics?.[0]?.passes?.key || 0`
- `index.js:8629`: `aerialDuels: playerData.statistics?.[0]?.duels?.won || 0` (⚠️ 対戦勝利と同じ)
- `index.js:8631`: `chancesCreated: playerData.statistics?.[0]?.passes?.key || 0` (⚠️ キーパスと同じ)
- `index.js:903`: `foulsDraw: stats.fouls?.drawn || 0`

## 結論

- **取得可能**: キーパス、ファウル獲得
- **取得不可**: ロングパス、クロス、期待値(xG)（選手レベル）
- **誤表示**: 空中戦（対戦勝利の値）、チャンス創出（キーパスの値）


