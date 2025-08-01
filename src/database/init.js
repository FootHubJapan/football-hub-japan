const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'football_hub_japan',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Database schema
const createTables = async () => {
  const client = await pool.connect();
  
  try {
    // Players table
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(50) PRIMARY KEY,
        player_id INT UNIQUE,
        player_name VARCHAR(100) NOT NULL,
        nationality VARCHAR(50),
        position VARCHAR(20),
        age INT,
        height VARCHAR(10),
        weight VARCHAR(10),
        photo_url TEXT,
        market_value DECIMAL(10,2),
        current_team_id INT,
        is_japanese BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Player stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_stats (
        id BIGSERIAL PRIMARY KEY,
        player_id INT NOT NULL,
        season INT NOT NULL,
        league VARCHAR(100),
        team VARCHAR(100),
        
        -- Basic statistics
        appearances INT DEFAULT 0,
        lineups INT DEFAULT 0,
        minutes INT DEFAULT 0,
        goals INT DEFAULT 0,
        assists INT DEFAULT 0,
        yellow_cards INT DEFAULT 0,
        red_cards INT DEFAULT 0,
        
        -- Detailed statistics
        passes_total INT DEFAULT 0,
        passes_accuracy DECIMAL(5,2),
        key_passes INT DEFAULT 0,
        shots_total INT DEFAULT 0,
        shots_on_target INT DEFAULT 0,
        dribbles_attempts INT DEFAULT 0,
        dribbles_success INT DEFAULT 0,
        tackles_total INT DEFAULT 0,
        interceptions INT DEFAULT 0,
        
        -- Advanced metrics (premium features)
        xg DECIMAL(5,2),
        xa DECIMAL(5,2),
        rating DECIMAL(3,1),
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(player_id, season, league)
      )
    `);

    // Matches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id BIGSERIAL PRIMARY KEY,
        match_id INT UNIQUE,
        home_team_id INT NOT NULL,
        away_team_id INT NOT NULL,
        league VARCHAR(100) NOT NULL,
        season INT NOT NULL,
        match_date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        home_score INT DEFAULT 0,
        away_score INT DEFAULT 0,
        
        -- Match statistics
        home_possession DECIMAL(5,2),
        away_possession DECIMAL(5,2),
        home_shots INT,
        away_shots INT,
        home_xg DECIMAL(5,2),
        away_xg DECIMAL(5,2),
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Teams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        team_id INT UNIQUE,
        team_name VARCHAR(100) NOT NULL,
        league VARCHAR(100),
        country VARCHAR(50),
        logo_url TEXT,
        founded INT,
        venue_name VARCHAR(100),
        venue_capacity INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255),
        plan_type VARCHAR(20) DEFAULT 'free' CHECK (plan_type IN ('free', 'premium', 'pro')),
        ai_usage_count INT DEFAULT 0,
        ai_usage_limit INT DEFAULT 5,
        favorite_players JSONB DEFAULT '[]',
        favorite_teams JSONB DEFAULT '[]',
        subscription_start DATE,
        subscription_end DATE,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // AI analysis history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_analysis_history (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        analysis_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(100),
        query_text TEXT,
        response_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Rankings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rankings (
        id BIGSERIAL PRIMARY KEY,
        ranking_type VARCHAR(50) NOT NULL,
        position VARCHAR(20),
        player_id INT,
        rank_position INT NOT NULL,
        score DECIMAL(10,2),
        season INT NOT NULL,
        is_japanese BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(ranking_type, position, player_id, season)
      )
    `);

    // Match predictions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS match_predictions (
        id BIGSERIAL PRIMARY KEY,
        match_id INT NOT NULL,
        prediction_type VARCHAR(20) DEFAULT 'basic',
        home_win_probability DECIMAL(5,2),
        draw_probability DECIMAL(5,2),
        away_win_probability DECIMAL(5,2),
        predicted_home_score INT,
        predicted_away_score INT,
        confidence_score DECIMAL(5,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_player_search 
      ON players(player_name, nationality, position)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_japanese_players 
      ON players(is_japanese, position) WHERE is_japanese = TRUE
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stats_ranking 
      ON player_stats(season, goals DESC, assists DESC)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_xg_ranking 
      ON player_stats(season, xg DESC) WHERE xg IS NOT NULL
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_analysis 
      ON ai_analysis_history(user_id, created_at DESC)
    `);

    logger.info('Database tables created successfully');
    
  } catch (error) {
    logger.error('Error creating database tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

const initializeDatabase = async () => {
  try {
    await createTables();
    logger.info('Database initialization completed');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

module.exports = { pool, initializeDatabase };