/**
 * 全選手データをFirebaseにインポートするスクリプト
 * 使用方法: node import-players-to-firebase.js
 */

const admin = require('firebase-admin');
const fs = require('fs').promises;
const path = require('path');

// Firebase Admin SDKの初期化
// 環境変数から設定を取得、またはデフォルト設定を使用
if (!admin.apps.length) {
    try {
        // サービスアカウントキーがある場合
        const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
        if (require('fs').existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            // 環境変数から初期化
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID || 'football-hub-japan',
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL
                })
            });
        }
        console.log('✅ Firebase Admin SDK initialized');
    } catch (error) {
        console.error('❌ Firebase Admin SDK initialization failed:', error);
        process.exit(1);
    }
}

const db = admin.firestore();

async function importPlayersToFirebase() {
    try {
        console.log('🔄 選手データのインポートを開始します...');
        
        // players.jsonを読み込み
        const playersFile = path.join(__dirname, 'data', 'players.json');
        console.log(`📂 ファイルを読み込み中: ${playersFile}`);
        
        const fileContent = await fs.readFile(playersFile, 'utf8');
        const data = JSON.parse(fileContent);
        
        // 配列形式またはオブジェクト形式に対応
        const players = Array.isArray(data) ? data : (data.players || []);
        console.log(`📊 ${players.length}名の選手データを読み込みました`);
        
        if (players.length === 0) {
            console.log('⚠️ 選手データが見つかりませんでした');
            return;
        }
        
        // バッチ処理でFirebaseに書き込み（500件ずつ）
        const batchSize = 500;
        let importedCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < players.length; i += batchSize) {
            const batch = db.batch();
            const batchPlayers = players.slice(i, i + batchSize);
            
            console.log(`📤 バッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(players.length / batchSize)} を処理中... (${i + 1}-${Math.min(i + batchSize, players.length)}/${players.length})`);
            
            for (const player of batchPlayers) {
                if (!player || !player.id) {
                    console.warn(`⚠️ 無効な選手データをスキップ:`, player);
                    errorCount++;
                    continue;
                }
                
                // 選手IDを正規化（FirestoreのドキュメントIDとして使用）
                const playerId = player.id.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
                const playerRef = db.collection('players').doc(playerId);
                
                // データを正規化（不要なフィールドを削除、必要なフィールドを追加）
                const playerData = {
                    ...player,
                    id: playerId,
                    importedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastUpdated: player.lastUpdated || new Date().toISOString()
                };
                
                batch.set(playerRef, playerData, { merge: true });
            }
            
            // バッチをコミット
            try {
                await batch.commit();
                importedCount += batchPlayers.length;
                console.log(`✅ ${importedCount}/${players.length}名の選手をインポートしました`);
            } catch (batchError) {
                console.error(`❌ バッチ ${Math.floor(i / batchSize) + 1} のコミットに失敗:`, batchError);
                errorCount += batchPlayers.length;
            }
            
            // レート制限を避けるため、少し待機
            if (i + batchSize < players.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log('\n✅ インポート完了！');
        console.log(`📊 成功: ${importedCount}名`);
        console.log(`❌ エラー: ${errorCount}名`);
        console.log(`📈 合計: ${players.length}名`);
        
        // インポート状態を記録
        await db.collection('metadata').doc('import_status').set({
            lastImport: admin.firestore.FieldValue.serverTimestamp(),
            totalPlayers: importedCount,
            source: 'players.json',
            version: '1.0'
        }, { merge: true });
        
        console.log('✅ メタデータを更新しました');
        
    } catch (error) {
        console.error('❌ インポートエラー:', error);
        throw error;
    }
}

// スクリプトを実行
if (require.main === module) {
    importPlayersToFirebase()
        .then(() => {
            console.log('✅ スクリプトが正常に完了しました');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ スクリプトがエラーで終了しました:', error);
            process.exit(1);
        });
}

module.exports = { importPlayersToFirebase };

