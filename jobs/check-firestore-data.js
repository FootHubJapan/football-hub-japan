/**
 * Firestoreに選手データが存在するか確認するスクリプト
 * 使用方法: node jobs/check-firestore-data.js
 */

const { getFirestore } = require('../firebaseAdmin');

async function checkFirestoreData() {
    try {
        console.log('🔍 Firestoreのデータ確認を開始...');
        
        const db = getFirestore();
        
        // playersコレクションの件数を確認
        const playersSnapshot = await db.collection('players').limit(1).get();
        
        if (playersSnapshot.empty) {
            console.log('❌ Firestoreに選手データが存在しません');
            console.log('📝 データをインポートするには、以下のコマンドを実行してください:');
            console.log('   STORAGE_MODE=firestore node import-players-to-firebase.js');
            return false;
        }
        
        // 実際の件数を取得（サンプルで確認）
        const sampleSnapshot = await db.collection('players').limit(10).get();
        console.log(`✅ Firestoreに選手データが存在します（少なくとも${sampleSnapshot.size}件以上）`);
        
        // メタデータを確認
        const metadataRef = db.collection('metadata').doc('import_status');
        const metadataDoc = await metadataRef.get();
        
        if (metadataDoc.exists) {
            const metadata = metadataDoc.data();
            console.log('📊 インポート情報:');
            console.log(`   総選手数: ${metadata.totalPlayers || '不明'}`);
            console.log(`   最終インポート: ${metadata.lastImport ? metadata.lastImport.toDate().toISOString() : '不明'}`);
            console.log(`   ソース: ${metadata.source || '不明'}`);
        } else {
            console.log('⚠️ メタデータが見つかりません');
        }
        
        // 実際の件数を正確に取得（時間がかかる可能性があるため、オプション）
        console.log('\n📈 正確な件数を取得中...（時間がかかる場合があります）');
        const countSnapshot = await db.collection('players').count().get();
        const totalCount = countSnapshot.data().count;
        console.log(`✅ 総選手数: ${totalCount}名`);
        
        return true;
    } catch (error) {
        console.error('❌ Firestoreデータ確認エラー:', error);
        console.error('   エラー詳細:', error.message);
        
        if (error.message.includes('credentials')) {
            console.error('   → 環境変数 FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY を設定してください');
        }
        
        return false;
    }
}

// 実行
if (require.main === module) {
    checkFirestoreData()
        .then((hasData) => {
            process.exit(hasData ? 0 : 1);
        })
        .catch((error) => {
            console.error('❌ スクリプトがエラーで終了しました:', error);
            process.exit(1);
        });
}

module.exports = { checkFirestoreData };
