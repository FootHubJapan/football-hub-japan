const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// Gemini APIの初期化（動的にAPIキーを設定）
let genAI = null;
let lastApiCall = 0;
const MIN_API_INTERVAL = 60000; // 60秒間隔（1分間隔）

// レート制限対応のリトライ機能
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 60000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // 連続リクエストの間隔制御
            const now = Date.now();
            const timeSinceLastCall = now - lastApiCall;
            if (timeSinceLastCall < MIN_API_INTERVAL) {
                const waitTime = MIN_API_INTERVAL - timeSinceLastCall;
                console.log(`⏳ API呼び出し間隔制御: ${waitTime}ms待機中...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            const result = await fn();
            lastApiCall = Date.now();
            return result;
        } catch (error) {
            if (error.message && (error.message.includes('429') || error.message.includes('RATE_LIMIT_EXCEEDED')) && attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                console.log(`⏳ レート制限により${delay}ms待機中... (試行 ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}

// API-Football設定
const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

// APIキーを動的に取得する関数
function getApiFootballKey() {
    return process.env.API_FOOTBALL_KEY;
}

// API-Footballにリクエストする関数
async function callApiFootball(endpoint, params = {}) {
    const apiKey = getApiFootballKey();
    
    if (!apiKey) {
        console.log('API_FOOTBALL_KEYが設定されていません');
        console.log('process.env.API_FOOTBALL_KEY:', process.env.API_FOOTBALL_KEY);
        return null;
    }

    try {
        console.log(`🚀 API-Football リクエスト開始: ${endpoint}`);
        
        const response = await axios.get(`${API_FOOTBALL_BASE_URL}${endpoint}`, {
            headers: {
                'x-apisports-key': apiKey
            },
            params: params,
            timeout: 10000
        });
        
        console.log(`✅ API応答成功: ${response.status}`);
        return response.data;
        
    } catch (error) {
        console.error(`❌ API-Football エラー:`, error.response?.data || error.message);
        return null;
    }
}

// チームIDを取得する関数
async function getTeamId(teamName) {
    // 日本語チーム名を英語に変換
    const teamNameMap = {
        'レアル・マドリード': 'Real Madrid',
        'バルセロナ': 'Barcelona',
        'アトレティコ・マドリード': 'Atletico Madrid',
        'マンチェスター・ユナイテッド': 'Manchester United',
        'マンチェスター・シティ': 'Manchester City',
        'リバプール': 'Liverpool',
        'チェルシー': 'Chelsea',
        'アーセナル': 'Arsenal',
        'トッテナム': 'Tottenham',
        'バイエルン・ミュンヘン': 'Bayern Munich',
        'ドルトムント': 'Dortmund',
        'パリ・サンジェルマン': 'Paris Saint-Germain',
        'ユベントス': 'Juventus',
        'ミラン': 'Milan',
        'インテル': 'Inter'
    };

    const englishName = teamNameMap[teamName] || teamName;
    const searchTerms = [
        englishName,
        englishName.toLowerCase(),
        englishName.replace(/ /g, '')
    ];

    for (const searchTerm of searchTerms) {
        console.log(`🔍 チーム検索中: "${searchTerm}"`);
        
        // リーグ指定なしで検索
        const data = await callApiFootball('/teams', {
            search: searchTerm
        });

        console.log(`📊 API応答:`, JSON.stringify(data, null, 2));

        if (data && data.response && data.response.length > 0) {
            console.log(`✅ チーム発見: ${data.response[0].team.name} (ID: ${data.response[0].team.id})`);
            return data.response[0].team.id;
        }
    }
    
    // リーグ別で検索
    const leagues = [140, 39, 61, 78, 135]; // La Liga, Premier League, Ligue 1, Bundesliga, Serie A
    for (const leagueId of leagues) {
        console.log(`🔍 リーグ ${leagueId} で検索中`);
        const data = await callApiFootball('/teams', {
            league: leagueId
        });

        if (data && data.response) {
            const team = data.response.find(t => 
                t.team.name.toLowerCase().includes(englishName.toLowerCase()) ||
                t.team.name.toLowerCase().includes(searchTerms[0].toLowerCase())
            );
            
            if (team) {
                console.log(`✅ チーム発見: ${team.team.name} (ID: ${team.team.id})`);
                return team.team.id;
            }
        }
    }
    
    console.log(`❌ チームが見つかりませんでした: ${teamName}`);
    return null;
}

// 試合日程を取得する関数
async function getTeamFixtures(teamId, next = 5) {
    if (!teamId) return null;

    console.log(`📅 試合日程取得開始: チームID ${teamId}`);
    
    // 複数のシーズンを試す
    const seasons = [2024, 2023, 2025];
    
    for (const season of seasons) {
        console.log(`🔍 シーズン ${season} で試合日程を検索中`);
        
        const data = await callApiFootball('/fixtures', {
            team: teamId,
            next: next,
            season: season
        });

        console.log(`📊 シーズン ${season} のAPI応答:`, JSON.stringify(data, null, 2));

        if (data && data.response && data.response.length > 0) {
            console.log(`✅ シーズン ${season} で試合日程取得成功: ${data.response.length}件`);
            return data.response.map(fixture => ({
                date: fixture.fixture.date,
                home: fixture.teams.home.name,
                away: fixture.teams.away.name,
                league: fixture.league.name,
                round: fixture.league.round,
                venue: fixture.fixture.venue?.name || '未定'
            }));
        }
    }
    
    console.log(`❌ 全シーズンで試合日程取得失敗`);
    return null;
}

// 日本時間に変換する関数
function convertToJST(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short'
    });
}

