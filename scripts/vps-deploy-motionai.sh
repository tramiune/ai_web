#!/usr/bin/env bash
# Deploy motionaistudio bot lên VPS (chạy từ Mac).
set -euo pipefail

VPS_USER="${VPS_USER:-root}"
VPS_HOST="${VPS_HOST:-165.101.46.68}"
SRC="${SRC:-$HOME/Documents/Tramiune/ai_web}"
REMOTE_DIR="${REMOTE_DIR:-ai_web}"

echo "==> Rsync $SRC → $VPS_USER@$VPS_HOST:~/$REMOTE_DIR (giữ .env trên VPS)"
rsync -az --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '__pycache__' \
  --exclude 'node_modules' \
  --exclude 'bot_chrome_profile' \
  --exclude '.idea' \
  --exclude 'bot_launchd.log' \
  --exclude 'bot_restart.log' \
  --exclude 'videoaieasy_session_*.json' \
  --exclude 'xiaoyang_session_*.json' \
  --exclude 'roboneo_session_*.json' \
  "$SRC/" "$VPS_USER@$VPS_HOST:~/$REMOTE_DIR/"

echo "==> Restart bot trên VPS"
ssh "$VPS_USER@$VPS_HOST" bash -lc "
  set -e
  cd ~/$REMOTE_DIR
  python3 -m py_compile bot.py roboneo_motion.py xiaoyang_motion.py account_pool.py
  pkill -f 'python3.*bot.py --name motionai_vps_bot' 2>/dev/null || true
  tmux kill-session -t bot-motionai-http 2>/dev/null || true
  sleep 1
  tmux new-session -d -s bot-motionai-http bash -lc 'cd ~/$REMOTE_DIR && set -a && source .env && set +a && PYTHONUNBUFFERED=1 python3 bot.py --name motionai_vps_bot --mode http'
  sleep 10
  tmux capture-pane -t bot-motionai-http -p | tail -25
"

echo "==> Xong. Log: ssh $VPS_USER@$VPS_HOST 'tmux attach -t bot-motionai-http'"
