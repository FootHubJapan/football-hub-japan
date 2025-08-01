// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "football-hub-japan.firebaseapp.com",
    projectId: "football-hub-japan",
    storageBucket: "football-hub-japan.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdefghijklmnop"
};

// Initialize Firebase
if (!firebase.apps.length) {
firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// Firebase Data Service
class FirebaseDataService {
    constructor() {
        this.db = db;
        console.log('FirebaseDataService initialized');
    }

    // Get all leagues
    async getLeagues() {
        try {
            const snapshot = await this.db.collection('leagues').get();
            if (!snapshot.empty) {
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                console.log('No leagues found in Firestore, using fallback data');
                return this.getFallbackLeagues();
            }
        } catch (error) {
            console.error('Error fetching leagues:', error);
            return this.getFallbackLeagues();
        }
    }

    // Get all teams
    async getTeams() {
        try {
            const snapshot = await this.db.collection('teams').get();
            if (!snapshot.empty) {
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                console.log('No teams found in Firestore, using fallback data');
                return this.getFallbackTeams();
            }
        } catch (error) {
            console.error('Error fetching teams:', error);
            return this.getFallbackTeams();
        }
    }

    // Get all players
    async getPlayers() {
        try {
            const snapshot = await this.db.collection('players').get();
            if (!snapshot.empty) {
                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                console.log('No players found in Firestore, using fallback data');
                return this.getFallbackPlayers();
            }
        } catch (error) {
            console.error('Error fetching players:', error);
            return this.getFallbackPlayers();
        }
    }

    // Search players with enhanced functionality
    async searchPlayers(query) {
        try {
            console.log('Player search started: "' + query + '"');
            const searchQuery = query.toLowerCase().trim();
            
            if (!searchQuery) {
                return [];
            }

            const players = await this.getPlayers();
            if (!players || players.length === 0) {
                console.log('No players available for search');
                return this.searchFallbackPlayers(query);
            }

            // Japanese name mapping for better search
            const japaneseNameMap = {
                '久保建英': 'takefusa kubo',
                '三笘薫': 'kaoru mitoma',
                '田中碧': 'ao tanaka',
                '伊藤洋輝': 'hiroki ito',
                '堂安律': 'ritsudo yanagi',
                '南野拓実': 'takumi minamino',
                '古橋亨梧': 'kyogo furuhashi',
                '前田大然': 'daizen maeda',
                '浅野拓磨': 'takuma asano',
                '上田綺世': 'ayase ueda'
            };

            // Check if query is a Japanese name
            let searchTerms = [searchQuery];
            if (japaneseNameMap[query]) {
                searchTerms.push(japaneseNameMap[query]);
            }

            // Helper function to safely convert to string and lowercase
            const safeToString = (value) => {
                if (value === null || value === undefined) return '';
                return String(value).toLowerCase();
            };

            // First pass: exact matches
            let results = players.filter(player => {
                const fullName = safeToString(player.fullName || player.name);
                const firstName = safeToString(player.firstName);
                const lastName = safeToString(player.lastName);
                const team = safeToString(player.currentTeam || player.team);
                const nationality = safeToString(player.nationality);
                const position = safeToString(player.position);

                return searchTerms.some(term => 
                    fullName.includes(term) ||
                    firstName.includes(term) ||
                    lastName.includes(term) ||
                    team.includes(term) ||
                    nationality.includes(term) ||
                    position.includes(term)
                );
            });

            if (results.length > 0) {
                console.log(results.length + ' players found');
                return results;
            }

            // Second pass: word-based search
            console.log('No exact match found. Trying flexible search...');
            const words = searchQuery.split(' ').filter(word => word.length > 1);
            
            results = players.filter(player => {
                const fullName = safeToString(player.fullName || player.name);
                const firstName = safeToString(player.firstName);
                const lastName = safeToString(player.lastName);
                const team = safeToString(player.currentTeam || player.team);
                const nationality = safeToString(player.nationality);
                const position = safeToString(player.position);

                return words.some(word => 
                    fullName.includes(word) ||
                    firstName.includes(word) ||
                    lastName.includes(word) ||
                    team.includes(word) ||
                    nationality.includes(word) ||
                    position.includes(word)
                );
            });

            if (results.length > 0) {
                console.log(results.length + ' players found with flexible search');
                return results;
            }

            console.log('No search results found, using fallback data');
            return this.searchFallbackPlayers(query);

        } catch (error) {
            console.error('Search error:', error);
            return this.searchFallbackPlayers(query);
        }
    }

    // Fallback data methods
    getFallbackLeagues() {
        return [
            { id: 'PL', name: 'Premier League', country: 'England' },
            { id: 'PD', name: 'La Liga', country: 'Spain' },
            { id: 'SA', name: 'Serie A', country: 'Italy' },
            { id: 'BL1', name: 'Bundesliga', country: 'Germany' },
            { id: 'FL1', name: 'Ligue 1', country: 'France' }
        ];
    }

    getFallbackTeams() {
        return [
            { id: '1', name: 'Real Madrid CF', league: 'PD', country: 'Spain' },
            { id: '2', name: 'FC Barcelona', league: 'PD', country: 'Spain' },
            { id: '3', name: 'Manchester City FC', league: 'PL', country: 'England' },
            { id: '4', name: 'Brighton & Hove Albion', league: 'PL', country: 'England' },
            { id: '5', name: 'Girona FC', league: 'PD', country: 'Spain' },
            { id: '6', name: 'Real Sociedad', league: 'PD', country: 'Spain' }
        ];
    }

    getFallbackPlayers() {
        return [
            {
                id: '1',
                fullName: 'Juan Carlos',
                firstName: 'Juan',
                lastName: 'Carlos',
                position: 'Goalkeeper',
                birthday: '1988-01-20',
                nationality: 'Spain',
                currentTeam: 'Girona FC',
                team: 'Girona FC',
                contract: { start: '2019-07', end: '2025-06' },
                marketValue: '5.2',
                preferredFoot: 'Right',
                matches: this.generateMatchHistory('Girona FC'),
                seasons: {
                    '2024-2025': {
                        team: 'Girona FC',
                        teamId: '5',
                        league: 'La Liga',
                        leagueId: 'PD',
                        matchesPlayed: 25,
                stats: {
                            goals: 0,
                            assists: 0,
                            appearances: 25,
                            minutes: 2250,
                            passAccuracy: 85,
                            dribbleSuccess: 0,
                            shots: 0,
                            shotsOnTarget: 0,
                            keyPasses: 0,
                            tackles: 0,
                            interceptions: 0,
                            clearances: 0,
                            blocks: 0,
                            rating: 7.2,
                            yellowCards: 2,
                            redCards: 0
                        }
                    }
                }
            },
            {
                id: '2',
                fullName: 'Takefusa Kubo',
                firstName: 'Takefusa',
                lastName: 'Kubo',
                position: 'Right Winger',
                birthday: '2001-06-04',
                nationality: 'Japan',
                currentTeam: 'Real Sociedad',
                team: 'Real Sociedad',
                contract: { start: '2022-07', end: '2027-06' },
                marketValue: '25.0',
                preferredFoot: 'Left',
                matches: this.generateMatchHistory('Real Sociedad'),
                seasons: {
                    '2024-2025': {
                        team: 'Real Sociedad',
                        teamId: '6',
                        league: 'La Liga',
                        leagueId: 'PD',
                        matchesPlayed: 28,
                stats: {
                            goals: 8,
                            assists: 12,
                            appearances: 28,
                            minutes: 2520,
                    passAccuracy: 82,
                            dribbleSuccess: 68,
                            shots: 45,
                            shotsOnTarget: 18,
                            keyPasses: 35,
                            tackles: 12,
                            interceptions: 8,
                            clearances: 2,
                            blocks: 1,
                            rating: 7.5,
                            yellowCards: 4,
                            redCards: 0
                        }
                    }
                }
            },
            {
                id: '3',
                fullName: 'Kaoru Mitoma',
                firstName: 'Kaoru',
                lastName: 'Mitoma',
                position: 'Left Winger',
                birthday: '1997-05-20',
                nationality: 'Japan',
                currentTeam: 'Brighton & Hove Albion',
                team: 'Brighton & Hove Albion',
                contract: { start: '2022-08', end: '2027-06' },
                marketValue: '30.0',
                preferredFoot: 'Right',
                matches: this.generateMatchHistory('Brighton & Hove Albion'),
                seasons: {
                    '2024-2025': {
                        team: 'Brighton & Hove Albion',
                        teamId: '4',
                        league: 'Premier League',
                        leagueId: 'PL',
                        matchesPlayed: 26,
                stats: {
                            goals: 6,
                            assists: 8,
                            appearances: 26,
                            minutes: 2340,
                            passAccuracy: 78,
                            dribbleSuccess: 72,
                            shots: 38,
                            shotsOnTarget: 15,
                            keyPasses: 42,
                            tackles: 18,
                            interceptions: 12,
                            clearances: 3,
                            blocks: 2,
                            rating: 7.3,
                            yellowCards: 3,
                            redCards: 0
                        }
                    }
                }
            },
            {
                id: '4',
                fullName: 'Erling Haaland',
                firstName: 'Erling',
                lastName: 'Haaland',
                position: 'Centre-Forward',
                birthday: '2000-07-21',
                nationality: 'Norway',
                currentTeam: 'Manchester City FC',
                team: 'Manchester City FC',
                contract: { start: '2022-07', end: '2027-06' },
                marketValue: '180.0',
                preferredFoot: 'Left',
                matches: this.generateMatchHistory('Manchester City FC'),
                seasons: {
                    '2024-2025': {
                        team: 'Manchester City FC',
                        teamId: '3',
                        league: 'Premier League',
                        leagueId: 'PL',
                        matchesPlayed: 30,
                stats: {
                            goals: 18,
                            assists: 5,
                            appearances: 30,
                            minutes: 2700,
                            passAccuracy: 75,
                            dribbleSuccess: 45,
                            shots: 89,
                            shotsOnTarget: 42,
                            keyPasses: 28,
                            tackles: 8,
                            interceptions: 5,
                            clearances: 12,
                            blocks: 3,
                            rating: 7.8,
                            yellowCards: 2,
                            redCards: 0
                        }
                    }
                }
            }
        ];
    }

    searchFallbackPlayers(query) {
        const players = this.getFallbackPlayers();
        const searchQuery = query.toLowerCase().trim();
        
        // Helper function to safely convert to string and lowercase
        const safeToString = (value) => {
            if (value === null || value === undefined) return '';
            return String(value).toLowerCase();
        };
        
        return players.filter(player => {
            const fullName = safeToString(player.fullName);
            const firstName = safeToString(player.firstName);
            const lastName = safeToString(player.lastName);
            const team = safeToString(player.currentTeam);
            const nationality = safeToString(player.nationality);
            const position = safeToString(player.position);

            return fullName.includes(searchQuery) ||
                   firstName.includes(searchQuery) ||
                   lastName.includes(searchQuery) ||
                   team.includes(searchQuery) ||
                   nationality.includes(searchQuery) ||
                   position.includes(searchQuery);
        });
    }

    // Generate realistic match history
    generateMatchHistory(teamName) {
        const matches = [];
        const opponents = {
            'Girona FC': ['Real Madrid CF', 'FC Barcelona', 'Atletico Madrid', 'Sevilla FC', 'Valencia CF', 'Athletic Club', 'Real Betis', 'Villarreal CF', 'Real Sociedad', 'Getafe CF'],
            'Real Sociedad': ['Real Madrid CF', 'FC Barcelona', 'Atletico Madrid', 'Sevilla FC', 'Valencia CF', 'Athletic Club', 'Real Betis', 'Villarreal CF', 'Girona FC', 'Getafe CF'],
            'Brighton & Hove Albion': ['Manchester City FC', 'Arsenal FC', 'Liverpool FC', 'Manchester United FC', 'Chelsea FC', 'Tottenham Hotspur FC', 'Newcastle United FC', 'Aston Villa FC', 'West Ham United FC', 'Crystal Palace FC'],
            'Manchester City FC': ['Arsenal FC', 'Liverpool FC', 'Manchester United FC', 'Chelsea FC', 'Tottenham Hotspur FC', 'Newcastle United FC', 'Aston Villa FC', 'West Ham United FC', 'Brighton & Hove Albion', 'Crystal Palace FC']
        };

        const teamOpponents = opponents[teamName] || ['Team A', 'Team B', 'Team C', 'Team D', 'Team E'];
        
        for (let i = 0; i < 15; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (i * 7));
            
            const isHome = Math.random() > 0.5;
            const opponent = teamOpponents[Math.floor(Math.random() * teamOpponents.length)];
            const homeGoals = Math.floor(Math.random() * 4);
            const awayGoals = Math.floor(Math.random() * 4);
            
            matches.push({
                date: date.toISOString().split('T')[0],
                time: '14:00',
                homeTeam: isHome ? teamName : opponent,
                awayTeam: isHome ? opponent : teamName,
                score: `${isHome ? homeGoals : awayGoals}:${isHome ? awayGoals : homeGoals}`,
                odds: `${(Math.random() * 2 + 1).toFixed(2)} / ${(Math.random() * 2 + 2).toFixed(2)} / ${(Math.random() * 2 + 2).toFixed(2)}`,
                result: homeGoals > awayGoals ? 'W' : homeGoals < awayGoals ? 'L' : 'D'
            });
        }
        
        return matches.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // Import real data from football-data.org API
    async importRealFootballData() {
        try {
            console.log('Starting import of real football data...');
            
            const leagues = ['PL', 'PD', 'SA', 'BL1', 'FL1'];
            let totalTeams = 0;
            let totalPlayers = 0;

            for (const league of leagues) {
                console.log(`Importing ${league} teams...`);
                
                try {
                    const response = await fetch(`/api/football-data/competitions/${league}/teams`);
                    if (!response.ok) {
                        console.log(`Failed to fetch ${league} teams, skipping...`);
                        continue;
                    }
                    
                    const data = await response.json();
                    const teams = data.teams || [];
                    
                    console.log(`${league}: ${teams.length} teams to process...`);
                    
                    for (let i = 0; i < teams.length; i++) {
                        const team = teams[i];
                        console.log(`Processing team ${i + 1}/${teams.length}: ${team.name}`);
                        
                        // Save team data
                        const teamData = {
                            id: team.id.toString(),
                            name: team.name || 'Unknown',
                            shortName: team.shortName || team.name || 'Unknown',
                            tla: team.tla || 'Unknown',
                            founded: team.founded || null,
                            venue: team.venue || null,
                            crest: team.crest || null,
                            website: team.website || null,
                            league: league,
                            seasons: {
                                '2024-2025': {
                                    league: league,
                                    leagueId: league,
                                    matchesPlayed: Math.floor(Math.random() * 20) + 10,
                                    stats: {
                                        wins: Math.floor(Math.random() * 15),
                                        draws: Math.floor(Math.random() * 10),
                                        losses: Math.floor(Math.random() * 10),
                                        goalsFor: Math.floor(Math.random() * 50) + 20,
                                        goalsAgainst: Math.floor(Math.random() * 40) + 15,
                                        points: Math.floor(Math.random() * 60) + 30
                                    }
                                }
                            }
                        };

                        // Remove undefined values
                        Object.keys(teamData).forEach(key => {
                            if (teamData[key] === undefined) {
                                delete teamData[key];
                            }
                        });

                        await this.db.collection('teams').doc(team.id.toString()).set(teamData);
                        totalTeams++;

                        // Get players for this team
                        try {
                            const playerResponse = await fetch(`/api/football-data/teams/${team.id}`);
                            if (playerResponse.ok) {
                                const playerData = await playerResponse.json();
                                const players = playerData.squad || [];
                                
                                console.log(`${team.name}: ${players.length} players to process...`);
                                
                                for (let j = 0; j < players.length; j++) {
                                    const player = players[j];
                                    
                                    if (j % 10 === 0) {
                                        console.log(`Player ${j + 1}/${players.length} processed`);
                                    }
                                    
                                    const playerDataWithSeason = {
                                        id: player.id.toString(),
                                        name: player.name || 'Unknown',
                                        firstName: player.firstName || 'Unknown',
                                        lastName: player.lastName || 'Unknown',
                                        fullName: player.name,
                                        position: this.translatePosition(player.position) || 'Unknown',
                                        birthday: player.dateOfBirth || null,
                                        nationality: player.nationality || 'Unknown',
                                        currentTeam: team.name,
                                        team: team.name,
                                        teamId: team.id.toString(),
                                        contract: {
                                            start: '2024-07-01',
                                            end: '2025-06-30'
                                        },
                                        marketValue: player.marketValue || null,
                                        preferredFoot: Math.random() > 0.5 ? 'Right' : 'Left',
                                        matches: this.generateMatchHistory(team.name),
                                        seasons: {
                                            '2024-2025': {
                                                team: team.name,
                                                teamId: team.id.toString(),
                                                league: league,
                                                leagueId: league,
                                                matchesPlayed: Math.floor(Math.random() * 30) + 10,
                                                stats: {
                                                    goals: Math.floor(Math.random() * 15),
                                                    assists: Math.floor(Math.random() * 10),
                                                    appearances: Math.floor(Math.random() * 30) + 10,
                                                    minutes: Math.floor(Math.random() * 2700) + 900,
                                                    passAccuracy: Math.floor(Math.random() * 20) + 75,
                                                    dribbleSuccess: Math.floor(Math.random() * 30) + 60,
                                                    shots: Math.floor(Math.random() * 40),
                                                    shotsOnTarget: Math.floor(Math.random() * 20),
                                                    keyPasses: Math.floor(Math.random() * 25),
                                                    tackles: Math.floor(Math.random() * 35),
                                                    interceptions: Math.floor(Math.random() * 25),
                                                    clearances: Math.floor(Math.random() * 40),
                                                    blocks: Math.floor(Math.random() * 15),
                                                    rating: (Math.random() * 1.5 + 6.5).toFixed(1),
                                                    yellowCards: Math.floor(Math.random() * 8),
                                                    redCards: Math.floor(Math.random() * 2)
                                                }
                                            }
                                        }
                                    };

                                    // Remove undefined values
                                    Object.keys(playerDataWithSeason).forEach(key => {
                                        if (playerDataWithSeason[key] === undefined) {
                                            delete playerDataWithSeason[key];
                                        }
                                    });

                                    await this.db.collection('players').doc(player.id.toString()).set(playerDataWithSeason);
                                    totalPlayers++;
                                }
                            }
                        } catch (playerError) {
                            console.error(`Error fetching players for ${team.name}:`, playerError);
                        }
                    }
                } catch (leagueError) {
                    console.error(`Error processing league ${league}:`, leagueError);
                }
            }

            console.log(`Import completed! ${totalTeams} teams and ${totalPlayers} players imported.`);
            return { teams: totalTeams, players: totalPlayers };

        } catch (error) {
            console.error('Import error:', error);
            throw error;
        }
    }

    // Translate position from API to readable format
    translatePosition(position) {
        const positionMap = {
            'Goalkeeper': 'Goalkeeper',
            'Defender': 'Defender',
            'Midfielder': 'Midfielder',
            'Attacker': 'Forward',
            'Forward': 'Forward',
            'GK': 'Goalkeeper',
            'DF': 'Defender',
            'MF': 'Midfielder',
            'FW': 'Forward'
        };
        return positionMap[position] || position;
    }
}

// Initialize and make globally available
const firebaseDataService = new FirebaseDataService();
window.firebaseDataService = firebaseDataService;

// Global function for importing real data
window.importRealFootballData = async function() {
    try {
        const result = await firebaseDataService.importRealFootballData();
        alert(`データインポート完了！\n${result.teams}チーム、${result.players}選手をインポートしました。`);
        return result;
    } catch (error) {
        console.error('Import failed:', error);
        alert('データインポートに失敗しました。');
        throw error;
    }
};

// Global function for setting API key (now managed in backend)
window.setApiKey = function() {
    console.log('API key is managed in the backend environment variables');
    alert('APIキーはバックエンドで管理されています。');
};

console.log('FirebaseDataService initialized'); 