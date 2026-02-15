/**
 * Firestore接続のヘルスチェックジョブ
 * 使用方法: node jobs/test-firestore.js
 */

const { getFirestore } = require('../firebaseAdmin');
const admin = require('firebase-admin');

async function testFirestoreConnection() {
    try {
        console.log('🔍 Firestore接続テストを開始...');
        
        // Firebase Admin SDKを初期化
        const db = getFirestore();
        
        // ヘルスチェックドキュメントを作成
        const healthcheckRef = db.collection('metadata').doc('healthcheck');
        
        await healthcheckRef.set({
            ok: true,
            ts: admin.firestore.FieldValue.serverTimestamp(),
            env: process.env.RENDER ? 'render' : 'local',
            nodeEnv: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        });
        
        console.log('✅ Firestore接続成功！ヘルスチェックドキュメントを作成しました。');
        console.log(`   環境: ${process.env.RENDER ? 'Render' : 'ローカル'}`);
        console.log(`   プロジェクトID: ${process.env.FIREBASE_PROJECT_ID || '未設定'}`);
        
        // 読み取りテスト
        const doc = await healthcheckRef.get();
        if (doc.exists) {
            console.log('✅ 読み取りテスト成功！');
            console.log('   データ:', doc.data());
        } else {
            console.warn('⚠️ ドキュメントが存在しません');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Firestore接続テスト失敗:', error);
        console.error('   エラー詳細:', error.message);
        
        if (error.code === 'permission-denied') {
            console.error('   → Firebaseの認証情報を確認してください');
        } else if (error.code === 'unavailable') {
            console.error('   → Firestoreサービスが利用できません');
        } else if (error.message.includes('credentials')) {
            console.error('   → 環境変数 FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY を設定してください');
        }
        
        process.exit(1);
    }
}

// 実行
testFirestoreConnection();
