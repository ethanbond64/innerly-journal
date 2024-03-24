from os import environ
from dotenv import load_dotenv

load_dotenv()

def safe_get_env_var(key):
    try:
        return environ[key]
    except KeyError:
        raise NameError(f"Missing {key} environment variable.")
