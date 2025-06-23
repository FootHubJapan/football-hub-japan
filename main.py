from flask import Flask, request, abort
import os
from datetime import datetime
import time

# LINE Bot SDK v3
from linebot.v3 import WebhookHandler
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import (
    Configuration, ApiClient, MessagingApi, 
    ReplyMessageRequest, TextMessage
)
from linebot.v3.webhooks import MessageEvent, TextMessageContent

# 独自AIエンジンをインポート
from custom_ai_engine import CustomSoccerAI

app = Flask(__name__)

# LINE Bot設定
configuration = Configuration(access_token=os.getenv('CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.getenv('CHANNEL_SECRET'))

# 独自AIエンジンを初期化
print("🤖 独自AIエンジンを初期化中...")
soccer_ai = CustomSoccerAI()
print("✅ 独自AIエンジン初期化完了！")

@app.route('/')
def hello():
    return "<h1>⚽ Football Hub Japan</h1><h2>🤖 独自AI搭載版</h2>"

@app.route('/callback', methods=['POST'])
def callback():
    signature = request.headers.get('X-Line-Signature')
    body = request.get_data(as_text=True)
    
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)
    
    return 'OK'

@handler.add(MessageEvent, message=TextMessageContent)
def handle_message(event):
    user_message = event.message.text
    user_id = event.source.user_id
    
    try:
        ai_response = soccer_ai.process_message(user_id, user_message)
        
        with ApiClient(configuration) as api_client:
            line_bot_api = MessagingApi(api_client)
            line_bot_api.reply_message_with_http_info(
                ReplyMessageRequest(
                    reply_token=event.reply_token,
                    messages=[TextMessage(text=ai_response)]
                )
            )
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=True)