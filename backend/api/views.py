from flask import Blueprint

views = Blueprint("views", __name__)

@views.route('/version')
def index():
    return {"version": "1.0.0"}, 200


@views.route('/<share>/signup', methods=['POST'])
def signup(share):
    return None

@views.route('/login', methods=['POST'])
def login():
    return None

@views.route('/update/users/<int:id>', methods=['POST'])
def update_user(id):
    return None

@views.route('/insert/entries', methods=['POST'])
def insert_entry():
    return None

@views.route('/update/entries/<int:id>', methods=['POST'])
def update_entry(id):
    return None

@views.route('/fetch/<table>', methods=['GET'])
def fetch(table):
    return None

# POST to put passcode in the body for locked entries.
@views.route('/fetch/entries/<int:id>', methods=['POST'])
def fetch_entry(id):
    return None