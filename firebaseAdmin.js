/**
 * Firebase Admin SDK 共通初期化モジュール
 * 環境変数から認証情報を取得して初期化
 */

const admin = require('firebase-admin');

let firestore = null;
let initialized = false;

/**
 * Firebase Admin SDKを初期化
 * @returns {admin.firestore.Firestore} Firestoreインスタンス
 */
function initializeFirebaseAdmin() {
    if (initialized && firestore) {
        return firestore;
    }

    try {
        // 既に初期化されている場合は既存のインスタンスを返す
        if (admin.apps.length > 0) {
            firestore = admin.firestore();
            initialized = true;
            console.log('✅ Firebase Admin SDK already initialized');
            return firestore;
        }

        // 環境変数から認証情報を取得
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (!projectId || !clientEmail || !privateKey) {
            throw new Error('Firebase Admin SDK credentials not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables.');
        }

        // サービスアカウントキーファイルがある場合は優先
        const fs = require('fs');
        const path = require('path');
        const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
        
        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('✅ Firebase Admin SDK initialized from service account file');
        } else {
            // 環境変数から初期化
            // PRIVATE_KEYの改行文字を正しく処理
            const processedPrivateKey = privateKey.replace(/\\n/g, '\n');
            
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: projectId,
                    privateKey: processedPrivateKey,
                    clientEmail: clientEmail
                })
            });
            console.log('✅ Firebase Admin SDK initialized from environment variables');
        }

        firestore = admin.firestore();
        initialized = true;
        
        return firestore;
    } catch (error) {
        console.error('❌ Firebase Admin SDK initialization failed:', error);
        throw error;
    }
}

/**
 * Firestoreインスタンスを取得
 * @returns {admin.firestore.Firestore} Firestoreインスタンス
 */
function getFirestore() {
    if (!initialized) {
        return initializeFirebaseAdmin();
    }
    return firestore;
}

/**
 * Firebase Admin SDKが初期化されているか確認
 * @returns {boolean}
 */
function isInitialized() {
    return initialized && admin.apps.length > 0;
}

module.exports = {
    initializeFirebaseAdmin,
    getFirestore,
    isInitialized,
    admin // adminモジュール自体もエクスポート（必要に応じて）
};
