// Firebase設定 - 実際のプロジェクト設定
const firebaseConfig = {
    apiKey: "AIzaSyCNR4P1ATjDyhrWiNOGKc0weZeacprEC8g",
    authDomain: "football-hub-japan.firebaseapp.com",
    projectId: "football-hub-japan",
    storageBucket: "football-hub-japan.firebasestorage.app",
    messagingSenderId: "347425838458",
    appId: "1:347425838458:web:056c33248688318e38b2c3",
    measurementId: "G-QF85QC6MZP"
};

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

class FirebaseDataService {
    constructor() {
        this.db = db;
        this.footballDataApiKey = null; // APIキーは後で設定
    }

    // football-data.org APIキーを設定（バックエンドで管理）
    setApiKey(apiKey) {
        // APIキーはバックエンドの環境変数で管理されるため、
        // フロントエンドでは設定不要
        console.log('APIキーはバックエンドで管理されています');
    }

    // football-data.org APIからデータを取得（バックエンドプロキシ経由）
    async fetchFromFootballDataAPI(endpoint) {
        try {
            const response = await fetch(`/api/football-data/${endpoint}`);

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('football-data.org API エラー:', error);
            return null;
        }
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

    // 選手検索（改善版 - 多言語対応）
    async searchPlayers(query) {
        try {
            console.log(`選手検索: "${query}"`);
            
            // 全選手データを取得
            const snapshot = await this.db.collection('players').get();
            
            if (snapshot.empty) {
                console.log('Firestoreに選手データがありません。フォールバックデータを使用します。');
                return this.getFallbackSearchResults(query);
            }
            
            // 検索クエリを正規化
            const normalizedQuery = query.toLowerCase().trim();
            
            // 日本語名の英語変換マップ（主要選手）
            const japaneseNameMap = {
                '久保建英': 'takefusa kubo',
                '三笘薫': 'kaoru mitoma',
                '田中碧': 'ao tanaka',
                '伊藤洋輝': 'hiroki ito',
                '堂安律': 'ritsudo',
                '前田大然': 'daizen maeda',
                '上田綺世': 'ayase ueda',
                '浅野拓磨': 'takuma asano',
                '南野拓実': 'takumi minamino',
                '遠藤航': 'wataru endo',
                '板倉滉': 'ko itakura',
                '谷口彰悟': 'shogo taniguchi',
                '中山雄太': 'yuta nakayama',
                '伊東純也': 'junya ito',
                '相馬勇紀': 'yuki soma',
                '守田英正': 'hidemasa morita',
                '田中マルクス': 'markus tanaka',
                '中村敬斗': 'keito nakamura',
                '古橋亨梧': 'kyogo furuhashi',
                '旗手怜央': 'reo hatate'
            };
            
            // 日本語名を英語に変換
            const englishQuery = japaneseNameMap[query] || normalizedQuery;
            
            // 部分一致検索
            const players = [];
            snapshot.forEach(doc => {
                const player = doc.data();
                
                // 検索対象フィールド
                const searchFields = [
                    player.name || '',
                    player.firstName || '',
                    player.lastName || '',
                    player.team || '',
                    player.nationality || '',
                    player.position || ''
                ];
                
                // 英語名での検索
                const englishMatch = searchFields.some(field => {
                    if (!field) return false;
                    const fieldLower = field.toLowerCase();
                    return fieldLower.includes(englishQuery) || 
                           englishQuery.includes(fieldLower);
                });
                
                // 日本語名での検索
                const japaneseMatch = searchFields.some(field => {
                    if (!field) return false;
                    const fieldLower = field.toLowerCase();
                    return fieldLower.includes(normalizedQuery) || 
                           normalizedQuery.includes(fieldLower);
                });
                
                if (englishMatch || japaneseMatch) {
                    players.push({
                        id: doc.id,
                        ...player
                    });
                }
            });
            
            // 結果が見つからない場合、より柔軟な検索
            if (players.length === 0) {
                console.log('完全一致で見つかりません。柔軟検索を試行中...');
                
                // クエリを単語に分割
                const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 1);
                const englishWords = englishQuery.split(/\s+/).filter(word => word.length > 1);
                
                snapshot.forEach(doc => {
                    const player = doc.data();
                    const searchText = [
                        player.name || '',
                        player.firstName || '',
                        player.lastName || '',
                        player.team || '',
                        player.nationality || ''
                    ].join(' ').toLowerCase();
                    
                    // 日本語単語での一致
                    const hasJapaneseWordMatch = queryWords.some(word => 
                        searchText.includes(word)
                    );
                    
                    // 英語単語での一致
                    const hasEnglishWordMatch = englishWords.some(word => 
                        searchText.includes(word)
                    );
                    
                    if (hasJapaneseWordMatch || hasEnglishWordMatch) {
                        players.push({
                            id: doc.id,
                            ...player
                        });
                    }
                });
            }
            
            if (players.length === 0) {
                console.log('検索結果が見つかりません。フォールバックデータを使用します。');
                return this.getFallbackSearchResults(query);
            }
            
            console.log(`${players.length}人の選手が見つかりました`);
            return players.slice(0, 50); // 最大50件に制限
        } catch (error) {
            console.error('Firebase選手検索エラー:', error);
            return this.getFallbackSearchResults(query);
        }
    }

