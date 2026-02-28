/**
 * 包括的なサッカーデータベース管理システム
 * 98チーム分の選手データ、統計、顔写真を管理
 * STORAGE_MODE環境変数で保存先を切り替え可能（file|firestore）
 */

const fs = require('fs').promises;
const path = require('path');

class DatabaseManager {
    constructor() {
        // ストレージモードを環境変数から取得（デフォルト: file）
        this.storageMode = process.env.STORAGE_MODE || 'file';
        
        // ファイルベースのパス設定（fileモード用）
        this.dataPath = path.join(__dirname, 'data');
        this.playersPath = path.join(this.dataPath, 'players.json');
        this.teamsPath = path.join(this.dataPath, 'teams.json');
        this.leaguesPath = path.join(this.dataPath, 'leagues.json');
        this.statsPath = path.join(this.dataPath, 'stats.json');
        this.photosPath = path.join(this.dataPath, 'photos.json');
        this.matchesPath = path.join(this.dataPath, 'matches.json');
        this.schedulesPath = path.join(this.dataPath, 'schedules.json');
        this.lineupsPath = path.join(this.dataPath, 'lineups.json');
        this.standingsPath = path.join(this.dataPath, 'standings.json');
        
        // Firestore用の初期化（firestoreモードの場合）
        if (this.storageMode === 'firestore') {
            try {
                const { getFirestore } = require('./firebaseAdmin');
                this.db = getFirestore();
                console.log(`✅ DatabaseManager: Firestoreモードで初期化 (STORAGE_MODE=${this.storageMode})`);
            } catch (error) {
                console.error('❌ DatabaseManager: Firestore初期化エラー:', error);
                console.error('   エラー詳細:', error.message);
                console.log('⚠️ fileモードにフォールバックします');
                this.storageMode = 'file';
            }
        } else {
            console.log(`✅ DatabaseManager: ファイルモードで初期化 (STORAGE_MODE=${this.storageMode || '未設定'})`);
        }
        
        // 書き込みロック（同時書き込みを防ぐ）
        this.writeLock = false;
        this.writeQueue = [];
        
        // 主要リーグとチームの定義
        this.majorLeagues = {
            'PL': { name: 'Premier League', country: 'England', teams: 20 },
            'PD': { name: 'La Liga', country: 'Spain', teams: 20 },
            'SA': { name: 'Serie A', country: 'Italy', teams: 20 },
            'BL1': { name: 'Bundesliga', country: 'Germany', teams: 18 },
            'FL1': { name: 'Ligue 1', country: 'France', teams: 20 },
            'NL1': { name: 'Eredivisie', country: 'Netherlands', teams: 18 },
            'PPL': { name: 'Primeira Liga', country: 'Portugal', teams: 18 },
            'BSA': { name: 'Brasileirão', country: 'Brazil', teams: 20 },
            'CL': { name: 'UEFA Champions League', country: 'Europe', teams: 32 },
            'EL': { name: 'UEFA Europa League', country: 'Europe', teams: 32 },
            'J1': { name: 'J1 League', country: 'Japan', teams: 20 },
            'K1': { name: 'K League 1', country: 'South Korea', teams: 12 },
            'MLS': { name: 'Major League Soccer', country: 'USA', teams: 29 }
        };
    }

    /**
     * データベースを初期化
     */
    async init() {
        try {
            console.log('📁 包括的データベースディレクトリを初期化中...');
            
            // データディレクトリを作成
            await fs.mkdir(this.dataPath, { recursive: true });
            console.log('📁 包括的データベースディレクトリを初期化しました');
            
            // 初期ファイルを作成
            await this.initializeFiles();
            console.log('📄 初期ファイルの作成完了');
            
            // 既存データの確認
            const players = await this.loadPlayers();
            const teams = await this.loadTeams();
            const leagues = await this.loadLeagues();
            
            console.log(`📊 包括的データベース初期化完了:`);
            console.log(`   - 選手: ${players.length}名`);
            console.log(`   - チーム: ${teams.length}チーム`);
            console.log(`   - リーグ: ${leagues.length}リーグ`);
            
            return true;
            
        } catch (error) {
            console.error('❌ 包括的データベース初期化エラー:', error);
            throw error;
        }
    }