// サッカー分析用のプロンプトテンプレート
const SOCCER_ANALYSIS_PROMPT = `
あなたは専門的なサッカー分析AIアシスタントです。以下の指示に従って、ユーザーの質問に回答してください：

**役割**: サッカー専門家として、選手分析、試合予測、戦術解説、統計分析を行います。

**回答スタイル**:
- 専門的かつ分かりやすい日本語で回答
- 具体的なデータや統計を可能な限り含める
- 客観的な分析を心がける
- 必要に応じて箇条書きや表形式で整理
- 箇条書きには「*」を使用せず、数字や「-」を使用する
- 時間は日本時間（JST）を基本とする

**専門分野**:
- 選手のパフォーマンス分析
- チーム戦術とフォーメーション
- 試合結果の予測と分析
- 統計データの解説
- 世界のサッカーリーグ情報
- ファンタジーリーグのアドバイス
- 日本サッカー（Jリーグ、日本代表）の分析

**注意事項**:
- 最新の情報に基づいて回答
- 不確実な情報は明確に示す
- ユーザーの質問に直接回答
- 必要に応じて追加の質問を提案
- 時間に関する質問には日本時間で回答する
- 箇条書きには「*」を使用しない

ユーザーの質問: {userMessage}

上記の指示に従って、専門的で分かりやすい回答を提供してください。
`;

// AIチャット機能
async function generateSoccerAnalysis(userMessage) {
    try {
        console.log('AI分析開始:', userMessage);
        
        // 試合日程に関する質問かチェック
        const lowerMessage = userMessage.toLowerCase();
        if (lowerMessage.includes('次の試合') || lowerMessage.includes('試合日程') || lowerMessage.includes('スケジュール')) {
            const teamName = extractTeamName(userMessage);
            if (teamName) {
                const scheduleInfo = await getRealTimeSchedule(teamName);
                if (scheduleInfo) {
                    return scheduleInfo;
                }
            }
        }
        
        // APIキーが設定されているかチェック
        console.log('GEMINI_API_KEY check:', {
            exists: !!process.env.GEMINI_API_KEY,
            length: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
            preview: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'undefined'
        });
        
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === '') {
            console.log('Gemini APIキーが設定されていないため、フォールバック応答を使用');
            return generateFallbackResponse(userMessage);
        }
        
        // レート制限回避のため、現在時刻をチェックしてAPI呼び出しを制限
        const now = Date.now();
        const timeSinceLastCall = now - lastApiCall;
        if (timeSinceLastCall < MIN_API_INTERVAL) {
            console.log(`⏳ レート制限回避: ${MIN_API_INTERVAL - timeSinceLastCall}ms待機後にフォールバック応答を使用`);
            return generateFallbackResponse(userMessage);
        }
        
        // Gemini APIの初期化（動的にAPIキーを設定）
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Gemini 1.5 Flashモデルを使用
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // プロンプトを構築
        const prompt = SOCCER_ANALYSIS_PROMPT.replace('{userMessage}', userMessage);
        
        // レート制限対応のリトライ機能でAI応答を生成
        const result = await retryWithBackoff(async () => {
            return await model.generateContent(prompt);
        });
        
        const response = await result.response;
        const text = response.text();
        
        console.log('AI分析完了');
        return text;
        
    } catch (error) {
        console.error('AI分析エラー:', error);
        console.log('フォールバック応答を使用');
        return generateFallbackResponse(userMessage);
    }
}

