const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/init');
const { logger } = require('../utils/logger');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// Middleware to verify Firebase token
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    
    // Get or create user subscription record
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        'SELECT * FROM user_subscriptions WHERE user_id = $1',
        [decodedToken.uid]
      );

      if (userResult.rows.length === 0) {
        // Create new user record
        await client.query(`
          INSERT INTO user_subscriptions (user_id, email, plan_type)
          VALUES ($1, $2, 'free')
        `, [decodedToken.uid, decodedToken.email]);
        
        req.userSubscription = {
          user_id: decodedToken.uid,
          email: decodedToken.email,
          plan_type: 'free',
          ai_usage_count: 0,
          ai_usage_limit: 5
        };
      } else {
        req.userSubscription = userResult.rows[0];
      }
      
    } finally {
      client.release();
    }

    next();
  } catch (error) {
    logger.error('Firebase token verification failed:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

// Middleware to check subscription plan
const requirePlan = (requiredPlan) => {
  return (req, res, next) => {
    const userPlan = req.userSubscription?.plan_type || 'free';
    const planHierarchy = { free: 0, premium: 1, pro: 2 };
    
    if (planHierarchy[userPlan] < planHierarchy[requiredPlan]) {
      return res.status(403).json({
        success: false,
        error: `${requiredPlan} plan required`,
        currentPlan: userPlan,
        requiredPlan: requiredPlan
      });
    }
    
    next();
  };
};

// Middleware to check AI usage limits
const checkAIUsage = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const userSubscription = req.userSubscription;
    
    if (userSubscription.plan_type === 'free') {
      if (userSubscription.ai_usage_count >= userSubscription.ai_usage_limit) {
        return res.status(429).json({
          success: false,
          error: 'AI usage limit exceeded',
          usageCount: userSubscription.ai_usage_count,
          usageLimit: userSubscription.ai_usage_limit,
          upgradeRequired: true
        });
      }
    }
    
    next();
  } catch (error) {
    logger.error('AI usage check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Usage check failed'
    });
  }
};

// Middleware to increment AI usage
const incrementAIUsage = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    
    if (req.userSubscription.plan_type === 'free') {
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE user_subscriptions SET ai_usage_count = ai_usage_count + 1 WHERE user_id = $1',
          [userId]
        );
      } finally {
        client.release();
      }
    }
    
    next();
  } catch (error) {
    logger.error('AI usage increment failed:', error);
    // Don't block the request, just log the error
    next();
  }
};

// Optional authentication (for public endpoints with user-specific features)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
      
      // Get user subscription
      const client = await pool.connect();
      try {
        const userResult = await client.query(
          'SELECT * FROM user_subscriptions WHERE user_id = $1',
          [decodedToken.uid]
        );
        
        if (userResult.rows.length > 0) {
          req.userSubscription = userResult.rows[0];
        }
      } finally {
        client.release();
      }
    }
    
    next();
  } catch (error) {
    // For optional auth, continue without user data if token is invalid
    next();
  }
};

module.exports = {
  verifyFirebaseToken,
  requirePlan,
  checkAIUsage,
  incrementAIUsage,
  optionalAuth
};