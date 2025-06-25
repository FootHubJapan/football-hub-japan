import re
import time
import requests
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import json

class EnhancedSoccerAI:
    def __init__(self):
        """Football-Data.org API統合版サッカーAIエンジン"""
        
        # Football-Data.org API設定
        self.football_api_key = os.getenv('FOOTBALL_API_KEY', '')
        self.football_api_base = "https://api.football-data.org/v4"
        self.api_headers = {
            'X-Auth-Token': self.football_api_key,
            'User-Agent': 'Football Hub Japan Bot'
        }
        
        # APIレート制限管理
        self.last_api_call = {}
        self.api_cache = {}
        self.cache_duration = 300  # 5分間キャッシュ
        
        # 基本データベース（フォールバック用）
        self.players_database = {
            "三笘薫": {
                "team": "ブライトン",
                "position": "ウイング",
                "nationality": "日本",
                "stats": "スピード95, ドリブル92, シュート78",
                "description": "日本代表の超高速ウイング。プレミアリーグで活躍中。",
                "team_id": 397  # Brighton & Hove Albion
            },
            "久保建英": {
                "team": "レアル・ソシエダ",
                "position": "攻撃的MF",
                "nationality": "日本", 
                "stats": "テクニック96, パス90, 視野94",
                "description": "日本代表の司令塔。ラ・リーガでプレー。",
                "team_id": 92  # Real Sociedad
            },
            "ハーランド": {
                "team": "マンチェスター・シティ",
                "position": "FW",
                "nationality": "ノルウェー",
                "stats": "シュート98, スピード89, フィジカル94",
                "description": "現代最高のストライカーの一人。ゴールマシン。",
                "team_id": 65  # Manchester City
            },
            "ムバッペ": {
                "team": "レアル・マドリード",
                "position": "FW", 
                "nationality": "フランス",
                "stats": "スピード99, ドリブル94, シュート95",
                "description": "世界最速のフォワード。レアル・マドリードの新星。",
                "team_id": 86  # Real Madrid
            }
        }
        
        # チームID マッピング
        self.team_mapping = {
            "アーセナル": 57,
            "チェルシー": 61,
            "リヴァプール": 64,
            "マンチェスター・シティ": 65,
            "マンチェスター・ユナイテッド": 66,
            "トッテナム": 73,
            "レアル・マドリード": 86,
            "バルセロナ": 81,
            "アトレティコ・マドリード": 78,
            "バイエルン・ミュンヘン": 5,
            "ボルシア・ドルトムント": 4,
            "パリ・サンジェルマン": 524,
            "ユヴェントス": 109,
            "ACミラン": 98,
            "インテル": 108
        }
        
        # リーグID マッピング
        self.league_mapping = {
            "プレミアリーグ": "PL",
            "ラ・リーガ": "PD", 
            "ブンデスリーガ": "BL1",
            "セリエA": "SA",
            "リーグ・アン": "FL1",
            "チャンピオンズリーグ": "CL"
        }
        
        # 意図認識パターン（拡張版）
        self.intent_patterns = {
            "live_scores": [
                r"ライブスコア",
                r"現在の試合",
                r"今の試合",
                r"試合結果",
                r"スコア"
            ],
            "league_table": [
                r"(.+?)の順位表?",
                r"(.+?)の順位",
                r"(.+?)のランキング",
                r"順位表",
                r"リーグテーブル"
            ],
            "team_matches": [
                r"(.+?)の試合予定",
                r"(.+?)の次の試合",
                r"(.+?)の試合",
                r"(.+?)のスケジュール"
            ],
            "player_stats": [
                r"(.+?)の最新統計",
                r"(.+?)の今シーズン",
                r"(.+?)のゴール数",
                r"(.+?)のアシスト"
            ],
            "player_info": [
                r"(.+?)について教えて",
                r"(.+?)の情報",
                r"(.+?)ってどんな選手",
                r"(.+?)のポジション"
            ],
            "team_info": [
                r"(.+?)のチーム情報",
                r"(.+?)について",
                r"(.+?)の戦術"
            ],
            "greeting": [
                r"こんにちは",
                r"おはよう", 
                r"こんばんは",
                r"はじめまして",
                r"よろしく"
            ]
        }
        
        self.user_contexts = {}
        
        print("🚀 Enhanced Soccer AI with Football-Data.org API")
        print(f"🔑 API Key configured: {'✅' if self.football_api_key else '❌'}")
        print(f"📊 Database: {len(self.players_database)} players, {len(self.team_mapping)} teams")

    def _make_api_request(self, endpoint: str, use_cache: bool = True) -> Optional[Dict]:
        """Football-Data.org APIリクエストを実行"""
        
        if not self.football_api_key:
            print("⚠️ Football API key not configured, using fallback data")
            return None
        
        # キャッシュチェック
        cache_key = endpoint
        if use_cache and cache_key in self.api_cache:
            cached_data, timestamp = self.api_cache[cache_key]
            if datetime.now() - timestamp < timedelta(seconds=self.cache_duration):
                print(f"📋 Using cached data for {endpoint}")
                return cached_data
        
        # レート制限チェック
        if endpoint in self.last_api_call:
            time_diff = datetime.now() - self.last_api_call[endpoint]
            if time_diff.seconds < 6:  # 10requests/minute limit
                print(f"⏳ Rate limit: waiting for {endpoint}")
                time.sleep(6 - time_diff.seconds)
        
        try:
            url = f"{self.football_api_base}/{endpoint}"
            print(f"🌐 API Request: {url}")
            
            response = requests.get(url, headers=self.api_headers, timeout=10)
            self.last_api_call[endpoint] = datetime.now()
            
            if response.status_code == 200:
                data = response.json()
                # キャッシュに保存
                self.api_cache[cache_key] = (data, datetime.now())
                print(f"✅ API Success: {endpoint}")
                return data
            else:
                print(f"❌ API Error {response.status_code}: {endpoint}")
                return None
                
        except Exception as e:
            print(f"❌ API Exception: {e}")
            return None

    def get_live_scores(self) -> str:
        """ライブスコア情報を取得"""
        
        data = self._make_api_request("matches?status=LIVE,FINISHED&limit=10")
        
        if not data or 'matches' not in data:
            return ("⚽ **ライブスコア情報**\n\n"
                   "現在、ライブ中の試合はありません。\n\n"
                   "💡 **最新情報**: \n"
                   "・試合結果は試合終了後すぐに更新されます\n"
                   "・主要リーグの試合スケジュールをチェック中\n\n"
                   "🔍 特定のチームの試合情報は「アーセナルの試合」などで検索できます！")
        
        matches = data['matches'][:5]  # 最新5試合
        
        if not matches:
            return ("⚽ **ライブスコア情報**\n\n"
                   "現在、進行中の試合はありません。\n\n"
                   "📅 次の試合スケジュールや結果については、\n"
                   "チーム名で検索してみてください！")
        
        response = "⚽ **ライブスコア & 最新結果**\n\n"
        
        for match in matches:
            home_team = match['homeTeam']['name']
            away_team = match['awayTeam']['name']
            status = match['status']
            
            if match['score']['fullTime']['home'] is not None:
                home_score = match['score']['fullTime']['home']
                away_score = match['score']['fullTime']['away']
                score_text = f"{home_score} - {away_score}"
            else:
                score_text = "vs"
            
            if status == "LIVE":
                status_emoji = "🔴 LIVE"
            elif status == "FINISHED":
                status_emoji = "✅ 終了"
            else:
                status_emoji = "⏰ 予定"
            
            response += f"{status_emoji} **{home_team}** {score_text} **{away_team}**\n"
        
        response += "\n🔄 データは5分ごとに更新されます"
        return response

    def get_league_table(self, league_name: str) -> str:
        """リーグ順位表を取得"""
        
        league_code = self.league_mapping.get(league_name)
        if not league_code:
            available_leagues = list(self.league_mapping.keys())
            return (f"❌ 「{league_name}」の順位表が見つかりません。\n\n"
                   f"📋 対応リーグ：\n" + 
                   "\n".join([f"• {league}" for league in available_leagues]))
        
        data = self._make_api_request(f"competitions/{league_code}/standings")
        
        if not data or 'standings' not in data:
            return (f"⚠️ {league_name}の順位表を取得できませんでした。\n\n"
                   "💡 しばらく後に再度お試しください。")
        
        standings = data['standings'][0]['table'][:10]  # 上位10チーム
        
        response = f"🏆 **{league_name} 順位表**\n\n"
        
        for team in standings:
            position = team['position']
            name = team['team']['name']
            points = team['points']
            played = team['playedGames']
            
            # 順位に応じた絵文字
            if position == 1:
                pos_emoji = "🥇"
            elif position == 2:
                pos_emoji = "🥈"
            elif position == 3:
                pos_emoji = "🥉"
            elif position <= 4:
                pos_emoji = "⚽"
            else:
                pos_emoji = f"{position}."
            
            response += f"{pos_emoji} **{name}** - {points}pts ({played}試合)\n"
        
        response += f"\n📊 最新更新: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        return response

    def get_team_matches(self, team_name: str) -> str:
        """チームの試合スケジュール取得"""
        
        team_id = self.team_mapping.get(team_name)
        if not team_id:
            available_teams = list(self.team_mapping.keys())[:10]
            return (f"❌ 「{team_name}」の情報が見つかりません。\n\n"
                   f"📋 対応チーム例：\n" + 
                   "\n".join([f"• {team}" for team in available_teams]) +
                   f"\n\n🔍 他にも多くのチームに対応しています！")
        
        # 今後の試合
        data = self._make_api_request(f"teams/{team_id}/matches?status=SCHEDULED&limit=5")
        
        if not data or 'matches' not in data:
            return (f"⚠️ {team_name}の試合スケジュールを取得できませんでした。\n\n"
                   "💡 しばらく後に再度お試しください。")
        
        matches = data['matches']
        
        if not matches:
            return (f"📅 **{team_name}の次の試合**\n\n"
                   "現在、予定されている試合はありません。\n"
                   "シーズン終了期間の可能性があります。")
        
        response = f"📅 **{team_name} 今後の試合**\n\n"
        
        for match in matches:
            home_team = match['homeTeam']['name']
            away_team = match['awayTeam']['name']
            match_date = match['utcDate']
            competition = match['competition']['name']
            
            # 日付フォーマット
            date_obj = datetime.fromisoformat(match_date.replace('Z', '+00:00'))
            formatted_date = date_obj.strftime('%m/%d %H:%M')
            
            response += f"⚽ **{home_team}** vs **{away_team}**\n"
            response += f"📅 {formatted_date} | 🏆 {competition}\n\n"
        
        response += "🔔 試合開始時刻はUTC時間です"
        return response

    def process_message(self, user_id: str, message: str) -> str:
        """メッセージ処理（API統合版）"""
        
        # ユーザーコンテキスト初期化
        if user_id not in self.user_contexts:
            self.user_contexts[user_id] = {
                "previous_queries": [],
                "preferences": {},
                "session_start": datetime.now()
            }
        
        # メッセージ正規化
        normalized_message = message.strip().lower()
        
        # 意図認識
        intent, extracted_entity = self._recognize_intent(normalized_message)
        
        # コンテキスト更新
        self.user_contexts[user_id]["previous_queries"].append({
            "message": message,
            "intent": intent,
            "entity": extracted_entity,
            "timestamp": datetime.now()
        })
        
        # API統合応答生成
        response = self._generate_enhanced_response(intent, extracted_entity, user_id)
        
        return response

    def _recognize_intent(self, message: str) -> tuple:
        """意図認識（拡張版）"""
        
        # 各意図パターンをチェック
        for intent, patterns in self.intent_patterns.items():
            for pattern in patterns:
                match = re.search(pattern, message, re.IGNORECASE)
                if match:
                    if match.groups():
                        entity = match.group(1).strip()
                        return intent, entity
                    else:
                        return intent, None
        
        # エンティティ直接検索
        for player_name in self.players_database.keys():
            if player_name.lower() in message:
                return "player_info", player_name
                
        for team_name in self.team_mapping.keys():
            if team_name.lower() in message:
                return "team_info", team_name
        
        return "general", None

    def _generate_enhanced_response(self, intent: str, entity: str, user_id: str) -> str:
        """API統合応答生成"""
        
        if intent == "live_scores":
            return self.get_live_scores()
            
        elif intent == "league_table":
            league_name = entity or "プレミアリーグ"
            return self.get_league_table(league_name)
            
        elif intent == "team_matches":
            if not entity:
                return ("📅 チーム名を教えてください！\n\n"
                       "例: 「アーセナルの試合予定」「マンチェスター・シティの次の試合」")
            return self.get_team_matches(entity)
            
        elif intent == "player_stats":
            return self._get_player_enhanced_info(entity, include_stats=True)
            
        elif intent == "player_info":
            return self._get_player_enhanced_info(entity)
            
        elif intent == "team_info":
            return self._get_team_enhanced_info(entity)
            
        elif intent == "greeting":
            return self._generate_enhanced_greeting(user_id)
            
        else:
            return self._generate_enhanced_general_response(entity)

    def _get_player_enhanced_info(self, player_name: str, include_stats: bool = False) -> str:
        """拡張選手情報取得"""
        
        if not player_name:
            return ("🔍 選手名を教えてください！\n\n"
                   "例: 「三笘薫について教えて」「ハーランドの最新統計」")
        
        # 基本データベースから情報取得
        if player_name in self.players_database:
            player_data = self.players_database[player_name]
            
            response = f"⚽ **{player_name}** の情報\n\n"
            response += f"🏟️ **所属**: {player_data['team']}\n"
            response += f"📍 **ポジション**: {player_data['position']}\n"
            response += f"🌍 **国籍**: {player_data['nationality']}\n"
            response += f"📊 **能力値**: {player_data['stats']}\n\n"
            response += f"💬 **解説**: {player_data['description']}\n\n"
            
            # API統合でチーム情報も追加
            if 'team_id' in player_data and self.football_api_key:
                team_data = self._make_api_request(f"teams/{player_data['team_id']}")
                if team_data:
                    response += f"🏆 **所属クラブ**: {team_data['name']}\n"
                    response += f"🏟️ **ホームスタジアム**: {team_data.get('venue', 'データなし')}\n"
            
            if include_stats:
                response += "\n📈 **シーズン統計**: \n"
                response += "・最新データは試合終了後に更新されます\n"
                response += "・詳細統計は開発中です\n"
            
            response += "\n🔍 他の選手についても聞いてみてください！"
            return response
        
        # 見つからない場合
        available_players = list(self.players_database.keys())[:5]
        return (f"❌ 「{player_name}」の情報が見つかりませんでした。\n\n"
               f"📋 現在対応している選手：\n" + 
               "\n".join([f"• {name}" for name in available_players]) +
               f"\n\n🔄 データベースは随時更新中です！")

    def _get_team_enhanced_info(self, team_name: str) -> str:
        """拡張チーム情報取得"""
        
        if not team_name:
            return ("🏟️ チーム名を教えてください！\n\n"
                   "例: 「アーセナルについて教えて」「マンチェスター・シティの情報」")
        
        team_id = self.team_mapping.get(team_name)
        if not team_id:
            available_teams = list(self.team_mapping.keys())[:8]
            return (f"❌ 「{team_name}」の情報が見つかりません。\n\n"
                   f"📋 対応チーム例：\n" + 
                   "\n".join([f"• {team}" for team in available_teams]) +
                   f"\n\n🔍 他にも多くのチームに対応しています！")
        
        response = f"🏟️ **{team_name}** の情報\n\n"
        
        # API統合でリアルタイム情報取得
        if self.football_api_key:
            team_data = self._make_api_request(f"teams/{team_id}")
            if team_data:
                response += f"🏆 **正式名称**: {team_data['name']}\n"
                response += f"🏟️ **ホームスタジアム**: {team_data.get('venue', 'データなし')}\n"
                response += f"📅 **設立年**: {team_data.get('founded', 'データなし')}\n"
                response += f"🌐 **公式サイト**: {team_data.get('website', 'データなし')}\n\n"
                
                # 最近の試合結果
                matches_data = self._make_api_request(f"teams/{team_id}/matches?status=FINISHED&limit=3")
                if matches_data and 'matches' in matches_data:
                    response += "📊 **最近の試合結果**:\n"
                    for match in matches_data['matches'][:3]:
                        home = match['homeTeam']['name']
                        away = match['awayTeam']['name']
                        if match['score']['fullTime']['home'] is not None:
                            score = f"{match['score']['fullTime']['home']}-{match['score']['fullTime']['away']}"
                            response += f"• {home} {score} {away}\n"
                    response += "\n"
        
        response += "🔍 「アーセナルの試合予定」で今後の試合も確認できます！"
        return response

    def _generate_enhanced_greeting(self, user_id: str) -> str:
        """拡張挨拶応答"""
        
        session_count = len(self.user_contexts[user_id]["previous_queries"])
        api_status = "🔌 リアルタイムデータ対応" if self.football_api_key else "📊 基本データベース"
        
        if session_count <= 1:
            return (f"⚽ こんにちは！Football Hub Japan Enhanced へようこそ！\n\n"
                   f"🤖 私は Football-Data.org API 統合の高度サッカー情報AIです。\n\n"
                   f"🌟 **新機能**：\n"
                   f"• 📺 ライブスコア情報\n"
                   f"• 🏆 リーグ順位表\n"
                   f"• 📅 試合スケジュール\n"
                   f"• 📊 選手・チーム統計\n\n"
                   f"💡 **使用例**：\n"
                   f"• 「ライブスコア」- 現在の試合状況\n"
                   f"• 「プレミアリーグの順位表」- 最新順位\n"
                   f"• 「アーセナルの試合予定」- スケジュール\n"
                   f"• 「三笘薫の最新統計」- 選手データ\n\n"
                   f"🔧 **システム状態**: {api_status}\n\n"
                   f"何について調べましょうか？ ⚽")
        else:
            return (f"⚽ おかえりなさい！\n\n"
                   f"🔍 最新のサッカー情報をお調べします！\n"
                   f"ライブスコア、順位表、試合予定など、お気軽にどうぞ！\n\n"
                   f"📊 {api_status}")

    def _generate_enhanced_general_response(self, entity: str) -> str:
        """拡張一般応答"""
        
        api_features = [
            "📺 ライブスコア: 「ライブスコア」",
            "🏆 リーグ順位: 「プレミアリーグの順位表」",
            "📅 試合予定: 「アーセナルの試合予定」",
            "📊 選手情報: 「三笘薫について教えて」",
            "🔍 チーム情報: 「マンチェスター・シティの情報」"
        ]
        
        if entity:
            response = f"🤔 「{entity}」について、もう少し具体的に教えてください！\n\n"
        else:
            response = "🤖 Football-Data.org API統合で、リアルタイムサッカー情報をお届けします！\n\n"
        
        response += "🌟 **新機能でできること**：\n"
        response += "\n".join([f"• {feature}" for feature in api_features])
        response += "\n\n⚽ どの情報をお調べしましょうか？"
        
        return response

    def get_system_stats(self) -> Dict[str, Any]:
        """拡張システム統計"""
        
        return {
            "total_players": len(self.players_database),
            "total_teams": len(self.team_mapping),
            "supported_leagues": len(self.league_mapping),
            "api_integration": bool(self.football_api_key),
            "supported_intents": list(self.intent_patterns.keys()),
            "active_contexts": len(self.user_contexts),
            "cache_entries": len(self.api_cache),
            "system_uptime": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }