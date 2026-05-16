"""
Gunicorn configuration for production (Render / Railway).

Render free tier: 512 MB RAM, shared CPU.
Keep workers at 2 to avoid OOM — increase when you upgrade the plan.
"""
import os
import multiprocessing

# Bind to the PORT provided by Render / Railway (defaults to 8000 locally)
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# 2 workers for free tier; (2 × CPU + 1) for paid plans
workers = int(os.environ.get('WEB_CONCURRENCY', min(multiprocessing.cpu_count() * 2 + 1, 2)))

# Sync worker is the safest default — switch to 'gevent' if you add async I/O
worker_class = 'sync'

# Kill and restart a worker if it takes longer than this (seconds)
timeout = 120

# How long to wait for requests on a Keep-Alive connection
keepalive = 5

# Graceful restart: recycle workers after N requests to prevent memory leaks
max_requests       = 1000
max_requests_jitter = 50   # randomize so all workers don't restart simultaneously

# Logging — let Render / Railway capture stdout/stderr
accesslog  = '-'
errorlog   = '-'
loglevel   = os.environ.get('LOG_LEVEL', 'info')

# Forward the real client IP from Render's load balancer
forwarded_allow_ips = '*'
proxy_protocol      = False