// チーム名を抽出する関数
function extractTeamName(message) {
    const teamPatterns = [
        /レアル・マドリード|real madrid|real madrid/i,
        /バルセロナ|barcelona/i,
        /アトレティコ・マドリード|atletico madrid/i,
        /マンチェスター・ユナイテッド|manchester united/i,
        /マンチェスター・シティ|manchester city/i,
        /リバプール|liverpool/i,
        /チェルシー|chelsea/i,
        /アーセナル|arsenal/i,
        /トッテナム|tottenham/i,
        /バイエルン・ミュンヘン|bayern munich/i,
        /ドルトムント|dortmund/i,
        /パリ・サンジェルマン|paris saint-germain|psg/i,
        /ユベントス|juventus/i,
        /ミラン|milan/i,
        /インテル|inter/i
    ];

    for (const pattern of teamPatterns) {
        const match = message.match(pattern);
        if (match) {
            return match[0];
        }
    }
    return null;
}

// リアルタイムの試合日程を取得する関数
async function getRealTimeSchedule(teamName) {
    try {
        console.log(`🔍 試合日程取得開始: ${teamName}`);
        
        const teamId = await getTeamId(teamName);
        if (!teamId) {
            return `申し訳ございませんが、「${teamName}」のチームIDを取得できませんでした。\n\n以下の方法で試合日程を確認することをお勧めします：\n\n1. **${teamName}公式ウェブサイト**\n2. **リーグ公式ウェブサイト**\n3. **スポーツニュースサイト**\n4. **ライブスコアアプリ**`;
        }

        const fixtures = await getTeamFixtures(teamId, 5);
        if (!fixtures || fixtures.length === 0) {
            return `申し訳ございませんが、「${teamName}」の今後の試合日程を取得できませんでした。\n\n以下の方法で試合日程を確認することをお勧めします：\n\n1. **${teamName}公式ウェブサイト**\n2. **リーグ公式ウェブサイト**\n3. **スポーツニュースサイト**\n4. **ライブスコアアプリ**`;
        }

        let scheduleText = `${teamName}の今後の試合日程（日本時間）\n\n`;
        
        fixtures.forEach((fixture, index) => {
            const jstDate = convertToJST(fixture.date);
            scheduleText += `${index + 1}. ${fixture.home} vs ${fixture.away}\n`;
            scheduleText += `📅 ${jstDate}\n`;
            scheduleText += `🏆 ${fixture.league}\n`;
            if (fixture.venue && fixture.venue !== '未定') {
                scheduleText += `🏟️ ${fixture.venue}\n`;
            }
            scheduleText += '\n';
        });

        scheduleText += `注意事項：\n- 試合日程は変更される可能性があります\n- 最新情報は公式ウェブサイトでご確認ください\n- キックオフ時間は日本時間で表示しています`;

        return scheduleText;

    } catch (error) {
        console.error('試合日程取得エラー:', error);
        return `申し訳ございませんが、試合日程の取得中にエラーが発生しました。\n\n以下の方法で試合日程を確認することをお勧めします：\n\n1. **${teamName}公式ウェブサイト**\n2. **リーグ公式ウェブサイト**\n3. **スポーツニュースサイト**\n4. **ライブスコアアプリ**`;
    }
}

