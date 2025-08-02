// Version: 1.5 - Cache busting - UPDATED
// Firebase Configuration
let firebaseConfig = {
    apiKey: "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "football-hub-japan.firebaseapp.com",
    projectId: "football-hub-japan",
    storageBucket: "football-hub-japan.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdefghijklmnop"
};

// Check if Firebase is properly configured
function isFirebaseConfigured() {
    return firebaseConfig.apiKey && 
           firebaseConfig.apiKey !== "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" &&
           firebaseConfig.projectId &&
           firebaseConfig.projectId !== "football-hub-japan";
}

// Initialize Firebase only if properly configured
let db = null;
let firebaseInitialized = false;

// Function to initialize Firebase with server config
async function initializeFirebase() {
    try {
        // Get Firebase config from server
        const response = await fetch('/api/firebase-config');
        const data = await response.json();
        
        if (data.isConfigured) {
            firebaseConfig = data.config;
            console.log('Firebase configuration loaded from server');
        } else {
            console.warn('Firebase not properly configured on server');
            return false;
        }
        
        // Initialize Firebase
        if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            firebaseInitialized = true;
            console.log('Firebase initialized successfully');
            return true;
        } else {
            console.warn('Firebase not available or not properly configured');
            return false;
        }
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        return false;
    }
}

// Initialize Firebase when the script loads
initializeFirebase().then(success => {
    if (!success) {
        console.log('Firebase initialization failed, using fallback data');
    }
});

// Firebase Data Service
class FirebaseDataService {
    constructor() {
        this.db = db;
        this.isInitialized = firebaseInitialized;
        this.initializationPromise = null;
        
        if (this.isInitialized) {
            console.log('FirebaseDataService initialized with Firebase');
        } else {
            console.log('FirebaseDataService initialized with fallback mode');
        }
        
        // Make the service available globally
        window.firebaseDataService = this;
    }
    
    // Wait for Firebase initialization
    async waitForInitialization() {
        if (this.isInitialized) {
            return true;
        }
        
        if (!this.initializationPromise) {
            this.initializationPromise = new Promise((resolve) => {
                const checkInitialization = () => {
                    if (firebaseInitialized) {
                        this.isInitialized = true;
                        this.db = db;
                        resolve(true);
                    } else {
                        setTimeout(checkInitialization, 100);
                    }
                };
                checkInitialization();
            });
        }
        
        return this.initializationPromise;
    }

