#!/bin/bash

# ─────────────────────────────────────────────
# TicketingApp - Full Stack Startup Script
# Launches all 4 services in one terminal (4 tabs)
# Frontend server, Backend server, Django celery service, Django beat service
# ─────────────────────────────────────────────

PROJECT_ROOT="/home/silpc-011/Desktop/adwaith/TicketingApp"
FRONTEND_DIR="$PROJECT_ROOT/Frontend"
BACKEND_DIR="$PROJECT_ROOT/Backend"


# ── 1. Frontend ───────────────────────────────
gnome-terminal --tab --title="Frontend" -- bash -c "
  cd '$FRONTEND_DIR'
  export NVM_DIR=\"\$HOME/.nvm\"
  source \"\$NVM_DIR/nvm.sh\"
  nvm use
  npm run dev -- --host
  exec bash
"

sleep 0.5

# ── 2. Django Server ──────────────────────────
gnome-terminal --tab --title="Django Server" -- bash -c "
  cd '$BACKEND_DIR'
  source venv/bin/activate
  python3 manage.py runserver 0.0.0.0:8001
  exec bash
"

sleep 0.5

# ── 3. Celery Worker ──────────────────────────
gnome-terminal --tab --title="Celery Worker" -- bash -c "
  cd '$BACKEND_DIR'
  source venv/bin/activate
  celery -A Backend worker -l info
  exec bash
"

sleep 0.5

# ── 4. Celery Beat ────────────────────────────
gnome-terminal --tab --title="Celery Beat" -- bash -c "
  cd '$BACKEND_DIR'
  source venv/bin/activate
  celery -A Backend beat --loglevel=info
  exec bash
"

echo "✅ All 4 services launched in tabs!"
