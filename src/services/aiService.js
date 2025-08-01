const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../utils/logger');
const { pool } = require('../database/init');

class AIService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  async analyzePlayer(playerData, userPlan = 'free') {
    try {
      const basicPrompt = `
        選手データを分析してください：
        名前: ${playerData.name}
        ポジション: ${playerData.position}
        年齢: ${playerData.age}歳
        国籍: ${playerData.nationality}
        
        今シーズンの統計:
        - ゴール: ${playerData.goals || 0}
        - アシスト: ${playerData.assists || 0}
        - 出場試合: ${playerData.appearances || 0}
        - 出場時間: ${playerData.minutes || 0}分
        
        以下の観点で分析してください：
        1. 今シーズンのパフォーマンス評価（5段階）
        2. 強みと弱み
        3. 同ポジションでの評価
        ${userPlan === 'free' ? '' : '4. 今後の成長予測\n5. 移籍市場での価値評価'}
      `;

      const premiumPrompt = `
        ${basicPrompt}
        
        追加の詳細統計:
        - xG: ${playerData.xg || 'N/A'}
        - xA: ${playerData.xa || 'N/A'}
        - パス成功率: ${playerData.passes_accuracy || 'N/A'}%
        - シュート数: ${playerData.shots_total || 0}
        - ドリブル成功率: ${playerData.dribbles_success || 0}/${playerData.dribbles_attempts || 0}
        
        高度な分析も含めてください：
        6. 戦術的適性分析
        7. 怪我リスク評価
        8. ファンタジーサッカーでの推奨度
        9. 類似選手との比較
        10. 投資価値としての評価
      `;

      const result = await this.model.generateContent({
        contents: [{ 
          role: 'user', 
          parts: [{ text: userPlan === 'free' ? basicPrompt : premiumPrompt }] 
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: userPlan === 'free' ? 512 : 1024,
        }
      });

      const analysis = result.response.text();
      
      // Save analysis to history
      await this.saveAnalysisHistory(
        playerData.user_id || 'anonymous',
        'player_analysis',
        playerData.id || playerData.name,
        basicPrompt,
        analysis
      );

      return {
        success: true,
        analysis: analysis,
        playerName: playerData.name,
        analysisType: 'player_analysis',
        plan: userPlan
      };

    } catch (error) {
      logger.error('AI player analysis failed:', error);
      throw new Error('AI analysis temporarily unavailable');
    }
  }

  async predictMatch(matchData, userPlan = 'free') {
    try {
      const basicPrompt = `
        試合予想を行ってください：
        
        ホームチーム: ${matchData.homeTeam}
        アウェイチーム: ${matchData.awayTeam}
        リーグ: ${matchData.league}
        
        最近の成績:
        ${matchData.homeTeam}: ${matchData.homeRecentForm || '不明'}
        ${matchData.awayTeam}: ${matchData.awayRecentForm || '不明'}
        
        ${userPlan === 'free' ? '勝敗予想のみ' : '詳細なスコア予想と分析'}を提供してください。
      `;

      const premiumPrompt = `
        ${basicPrompt}
        
        詳細データ:
        - 過去対戦成績: ${matchData.h2hRecord || '不明'}
        - ホーム平均得点: ${matchData.homeAvgGoals || 'N/A'}
        - アウェイ平均得点: ${matchData.awayAvgGoals || 'N/A'}
        - 負傷者情報: ${matchData.injuries || '不明'}
        
        以下を含む詳細分析を提供してください：
        1. 詳細スコア予想
        2. 得点者予想（上位3名）
        3. 試合の流れ予想
        4. キーファクター分析
        5. ベッティングオッズ分析
        6. 信頼度スコア（100点満点）
      `;

      const result = await this.model.generateContent({
        contents: [{ 
          role: 'user', 
          parts: [{ text: userPlan === 'free' ? basicPrompt : premiumPrompt }] 
        }],
        generationConfig: {
          temperature: 0.6,
          topK: 30,
          topP: 0.9,
          maxOutputTokens: userPlan === 'free' ? 256 : 1024,
        }
      });

      const prediction = result.response.text();
      
      // Save analysis to history
      await this.saveAnalysisHistory(
        matchData.user_id || 'anonymous',
        'match_prediction',
        `${matchData.homeTeam}_vs_${matchData.awayTeam}`,
        basicPrompt,
        prediction
      );

      return {
        success: true,
        prediction: prediction,
        matchInfo: `${matchData.homeTeam} vs ${matchData.awayTeam}`,
        analysisType: 'match_prediction',
        plan: userPlan
      };

    } catch (error) {
      logger.error('AI match prediction failed:', error);
      throw new Error('Match prediction temporarily unavailable');
    }
  }

