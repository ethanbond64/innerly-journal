from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from flask_jwt_extended import JWTManager

from api.views import views
from api.extensions import db

load_dotenv()

def create_app():

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
