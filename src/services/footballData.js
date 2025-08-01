const axios = require('axios');
const { logger } = require('../utils/logger');

class FootballDataService {
  constructor() {
    this.apiFootballKey = process.env.API_FOOTBALL_KEY;
    this.footballDataKey = process.env.FOOTBALL_DATA_ORG_KEY;
    
    this.apiFootballBase = 'https://v3.football.api-sports.io';
    this.footballDataBase = 'https://api.football-data.org/v4';
    
    this.axiosApiFootball = axios.create({
      baseURL: this.apiFootballBase,
      headers: {
        'x-apisports-key': this.apiFootballKey
      },
      timeout: 10000
    });
    
    this.axiosFootballData = axios.create({
      baseURL: this.footballDataBase,
      headers: {
        'X-Auth-Token': this.footballDataKey
      },
      timeout: 10000
    });
  }

  // API-Football methods
  async getPlayers(searchQuery, season = 2024, league = null) {
    try {
      const params = {
        search: searchQuery,
        season: season
      };
      
      if (league) params.league = league;
      
      const response = await this.axiosApiFootball.get('/players', { params });
      
      logger.info(`Retrieved ${response.data.response?.length || 0} players for query: ${searchQuery}`);
      return response.data;
      
    } catch (error) {
      logger.error('Error fetching players:', error.response?.data || error.message);
      throw error;
    }
  }

  async getPlayerStats(playerId, season = 2024) {
    try {
      const response = await this.axiosApiFootball.get('/players', {
        params: { id: playerId, season }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Error fetching player stats for ${playerId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async getLiveMatches() {
    try {
      const response = await this.axiosApiFootball.get('/fixtures', {
        params: { live: 'all' }
      });
      
      logger.info(`Retrieved ${response.data.response?.length || 0} live matches`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching live matches:', error.response?.data || error.message);
      throw error;
    }
  }

  async getFixtures(league, season = 2024, from = null, to = null) {
    try {
      const params = { league, season };
      if (from) params.from = from;
      if (to) params.to = to;
      
      const response = await this.axiosApiFootball.get('/fixtures', { params });
      
      return response.data;
    } catch (error) {
      logger.error('Error fetching fixtures:', error.response?.data || error.message);
      throw error;
    }
  }

  async getStandings(league, season = 2024) {
    try {
      const response = await this.axiosApiFootball.get('/standings', {
        params: { league, season }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error fetching standings:', error.response?.data || error.message);
      throw error;
    }
  }

  async getTeams(league, season = 2024) {
    try {
      const response = await this.axiosApiFootball.get('/teams', {
        params: { league, season }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error fetching teams:', error.response?.data || error.message);
      throw error;
    }
  }

  // Football-data.org methods (alternative/backup)
  async getCompetitions() {
    try {
      const response = await this.axiosFootballData.get('/competitions');
      return response.data;
    } catch (error) {
      logger.error('Error fetching competitions:', error.response?.data || error.message);
      throw error;
    }
  }

  async getMatchesFromFootballData(competitionId, dateFrom = null, dateTo = null) {
    try {
      const params = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      
      const response = await this.axiosFootballData.get(`/competitions/${competitionId}/matches`, { params });
      return response.data;
    } catch (error) {
      logger.error('Error fetching matches from football-data.org:', error.response?.data || error.message);
      throw error;
    }
  }

  // Utility methods
  async searchJapanesePlayers(season = 2024) {
    try {
      // Common Japanese player names and search terms
      const japaneseSearchTerms = [
        'takumi', 'yuya', 'hiroshi', 'keisuke', 'takahiro', 'yuki', 'daichi',
        'minamino', 'kamada', 'endo', 'mitoma', 'doan', 'kubo', 'tomiyasu'
      ];
      
      const allPlayers = [];
      
      for (const term of japaneseSearchTerms) {
        try {
          const data = await this.getPlayers(term, season);
          if (data.response) {
            const japanesePlayers = data.response.filter(player => 
              player.player.nationality === 'Japan'
            );
            allPlayers.push(...japanesePlayers);
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.warn(`Failed to search for term: ${term}`, error.message);
        }
      }
      
      // Remove duplicates
      const uniquePlayers = allPlayers.reduce((acc, current) => {
        const exists = acc.find(player => player.player.id === current.player.id);
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, []);
      
      logger.info(`Found ${uniquePlayers.length} unique Japanese players`);
      return uniquePlayers;
      
    } catch (error) {
      logger.error('Error searching Japanese players:', error);
      throw error;
    }
  }

  // Get major European league IDs
  getMajorLeagues() {
    return {
      premierLeague: 39,    // England Premier League
      laLiga: 140,          // Spain La Liga
      bundesliga: 78,       // Germany Bundesliga
      serieA: 135,          // Italy Serie A
      ligue1: 61,           // France Ligue 1
      championsLeague: 2,   // UEFA Champions League
      jLeague: 98           // Japan J1 League
    };
  }

  async getTopScorers(league, season = 2024) {
    try {
      const response = await this.axiosApiFootball.get('/players/topscorers', {
        params: { league, season }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error fetching top scorers:', error.response?.data || error.message);
      throw error;
    }
  }

  async getTopAssists(league, season = 2024) {
    try {
      const response = await this.axiosApiFootball.get('/players/topassists', {
        params: { league, season }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error fetching top assists:', error.response?.data || error.message);
      throw error;
    }
  }

  // Head-to-head statistics
  async getH2H(team1Id, team2Id, last = 10) {
    try {
      const response = await this.axiosApiFootball.get('/fixtures/headtohead', {
        params: { 
          h2h: `${team1Id}-${team2Id}`,
          last: last
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error fetching H2H data:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new FootballDataService();