import re
from datetime import datetime
from typing import Dict, List, Optional

class CustomSoccerAI:
    """シンプル版サッカーAIエンジン"""
    
    def __init__(self):
        print("⚽ サッカーAIエンジン初期化中...")
        
        # 基本的なサッカー知識ベース
        self.player_data = {
            "三笘薫": {
                "team": "ブライトン",
                "position": "ウィンガー",
                "goals": 8,
                "assists": 5,
                "description": "圧倒的なドリブル技術でプレミアリーグを席巻する日本代表のエース"
            },
            "ハーランド": {
                "team": "マンチェスター・シティ", 
                "position": "ストライカー",
                "goals": 27,
                "assists": 5,
                "description": "現代サッカー界最高峰のゴールマシン"
            },
            "メッシ": {
                "team": "インテル・マイアミ",
                "position": "フォワード",
                "goals": 15,
                "assists": 12,
                "description": "サッカー史上最高の選手、バロンドール8回受賞"
            },
            "久保建英": {
                "team": "レアル・ソシエダ",
                "position": "ミッドフィールダー", 
                "goals": 6,
                "assists": 8,
                "description": "創造性豊かなプレーメイカー、日本サッカーの至宝"
            }
        }
        
        # チーム情報
        self.team_data = {
            "日本代表": {
                "manager": "森保一",
                "ranking": "世界15位前後",
                "recent_result": "W杯2022ベスト16進出",
                "description": "組織的な戦術と技術力で世界と戦うサムライブルー"
            },
            "マンチェスターシティ": {
                "manager": "ペップ・グアルディオラ",
                "league": "プレミアリーグ",
                "recent_result": "チャンピオンズリーグ優勝",
                "description": "ポゼッション中心の美しいパスサッカー"
            }
        }
        
        # 会話履歴（ユーザーごと）
        self.contexts = {}
        
        print("✅ サッカーAI初期化完了！")
    
    def process_message(self, user_id: str, message: str) -> str:
        """メッセージ処理のメインメソッド"""
        print(f"🔄 処理中: {message}")
        
        # ユーザーコンテキストの初期化
        if user_id not in self.contexts:
            self.contexts[user_id] = {"history": []}
        
        # メッセージを履歴に追加
        self.contexts[user_id]["history"].append(message)
        
        # 応答生成
        response = self._generate_response(message)
        
        print(f"✅ 応答生成完了: {len(response)}文字")
        return response
    
    def _generate_response(self, message: str) -> str:
        """応答生成ロジック"""
        message_lower = message.lower()
        
        # 挨拶への応答
        if any(word in message_lower for word in ['こんにちは', 'hello', 'はじめまして', 'テスト']):
            return self._get_greeting_response()
        
        # 選手情報の応答
        for player_name, data in self.player_data.items():
            if player_name in message or any(alias in message_lower for alias in [player_name.lower()]):
                return self._get_player_response(player_name, data)
        
        # 海外選手の英語名対応
        english_names = {
            "haaland": "ハーランド",
            "messi": "メッシ", 
            "kubo": "久保建英",
            "mitoma": "三笘薫"
        }
        
        for eng_name, jp_name in english_names.items():
            if eng_name in message_lower:
                return self._get_player_response(jp_name, self.player_data[jp_name])
        
        # チーム情報の応答
        for team_name, data in self.team_data.items():
            if team_name in message:
                return self._get_team_response(team_name, data)
        
        # 一般的なサッカー質問
        if any(word in message_lower for word in ['サッカー', 'フットボール', '試合', 'ゴール']):
            return self._get_general_soccer_response()
        
        # デフォルト応答
        return self._get_default_response(message)
    
    def _get_greeting_response(self) -> str:
        """挨拶応答"""
        return f"""⚽ **Football Hub Japan へようこそ！**

🤖 私は独自開発のサッカーAIです。

🎯 **できること**
• 選手の詳細情報・成績
• チーム情報・戦術解説
• サッカー用語・ルール解説

💡 **質問例**
「三笘薫について教えて」
「ハーランドのゴール数は？」
「日本代表の情報は？」

現在時刻: {datetime.now().strftime('%H:%M:%S')}
何について知りたいですか？⚽"""
    
    def _get_player_response(self, player_name: str, data: Dict) -> str:
        """選手情報応答"""
        return f"""⚽ **{player_name}**

🏟️ **所属**: {data['team']}
📍 **ポジション**: {data['position']}
⚽ **ゴール**: {data['goals']}点
🎯 **アシスト**: {data['assists']}回

💭 **解説**
{data['description']}

📊 今シーズンも素晴らしい活躍を見せていますね！

🔄 他の選手についても気軽にお聞きください。"""
    
    def _get_team_response(self, team_name: str, data: Dict) -> str:
        """チーム情報応答"""
        return f"""🏟️ **{team_name}**

👨‍🏫 **監督**: {data['manager']}
📊 **最近の実績**: {data['recent_result']}

💭 **特徴**
{data['description']}

⚽ このチームについてもっと詳しく知りたいことがあれば、お聞きください！"""
    
    def _get_general_soccer_response(self) -> str:
        """一般的なサッカー応答"""
        return """⚽ **サッカーについて**

🌟 **対応可能な情報**
• 日本人選手: 三笘薫、久保建英
• 世界のスター: ハーランド、メッシ
• チーム: 日本代表、マンチェスターシティ

💡 **質問のコツ**
選手名やチーム名を具体的に教えてください！

例：「三笘薫のゴール数は？」
例：「日本代表について教えて」

🚀 どの選手・チームについて知りたいですか？"""
    
    def _get_default_response(self, message: str) -> str:
        """デフォルト応答"""
        return f"""🤖 「{message}」についてですね。

申し訳ございませんが、その情報は現在データベースにありません。

⚽ **対応可能な質問**
• 「三笘薫について」
• 「ハーランドのゴール数は？」
• 「日本代表の情報は？」
• 「マンチェスターシティについて」

🔄 上記のような具体的な選手名やチーム名でお試しください！

💡 新しい情報のリクエストもお気軽にどうぞ。"""
    
    def get_system_stats(self) -> Dict:
        """システム統計情報"""
        return {
            "total_players": len(self.player_data),
            "total_teams": len(self.team_data),
            "active_contexts": len(self.contexts),
            "supported_intents": ["player_info", "team_info", "general_soccer", "greeting"]
        }

# テスト用
if __name__ == "__main__":
    ai = CustomSoccerAI()
    
    test_messages = [
        "こんにちは",
        "三笘薫について教えて",
        "ハーランドのゴール数は？",
        "日本代表について"
    ]
    
    for msg in test_messages:
        print(f"\n入力: {msg}")
        response = ai.process_message("test_user", msg)
        print(f"出力: {response}")
        print("-" * 50)