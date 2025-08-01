# Firebase設定ガイド

## 1. Firebaseプロジェクトの設定情報を取得

### プロジェクト設定ページにアクセス
1. [Firebase Console](https://console.firebase.google.com/u/1/project/football-hub-japan/overview?hl=ja) にアクセス
2. プロジェクト「football-hub-japan」を選択
3. 左側の歯車アイコン（⚙️）をクリック
4. 「プロジェクトの設定」を選択

### Webアプリの設定情報を取得
1. 「全般」タブで「マイアプリ」セクションを確認
2. Webアプリが存在しない場合は「Webアプリを追加」をクリック
3. アプリ名を入力（例：「Football Hub Japan Web」）
4. 「アプリを登録」をクリック

### 設定情報をコピー
登録後、以下のような設定情報が表示されます：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "football-hub-japan.firebaseapp.com",
  projectId: "football-hub-japan",
  storageBucket: "football-hub-japan.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

## 2. 設定情報を更新

### public/firebaseData.js を更新
上記で取得した設定情報で `public/firebaseData.js` の `firebaseConfig` を更新してください。

## 3. Firestoreデータベースの設定

### データベースの作成
1. 左側メニューから「Firestore Database」を選択
2. 「データベースを作成」をクリック
3. セキュリティルールを選択：
   - **開発モード**: テスト用（現在の設定）
   - **本番モード**: 本番用（セキュリティルールが必要）

### コレクションの作成
以下のコレクションを作成してください：

#### leagues コレクション
```
id: j1
name: J1リーグ
country: 日本
teams: 18
season: 2024
stats: {
  totalMatches: 306,
  totalGoals: 856,
  avgGoals: 2.8
}
```

#### teams コレクション
```
id: urawa
name: 浦和レッズ
leagueId: j1
league: J1リーグ
country: 日本
founded: 1950
stats: {
  points: 65,
  wins: 20,
  draws: 5,
  losses: 9
}
```

#### players コレクション
```
id: kubo
name: 久保建英
teamId: sociedad
team: レアル・ソシエダード
league: ラ・リーガ
age: 22
position: MF/FW
nationality: 日本
stats: {
  goals: 8,
  assists: 12,
  appearances: 28,
  minutes: 2240,
  passAccuracy: 87,
  dribbleSuccess: 68
}
```

## 4. セキュリティルールの設定

### 開発用（現在の設定）
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 本番用（推奨）
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leagues/{leagueId} {
      allow read: if true;
      allow write: if false;
    }
    match /teams/{teamId} {
      allow read: if true;
      allow write: if false;
    }
    match /players/{playerId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

## 5. データの追加

### ブラウザコンソールから追加
1. サイトにアクセス
2. ブラウザの開発者ツールを開く（F12）
3. コンソールタブで以下を実行：

```javascript
addSampleDataToFirestore();
```

### 手動で追加
Firebase Consoleの「Firestore Database」から手動でデータを追加することも可能です。

## 6. 動作確認

設定完了後、以下を確認してください：

1. **データベースページ**: `/database` でデータが表示される
2. **レーダーチャートページ**: `/radar` で選手比較ができる
3. **検索機能**: 選手名で検索ができる

## トラブルシューティング

### よくある問題
1. **APIキーエラー**: 設定情報が正しくコピーされているか確認
2. **データが表示されない**: Firestoreにデータが存在するか確認
3. **セキュリティエラー**: セキュリティルールを確認

### ログの確認
ブラウザの開発者ツールのコンソールでエラーメッセージを確認してください。 