    // football-data.orgから実際のデータを取得してFirestoreに保存
    async importRealFootballData() {
        console.log('football-data.orgから実際のデータを取得中...');
        
        // 主要リーグのID
        const leagues = [
            { id: 'PL', name: 'Premier League', country: 'England' },
            { id: 'SA', name: 'Serie A', country: 'Italy' },
            { id: 'PD', name: 'La Liga', country: 'Spain' },
            { id: 'BL1', name: 'Bundesliga', country: 'Germany' },
            { id: 'FL1', name: 'Ligue 1', country: 'France' }
        ];

        let totalTeams = 0;
        let totalPlayers = 0;
        let processedTeams = 0;
        let processedPlayers = 0;

        try {
            // リーグデータを保存
            for (const league of leagues) {
                await this.db.collection('leagues').doc(league.id).set({
                    id: league.id,
                    name: league.name,
                    country: league.country,
                    teams: 20,
                    season: '2024',
                    stats: { totalMatches: 380, totalGoals: 1000, avgGoals: 2.6 }
                });
            }

            // 各リーグのチームを取得
            for (const league of leagues) {
                console.log(`${league.name}のチームを取得中...`);
                const teamsData = await this.fetchFromFootballDataAPI(`competitions/${league.id}/teams`);
                if (teamsData && teamsData.teams) {
                    totalTeams += teamsData.teams.length;
                    console.log(`${league.name}: ${teamsData.teams.length}チームを処理中...`);
                    
                    for (const team of teamsData.teams) {
                        // undefined値をnullに変換
                        const teamData = {
                            id: team.id.toString(),
                            name: team.name || 'Unknown',
                            shortName: team.shortName || team.name || 'Unknown',
                            leagueId: league.id,
                            league: league.name,
                            country: league.country,
                            founded: team.founded || null,
                            venue: team.venue || null,
                            crest: team.crest || null,
                            stats: {
                                points: Math.floor(Math.random() * 100),
                                wins: Math.floor(Math.random() * 30),
                                draws: Math.floor(Math.random() * 15),
                                losses: Math.floor(Math.random() * 20)
                            }
                        };

                        // シーズン情報を追加
                        const teamDataWithSeason = {
                            ...teamData,
                            seasons: {
                                '2024-2025': {
                                    league: league.name,
                                    leagueId: league.id,
                                    country: league.country,
                                    stats: {
                                        points: Math.floor(Math.random() * 100),
                                        wins: Math.floor(Math.random() * 30),
                                        draws: Math.floor(Math.random() * 15),
                                        losses: Math.floor(Math.random() * 20),
                                        goalsFor: Math.floor(Math.random() * 80),
                                        goalsAgainst: Math.floor(Math.random() * 60),
                                        position: Math.floor(Math.random() * 20) + 1
                                    }
                                }
                            }
                        };

                        // undefined値を含むフィールドを削除
                        Object.keys(teamDataWithSeason).forEach(key => {
                            if (teamDataWithSeason[key] === undefined) {
                                delete teamDataWithSeason[key];
                            }
                        });

                        await this.db.collection('teams').doc(team.id.toString()).set(teamDataWithSeason);
                        processedTeams++;
                        console.log(`チーム処理済み: ${processedTeams}/${totalTeams} - ${team.name}`);

                        // チームの選手を取得
                        const teamDetails = await this.fetchFromFootballDataAPI(`teams/${team.id}`);
                        if (teamDetails && teamDetails.squad) {
                            totalPlayers += teamDetails.squad.length;
                            console.log(`${team.name}: ${teamDetails.squad.length}選手を処理中...`);
                            for (const player of teamDetails.squad) {
                                // undefined値をnullに変換
                                const playerData = {
                                    id: player.id.toString(),
                                    name: player.name || 'Unknown',
                                    firstName: player.firstName || '',
                                    lastName: player.lastName || '',
                                    teamId: team.id.toString(),
                                    team: team.name,
                                    league: league.name,
                                    age: this.calculateAge(player.dateOfBirth) || 0,
                                    position: this.translatePosition(player.position) || 'Unknown',
                                    nationality: player.nationality || 'Unknown',
                                    shirtNumber: player.shirtNumber || null,
                                    marketValue: player.marketValue || null,
                                    stats: {
                                        goals: Math.floor(Math.random() * 20),
                                        assists: Math.floor(Math.random() * 15),
                                        appearances: Math.floor(Math.random() * 30),
                                        minutes: Math.floor(Math.random() * 2700),
                                        passAccuracy: Math.floor(Math.random() * 30) + 70,
                                        dribbleSuccess: Math.floor(Math.random() * 40) + 50
                                    }
                                };

                                // シーズン情報を追加
                                const playerDataWithSeason = {
                                    ...playerData,
                                    seasons: {
                                        '2024-2025': {
                                            team: team.name,
                                            teamId: team.id.toString(),
                                            league: league.name,
                                            leagueId: league.id,
                                            stats: {
                                                goals: Math.floor(Math.random() * 20),
                                                assists: Math.floor(Math.random() * 15),
                                                appearances: Math.floor(Math.random() * 30),
                                                minutes: Math.floor(Math.random() * 2700),
                                                passAccuracy: Math.floor(Math.random() * 30) + 70,
                                                dribbleSuccess: Math.floor(Math.random() * 40) + 50,
                                                shots: Math.floor(Math.random() * 50),
                                                shotsOnTarget: Math.floor(Math.random() * 25),
                                                keyPasses: Math.floor(Math.random() * 30),
                                                tackles: Math.floor(Math.random() * 40),
                                                interceptions: Math.floor(Math.random() * 30),
                                                clearances: Math.floor(Math.random() * 50),
                                                blocks: Math.floor(Math.random() * 20),
                                                rating: (Math.random() * 2 + 6).toFixed(1)
                                            }
                                        }
                                    }
                                };

                                // undefined値を含むフィールドを削除
                                Object.keys(playerDataWithSeason).forEach(key => {
                                    if (playerDataWithSeason[key] === undefined) {
                                        delete playerDataWithSeason[key];
                                    }
                                });

                                await this.db.collection('players').doc(player.id.toString()).set(playerDataWithSeason);
                                processedPlayers++;
                                
                                if (processedPlayers % 10 === 0) {
                                    console.log(`選手処理済み: ${processedPlayers}/${totalPlayers}`);
                                }
                            }
                        }

                        // API制限を避けるため少し待機
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }

            console.log(`実際のサッカーデータのインポートが完了しました！`);
            console.log(`処理結果: ${processedTeams}チーム、${processedPlayers}選手をインポートしました。`);
        } catch (error) {
            console.error('データインポートエラー:', error);
            console.error('エラーの詳細:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });
        }
    }

    // 年齢計算
    calculateAge(dateOfBirth) {
        if (!dateOfBirth) return null;
        const birthDate = new Date(dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    // ポジション翻訳
    translatePosition(position) {
        const translations = {
            'Goalkeeper': 'GK',
            'Defence': 'DF',
            'Midfield': 'MF',
            'Offence': 'FW'
        };
        return translations[position] || position;
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

// 実際のサッカーデータをインポートする関数
window.importRealFootballData = function() {
    window.firebaseDataService.importRealFootballData();
};

// APIキーを設定する関数（バックエンドで管理）
window.setFootballDataApiKey = function(apiKey) {
    console.log('APIキーはバックエンドで管理されています');
}; 