    /**
     * 初期ファイルを作成
     */
    async initializeFiles() {
        const files = [
            { path: this.playersPath, default: [] },
            { path: this.teamsPath, default: [] },
            { path: this.leaguesPath, default: [] },
            { path: this.statsPath, default: { lastUpdate: new Date().toISOString() } },
            { path: this.photosPath, default: {} },
            { path: this.matchesPath, default: [] },
            { path: this.schedulesPath, default: [] },
            { path: this.lineupsPath, default: {} },
            { path: this.standingsPath, default: {} }
        ];

        console.log(`📄 ${files.length}個の初期ファイルを作成中...`);

        for (const file of files) {
            try {
                await fs.access(file.path);
                console.log(`✅ 既存ファイル確認: ${path.basename(file.path)}`);
            } catch {
                await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
                console.log(`📄 初期ファイル作成: ${path.basename(file.path)}`);
            }
        }
        
        console.log('📄 初期ファイルの作成完了');
    }

    /**
     * 試合データを保存
     */
    async saveMatchesData(matches) {
        try {
            await this.ensureDataDirectory();
            
            // 既存の試合データを読み込み
            let existingMatches = [];
            try {
                const existingData = await fs.readFile(this.matchesPath, 'utf8');
                existingMatches = JSON.parse(existingData);
            } catch (error) {
                // ファイルが存在しない場合は空の配列から開始
                console.log('Creating new matches file');
            }
            
            // 新しい試合データを追加（重複を避ける）
            const mergedMatches = [...existingMatches];
            
            for (const newMatch of matches) {
                // IDで重複チェック
                const existingIndex = mergedMatches.findIndex(m => m.id === newMatch.id);
                
                if (existingIndex >= 0) {
                    // 既存データを更新
                    mergedMatches[existingIndex] = { ...mergedMatches[existingIndex], ...newMatch };
                } else {
                    // 新しいデータを追加
                    mergedMatches.push(newMatch);
                }
            }
            
            // マージされたデータを保存
            await fs.writeFile(this.matchesPath, JSON.stringify(mergedMatches, null, 2));
            
            console.log(`💾 試合データを保存: ${matches.length}件（合計: ${mergedMatches.length}件）`);
            return mergedMatches;
            
        } catch (error) {
            console.error('試合データ保存エラー:', error);
            throw error;
        }
    }

    /**
     * 書き込みロックを取得（同時書き込みを防ぐ）
     */
    async acquireWriteLock() {
        return new Promise((resolve) => {
            if (!this.writeLock) {
                this.writeLock = true;
                resolve();
            } else {
                // ロックが取得できるまで待機
                const checkLock = () => {
                    if (!this.writeLock) {
                        this.writeLock = true;
                        resolve();
                    } else {
                        setTimeout(checkLock, 10);
                    }
                };
                checkLock();
            }
        });
    }

    /**
     * 書き込みロックを解放
     */
    releaseWriteLock() {
        this.writeLock = false;
    }

    /**
     * アトミックなファイル書き込み（一時ファイルに書き込んでからリネーム）
     */
    async atomicWriteFile(filePath, data) {
        const tempPath = `${filePath}.tmp`;
        try {
            // 一時ファイルに書き込み
            await fs.writeFile(tempPath, data, 'utf8');
            // アトミックにリネーム（Unix系ではリネームはアトミック操作）
            await fs.rename(tempPath, filePath);
        } catch (error) {
            // エラー時は一時ファイルを削除
            try {
                await fs.unlink(tempPath);
            } catch (unlinkError) {
                // 無視
            }
            throw error;
        }
    }

    /**
     * 包括的な選手データを保存
     * STORAGE_MODEに応じてfileまたはfirestoreに保存
     */
    async saveComprehensivePlayers(players) {
        if (this.storageMode === 'firestore') {
            return this.saveComprehensivePlayersToFirestore(players);
        } else {
            return this.saveComprehensivePlayersToFile(players);
        }
    }

