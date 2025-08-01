// Firebase設定 - 実際のプロジェクト設定
const firebaseConfig = {
    apiKey: "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // 実際のAPIキーに置き換え
    authDomain: "football-hub-japan.firebaseapp.com",
    projectId: "football-hub-japan",
    storageBucket: "football-hub-japan.appspot.com",
    messagingSenderId: "123456789", // 実際のSender IDに置き換え
    appId: "1:123456789:web:abcdef123456" // 実際のApp IDに置き換え
};

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

class FirebaseDataService {
    constructor() {
        this.db = db;
    }

    // リーグ一覧を取得
    async getLeagues() {
        try {
            const snapshot = await this.db.collection('leagues').get();
            if (snapshot.empty) {
                console.log('Firestoreにリーグデータがありません。フォールバックデータを使用します。');
                return this.getFallbackLeagues();
            }
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Firebaseリーグ取得エラー:', error);
            return this.getFallbackLeagues();
        }
    }

    // チーム一覧を取得
    async getTeams(leagueId) {
        try {
            const snapshot = await this.db.collection('teams')
                .where('leagueId', '==', leagueId)
                .get();
            if (snapshot.empty) {
                console.log('Firestoreにチームデータがありません。フォールバックデータを使用します。');
                return this.getFallbackTeams();
            }
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Firebaseチーム取得エラー:', error);
            return this.getFallbackTeams();
        }
    }

    // 選手一覧を取得
    async getPlayers(teamId) {
        try {
            const snapshot = await this.db.collection('players')
                .where('teamId', '==', teamId)
                .get();
            if (snapshot.empty) {
                console.log('Firestoreに選手データがありません。フォールバックデータを使用します。');
                return this.getFallbackPlayers();
            }
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Firebase選手取得エラー:', error);
            return this.getFallbackPlayers();
        }
    }

    // 選手検索
    async searchPlayers(query) {
        try {
            const snapshot = await this.db.collection('players')
                .where('name', '>=', query)
                .where('name', '<=', query + '\uf8ff')
                .limit(20)
                .get();
            if (snapshot.empty) {
                console.log('検索結果が見つかりません。フォールバックデータを使用します。');
                return this.getFallbackSearchResults(query);
            }
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Firebase選手検索エラー:', error);
            return this.getFallbackSearchResults(query);
        }
    }

    // データをFirestoreに追加（開発用）
    async addSampleData() {
        try {
            // リーグデータを追加
            const leaguesRef = this.db.collection('leagues');
            const leagues = this.getFallbackLeagues();
            for (const league of leagues) {
                await leaguesRef.doc(league.id).set(league);
            }

            // チームデータを追加
            const teamsRef = this.db.collection('teams');
            const teams = this.getFallbackTeams();
            for (const team of teams) {
                await teamsRef.doc(team.id).set(team);
            }

            // 選手データを追加
            const playersRef = this.db.collection('players');
            const players = this.getFallbackPlayers();
            for (const player of players) {
                await playersRef.doc(player.id).set(player);
            }

            console.log('サンプルデータがFirestoreに追加されました。');
        } catch (error) {
            console.error('データ追加エラー:', error);
        }
    }

    // フォールバックデータ
    getFallbackLeagues() {
        return [
            {
                id: 'j1',
                name: 'J1リーグ',
                country: '日本',
                teams: 18,
                season: '2024',
                stats: { totalMatches: 306, totalGoals: 856, avgGoals: 2.8 }
            },
            {
                id: 'j2',
                name: 'J2リーグ',
                country: '日本',
                teams: 22,
                season: '2024',
                stats: { totalMatches: 462, totalGoals: 1155, avgGoals: 2.5 }
            },
            {
                id: 'premier',
                name: 'プレミアリーグ',
                country: 'イングランド',
                teams: 20,
                season: '2023/24',
                stats: { totalMatches: 380, totalGoals: 1084, avgGoals: 2.85 }
            }
        ];
    }

    getFallbackTeams() {
        return [
            {
                id: 'urawa',
                name: '浦和レッズ',
                leagueId: 'j1',
                league: 'J1リーグ',
                country: '日本',
                founded: 1950,
                stats: { points: 65, wins: 20, draws: 5, losses: 9 }
            },
            {
                id: 'yokohama',
                name: '横浜F・マリノス',
                leagueId: 'j1',
                league: 'J1リーグ',
                country: '日本',
                founded: 1972,
                stats: { points: 68, wins: 21, draws: 5, losses: 8 }
            },
            {
                id: 'kawasaki',
                name: '川崎フロンターレ',
                leagueId: 'j1',
                league: 'J1リーグ',
                country: '日本',
                founded: 1955,
                stats: { points: 58, wins: 17, draws: 7, losses: 10 }
            }
        ];
    }

    getFallbackPlayers() {
        return [
            {
                id: 'kubo',
                name: '久保建英',
                teamId: 'sociedad',
                team: 'レアル・ソシエダード',
                league: 'ラ・リーガ',
                age: 22,
                position: 'MF/FW',
                nationality: '日本',
                stats: {
                    goals: 8,
                    assists: 12,
                    appearances: 28,
                    minutes: 2240,
                    passAccuracy: 87,
                    dribbleSuccess: 68
                }
            },
            {
                id: 'mitoma',
                name: '三笘薫',
                teamId: 'brighton',
                team: 'ブライトン',
                league: 'プレミアリーグ',
                age: 26,
                position: 'FW',
                nationality: '日本',
                stats: {
                    goals: 10,
                    assists: 8,
                    appearances: 32,
                    minutes: 2560,
                    passAccuracy: 82,
                    dribbleSuccess: 72
                }
            },
            {
                id: 'tanaka',
                name: '田中碧',
                teamId: 'dusseldorf',
                team: 'デュッセルドルフ',
                league: 'ブンデスリーガ2部',
                age: 24,
                position: 'MF',
                nationality: '日本',
                stats: {
                    goals: 5,
                    assists: 15,
                    appearances: 30,
                    minutes: 2400,
                    passAccuracy: 89,
                    dribbleSuccess: 65
                }
            },
            {
                id: 'ito',
                name: '伊藤洋輝',
                teamId: 'stuttgart',
                team: 'シュトゥットガルト',
                league: 'ブンデスリーガ',
                age: 24,
                position: 'DF',
                nationality: '日本',
                stats: {
                    goals: 2,
                    assists: 4,
                    appearances: 25,
                    minutes: 2000,
                    passAccuracy: 85,
                    dribbleSuccess: 58
                }
            },
            {
                id: 'doan',
                name: '堂安律',
                teamId: 'freiburg',
                team: 'フライブルク',
                league: 'ブンデスリーガ',
                age: 25,
                position: 'MF',
                nationality: '日本',
                stats: {
                    goals: 6,
                    assists: 9,
                    appearances: 29,
                    minutes: 2320,
                    passAccuracy: 84,
                    dribbleSuccess: 70
                }
            }
        ];
    }

    getFallbackSearchResults(query) {
        const players = this.getFallbackPlayers();
        return players.filter(player => 
            player.name.toLowerCase().includes(query.toLowerCase()) ||
            player.team.toLowerCase().includes(query.toLowerCase())
        );
    }
}

// グローバルに利用可能にする
window.firebaseDataService = new FirebaseDataService();

// 開発用：サンプルデータをFirestoreに追加する関数
window.addSampleDataToFirestore = function() {
    window.firebaseDataService.addSampleData();
}; 