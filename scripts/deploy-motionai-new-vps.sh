#!/usr/bin/env bash
# Deploy motionaistudio bot (ai_web + RoboNeo) lên VPS mới.
set -euo pipefail

VPS_HOST="${VPS_HOST:-165.101.46.68}"
VPS_USER="${VPS_USER:-root}"
VPS_PASS="${VPS_PASS:?Set VPS_PASS}"
SRC="${SRC:-$HOME/Documents/Tramiune/ai_web}"
REMOTE_DIR="${REMOTE_DIR:-/root/ai_web}"

if ! command -v expect >/dev/null; then
  echo "Cần expect (macOS có sẵn)."
  exit 1
fi

echo "==> Dừng bot motionai trên VPS cũ (nếu SSH được)..."
ssh -o ConnectTimeout=12 -o BatchMode=yes hoang1432001@136.119.193.255 \
  'pkill -f "bot.py --name motionai_vps_bot" 2>/dev/null || true; tmux kill-session -t bot-motionai-http 2>/dev/null || true' \
  2>/dev/null || echo "(bỏ qua VPS cũ)"

export VPS_HOST VPS_USER VPS_PASS SRC REMOTE_DIR

echo "==> SSH kiểm tra VPS mới $VPS_USER@$VPS_HOST ..."
expect <<'EXPECT_EOF'
set timeout 60
spawn ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${env(VPS_USER)}@${env(VPS_HOST)} "echo SSH_OK && uname -a"
expect {
  "password:" { send "$env(VPS_PASS)\r"; exp_continue }
  "Password:" { send "$env(VPS_PASS)\r"; exp_continue }
  "SSH_OK" { }
  timeout { exit 1 }
}
expect eof
EXPECT_EOF

