import os
import json

DEBUG = False

INNERLY_DIRECTORY = os.path.join(os.path.expanduser("~"), '.innerly')

config_vars = {}
with open(os.path.join(INNERLY_DIRECTORY, 'config.json'), 'r') as config:
    config_vars = json.load(config)
    print(config_vars)

# Flask
SECRET_KEY = config_vars.get("secret")
SERVER_NAME = config_vars.get("server")

# Sqlalchemy
SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(INNERLY_DIRECTORY, 'database.db')
SQLALCHEMY_TRACK_MODIFICATIONS = False
SQLALCHEMY_ENGINE_OPTIONS = {
    'pool_pre_ping': True,      # Check if the connection is alive before using it
    'pool_size': 3,             # Number of database connections in the pool
    'max_overflow': 6,          # Number of additional connections to allow when the pool is exhausted
    'pool_timeout': 10,         # Timeout in seconds to wait for a connection from the pool
    'pool_recycle': 3600,       # Automatically recycle connections after this time (in seconds)
    # 'max_retries': 3           # Number of times to retry a connection before giving up
}