    /**
     * ファイルに選手データを保存（既存の実装）
     */
    async saveComprehensivePlayersToFile(players) {
        // 書き込みロックを取得
        await this.acquireWriteLock();
        
        try {
            // 既存の選手データを読み込み（リトライロジック付き）
            let existingPlayers = [];
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    const data = await fs.readFile(this.playersPath, 'utf8');
                    // JSONパース前にバリデーション
                    if (!data || data.trim().length === 0) {
                        console.log('⚠️ players.jsonが空です。新規作成します。');
                        existingPlayers = [];
                        break;
                    }
                    
                    // JSONパースを試行
                    try {
                        existingPlayers = JSON.parse(data);
                        if (!Array.isArray(existingPlayers)) {
                            console.log('⚠️ players.jsonの形式が不正です。新規作成します。');
                            existingPlayers = [];
                        }
                        break; // 成功したらループを抜ける
                    } catch (parseError) {
                        console.error(`❌ JSONパースエラー (試行 ${retryCount + 1}/${maxRetries}):`, parseError.message);
                        retryCount++;
                        if (retryCount < maxRetries) {
                            // 少し待ってからリトライ
                            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
                            continue;
                        } else {
                            // 最大リトライ回数に達した場合は空配列で続行
                            console.log('⚠️ 最大リトライ回数に達しました。新規作成します。');
                            existingPlayers = [];
                            break;
                        }
                    }
                } catch (readError) {
                    if (readError.code === 'ENOENT') {
                        // ファイルが存在しない場合は新規作成
                        console.log('既存データの読み込みに失敗、新規作成します');
                        existingPlayers = [];
                        break;
                    } else {
                        console.error(`❌ ファイル読み込みエラー (試行 ${retryCount + 1}/${maxRetries}):`, readError.message);
                        retryCount++;
                        if (retryCount < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
                            continue;
                        } else {
                            throw readError;
                        }
                    }
                }
            }

