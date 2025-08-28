/**
 * 包括的なサッカーデータベース管理システム
 * 98チーム分の選手データ、統計、顔写真を管理
 */

const fs = require('fs').promises;
const path = require('path');

class DatabaseManager {
    constructor() {
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
     * 包括的な選手データを保存
     */
    async saveComprehensivePlayers(players) {
        try {
            // 選手データを正規化
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

            await fs.writeFile(this.playersPath, JSON.stringify(normalizedPlayers, null, 2));
            
            // 統計を更新
            await this.updateStats({
                totalPlayers: normalizedPlayers.length,
                lastUpdate: new Date().toISOString(),
                leagues: [...new Set(normalizedPlayers.map(p => p.league))],
                teams: [...new Set(normalizedPlayers.map(p => p.currentTeam))],
                positions: [...new Set(normalizedPlayers.map(p => p.position))]
            });

            console.log(`💾 包括的選手データを保存: ${normalizedPlayers.length}名`);
            return normalizedPlayers;
            
        } catch (error) {
            console.error('包括的選手データ保存エラー:', error);
            throw error;
        }
    }

    /**
     * 包括的な選手データを読み込み
     */
    async loadComprehensivePlayers() {
        try {
            const data = await fs.readFile(this.playersPath, 'utf8');
            const players = JSON.parse(data);
            console.log(`📊 包括的選手データを読み込み: ${players.length}名`);
            return players;
        } catch (error) {
            console.error('包括的選手データ読み込みエラー:', error);
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
    async getPlayerById(playerId) { 
        const players = await this.loadComprehensivePlayers();
        return players.find(p => p.id === playerId);
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