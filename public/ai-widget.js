// AIエージェントウィジェット
class AIWidget {
    constructor() {
        this.isOpen = false;
        this.init();
    }

    init() {
        // ウィジェットのHTMLを作成
        const widgetHTML = `
            <div id="ai-widget" class="ai-widget">
                <div id="ai-widget-toggle" class="ai-widget-toggle">
                    <span class="ai-widget-icon">🤖</span>
                    <span class="ai-widget-text">AIエージェント</span>
                </div>
                <div id="ai-widget-chat" class="ai-widget-chat" style="display: none;">
                    <div class="ai-widget-header">
                        <span class="ai-widget-title">AIエージェント</span>
                        <button id="ai-widget-close" class="ai-widget-close">×</button>
                    </div>
                    <div id="ai-widget-messages" class="ai-widget-messages">
                        <div class="ai-message">
                            こんにちは！サッカー分析AIです。何でもお聞きください。
                        </div>
                    </div>
                    <div class="ai-widget-input">
                        <input type="text" id="ai-widget-input-field" placeholder="質問を入力...">
                        <button id="ai-widget-send">送信</button>
                    </div>
                </div>
            </div>
        `;

        // スタイルを追加
        const style = document.createElement('style');
        style.textContent = `
            .ai-widget {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 1000;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }

            .ai-widget-toggle {
                background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                color: #000000;
                padding: 12px 20px;
                border-radius: 25px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
                transition: all 0.3s ease;
                font-weight: bold;
            }

            .ai-widget-toggle:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0, 255, 136, 0.4);
            }

            .ai-widget-icon {
                font-size: 1.2rem;
            }

            .ai-widget-text {
                font-size: 0.9rem;
            }

            .ai-widget-chat {
                background: #1a1a1a;
                border: 2px solid #00ff88;
                border-radius: 15px;
                width: 350px;
                height: 400px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            }

            .ai-widget-header {
                background: #00ff88;
                color: #000000;
                padding: 12px 16px;
                border-radius: 13px 13px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: bold;
            }

            .ai-widget-close {
                background: none;
                border: none;
                color: #000000;
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .ai-widget-close:hover {
                background: rgba(0, 0, 0, 0.1);
                border-radius: 50%;
            }

            .ai-widget-messages {
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                background: #0a0a0a;
            }

            .ai-message {
                background: #333333;
                color: #ffffff;
                padding: 8px 12px;
                border-radius: 8px;
                margin-bottom: 8px;
                font-size: 0.9rem;
                line-height: 1.4;
            }

            .ai-message.user {
                background: #00ff88;
                color: #000000;
                margin-left: 20px;
            }

            .ai-message.ai {
                background: #333333;
                color: #ffffff;
                margin-right: 20px;
            }

            .ai-widget-input {
                padding: 12px 16px;
                background: #1a1a1a;
                border-radius: 0 0 13px 13px;
                display: flex;
                gap: 8px;
            }

            .ai-widget-input input {
                flex: 1;
                padding: 8px 12px;
                border: 1px solid #333333;
                border-radius: 5px;
                background: #0a0a0a;
                color: #ffffff;
                font-size: 0.9rem;
            }

            .ai-widget-input input:focus {
                outline: none;
                border-color: #00ff88;
            }

            .ai-widget-input button {
                background: #00ff88;
                color: #000000;
                border: none;
                padding: 8px 16px;
                border-radius: 5px;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.3s;
            }

            .ai-widget-input button:hover {
                background: #00cc6a;
            }

            @media (max-width: 768px) {
                .ai-widget-chat {
                    width: 300px;
                    height: 350px;
                }
            }
        `;

        // HTMLとスタイルを追加
        document.head.appendChild(style);
        document.body.insertAdjacentHTML('beforeend', widgetHTML);

        // イベントリスナーを追加
        this.addEventListeners();
    }

    addEventListeners() {
        const toggle = document.getElementById('ai-widget-toggle');
        const close = document.getElementById('ai-widget-close');
        const send = document.getElementById('ai-widget-send');
        const input = document.getElementById('ai-widget-input-field');

        toggle.addEventListener('click', () => this.toggleChat());
        close.addEventListener('click', () => this.closeChat());
        send.addEventListener('click', () => this.sendMessage());
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    toggleChat() {
        const chat = document.getElementById('ai-widget-chat');
        const toggle = document.getElementById('ai-widget-toggle');
        
        if (this.isOpen) {
            chat.style.display = 'none';
            toggle.style.display = 'flex';
        } else {
            chat.style.display = 'flex';
            toggle.style.display = 'none';
        }
        
        this.isOpen = !this.isOpen;
    }

    closeChat() {
        const chat = document.getElementById('ai-widget-chat');
        const toggle = document.getElementById('ai-widget-toggle');
        
        chat.style.display = 'none';
        toggle.style.display = 'flex';
        this.isOpen = false;
    }

    async sendMessage() {
        const input = document.getElementById('ai-widget-input-field');
        const message = input.value.trim();
        
        if (!message) return;

        // ユーザーメッセージを表示
        this.addMessage(message, 'user');
        input.value = '';

        // AI応答を取得
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            
            if (data.response) {
                this.addMessage(data.response, 'ai');
            } else {
                this.addMessage('申し訳ございません。応答を生成できませんでした。', 'ai');
            }
        } catch (error) {
            console.error('AI chat error:', error);
            this.addMessage('エラーが発生しました。もう一度お試しください。', 'ai');
        }
    }

    addMessage(text, sender) {
        const messages = document.getElementById('ai-widget-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${sender}`;
        messageDiv.textContent = text;
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
    }
}

// ページ読み込み時にウィジェットを初期化
document.addEventListener('DOMContentLoaded', function() {
    new AIWidget();
}); 