echo "==> Cài package cơ bản trên VPS ..."
expect <<'EXPECT_EOF'
set timeout 600
spawn ssh -o StrictHostKeyChecking=no ${env(VPS_USER)}@${env(VPS_HOST)} {bash -s}
expect "password:" { send "$env(VPS_PASS)\r" }
expect "Password:" { send "$env(VPS_PASS)\r" }
expect -re {\$ |# }
send "export DEBIAN_FRONTEND=noninteractive\r"
expect -re {\$ |# }
send "apt-get update -qq && apt-get install -y -qq python3 python3-pip python3-venv git rsync ffmpeg\r"
expect -re {\$ |# }
send "mkdir -p ${env(REMOTE_DIR)}\r"
expect -re {\$ |# }
send "exit\r"
expect eof
EXPECT_EOF

echo "==> Rsync code ai_web ..."
expect <<'EXPECT_EOF'
set timeout 900
spawn rsync -az --delete --exclude .git --exclude __pycache__ --exclude node_modules --exclude bot_chrome_profile --exclude .env --exclude roboneo_session_*.json --exclude videoaieasy_session_*.json --exclude xiaoyang_session_*.json -e {ssh -o StrictHostKeyChecking=no} $env(SRC)/ ${env(VPS_USER)}@${env(VPS_HOST)}:${env(REMOTE_DIR)}/
expect {
  "password:" { send "$env(VPS_PASS)\r"; exp_continue }
  "Password:" { send "$env(VPS_PASS)\r"; exp_continue }
  eof
}
EXPECT_EOF

echo "==> Tạo .env + pip + start bot ..."
expect <<'EXPECT_EOF'
set timeout 900
spawn ssh -o StrictHostKeyChecking=no ${env(VPS_USER)}@${env(VPS_HOST)} {bash -s}
expect "password:" { send "$env(VPS_PASS)\r" }
expect "Password:" { send "$env(VPS_PASS)\r" }
expect -re {\$ |# }
send "cd ${env(REMOTE_DIR)}\r"
expect -re {\$ |# }
send "cat > .env << 'ENVEOF'\r"
send "AIDANCING_COOKIE=_ga=GA1.1.523989504.1779936438; JSESSIONID=25760116572891E716815F16E7B37687; _ga_QRSCBTW806=GS2.1.s1780302413\$o10\$g1\$t1780302715\$j58\$l0\$h0\r"
send "XIAOYANG_API_KEYS=xy_ko9hMsOmczIfQgBeO6zv5Z9QqzR_QnMPHwOzFNmhmz8,xy_YArPW-t5vz1aZzPlBFddH8i1Lu9C8Y5rJeSN5KUqbJ0,xy_xrhgUR-HgUMCAelwb6hWee0ABRCgeBfLhZsIOG7-1Gg,xy_AruOOUmWLnuRfY8832XvvDbLEKmZN1RH_mo43pRXCyY\r"
send "XIAOYANG_DIRECT_WORKER_URL=https://xiaoyang-direct-media.traderfinn0312.workers.dev\r"
send "XIAOYANG_OPTION_KEY=default\r"
send "XIAOYANG_MOTION_ORIENTATION=video\r"
send "XIAOYANG_ACCOUNTS=traderfinn0312@gmail.com:123456,motionaistudio4@gmail.com:123456\r"
send "XIAOYANG_MAX_CONCURRENT=4\r"
send "XIAOYANG_ENHANCE_4K=1\r"
send "VIDEOAIEASY_EMAIL=motionaistudio@gmail.com\r"
send "VIDEOAIEASY_PASSWORD=123456\r"
send "ROBONEO_PROXY_KEY=UK-99db4602-8770-4327-a1cf-df479b9f0868\r"
send "ROBONEO_PROXY_PROVINCE_ID=3\r"
send "ROBONEO_ALLOW_DIRECT=1\r"
send "ROBONEO_SURFACE=team_studio\r"
send "ROBONEO_QUALITY_MODEL=v26\r"
send "ROBONEO_MOTION_MODE=std\r"
send "ROBONEO_CREDITS_PER_15S=115\r"
send "PROXY_ROTATE_COOLDOWN_SEC=60\r"
send "ROBONEO_MAX_CONCURRENT=2\r"
send "ROBONEO_MIN_RENDER_SEC=300\r"
send "ROBONEO_PROMPT=Follow the reference motion naturally\r"
send "HUANAIHUB_USERNAME=kaling\r"
send "HUANAIHUB_PASSWORD=123456\r"
send "HUANAIHUB_PRODUCT_ID=138\r"
send "BOT_MIN_RENDER_SEC=300\r"
send "TELEGRAM_BOT_TOKEN=8676046240:AAE14lDxAj9otGTjVnd8Smr2__Wg-J2dCLc\r"
send "TELEGRAM_CHAT_ID=6067707939\r"
send "R2_ACCOUNT_ID=63d845717fabfd98a4a3eb9f44600095\r"
send "R2_ACCESS_KEY_ID=14163ab4f5a2e66914802f4ced7ecb76\r"
send "R2_SECRET_ACCESS_KEY=9e663717b8fdfc80c36250ae0a39cfca8703ec0b7d6284dd486a20dc7be4bae1\r"
send "R2_BUCKET_NAME=ai-web\r"
send "R2_PUBLIC_BASE=https://pub-4496e76c4ba34c28980998855e485fbd.r2.dev\r"
send "R2_WORKER_MAX_BYTES=94371840\r"
send "ENVEOF\r"
expect -re {\$ |# }
send "pip3 install -q -r requirements.txt\r"
expect -re {\$ |# }
send "python3 -m py_compile bot.py roboneo_motion.py xiaoyang_motion.py account_pool.py bot_singleton.py\r"
expect -re {\$ |# }
send "bash scripts/run-bot-single.sh motionai_vps_bot --mode http\r"
expect -re {\$ |# }
send "sleep 12 && pgrep -af 'bot.py --name motionai_vps_bot' && tail -25 bot_restart.log\r"
expect -re {\$ |# }
send "exit\r"
expect eof
EXPECT_EOF

echo "==> Xong. Log: ssh root@$VPS_HOST 'tail -f $REMOTE_DIR/bot_restart.log'"