// フォールバック応答生成
function generateFallbackResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    
    // 選手比較
    if (lowerMessage.includes('比較') || lowerMessage.includes('vs') || lowerMessage.includes('対')) {
        return `「${userMessage}」について分析いたします。

現在、AI分析サービスが一時的に高負荷のため、詳細な比較ができません。以下の情報をお探しの場合は、データベース機能をご利用ください：

• 選手データベース検索
• 選手統計情報
• チーム別選手一覧
• ポジション別選手データ

AI分析機能は数分後に自動復旧いたします。`;
    }
    
    // 試合予測
    if (lowerMessage.includes('試合') || lowerMessage.includes('予測') || lowerMessage.includes('結果')) {
        return `「${userMessage}」について分析いたします。

現在、AI分析サービスが一時的に高負荷のため、詳細な予測ができません。以下の情報をお探しの場合は、データベース機能をご利用ください：

• 試合スケジュール確認
• 過去の対戦成績
• チーム統計情報
• 選手データベース

AI分析機能は数分後に自動復旧いたします。`;
    }
    
    // 戦術分析
    if (lowerMessage.includes('戦術') || lowerMessage.includes('フォーメーション') || lowerMessage.includes('戦略')) {
        return `「${userMessage}」について分析いたします。

現在、AI分析サービスが一時的に高負荷のため、詳細な戦術分析ができません。以下の情報をお探しの場合は、データベース機能をご利用ください：

• チーム統計情報
• 選手データベース
• 試合結果データ
• リーグ順位表

AI分析機能は数分後に自動復旧いたします。`;
    }
    
    // 統計解説
    if (lowerMessage.includes('統計') || lowerMessage.includes('データ') || lowerMessage.includes('数字')) {
        return `「${userMessage}」について分析いたします。

現在、AI分析サービスが一時的に高負荷のため、詳細な統計分析ができません。以下の情報をお探しの場合は、データベース機能をご利用ください：

• 選手統計データ
• チーム統計情報
• リーグ統計
• 試合データ分析

AI分析機能は数分後に自動復旧いたします。`;
    }
    
    // ファンタジーリーグ
    if (lowerMessage.includes('ファンタジー') || lowerMessage.includes('fantasy')) {
        return `「${userMessage}」について分析いたします。

現在、AI分析サービスが一時的に高負荷のため、詳細なファンタジーアドバイスができません。以下の情報をお探しの場合は、データベース機能をご利用ください：

• 選手統計データ
• チーム統計情報
• 試合スケジュール
• 選手データベース

AI分析機能は数分後に自動復旧いたします。`;
    }
    
    // デフォルト応答
    return `「${userMessage}」について分析いたします。

現在、Gemini APIの無料プランでは1分間にリクエスト制限があるため、詳細な分析ができません。以下の情報をお探しの場合は、Football Data Platformのデータベース機能をご利用ください：

• 選手データベース検索
• 試合スケジュール確認
• チーム統計情報
• リーグ順位表

AI分析機能は1分後に自動復旧いたします。より頻繁な利用をご希望の場合は、Gemini APIの有料プランをご検討ください。`;
}

// 選手比較分析
async function generatePlayerComparison(player1, player2) {
    try {
        // Gemini APIキーを動的に取得
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            console.log('GEMINI_API_KEYが設定されていません');
            return generateFallbackResponse(`選手比較分析: ${player1} vs ${player2}`);
        }

        // Gemini APIを初期化
        genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        // 選手データを取得
        const [player1Data, player2Data] = await Promise.all([
            getPlayerData(player1),
            getPlayerData(player2)
        ]);

        const prompt = `
あなたはサッカー分析の専門家です。以下の2人の選手を詳細に比較分析してください。

選手1: ${player1}
${player1Data ? `データ: ${JSON.stringify(player1Data, null, 2)}` : ''}

選手2: ${player2}
${player2Data ? `データ: ${JSON.stringify(player2Data, null, 2)}` : ''}

以下の観点から詳細な比較分析を行ってください：

1. **技術的な特徴**
   - ドリブル技術
   - パス精度
   - シュート技術
   - フィジカル面

2. **戦術的な役割**
   - ポジションでの役割
   - チームへの貢献度
   - 戦術的適応性

3. **統計データの比較**
   - 得点・アシスト
   - 出場時間・出場試合数
   - パフォーマンス評価

4. **強みと弱み**
   - 各選手の特徴的な強み
   - 改善が必要な点
   - プレースタイルの違い

5. **今後の可能性**
   - 成長の可能性
   - 適しているリーグ・チーム
   - 国際舞台での活躍

分析は日本語で行い、具体的で分かりやすく説明してください。データがある場合は数値も含めて分析してください。
`;

        const result = await retryWithBackoff(async () => {
            return await model.generateContent(prompt);
        });
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('選手比較分析エラー:', error);
        return generateFallbackResponse(`選手比較分析: ${player1} vs ${player2}`);
    }
}

