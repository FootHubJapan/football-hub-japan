from flask import Flask, request, abort
import os
from datetime import datetime
import time

# LINE Bot SDK v2 (動作確認済み)
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, TextMessage, TextSendMessage

# 独自AIエンジンをインポート
from custom_ai_engine import CustomSoccerAI

app = Flask(__name__)

# LINE Bot設定 (v2)
line_bot_api = LineBotApi(os.getenv('CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.getenv('CHANNEL_SECRET'))

# 独自AIエンジンを初期化
print("🚀 Football Hub Japan - 安定版 起動中...")
print("🤖 独自AIエンジンを初期化中...")
soccer_ai = CustomSoccerAI()
print("✅ 独自AIエンジン初期化完了！")

@app.route('/')
def hello():
    stats = soccer_ai.get_system_stats()
    
    return f'''
    <h1>⚽ Football Hub Japan</h1>
    <h2>🤖 独自AI搭載版</h2>
    <p>📱 LINEで高度なサッカー情報AI</p>
    
    <h3>🎯 システム情報</h3>
    <ul>
        <li>登録選手数: {stats["total_players"]}人</li>
        <li>登録チーム数: {stats["total_teams"]}チーム</li>
        <li>対応意図: {len(stats["supported_intents"])}種類</li>
        <li>アクティブユーザー: {stats["active_contexts"]}人</li>
    </ul>
    
    <h3>🌟 機能</h3>
    <ul>
        <li>🤖 独自AIエンジン搭載</li>
        <li>⚡ 高速応答 (0.1秒未満)</li>
        <li>🆓 完全無料運用</li>
        <li>📱 24/7稼働</li>
    </ul>
    
    <h3>📱 使用例</h3>
    <ul>
        <li>「三笘薫のゴール数は？」</li>
        <li>「久保建英について教えて」</li>
        <li>「日本代表の最近の結果は？」</li>
        <li>「こんにちは」</li>
    </ul>
    
    <footer>
        <p>⚡ Claude API代替 独自AIエンジン</p>
        <p>🚀 24/7稼働中</p>
    </footer>
    '''

@app.route('/callback', methods=['POST'])
def callback():
    print("🔔 Webhook endpoint called!")
    
    signature = request.headers.get('X-Line-Signature')
    body = request.get_data(as_text=True)
    
    print(f"📋 Request headers: {dict(request.headers)}")
    print(f"📝 Request body length: {len(body)}")
    
    if not signature or not body:
        print("❌ Missing signature or body")
        abort(400)
    
    try:
        handler.handle(body, signature)
        print("✅ Handler processed successfully")
    except InvalidSignatureError:
        print("❌ Invalid signature")
        abort(400)
    except Exception as e:
        print(f"❌ Handler error: {e}")
        abort(500)
    
    return 'OK'

@handler.add(MessageEvent, message=TextMessage)
def handle_message(event):
    user_message = event.message.text
    user_id = event.source.user_id
    
    print(f"👤 User {user_id}: {user_message}")
    
    try:
        # 独自AIエンジンで処理
        start_time = time.time()
        ai_response = soccer_ai.process_message(user_id, user_message)
        processing_time = time.time() - start_time
        
        print(f"🤖 AI processed in {processing_time:.3f}s")
        print(f"📤 Response: {ai_response[:100]}...")
        
        # メッセージ長制限（LINE APIの制限対応）
        if len(ai_response) > 5000:
            ai_response = ai_response[:4950] + "\n\n📝 メッセージが長いため短縮されました"
        
        # LINE API で応答送信 (v2)
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text=ai_response)
        )
        
        print("✅ Message sent successfully")
        
    except Exception as e:
        print(f"❌ Error in message handling: {e}")
        import traceback
        traceback.print_exc()
        
        try:
            error_response = "申し訳ございません。一時的にエラーが発生しました。\n\n⚽ しばらく待ってから再度お試しください。"
            line_bot_api.reply_message(
                event.reply_token,
                TextSendMessage(text=error_response)
            )
        except Exception as e2:
            print(f"❌ Failed to send error message: {e2}")

if __name__ == "__main__":
    print("🚀 Football Hub Japan - 安定版 Ready!")
    print("⚽ 独自サッカーAI稼働開始！")
    
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=True)