            // 新しい選手データを正規化
            const normalizedPlayers = players.map(player => ({
                id: player.id || `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: player.name,
                fullName: player.fullName || player.name,
                firstName: player.firstName || player.name.split(' ')[0],
                lastName: player.lastName || player.name.split(' ').slice(1).join(' '),
                age: player.age,
                dateOfBirth: player.dateOfBirth,
                nationality: player.nationality,
                height: player.height,
                weight: player.weight,
                position: player.position,
                detailedPosition: player.detailedPosition || player.position,
                currentTeam: player.currentTeam,
                teamId: player.teamId,
                league: player.league,
                leagueId: player.leagueId,
                country: player.country,
                photo: player.photo,
                photoUrl: player.photoUrl,
                shirtNumber: player.shirtNumber,
                preferredFoot: player.preferredFoot,
                marketValue: player.marketValue,
                contractUntil: player.contractUntil,
                joinedDate: player.joinedDate,
                stats: player.stats || {},
                lastUpdated: new Date().toISOString(),
                source: player.source || 'api-football'
            }));

            // 既存データと新しいデータをマージ（重複を避ける）
            const mergedPlayers = [...existingPlayers];
            
            for (const newPlayer of normalizedPlayers) {
                // ID、名前とチームで重複チェック
                const existingIndex = mergedPlayers.findIndex(p => 
                    (p.id === newPlayer.id || p.playerId === newPlayer.id) ||
                    (p.name === newPlayer.name && p.currentTeam === newPlayer.currentTeam)
                );
                
                if (existingIndex >= 0) {
                    // 既存データを更新（statsをマージ）
                    const existingStats = mergedPlayers[existingIndex].stats || [];
                    const newStats = newPlayer.stats || [];
                    const mergedStats = Array.isArray(existingStats) ? [...existingStats] : [];
                    
                    // 新しいstatsをマージ（同じシーズン・リーグの場合は上書き）
                    if (Array.isArray(newStats)) {
                        for (const newStat of newStats) {
                            const statIndex = mergedStats.findIndex(s => 
                                s.season === newStat.season && 
                                (s.leagueName === newStat.leagueName || s.league === newStat.league)
                            );
                            if (statIndex >= 0) {
                                mergedStats[statIndex] = { ...mergedStats[statIndex], ...newStat };
                            } else {
                                mergedStats.push(newStat);
                            }
                        }
                    }
                    
                    mergedPlayers[existingIndex] = { 
                        ...mergedPlayers[existingIndex], 
                        ...newPlayer,
                        stats: mergedStats
                    };
                } else {
                    // 新しいデータを追加
                    mergedPlayers.push(newPlayer);
                }
            }

            // マージされたデータをアトミックに保存
            const jsonData = JSON.stringify(mergedPlayers, null, 2);
            await this.atomicWriteFile(this.playersPath, jsonData);
            
            // 統計を更新
            await this.updateStats({
                totalPlayers: mergedPlayers.length,
                lastUpdate: new Date().toISOString(),
                leagues: [...new Set(mergedPlayers.map(p => p.league).filter(Boolean))],
                teams: [...new Set(mergedPlayers.map(p => p.currentTeam).filter(Boolean))],
                positions: [...new Set(mergedPlayers.map(p => p.position).filter(Boolean))]
            });

            console.log(`💾 包括的選手データを保存: ${normalizedPlayers.length}名（合計: ${mergedPlayers.length}名）`);
            return mergedPlayers;
            
        } catch (error) {
            console.error('包括的選手データ保存エラー:', error);
            throw error;
        } finally {
            // 書き込みロックを解放
            this.releaseWriteLock();
        }
    }

    /**
     * Firestoreに選手データを保存（分割保存）
     * players/{playerId} ドキュメントに set(merge:true) で更新
     */
    async saveComprehensivePlayersToFirestore(players) {
        if (!this.db) {
            throw new Error('Firestore is not initialized');
        }

        const batchSize = 500; // Firestoreのバッチ書き込み制限
        let savedCount = 0;

        try {
            // 選手をバッチで処理
            for (let i = 0; i < players.length; i += batchSize) {
                const batch = this.db.batch();
                const batchPlayers = players.slice(i, i + batchSize);

                for (const player of batchPlayers) {
                    const playerId = player.id || player.playerId;
                    if (!playerId) {
                        console.warn('⚠️ 選手IDがありません。スキップします:', player.name);
                        continue;
                    }

                    // 選手データを正規化
                    const normalizedPlayer = {
                        id: playerId,
                        name: player.name,
                        fullName: player.fullName || player.name,
                        firstName: player.firstName || player.name.split(' ')[0],
                        lastName: player.lastName || player.name.split(' ').slice(1).join(' '),
                        age: player.age,
                        dateOfBirth: player.dateOfBirth,
                        nationality: player.nationality,
                        height: player.height,
                        weight: player.weight,
                        position: player.position,
                        detailedPosition: player.detailedPosition || player.position,
                        currentTeam: player.currentTeam,
                        teamId: player.teamId,
                        league: player.league,
                        leagueId: player.leagueId,
                        country: player.country,
                        photo: player.photo,
                        photoUrl: player.photoUrl,
                        shirtNumber: player.shirtNumber,
                        preferredFoot: player.preferredFoot,
                        marketValue: player.marketValue,
                        contractUntil: player.contractUntil,
                        joinedDate: player.joinedDate,
                        stats: player.stats || [],
                        lastUpdated: new Date().toISOString(),
                        source: player.source || 'api-football'
                    };

                    // players/{playerId} に set(merge:true) で更新
                    const playerRef = this.db.collection('players').doc(String(playerId));
                    batch.set(playerRef, normalizedPlayer, { merge: true });
                }

                // バッチ書き込み実行
                await batch.commit();
                savedCount += batchPlayers.length;
                console.log(`💾 Firestoreに保存: ${savedCount}/${players.length}名`);
            }

            console.log(`✅ Firestoreに選手データを保存完了: ${savedCount}名`);
            return players;

        } catch (error) {
            console.error('❌ Firestoreへの選手データ保存エラー:', error);
            throw error;
        }
    }

    /**
     * 包括的な選手データを読み込み
     * STORAGE_MODEに応じてfileまたはfirestoreから読み込み
     * Firestoreから空配列が返された場合は、ファイルから読み込む（フォールバック）
     */
    async loadComprehensivePlayers(limit = null) {
        if (this.storageMode === 'firestore') {
            const firestorePlayers = await this.loadComprehensivePlayersFromFirestore(limit);
            // Firestoreからデータが取得できなかった場合は、ファイルから読み込む
            if (firestorePlayers.length === 0) {
                console.log('⚠️ Firestoreからデータが取得できませんでした。ファイルから読み込みます。');
                return this.loadComprehensivePlayersFromFile();
            }
            return firestorePlayers;
        } else {
            return this.loadComprehensivePlayersFromFile();
        }
    }

    /**
     * ファイルから選手データを読み込み（既存の実装）
     */
    async loadComprehensivePlayersFromFile() {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                const data = await fs.readFile(this.playersPath, 'utf8');
                
                // JSONパース前にバリデーション
                if (!data || data.trim().length === 0) {
                    console.log('⚠️ players.jsonが空です。空配列を返します。');
                    return [];
                }
                
                // JSONパースを試行
                try {
                    const players = JSON.parse(data);
                    if (!Array.isArray(players)) {
                        console.error('⚠️ players.jsonの形式が不正です（配列ではありません）。空配列を返します。');
                        return [];
                    }
                    console.log(`📊 包括的選手データを読み込み: ${players.length}名`);
                    return players;
                } catch (parseError) {
                    console.error(`❌ JSONパースエラー (試行 ${retryCount + 1}/${maxRetries}):`, parseError.message);
                    retryCount++;
                    if (retryCount < maxRetries) {
                        // 少し待ってからリトライ
                        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
                        continue;
                    } else {
                        // 最大リトライ回数に達した場合は空配列を返す
                        console.error('❌ 最大リトライ回数に達しました。空配列を返します。');
                        return [];
                    }
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // ファイルが存在しない場合は空配列を返す
                    console.log('⚠️ players.jsonが存在しません。空配列を返します。');
                    return [];
                } else {
                    console.error(`❌ ファイル読み込みエラー (試行 ${retryCount + 1}/${maxRetries}):`, error.message);
                    retryCount++;
                    if (retryCount < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
                        continue;
                    } else {
                        console.error('❌ 最大リトライ回数に達しました。空配列を返します。');
                        return [];
                    }
                }
            }
        }
        
        return [];
    }

    /**
     * Firestoreから選手データを読み込み（ページング対応）
     */
    async loadComprehensivePlayersFromFirestore(limit = null) {
        if (!this.db) {
            console.warn('⚠️ Firestore is not initialized. Returning empty array.');
            return [];
        }

        try {
            let players = [];
            let query = this.db.collection('players');

            // ページングで読み込み（全件一括読み込みを避ける）
            let lastDoc = null;
            const pageSize = 1000; // 1ページあたりの最大件数

            do {
                let pageQuery = query.limit(pageSize);
                if (lastDoc) {
                    pageQuery = pageQuery.startAfter(lastDoc);
                }

                const snapshot = await pageQuery.get();
                
                if (snapshot.empty) {
                    break;
                }

                snapshot.forEach(doc => {
                    players.push(doc.data());
                });

                lastDoc = snapshot.docs[snapshot.docs.length - 1];

                // limitが指定されている場合は制限
                if (limit && players.length >= limit) {
                    players = players.slice(0, limit);
                    break;
                }

            } while (lastDoc);

            console.log(`📊 Firestoreから選手データを読み込み: ${players.length}名`);
            return players;

        } catch (error) {
            console.error('❌ Firestoreからの選手データ読み込みエラー:', error);
            return [];
        }
    }

    /**
     * チーム別選手データを取得
     */
    async getPlayersByTeam(teamName) {
        try {
            const players = await this.loadComprehensivePlayers();
            const teamPlayers = players.filter(p => 
                p.currentTeam && p.currentTeam.toLowerCase().includes(teamName.toLowerCase())
            );
            console.log(`🏟️ ${teamName}の選手: ${teamPlayers.length}名`);
            return teamPlayers;
        } catch (error) {
            console.error('チーム別選手取得エラー:', error);
            return [];
        }
    }

    /**
     * リーグ別選手データを取得
     */
    async getPlayersByLeague(leagueName) {
        try {
            const players = await this.loadComprehensivePlayers();
            const leaguePlayers = players.filter(p => 
                p.league && p.league.toLowerCase().includes(leagueName.toLowerCase())
            );
            console.log(`🏆 ${leagueName}の選手: ${leaguePlayers.length}名`);
            return leaguePlayers;
        } catch (error) {
            console.error('リーグ別選手取得エラー:', error);
            return [];
        }
    }

    /**
     * ポジション別選手データを取得
     */
    async getPlayersByPosition(position) {
        try {
            const players = await this.loadComprehensivePlayers();
            const positionPlayers = players.filter(p => 
                p.position && p.position.toLowerCase().includes(position.toLowerCase())
            );
            console.log(`⚽ ${position}の選手: ${positionPlayers.length}名`);
            return positionPlayers;
        } catch (error) {
            console.error('ポジション別選手取得エラー:', error);
            return [];
        }
    }

    /**
     * 選手の詳細統計を保存
     */
    async savePlayerStats(playerId, stats) {
        try {
            const statsData = await this.loadStats();
            if (!statsData.playerStats) statsData.playerStats = {};
            
            statsData.playerStats[playerId] = {
                ...stats,
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(this.statsPath, JSON.stringify(statsData, null, 2));
            console.log(`📊 選手統計を保存: ${playerId}`);
            
        } catch (error) {
            console.error('選手統計保存エラー:', error);
        }
    }

    /**
     * 選手の顔写真URLを保存
     */
    async savePlayerPhoto(playerId, photoUrl) {
        try {
            const photosData = await this.loadPhotos();
            photosData[playerId] = {
                url: photoUrl,
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(this.photosPath, JSON.stringify(photosData, null, 2));
            console.log(`📸 選手写真を保存: ${playerId}`);
            
        } catch (error) {
            console.error('選手写真保存エラー:', error);
        }
    }

    /**
     * 包括的な検索機能
     */
    async comprehensiveSearch(query, filters = {}) {
        try {
            const players = await this.loadComprehensivePlayers();
            let results = players;

            // 名前検索
            if (query) {
                results = results.filter(p => 
                    p.name.toLowerCase().includes(query.toLowerCase()) ||
                    p.fullName.toLowerCase().includes(query.toLowerCase()) ||
                    p.currentTeam.toLowerCase().includes(query.toLowerCase())
                );
            }

            // フィルター適用
            if (filters.league) {
                results = results.filter(p => p.league === filters.league);
            }
            if (filters.team) {
                results = results.filter(p => p.currentTeam === filters.team);
            }
            if (filters.position) {
                results = results.filter(p => p.position === filters.position);
            }
            if (filters.nationality) {
                results = results.filter(p => p.nationality === filters.nationality);
            }

            console.log(`🔍 包括的検索結果: ${results.length}名`);
            return results;
            
        } catch (error) {
            console.error('包括的検索エラー:', error);
            return [];
        }
    }

    /**
     * データベースの最適化
     */
    async optimizeDatabase() {
        try {
            const players = await this.loadComprehensivePlayers();
            
            // 重複除去
            const uniquePlayers = players.filter((player, index, self) =>
                index === self.findIndex(p => p.id === player.id)
            );
            
            // 古いデータの除去
            const recentPlayers = uniquePlayers.filter(player => {
                const lastUpdate = new Date(player.lastUpdated);
                const daysDiff = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
                return daysDiff < 30; // 30日以内のデータのみ保持
            });
            
            if (recentPlayers.length < uniquePlayers.length) {
                await this.saveComprehensivePlayers(recentPlayers);
                console.log(`🧹 データベース最適化完了: ${uniquePlayers.length} → ${recentPlayers.length}名`);
            }
            
            return {
                before: uniquePlayers.length,
                after: recentPlayers.length,
                removed: uniquePlayers.length - recentPlayers.length
            };
            
        } catch (error) {
            console.error('データベース最適化エラー:', error);
            throw error;
        }
    }

    /**
     * データベースのバックアップ
     */
    async backupDatabase() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.dataPath, `backup_${timestamp}`);
            
            await fs.mkdir(backupPath, { recursive: true });
            
            const files = [
                this.playersPath,
                this.teamsPath,
                this.leaguesPath,
                this.statsPath,
                this.photosPath
            ];
            
            for (const file of files) {
                if (await fs.access(file).then(() => true).catch(() => false)) {
                    const fileName = path.basename(file);
                    const backupFile = path.join(backupPath, fileName);
                    await fs.copyFile(file, backupFile);
                }
            }
            
            console.log(`💾 データベースバックアップ完了: ${backupPath}`);
            return backupPath;
            
        } catch (error) {
            console.error('データベースバックアップエラー:', error);
            throw error;
        }
    }

    /**
     * 包括的なデータベース状態を取得
     */
    async getComprehensiveStatus() {
        try {
            const players = await this.loadComprehensivePlayers();
            const teams = await this.loadTeams();
            const leagues = await this.loadLeagues();
            const stats = await this.loadStats();
            const photos = await this.loadPhotos();

            // リーグ別統計
            const leagueStats = {};
            players.forEach(player => {
                if (player.league) {
                    if (!leagueStats[player.league]) {
                        leagueStats[player.league] = { count: 0, teams: new Set() };
                    }
                    leagueStats[player.league].count++;
                    if (player.currentTeam) {
                        leagueStats[player.league].teams.add(player.currentTeam);
                    }
                }
            });

            // チーム別統計
            const teamStats = {};
            players.forEach(player => {
                if (player.currentTeam) {
                    if (!teamStats[player.currentTeam]) {
                        teamStats[player.currentTeam] = { count: 0, positions: new Set() };
                    }
                    teamStats[player.currentTeam].count++;
                    if (player.position) {
                        teamStats[player.currentTeam].positions.add(player.position);
                    }
                }
            });

            return {
                status: 'active',
                totalPlayers: players.length,
                totalTeams: Object.keys(teamStats).length,
                totalLeagues: Object.keys(leagueStats).length,
                totalPhotos: Object.keys(photos).length,
                lastUpdate: stats.lastUpdate || new Date().toISOString(),
                dataPath: this.dataPath,
                leagueBreakdown: Object.entries(leagueStats).map(([league, data]) => ({
                    league,
                    playerCount: data.count,
                    teamCount: data.teams.size
                })),
                teamBreakdown: Object.entries(teamStats).map(([team, data]) => ({
                    team,
                    playerCount: data.count,
                    positions: Array.from(data.positions)
                })),
                fileSizes: {
                    players: await this.getFileSize(this.playersPath),
                    teams: await this.getFileSize(this.teamsPath),
                    leagues: await this.getFileSize(this.leaguesPath),
                    photos: await this.getFileSize(this.photosPath)
                }
            };
            
        } catch (error) {
            console.error('包括的データベース状態取得エラー:', error);
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    // 既存のメソッドも保持
    async loadPlayers() { return this.loadComprehensivePlayers(); }
    async savePlayers(players) { return this.saveComprehensivePlayers(players); }
    
    /**
     * 選手IDで選手データを取得（最適化版）
     * Firestoreモードの場合は直接ドキュメントを取得（全件読み込みを避ける）
     */
    async getPlayerById(playerId) {
        if (this.storageMode === 'firestore') {
            return this.getPlayerByIdFromFirestore(playerId);
        } else {
            const players = await this.loadComprehensivePlayers();
            return players.find(p => 
                p.id === playerId || 
                p.playerId === playerId ||
                String(p.id) === String(playerId) ||
                String(p.playerId) === String(playerId)
            );
        }
    }

    /**
     * Firestoreから選手IDで選手データを取得（1ドキュメントのみ）
     * リトライロジック付き（クォータエラー対策）
     */
    async getPlayerByIdFromFirestore(playerId) {
        if (!this.db) {
            console.warn('⚠️ Firestore is not initialized. Returning null.');
            return null;
        }

        const maxRetries = 3;
        let retryCount = 0;
        const baseDelay = 1000; // 1秒

        while (retryCount < maxRetries) {
            try {
                const playerRef = this.db.collection('players').doc(String(playerId));
                const doc = await playerRef.get();

                if (doc.exists) {
                    return doc.data();
                } else {
                    return null;
                }
            } catch (error) {
                // クォータエラー（8 RESOURCE_EXHAUSTED）の場合
                if (error.code === 8 || error.message.includes('Quota exceeded')) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        const delay = baseDelay * Math.pow(2, retryCount); // 指数バックオフ: 2秒, 4秒, 8秒
                        console.warn(`⚠️ Firestoreクォータエラー (${playerId}), ${delay/1000}秒待機してリトライ ${retryCount}/${maxRetries}...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    } else {
                        console.error(`❌ Firestoreからの選手データ取得エラー (${playerId}): クォータエラー - 最大リトライ回数に達しました`);
                        return null;
                    }
                } else {
                    // その他のエラー
                    console.error(`❌ Firestoreからの選手データ取得エラー (${playerId}):`, error.message);
                    return null;
                }
            }
        }

        return null;
    }
    async searchPlayers(query, filters) { return this.comprehensiveSearch(query, filters); }
    async getDatabaseStatus() { return this.getComprehensiveStatus(); }

    // ヘルパーメソッド
    async loadTeams() {
        try {
            const data = await fs.readFile(this.teamsPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    async loadLeagues() {
        try {
            const data = await fs.readFile(this.leaguesPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    async loadStats() {
        try {
            const data = await fs.readFile(this.statsPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return { lastUpdate: new Date().toISOString() };
        }
    }

    async loadPhotos() {
        try {
            const data = await fs.readFile(this.photosPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    async updateStats(newStats) {
        try {
            const currentStats = await this.loadStats();
            const updatedStats = { ...currentStats, ...newStats };
            await fs.writeFile(this.statsPath, JSON.stringify(updatedStats, null, 2));
        } catch (error) {
            console.error('統計更新エラー:', error);
        }
    }

    async getFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return stats.size;
        } catch {
            return 0;
        }
    }
}

module.exports = DatabaseManager; 