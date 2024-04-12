import os

DEBUG = False

# Flask
SECRET_KEY = os.getenv("SECRET_KEY")
SERVER_NAME = os.getenv("SERVER_NAME")

user_home = os.path.expanduser("~")
db_dir = os.path.join(user_home, '.innerly')

# Sqlalchemy
SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(db_dir, 'database.db')
SQLALCHEMY_TRACK_MODIFICATIONS = False
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_pre_ping': True,      # Check if the connection is alive before using it
    'pool_size': 3,             # Number of database connections in the pool
    'max_overflow': 6,          # Number of additional connections to allow when the pool is exhausted
    'pool_timeout': 10,         # Timeout in seconds to wait for a connection from the pool
    'pool_recycle': 3600,       # Automatically recycle connections after this time (in seconds)
    # 'max_retries': 3           # Number of times to retry a connection before giving up
}