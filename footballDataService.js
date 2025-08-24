class FootballDataService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.football-data.org/v4';
        this.headers = {
            'X-Auth-Token': apiKey,
            'Content-Type': 'application/json'
        };
    }

    // リーグの選手一覧を取得
    async getLeaguePlayers(competitionId, season = 2024) {
        try {
            const response = await fetch(`${this.baseUrl}/competitions/${competitionId}/teams?season=${season}`, {
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.teams || [];
        } catch (error) {
            console.error('リーグ選手取得エラー:', error);
            return [];
        }
    }

    // チームの詳細選手情報を取得
    async getTeamSquad(teamId) {
        try {
            const response = await fetch(`${this.baseUrl}/teams/${teamId}`, {
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.squad || [];
        } catch (error) {
            console.error('チーム選手取得エラー:', error);
            return [];
        }
    }

    // リーグの試合スケジュールを取得
    async getLeagueFixtures(competitionId, season = 2024) {
        try {
            const response = await fetch(`${this.baseUrl}/competitions/${competitionId}/matches?season=${season}`, {
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.matches || [];
        } catch (error) {
            console.error('リーグ試合取得エラー:', error);
            return [];
        }
    }

    // リーグの順位表を取得
    async getLeagueStandings(competitionId, season = 2024) {
        try {
            const response = await fetch(`${this.baseUrl}/competitions/${competitionId}/standings?season=${season}`, {
                headers: this.headers
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.standings || [];
        } catch (error) {
            console.error('リーグ順位取得エラー:', error);
            return [];
        }
    }

    // 選手検索
    async searchPlayers(searchTerm) {
        try {
            // football-data.orgでは直接的な選手検索がないため、
            // 主要リーグから検索
            const competitions = [2021, 2014, 2002, 2019, 2015]; // 主要5リーグ
            let allPlayers = [];
            
            for (const compId of competitions) {
                const teams = await this.getLeaguePlayers(compId);
                for (const team of teams) {
                    const squad = await this.getTeamSquad(team.id);
                    const filteredPlayers = squad.filter(player => 
                        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        player.nationality.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                    allPlayers.push(...filteredPlayers);
                }
            }
            
            return allPlayers;
        } catch (error) {
            console.error('選手検索エラー:', error);
            return [];
        }
    }

    // 日本人選手を取得
    async getJapanesePlayers() {
        try {
            const competitions = [2021, 2014, 2002, 2019, 2015]; // 主要5リーグ
            let japanesePlayers = [];
            
            for (const compId of competitions) {
                const teams = await this.getLeaguePlayers(compId);
                for (const team of teams) {
                    const squad = await this.getTeamSquad(team.id);
                    const japaneseInTeam = squad.filter(player => 
                        player.nationality === 'Japan' || 
                        player.nationality === 'JPN'
                    );
                    
                    // チーム情報を追加
                    japaneseInTeam.forEach(player => {
                        player.currentTeam = team.name;
                        player.teamId = team.id;
                        player.leagueId = compId;
                        player.photoUrl = team.crest; // チームロゴ
                    });
                    
                    japanesePlayers.push(...japaneseInTeam);
                }
            }
            
            return japanesePlayers;
        } catch (error) {
            console.error('日本人選手取得エラー:', error);
            return [];
        }
    }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FootballDataService;
}
