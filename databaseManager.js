const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'football_data.db');
        this.db = new Database(this.dbPath);
        this.initDatabase();
    }

    // データベースの初期化
    initDatabase() {
        console.log('🗄️ Initializing database...');
        
        // 選手テーブルの作成
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_id TEXT UNIQUE,
                name TEXT NOT NULL,
                english_name TEXT,
                full_name TEXT,
                current_team TEXT,
                position TEXT,
                nationality TEXT,
                age INTEGER,
                photo_url TEXT,
                league TEXT,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 選手統計テーブルの作成
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS player_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER,
                season INTEGER,
                goals INTEGER DEFAULT 0,
                assists INTEGER DEFAULT 0,
                appearances INTEGER DEFAULT 0,
                minutes INTEGER DEFAULT 0,
                rating REAL DEFAULT 0.0,
                yellow_cards INTEGER DEFAULT 0,
                shots_total INTEGER DEFAULT 0,
                shots_on_target INTEGER DEFAULT 0,
                expected_goals REAL DEFAULT 0.0,
                pass_accuracy TEXT DEFAULT '0%',
                tackles INTEGER DEFAULT 0,
                interceptions INTEGER DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player_id) REFERENCES players (id)
            )
        `);

        // チームテーブルの作成
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_id TEXT UNIQUE,
                name TEXT NOT NULL,
                league TEXT,
                country TEXT,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // インデックスの作成
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
            CREATE INDEX IF NOT EXISTS idx_players_team ON players(current_team);
            CREATE INDEX IF NOT EXISTS idx_players_league ON players(league);
            CREATE INDEX IF NOT EXISTS idx_players_last_updated ON players(last_updated);
        `);

        console.log('✅ Database initialized successfully');
    }

    // 選手データの保存
    savePlayer(playerData) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO players 
                (api_id, name, english_name, full_name, current_team, position, nationality, age, photo_url, league, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            const result = stmt.run(
                playerData.api_id || null,
                playerData.name,
                playerData.englishName || playerData.name,
                playerData.fullName || playerData.name,
                playerData.currentTeam,
                playerData.position,
                playerData.nationality,
                playerData.age,
                playerData.photo,
                playerData.league
            );

            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error saving player:', error);
            return null;
        }
    }

    // 選手統計データの保存
    savePlayerStats(playerId, stats, season = 2025) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO player_stats 
                (player_id, season, goals, assists, appearances, minutes, rating, yellow_cards, 
                 shots_total, shots_on_target, expected_goals, pass_accuracy, tackles, interceptions, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            const result = stmt.run(
                playerId,
                season,
                stats.goals || 0,
                stats.assists || 0,
                stats.appearances || 0,
                stats.minutes || 0,
                stats.rating || 0.0,
                stats.yellowCards || 0,
                stats.shotsTotal || 0,
                stats.shotsOnTarget || 0,
                stats.expectedGoals || 0.0,
                stats.passAccuracy || '0%',
                stats.tackles || 0,
                stats.interceptions || 0
            );

            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error saving player stats:', error);
            return null;
        }
    }

    // 選手データの取得（名前で検索）
    getPlayerByName(name) {
        try {
            const stmt = this.db.prepare(`
                SELECT p.*, ps.* FROM players p
                LEFT JOIN player_stats ps ON p.id = ps.player_id AND ps.season = 2025
                WHERE p.name LIKE ? OR p.english_name LIKE ?
                ORDER BY p.last_updated DESC
                LIMIT 1
            `);

            return stmt.get(`%${name}%`, `%${name}%`);
        } catch (error) {
            console.error('Error getting player by name:', error);
            return null;
        }
    }

    // チーム別選手一覧の取得
    getPlayersByTeam(teamName) {
        try {
            const stmt = this.db.prepare(`
                SELECT p.*, ps.* FROM players p
                LEFT JOIN player_stats ps ON p.id = ps.player_id AND ps.season = 2025
                WHERE p.current_team LIKE ?
                ORDER BY p.name
            `);

            return stmt.all(`%${teamName}%`);
        } catch (error) {
            console.error('Error getting players by team:', error);
            return [];
        }
    }

    // リーグ別選手一覧の取得
    getPlayersByLeague(league) {
        try {
            const stmt = this.db.prepare(`
                SELECT p.*, ps.* FROM players p
                LEFT JOIN player_stats ps ON p.id = ps.player_id AND ps.season = 2025
                WHERE p.league = ?
                ORDER BY p.name
            `);

            return stmt.all(league);
        } catch (error) {
            console.error('Error getting players by league:', error);
            return [];
        }
    }

    // 全選手データの取得
    getAllPlayers(limit = 100) {
        try {
            const stmt = this.db.prepare(`
                SELECT p.*, ps.* FROM players p
                LEFT JOIN player_stats ps ON p.id = ps.player_id AND ps.season = 2025
                ORDER BY p.last_updated DESC
                LIMIT ?
            `);

            return stmt.all(limit);
        } catch (error) {
            console.error('Error getting all players:', error);
            return [];
        }
    }

    // 古いデータの削除（30日以上前）
    cleanupOldData() {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM players 
                WHERE last_updated < datetime('now', '-30 days')
            `);

            const result = stmt.run();
            console.log(`🧹 Cleaned up ${result.changes} old player records`);
            return result.changes;
        } catch (error) {
            console.error('Error cleaning up old data:', error);
            return 0;
        }
    }

    // データベースの統計情報
    getDatabaseStats() {
        try {
            const playerCount = this.db.prepare('SELECT COUNT(*) as count FROM players').get();
            const teamCount = this.db.prepare('SELECT COUNT(*) as count FROM teams').get();
            const statsCount = this.db.prepare('SELECT COUNT(*) as count FROM player_stats').get();

            return {
                players: playerCount.count,
                teams: teamCount.count,
                stats: statsCount.count
            };
        } catch (error) {
            console.error('Error getting database stats:', error);
            return { players: 0, teams: 0, stats: 0 };
        }
    }

    // データベースのクローズ
    close() {
        if (this.db) {
            this.db.close();
            console.log('🔒 Database connection closed');
        }
    }
}

module.exports = DatabaseManager; 