    // Get all leagues
    async getLeagues() {
        await this.waitForInitialization();
        
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, using fallback leagues data');
            return this.getFallbackLeagues();
        }
        
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
        await this.waitForInitialization();
        
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, using fallback teams data');
            return this.getFallbackTeams();
        }
        
        try {
            // First try to get cached data
            const cachedTeams = await this.getCachedTeams();
            if (cachedTeams.length > 0) {
                console.log(`Using ${cachedTeams.length} cached teams`);
                return cachedTeams;
            }

            // If no cached data, try to import
            console.log('No cached teams found, checking if data needs to be imported...');
            const isImported = await this.isDataImported();
            
            if (isImported) {
                // Data exists but failed to load, try again
                const retryTeams = await this.getCachedTeams();
                if (retryTeams.length > 0) {
                    return retryTeams;
                }
            }

            // If still no data, use fallback
            console.log('Using fallback teams data');
            return this.getFallbackTeams();
        } catch (error) {
            console.error('Error getting teams:', error);
            return this.getFallbackTeams();
        }
    }

    // Get all players
    async getPlayers() {
        console.log('getPlayers() called');
        
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, using fallback players data');
            const fallbackPlayers = this.getFallbackPlayers();
            console.log('Fallback players returned:', fallbackPlayers.length, 'players');
            return fallbackPlayers;
        }
        
        try {
            // First try to get cached data
            const cachedPlayers = await this.getCachedPlayers();
            if (cachedPlayers.length > 0) {
                console.log(`Using ${cachedPlayers.length} cached players`);
                return cachedPlayers;
            }

            // If no cached data, try to import
            console.log('No cached players found, checking if data needs to be imported...');
            const isImported = await this.isDataImported();
            
            if (isImported) {
                // Data exists but failed to load, try again
                const retryPlayers = await this.getCachedPlayers();
                if (retryPlayers.length > 0) {
                    return retryPlayers;
                }
            }

            // If still no data, use fallback
            console.log('Using fallback players data');
            return this.getFallbackPlayers();
        } catch (error) {
            console.error('Error getting players:', error);
            return this.getFallbackPlayers();
        }
    }

    // Search players with enhanced functionality
    async searchPlayers(query) {
        await this.waitForInitialization();
        
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, using fallback search');
            return this.searchFallbackPlayers(query);
        }
        
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

            // Enhanced Japanese name mapping
            const japaneseNameMap = {
                'ハーランド': 'haaland',
                'エルリング・ハーランド': 'erling haaland',
                'モドリッチ': 'modric',
                'ルカ・モドリッチ': 'luka modric',
                'ベリンガム': 'bellingham',
                'ジュード・ベリンガム': 'jude bellingham',
                '久保': 'kubo',
                '久保建英': 'takefusa kubo',
                '三笘': 'mitoma',
                '三笘薫': 'kaoru mitoma',
                '孫': 'son',
                '孫興慜': 'heung-min son',
                'メッシ': 'messi',
                'リオネル・メッシ': 'lionel messi',
                'ロナウド': 'ronaldo',
                'クリスティアーノ・ロナウド': 'cristiano ronaldo',
                'ネイマール': 'neymar',
                'ネイマール・ジュニオール': 'neymar junior',
                'ムバッペ': 'mbappe',
                'キリアン・ムバッペ': 'kylian mbappe',
                'デ・ブルイネ': 'de bruyne',
                'ケビン・デ・ブルイネ': 'kevin de bruyne',
                'サラー': 'salah',
                'モハメド・サラー': 'mohamed salah',
                'ケイン': 'kane',
                'ハリー・ケイン': 'harry kane',
                'ディバラ': 'dybala',
                'パウロ・ディバラ': 'paulo dybala',
                'ルイス・ディアス': 'luis diaz',
                'ディアス': 'diaz',
                'フェルナンデス': 'fernandez',
                'ブルーノ・フェルナンデス': 'bruno fernandez',
                'ロドリゴ': 'rodrygo',
                'ロドリゴ・ゴエス': 'rodrygo goes',
                'ビニシウス': 'vinicius',
                'ビニシウス・ジュニオール': 'vinicius junior',
                'バルデ': 'valde',
                'ペドリ・ゴンサレス': 'pedri gonzalez',
                'ペドリ': 'pedri',
                'ガビ': 'gavi',
                'ガビ・パエス': 'gavi paez',
                'カマビンガ': 'camavinga',
                'エドゥアルド・カマビンガ': 'eduardo camavinga',
                'チュアメニ': 'tchouameni',
                'オーレリアン・チュアメニ': 'aurelien tchouameni',
                'エンデリック': 'endrick',
                'エンデリック・フェリペ': 'endrick felipe',
                'アルダ・ギュラー': 'arda guler',
                'ギュラー': 'guler',
                'ミリタン': 'militao',
                'エデル・ミリタン': 'eder militao',
                'アラバ': 'alaba',
                'ダビド・アラバ': 'david alaba',
                'ルディガー': 'rudiger',
                'アントニオ・ルディガー': 'antonio rudiger',
                'クルトゥア': 'courtois',
                'ティボ・クルトゥア': 'thibaut courtois',
                'アリソン': 'alisson',
                'アリソン・ベッカー': 'alisson becker',
                'エデルソン': 'ederson',
                'エデルソン・モラエス': 'ederson moraes',
                'テル・シュテーゲン': 'ter stegen',
                'シュテーゲン': 'stegen',
                'ノイアー': 'neuer',
                'マヌエル・ノイアー': 'manuel neuer',
                'ドンナルンマ': 'donnarumma',
                'ジャンヌイジ・ドンナルンマ': 'gianluigi donnarumma',
                'メニャン': 'mendy',
                'エドゥアール・メニャン': 'edouard mendy',
                'マルチネス': 'martinez',
                'エミリアーノ・マルチネス': 'emiliano martinez',
                'オブラク': 'oblak',
                'ヤン・オブラク': 'jan oblak',
                'シモン': 'simon',
                'ウナイ・シモン': 'unai simon',
                'ピケ': 'pique',
                'ジェラール・ピケ': 'gerard pique',
                'ラモス': 'ramos',
                'セルヒオ・ラモス': 'sergio ramos',
                'ペペ': 'pepe',
                'ペペ・レイナルド': 'pepe reinaldo',
                'ディアス': 'diaz',
                'ルイス・ディアス': 'luis diaz',
                'フェルナンデス': 'fernandez',
                'ブルーノ・フェルナンデス': 'bruno fernandez',
                'ロドリゴ': 'rodrygo',
                'ロドリゴ・ゴエス': 'rodrygo goes',
                'ビニシウス': 'vinicius',
                'ビニシウス・ジュニオール': 'vinicius junior',
                'バルデ': 'valde',
                'ペドリ・ゴンサレス': 'pedri gonzalez',
                'ペドリ': 'pedri',
                'ガビ': 'gavi',
                'ガビ・パエス': 'gavi paez',
                'カマビンガ': 'camavinga',
                'エドゥアルド・カマビンガ': 'eduardo camavinga',
                'チュアメニ': 'tchouameni',
                'オーレリアン・チュアメニ': 'aurelien tchouameni',
                'エンデリック': 'endrick',
                'エンデリック・フェリペ': 'endrick felipe',
                'アルダ・ギュラー': 'arda guler',
                'ギュラー': 'guler',
                'ミリタン': 'militao',
                'エデル・ミリタン': 'eder militao',
                'アラバ': 'alaba',
                'ダビド・アラバ': 'david alaba',
                'ルディガー': 'rudiger',
                'アントニオ・ルディガー': 'antonio rudiger',
                'クルトゥア': 'courtois',
                'ティボ・クルトゥア': 'thibaut courtois',
                'アリソン': 'alisson',
                'アリソン・ベッカー': 'alisson becker',
                'エデルソン': 'ederson',
                'エデルソン・モラエス': 'ederson moraes',
                'テル・シュテーゲン': 'ter stegen',
                'シュテーゲン': 'stegen',
                'ノイアー': 'neuer',
                'マヌエル・ノイアー': 'manuel neuer',
                'ドンナルンマ': 'donnarumma',
                'ジャンヌイジ・ドンナルンマ': 'gianluigi donnarumma',
                'メニャン': 'mendy',
                'エドゥアール・メニャン': 'edouard mendy',
                'マルチネス': 'martinez',
                'エミリアーノ・マルチネス': 'emiliano martinez',
                'オブラク': 'oblak',
                'ヤン・オブラク': 'jan oblak',
                'シモン': 'simon',
                'ウナイ・シモン': 'unai simon',
                'ピケ': 'pique',
                'ジェラール・ピケ': 'gerard pique',
                'ラモス': 'ramos',
                'セルヒオ・ラモス': 'sergio ramos',
                'ペペ': 'pepe',
                'ペペ・レイナルド': 'pepe reinaldo'
            };

            // Check if query is a Japanese name
            let searchTerms = [searchQuery];
            if (japaneseNameMap[query]) {
                searchTerms.push(japaneseNameMap[query]);
                console.log(`Japanese name detected: "${query}" -> "${japaneseNameMap[query]}"`);
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
        console.log('getFallbackPlayers() called');
        const players = [
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
                marketValue: '35.0',
                preferredFoot: 'Right',
                matches: this.generateMatchHistory('Brighton & Hove Albion'),
                seasons: {
                    '2024-2025': {
                        team: 'Brighton & Hove Albion',
                        teamId: '7',
                        league: 'Premier League',
                        leagueId: 'PL',
                        matchesPlayed: 30,
                        stats: {
                            goals: 12,
                            assists: 8,
                            appearances: 30,
                            minutes: 2700,
                            passAccuracy: 78,
                            dribbleSuccess: 72,
                            shots: 52,
                            shotsOnTarget: 22,
                            keyPasses: 42,
                            tackles: 18,
                            interceptions: 12,
                            clearances: 3,
                            blocks: 2,
                            rating: 7.8,
                            yellowCards: 5,
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
                currentTeam: 'Manchester City',
                team: 'Manchester City',
                contract: { start: '2022-07', end: '2027-06' },
                marketValue: '180.0',
                preferredFoot: 'Left',
                matches: this.generateMatchHistory('Manchester City'),
                seasons: {
                    '2024-2025': {
                        team: 'Manchester City',
                        teamId: '8',
                        league: 'Premier League',
                        leagueId: 'PL',
                        matchesPlayed: 32,
                        stats: {
                            goals: 28,
                            assists: 5,
                            appearances: 32,
                            minutes: 2880,
                            passAccuracy: 75,
                            dribbleSuccess: 45,
                            shots: 89,
                            shotsOnTarget: 42,
                            keyPasses: 18,
                            tackles: 8,
                            interceptions: 4,
                            clearances: 2,
                            blocks: 1,
                            rating: 8.2,
                            yellowCards: 3,
                            redCards: 0
                        }
                    }
                }
            },
            {
                id: '5',
                fullName: 'Kylian Mbappé',
                firstName: 'Kylian',
                lastName: 'Mbappé',
                position: 'Left Winger',
                birthday: '1998-12-20',
                nationality: 'France',
                currentTeam: 'Real Madrid',
                team: 'Real Madrid',
                contract: { start: '2024-07', end: '2029-06' },
                marketValue: '150.0',
                preferredFoot: 'Right',
                matches: this.generateMatchHistory('Real Madrid'),
                seasons: {
                    '2024-2025': {
                        team: 'Real Madrid',
                        teamId: '9',
                        league: 'La Liga',
                        leagueId: 'PD',
                        matchesPlayed: 29,
                        stats: {
                            goals: 22,
                            assists: 15,
                            appearances: 29,
                            minutes: 2610,
                            passAccuracy: 82,
                            dribbleSuccess: 78,
                            shots: 76,
                            shotsOnTarget: 35,
                            keyPasses: 48,
                            tackles: 12,
                            interceptions: 8,
                            clearances: 1,
                            blocks: 0,
                            rating: 8.5,
                            yellowCards: 4,
                            redCards: 0
                        }
                    }
                }
            }
        ];
        console.log('getFallbackPlayers() returning:', players.length, 'players');
        return players;
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

    // Generate realistic match history with actual team names and varied odds
    generateRealisticMatchHistory(teamName) {
        const matches = [];
        const teamOpponents = this.getTeamOpponents(teamName);
        
        for (let i = 0; i < 15; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (i * 7));
            
            const isHome = Math.random() > 0.5;
            const opponent = teamOpponents[Math.floor(Math.random() * teamOpponents.length)];
            const homeGoals = Math.floor(Math.random() * 4);
            const awayGoals = Math.floor(Math.random() * 4);
            
            // Generate realistic odds based on team strength
            const homeOdds = (Math.random() * 1.5 + 1.2).toFixed(2);
            const drawOdds = (Math.random() * 1.0 + 3.0).toFixed(2);
            const awayOdds = (Math.random() * 2.0 + 2.5).toFixed(2);
            
            // Generate realistic bet value (not always 100€)
            const betValue = Math.floor(Math.random() * 500 + 50) + '€';
            
            matches.push({
                date: date.toISOString().split('T')[0],
                time: `${Math.floor(Math.random() * 24)}:${Math.random() > 0.5 ? '00' : '30'}`,
                homeTeam: isHome ? teamName : opponent,
                awayTeam: isHome ? opponent : teamName,
                score: `${homeGoals}:${awayGoals}`,
                odds: `${homeOdds} / ${drawOdds} / ${awayOdds}`,
                result: homeGoals > awayGoals ? 'W' : homeGoals < awayGoals ? 'L' : 'D',
                betValue: betValue
            });
        }
        
        return matches.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // Get realistic opponents for each team
    getTeamOpponents(teamName) {
        const opponents = {
            'Real Madrid CF': ['FC Barcelona', 'Atletico Madrid', 'Sevilla FC', 'Valencia CF', 'Athletic Club', 'Real Betis', 'Villarreal CF', 'Real Sociedad', 'Girona FC', 'Getafe CF', 'Rayo Vallecano', 'Celta de Vigo'],
            'FC Barcelona': ['Real Madrid CF', 'Atletico Madrid', 'Sevilla FC', 'Valencia CF', 'Athletic Club', 'Real Betis', 'Villarreal CF', 'Real Sociedad', 'Girona FC', 'Getafe CF', 'Rayo Vallecano', 'Celta de Vigo'],
            'Manchester City FC': ['Arsenal FC', 'Liverpool FC', 'Manchester United FC', 'Chelsea FC', 'Tottenham Hotspur FC', 'Newcastle United FC', 'Aston Villa FC', 'West Ham United FC', 'Brighton & Hove Albion', 'Crystal Palace FC', 'Brentford FC', 'Fulham FC'],
            'Arsenal FC': ['Manchester City FC', 'Liverpool FC', 'Manchester United FC', 'Chelsea FC', 'Tottenham Hotspur FC', 'Newcastle United FC', 'Aston Villa FC', 'West Ham United FC', 'Brighton & Hove Albion', 'Crystal Palace FC', 'Brentford FC', 'Fulham FC'],
            'Liverpool FC': ['Manchester City FC', 'Arsenal FC', 'Manchester United FC', 'Chelsea FC', 'Tottenham Hotspur FC', 'Newcastle United FC', 'Aston Villa FC', 'West Ham United FC', 'Brighton & Hove Albion', 'Crystal Palace FC', 'Brentford FC', 'Fulham FC'],
            'Brighton & Hove Albion': ['Manchester City FC', 'Arsenal FC', 'Liverpool FC', 'Manchester United FC', 'Chelsea FC', 'Tottenham Hotspur FC', 'Newcastle United FC', 'Aston Villa FC', 'West Ham United FC', 'Crystal Palace FC', 'Brentford FC', 'Fulham FC'],
            'Girona FC': ['Real Madrid CF', 'FC Barcelona', 'Atletico Madrid', 'Sevilla FC', 'Valencia CF', 'Athletic Club', 'Real Betis', 'Villarreal CF', 'Real Sociedad', 'Getafe CF', 'Rayo Vallecano', 'Celta de Vigo'],
            'Real Sociedad': ['Real Madrid CF', 'FC Barcelona', 'Atletico Madrid', 'Sevilla FC', 'Valencia CF', 'Athletic Club', 'Real Betis', 'Villarreal CF', 'Girona FC', 'Getafe CF', 'Rayo Vallecano', 'Celta de Vigo'],
            'AC Milan': ['Inter Milan', 'Juventus FC', 'SSC Napoli', 'AS Roma', 'SS Lazio', 'Atalanta BC', 'Fiorentina', 'Torino FC', 'Bologna FC', 'Sassuolo Calcio', 'Udinese Calcio', 'Hellas Verona FC'],
            'Inter Milan': ['AC Milan', 'Juventus FC', 'SSC Napoli', 'AS Roma', 'SS Lazio', 'Atalanta BC', 'Fiorentina', 'Torino FC', 'Bologna FC', 'Sassuolo Calcio', 'Udinese Calcio', 'Hellas Verona FC'],
            'Juventus FC': ['AC Milan', 'Inter Milan', 'SSC Napoli', 'AS Roma', 'SS Lazio', 'Atalanta BC', 'Fiorentina', 'Torino FC', 'Bologna FC', 'Sassuolo Calcio', 'Udinese Calcio', 'Hellas Verona FC'],
            'FC Bayern München': ['Borussia Dortmund', 'RB Leipzig', 'Bayer 04 Leverkusen', 'VfB Stuttgart', 'Eintracht Frankfurt', 'SC Freiburg', 'TSG 1899 Hoffenheim', '1. FC Union Berlin', 'VfL Wolfsburg', '1. FC Köln', 'FC Augsburg', '1. FSV Mainz 05'],
            'Borussia Dortmund': ['FC Bayern München', 'RB Leipzig', 'Bayer 04 Leverkusen', 'VfB Stuttgart', 'Eintracht Frankfurt', 'SC Freiburg', 'TSG 1899 Hoffenheim', '1. FC Union Berlin', 'VfL Wolfsburg', '1. FC Köln', 'FC Augsburg', '1. FSV Mainz 05'],
            'Paris Saint-Germain FC': ['AS Monaco FC', 'Olympique de Marseille', 'Olympique Lyonnais', 'Lille OSC', 'Stade Rennais FC', 'RC Lens', 'OGC Nice', 'RC Strasbourg Alsace', 'FC Nantes', 'Toulouse FC', 'Stade Brestois 29', 'FC Lorient']
        };
        
        return opponents[teamName] || ['Team A', 'Team B', 'Team C', 'Team D', 'Team E'];
    }

    // Generate realistic player statistics
    generateRealisticPlayerStats(position) {
        const baseStats = {
            appearances: Math.floor(Math.random() * 30) + 10,
            minutes: Math.floor(Math.random() * 2700) + 900,
            rating: (Math.random() * 1.5 + 6.5).toFixed(1),
            yellowCards: Math.floor(Math.random() * 8),
            redCards: Math.floor(Math.random() * 2)
        };

        // Position-specific stats
        switch (position.toLowerCase()) {
            case 'goalkeeper':
                return {
                    ...baseStats,
                    goals: 0,
                    assists: 0,
                    saves: Math.floor(Math.random() * 100) + 50,
                    cleanSheets: Math.floor(Math.random() * 15) + 5,
                    passAccuracy: Math.floor(Math.random() * 20) + 70,
                    dribbleSuccess: 0,
                    shots: 0,
                    shotsOnTarget: 0,
                    keyPasses: 0,
                    tackles: 0,
                    interceptions: 0,
                    clearances: Math.floor(Math.random() * 50) + 20,
                    blocks: 0,
                    foulsCommitted: Math.floor(Math.random() * 10),
                    foulsDrawn: 0,
                    offsides: 0
                };
            case 'defender':
                return {
                    ...baseStats,
                    goals: Math.floor(Math.random() * 5),
                    assists: Math.floor(Math.random() * 8),
                    saves: 0,
                    cleanSheets: Math.floor(Math.random() * 10),
                    passAccuracy: Math.floor(Math.random() * 15) + 80,
                    dribbleSuccess: Math.floor(Math.random() * 30) + 40,
                    shots: Math.floor(Math.random() * 20),
                    shotsOnTarget: Math.floor(Math.random() * 8),
                    keyPasses: Math.floor(Math.random() * 15),
                    tackles: Math.floor(Math.random() * 40) + 20,
                    interceptions: Math.floor(Math.random() * 30) + 15,
                    clearances: Math.floor(Math.random() * 80) + 40,
                    blocks: Math.floor(Math.random() * 20) + 10,
                    foulsCommitted: Math.floor(Math.random() * 25) + 10,
                    foulsDrawn: Math.floor(Math.random() * 10),
                    offsides: Math.floor(Math.random() * 5)
                };
            case 'midfielder':
                return {
                    ...baseStats,
                    goals: Math.floor(Math.random() * 10) + 2,
                    assists: Math.floor(Math.random() * 12) + 3,
                    saves: 0,
                    cleanSheets: 0,
                    passAccuracy: Math.floor(Math.random() * 20) + 75,
                    dribbleSuccess: Math.floor(Math.random() * 40) + 50,
                    shots: Math.floor(Math.random() * 40) + 10,
                    shotsOnTarget: Math.floor(Math.random() * 15) + 5,
                    keyPasses: Math.floor(Math.random() * 50) + 20,
                    tackles: Math.floor(Math.random() * 35) + 15,
                    interceptions: Math.floor(Math.random() * 25) + 10,
                    clearances: Math.floor(Math.random() * 30) + 10,
                    blocks: Math.floor(Math.random() * 15) + 5,
                    foulsCommitted: Math.floor(Math.random() * 20) + 8,
                    foulsDrawn: Math.floor(Math.random() * 25) + 10,
                    offsides: Math.floor(Math.random() * 8) + 2
                };
            case 'forward':
            case 'striker':
            case 'winger':
                return {
                    ...baseStats,
                    goals: Math.floor(Math.random() * 20) + 5,
                    assists: Math.floor(Math.random() * 15) + 3,
                    saves: 0,
                    cleanSheets: 0,
                    passAccuracy: Math.floor(Math.random() * 25) + 70,
                    dribbleSuccess: Math.floor(Math.random() * 50) + 60,
                    shots: Math.floor(Math.random() * 60) + 20,
                    shotsOnTarget: Math.floor(Math.random() * 25) + 10,
                    keyPasses: Math.floor(Math.random() * 30) + 10,
                    tackles: Math.floor(Math.random() * 20) + 5,
                    interceptions: Math.floor(Math.random() * 15) + 5,
                    clearances: Math.floor(Math.random() * 15) + 5,
                    blocks: Math.floor(Math.random() * 10) + 2,
                    foulsCommitted: Math.floor(Math.random() * 15) + 5,
                    foulsDrawn: Math.floor(Math.random() * 30) + 15,
                    offsides: Math.floor(Math.random() * 15) + 5
                };
            default:
                return {
                    ...baseStats,
                    goals: Math.floor(Math.random() * 10),
                    assists: Math.floor(Math.random() * 10),
                    saves: 0,
                    cleanSheets: 0,
                    passAccuracy: Math.floor(Math.random() * 20) + 75,
                    dribbleSuccess: Math.floor(Math.random() * 40) + 50,
                    shots: Math.floor(Math.random() * 30),
                    shotsOnTarget: Math.floor(Math.random() * 12),
                    keyPasses: Math.floor(Math.random() * 25),
                    tackles: Math.floor(Math.random() * 25),
                    interceptions: Math.floor(Math.random() * 20),
                    clearances: Math.floor(Math.random() * 25),
                    blocks: Math.floor(Math.random() * 10),
                    foulsCommitted: Math.floor(Math.random() * 15),
                    foulsDrawn: Math.floor(Math.random() * 15),
                    offsides: Math.floor(Math.random() * 8)
                };
        }
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
                                        matches: this.generateRealisticMatchHistory(team.name),
                                        seasons: {
                                            '2024-2025': {
                                                team: team.name,
                                                teamId: team.id.toString(),
                                                league: league,
                                                leagueId: league,
                                                matchesPlayed: Math.floor(Math.random() * 30) + 10,
                                                stats: this.generateRealisticPlayerStats(this.translatePosition(player.position))
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

    // Check if data is already imported and cached
    async isDataImported() {
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, data import check skipped');
            return false;
        }
        
        try {
            const snapshot = await this.db.collection('players').limit(1).get();
            return !snapshot.empty;
        } catch (error) {
            console.error('Error checking data import status:', error);
            return false;
        }
    }

    // Get cached data from Firebase
    async getCachedPlayers() {
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, cannot load cached players');
            return [];
        }
        
        try {
            console.log('Loading cached players from Firebase...');
            const snapshot = await this.db.collection('players').get();
            if (snapshot.empty) {
                console.log('No cached players found');
                return [];
            }
            
            const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Loaded ${players.length} cached players`);
            return players;
        } catch (error) {
            console.error('Error loading cached players:', error);
            return [];
        }
    }

    async getCachedTeams() {
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, cannot load cached teams');
            return [];
        }
        
        try {
            console.log('Loading cached teams from Firebase...');
            const snapshot = await this.db.collection('teams').get();
            if (snapshot.empty) {
                console.log('No cached teams found');
                return [];
            }
            
            const teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Loaded ${teams.length} cached teams`);
            return teams;
        } catch (error) {
            console.error('Error loading cached teams:', error);
            return [];
        }
    }

    // Clear all cached data
    async clearCachedData() {
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, cannot clear cached data');
            return;
        }
        
        try {
            console.log('Clearing cached data...');
            
            // Clear players in smaller batches to avoid quota limits
            const playersSnapshot = await this.db.collection('players').get();
            const playerDocs = playersSnapshot.docs;
            const batchSize = 500; // Firebase batch limit
            
            for (let i = 0; i < playerDocs.length; i += batchSize) {
                const batch = this.db.batch();
                const batchDocs = playerDocs.slice(i, i + batchSize);
                batchDocs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
                console.log(`Cleared players batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(playerDocs.length / batchSize)}`);
            }
            
            // Clear teams
            const teamsSnapshot = await this.db.collection('teams').get();
            const teamDocs = teamsSnapshot.docs;
            
            for (let i = 0; i < teamDocs.length; i += batchSize) {
                const batch = this.db.batch();
                const batchDocs = teamDocs.slice(i, i + batchSize);
                batchDocs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
                console.log(`Cleared teams batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(teamDocs.length / batchSize)}`);
            }
            
            console.log('Cached data cleared successfully');
        } catch (error) {
            console.error('Error clearing cached data:', error);
            // Don't throw error to prevent breaking the UI
        }
    }

    // Check data status and return detailed information
    async checkDataStatus() {
        if (!this.isInitialized || !this.db) {
            return {
                type: 'warning',
                message: 'Firebaseが利用できません。フォールバックデータを使用しています。',
                playerCount: 0,
                teamCount: 0,
                isImported: false
            };
        }
        
        try {
            const playersSnapshot = await this.db.collection('players').get();
            const teamsSnapshot = await this.db.collection('teams').get();
            
            const playerCount = playersSnapshot.size;
            const teamCount = teamsSnapshot.size;
            
            if (playerCount > 0 && teamCount > 0) {
                return {
                    type: 'success',
                    message: `データベースに ${playerCount} 人の選手と ${teamCount} チームが保存されています`,
                    playerCount,
                    teamCount,
                    isImported: true
                };
            } else if (playerCount > 0) {
                return {
                    type: 'warning',
                    message: `選手データのみ保存されています (${playerCount}人)`,
                    playerCount,
                    teamCount: 0,
                    isImported: true
                };
            } else if (teamCount > 0) {
                return {
                    type: 'warning',
                    message: `チームデータのみ保存されています (${teamCount}チーム)`,
                    playerCount: 0,
                    teamCount,
                    isImported: true
                };
            } else {
                return {
                    type: 'info',
                    message: 'データベースにデータが保存されていません',
                    playerCount: 0,
                    teamCount: 0,
                    isImported: false
                };
            }
        } catch (error) {
            console.error('Error checking data status:', error);
            return {
                type: 'error',
                message: 'データベース状態の確認中にエラーが発生しました',
                playerCount: 0,
                teamCount: 0,
                isImported: false
            };
        }
    }

    // Refresh data (clear and re-import)
    async refreshData() {
        if (!this.isInitialized || !this.db) {
            console.log('Firebase not available, cannot refresh data');
            return {
                type: 'warning',
                message: 'Firebaseが利用できません。データ更新をスキップしました。'
            };
        }
        
        try {
            console.log('Starting data refresh...');
            
            // Clear existing data
            await this.clearCachedData();
            
            // Re-import data
            await this.importRealFootballData();
            
            console.log('Data refresh completed');
            return {
                type: 'success',
                message: 'データの更新が完了しました'
            };
        } catch (error) {
            console.error('Error refreshing data:', error);
            return {
                type: 'error',
                message: 'データ更新中にエラーが発生しました'
            };
        }
    }
}

// Initialize and make globally available
let firebaseDataService = null;

// Initialize FirebaseDataService after Firebase is ready
async function initializeFirebaseDataService() {
    try {
        firebaseDataService = new FirebaseDataService();
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
    } catch (error) {
        console.error('Error initializing FirebaseDataService:', error);
    }
}

// Initialize after Firebase is ready
initializeFirebase().then(() => {
    initializeFirebaseDataService();
}); 