// 選手データを取得する関数
async function getPlayerData(playerName) {
    try {
        // API-Footballから選手データを取得
        const apiFootballKey = process.env.API_FOOTBALL_KEY;
        if (apiFootballKey) {
            const response = await axios.get('https://v3.football.api-sports.io/players', {
                headers: {
                    'x-apisports-key': apiFootballKey
                },
                params: {
                    search: playerName,
                    limit: 1
                }
            });

            if (response.data.response && response.data.response.length > 0) {
                const player = response.data.response[0];
                return {
                    name: player.player.name,
                    age: player.player.age,
                    nationality: player.player.nationality,
                    height: player.player.height,
                    weight: player.player.weight,
                    position: player.statistics?.[0]?.games?.position,
                    team: player.statistics?.[0]?.team?.name,
                    stats: {
                        goals: player.statistics?.[0]?.goals?.total || 0,
                        assists: player.statistics?.[0]?.goals?.assists || 0,
                        appearances: player.statistics?.[0]?.games?.appearences || 0,
                        minutes: player.statistics?.[0]?.games?.minutes || 0,
                        rating: player.statistics?.[0]?.games?.rating || 'N/A',
                        yellowCards: player.statistics?.[0]?.cards?.yellow || 0,
                        redCards: player.statistics?.[0]?.cards?.red || 0
                    }
                };
            }
        }

        // Football-Data.orgからも取得を試行
        const footballDataKey = process.env.FOOTBALL_DATA_KEY;
        if (footballDataKey) {
            // 主要リーグのチームから選手を検索
            const leagues = ['PL', 'PD', 'SA', 'BL1', 'FL1'];
            
            for (const league of leagues) {
                try {
                    const teamsResponse = await axios.get(`https://api.football-data.org/v4/competitions/${league}/teams`, {
                        headers: {
                            'X-Auth-Token': footballDataKey
                        }
                    });

                    for (const team of teamsResponse.data.teams || []) {
                        try {
                            const playersResponse = await axios.get(`https://api.football-data.org/v4/teams/${team.id}/players`, {
                                headers: {
                                    'X-Auth-Token': footballDataKey
                                }
                            });

                            const player = playersResponse.data.players?.find(p => 
                                `${p.firstName} ${p.lastName}`.toLowerCase().includes(playerName.toLowerCase())
                            );

                            if (player) {
                                return {
                                    name: `${player.firstName} ${player.lastName}`,
                                    age: player.dateOfBirth ? calculateAge(player.dateOfBirth) : 'N/A',
                                    nationality: player.nationality,
                                    position: player.position,
                                    team: team.name,
                                    stats: {
                                        goals: 0,
                                        assists: 0,
                                        appearances: 0,
                                        minutes: 0,
                                        rating: 'N/A'
                                    }
                                };
                            }
                        } catch (error) {
                            console.error(`Error fetching players for team ${team.id}:`, error);
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching teams for league ${league}:`, error);
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Player data fetch error:', error);
        return null;
    }
}

// 年齢計算関数
function calculateAge(dateOfBirth) {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

// 試合予測
async function generateMatchPrediction(team1, team2, context = '') {
    const prompt = `
以下の試合の結果を予測してください：

${team1} vs ${team2}

${context ? `背景情報: ${context}` : ''}

以下の観点から分析してください：
1. 両チームの現在の調子
2. 過去の対戦成績
3. 主要選手の状況
4. 戦術的な分析
5. 予想スコアと理由

客観的で根拠のある予測を提供してください。
`;

    return await generateSoccerAnalysis(prompt);
}

// チーム戦術分析
async function generateTacticalAnalysis(team, season = '現在のシーズン') {
    const prompt = `
以下のチームの戦術分析を行ってください：

チーム: ${team}
シーズン: ${season}

以下の観点から分析してください：
1. フォーメーションと戦術スタイル
2. 攻撃パターン
3. 守備システム
4. 主要選手の役割
5. チームの強みと弱み
6. 今後の課題

詳細で専門的な戦術分析を提供してください。
`;

    return await generateSoccerAnalysis(prompt);
}

// 統計解説
async function generateStatsAnalysis(statsData, context = '') {
    const prompt = `
以下の統計データを分析・解説してください：

統計データ: ${statsData}
${context ? `背景: ${context}` : ''}

以下の観点から分析してください：
1. データの意味と重要性
2. 他選手・チームとの比較
3. トレンドと傾向
4. 改善点や課題
5. 今後の展望

統計データを分かりやすく解説し、洞察を提供してください。
`;

    return await generateSoccerAnalysis(prompt);
}

// ファンタジーリーグアドバイス
async function generateFantasyAdvice(question) {
    const prompt = `
ファンタジーリーグに関する質問に回答してください：

質問: ${question}

以下の観点からアドバイスを提供してください：
1. 選手選びの戦略
2. ポジション別の重要度
3. フォームと調子の見方
4. 試合日程の考慮
5. キャプテン選びのコツ
6. チーム構成のバランス

実践的で具体的なアドバイスを提供してください。
`;

    return await generateSoccerAnalysis(prompt);
}

module.exports = {
    generateSoccerAnalysis,
    generatePlayerComparison,
    generateMatchPrediction,
    generateTacticalAnalysis,
    generateStatsAnalysis,
    generateFantasyAdvice
}; 