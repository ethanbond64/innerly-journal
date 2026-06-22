import os

from flask import Flask
from flask_cors import CORS

from flask_jwt_extended import JWTManager

from api.views import views
from api.extensions import db
from api.settings import INNERLY_DIRECTORY


def _ensure_innerly_layout():
    os.makedirs(os.path.join(INNERLY_DIRECTORY, 'imports'), exist_ok=True)
    os.makedirs(os.path.join(INNERLY_DIRECTORY, 'static'), exist_ok=True)
    db_path = os.path.join(INNERLY_DIRECTORY, 'database.db')
    if not os.path.exists(db_path):
        open(db_path, 'a').close()


def create_app():

    _ensure_innerly_layout()

    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object("api.settings")

    db.init_app(app)
    with app.app_context():
        # db.drop_all();
        db.create_all()

    JWTManager(app)
    CORS(
        app,
        resources={r"/*": {"origins": "*"}}, # TODO limit to frontend...?
        allow_headers=["Authorization", "Content-Type"],
        methods=["GET", "POST"],
        max_age=86400,
    )

    app.register_blueprint(views, url_prefix='/api')

    return app

# if __name__ == "__main__":
#     app = create_app()
#     app.run()
