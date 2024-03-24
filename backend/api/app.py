##########################################
# External Modules
##########################################
from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from views import views

from flask_jwt_extended import JWTManager


from extensions import db
from utils import safe_get_env_var

load_dotenv()


def create_app():
    ##########################################
    # Environment Variables
    ##########################################
    client_origin_url = safe_get_env_var("CLIENT_ORIGIN_URL")


    ##########################################
    # Flask App Instance
    ##########################################

    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object("api.settings")

    ##########################################
    # Flask extensions
    ##########################################

    db.init_app(app)
    # with app.app_context():
    #     # db.drop_all();
    #     db.create_all()

    JWTManager(app)

    ##########################################
    # CORS
    ##########################################

    CORS(
        app,
        resources={r"/*": {"origins": client_origin_url}},
        allow_headers=["Authorization", "Content-Type"],
        methods=["GET", "POST"],
        max_age=86400,
    )

    ##########################################
    # Blueprint Registration
    ##########################################

    app.register_blueprint(views, url_prefix='/api')

    return app


liveapp = create_app()

if __name__ == "__main__":
    liveapp.run(debug=False, host="0.0.0.0", port=8000)