  async generateRankingInsights(playersData, position, userPlan = 'free') {
    try {
      const topPlayers = playersData.slice(0, userPlan === 'free' ? 5 : 10);
      
      const prompt = `
        ${position}ポジションのランキング分析を行ってください：
        
        TOP選手リスト:
        ${topPlayers.map((player, index) => 
          `${index + 1}. ${player.name} (${player.team}) - ゴール:${player.goals} アシスト:${player.assists}`
        ).join('\n')}
        
        以下の分析を提供してください：
        1. ランキングの特徴と傾向
        2. 注目すべき選手とその理由
        3. 日本人選手がいる場合の評価
        ${userPlan !== 'free' ? '4. 今後のランキング変動予想\n5. 移籍市場への影響' : ''}
      `;

      const result = await this.model.generateContent({
        contents: [{ 
          role: 'user', 
          parts: [{ text: prompt }] 
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: userPlan === 'free' ? 512 : 1024,
        }
      });

      return {
        success: true,
        insights: result.response.text(),
        position: position,
        playersCount: topPlayers.length,
        plan: userPlan
      };

    } catch (error) {
      logger.error('AI ranking insights failed:', error);
      throw new Error('Ranking insights temporarily unavailable');
    }
  }

  async comparePlayersAdvanced(player1Data, player2Data, userPlan = 'premium') {
    try {
      const prompt = `
        選手比較分析を行ってください：
        
        選手A: ${player1Data.name}
        - ポジション: ${player1Data.position}
        - ゴール: ${player1Data.goals}
        - アシスト: ${player1Data.assists}
        - xG: ${player1Data.xg || 'N/A'}
        - xA: ${player1Data.xa || 'N/A'}
        
        選手B: ${player2Data.name}
        - ポジション: ${player2Data.position}
        - ゴール: ${player2Data.goals}
        - アシスト: ${player2Data.assists}
        - xG: ${player2Data.xg || 'N/A'}
        - xA: ${player2Data.xa || 'N/A'}
        
        以下の観点で詳細比較してください：
        1. 総合能力比較（レーダーチャート形式）
        2. 各能力値の詳細分析
        3. どちらが優秀か、その理由
        4. それぞれの適性チーム戦術
        5. 移籍市場での価値比較
        6. ファンタジーサッカーでの推奨度
      `;

      const result = await this.model.generateContent({
        contents: [{ 
          role: 'user', 
          parts: [{ text: prompt }] 
        }],
        generationConfig: {
          temperature: 0.6,
          topK: 30,
          topP: 0.9,
          maxOutputTokens: 1024,
        }
      });

      // Save analysis to history
      await this.saveAnalysisHistory(
        player1Data.user_id || 'anonymous',
        'player_comparison',
        `${player1Data.name}_vs_${player2Data.name}`,
        prompt,
        result.response.text()
      );

      return {
        success: true,
        comparison: result.response.text(),
        players: [player1Data.name, player2Data.name],
        analysisType: 'player_comparison'
      };

    } catch (error) {
      logger.error('AI player comparison failed:', error);
      throw new Error('Player comparison temporarily unavailable');
    }
  }

  async generateCustomReport(reportData, userPlan = 'pro') {
    try {
      const prompt = `
        カスタムレポートを生成してください：
        
        レポートタイプ: ${reportData.type}
        対象期間: ${reportData.period}
        対象リーグ: ${reportData.leagues?.join(', ') || '全リーグ'}
        注目選手: ${reportData.focusPlayers?.join(', ') || 'なし'}
        
        以下を含む包括的なレポートを作成してください：
        1. エグゼクティブサマリー
        2. 主要トレンド分析
        3. 注目選手の詳細分析
        4. 市場価値の変動
        5. 今後の予測
        6. 投資推奨事項
        
        レポート形式: 構造化されたマークダウン形式で出力
      `;

      const result = await this.model.generateContent({
        contents: [{ 
          role: 'user', 
          parts: [{ text: prompt }] 
        }],
        generationConfig: {
          temperature: 0.5,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      });

      // Save analysis to history
      await this.saveAnalysisHistory(
        reportData.user_id || 'anonymous',
        'custom_report',
        reportData.type,
        prompt,
        result.response.text()
      );

      return {
        success: true,
        report: result.response.text(),
        reportType: reportData.type,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('AI custom report generation failed:', error);
      throw new Error('Custom report generation temporarily unavailable');
    }
  }

  async saveAnalysisHistory(userId, analysisType, targetId, query, response) {
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          INSERT INTO ai_analysis_history 
          (user_id, analysis_type, target_id, query_text, response_text)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, analysisType, targetId, query, response]);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to save analysis history:', error);
      // Don't throw error as this is not critical
    }
  }

  async getAnalysisHistory(userId, limit = 10) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT analysis_type, target_id, query_text, response_text, created_at
          FROM ai_analysis_history 
          WHERE user_id = $1 
          ORDER BY created_at DESC 
          LIMIT $2
        `, [userId, limit]);
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get analysis history:', error);
      return [];
    }
  }
}

module.exports = new AIService();