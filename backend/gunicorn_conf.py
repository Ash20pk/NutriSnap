"""
Gunicorn configuration for production deployment.
Optimized for VM deployment with systemd.
"""

import multiprocessing
import os

# Server socket
bind = "127.0.0.1:8000"  # Bind to localhost; nginx will reverse proxy

# Worker processes
workers = int(os.environ.get("WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000

# Timeouts
timeout = 120  # Worker timeout (seconds)
keepalive = 5  # Keep-alive connections
graceful_timeout = 30  # Graceful shutdown timeout

# Worker lifecycle
max_requests = 1000  # Restart workers after N requests (prevents memory leaks)
max_requests_jitter = 50  # Add randomness to prevent thundering herd

# Logging
accesslog = "-"  # Log to stdout (systemd will capture)
errorlog = "-"   # Log to stderr
loglevel = os.environ.get("LOG_LEVEL", "info").lower()
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "nutrisnap-api"

# Server mechanics
daemon = False  # Don't daemonize (systemd manages this)
pidfile = None  # No PID file needed with systemd
umask = 0o007
user = None  # Run as the user who starts gunicorn (systemd sets this)
group = None
tmp_upload_dir = None

# SSL (if terminating SSL at app level; usually nginx handles this)
# keyfile = None
# certfile = None

def on_starting(server):
    """Called just before the master process is initialized."""
    print(f"Starting Gunicorn with {workers} workers")

def on_reload(server):
    """Called to recycle workers during a reload via SIGHUP."""
    print("Reloading workers")

def worker_int(worker):
    """Called when a worker receives the SIGINT or SIGQUIT signal."""
    print(f"Worker {worker.pid} received INT/QUIT signal")

def worker_abort(worker):
    """Called when a worker receives the SIGABRT signal."""
    print(f"Worker {worker.pid} aborted")
