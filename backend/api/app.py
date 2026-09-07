import os

from flask import Flask, send_from_directory
from werkzeug.exceptions import NotFound

from flask_jwt_extended import JWTManager

from api.views import views
from api.extensions import db
from api.settings import FRONTEND_DIRECTORY

def create_app():

    # static_folder is disabled because the frontend is served by serve_frontend
    # below, which needs to fall back to index.html for client-side routes.
    app = Flask(__name__, instance_relative_config=True, static_folder=None)
    app.config.from_object("api.settings")

    db.init_app(app)
    with app.app_context():
        # db.drop_all();
        db.create_all()

    JWTManager(app)

    app.register_blueprint(views, url_prefix='/api')

    # Serve the built frontend from the same origin as the API, so no CORS is needed.
    # Real files are served as-is; anything else falls through to index.html so that
    # deep links like /view/12 are handled by the client-side router.
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        # An unregistered /api route is a genuine 404, not a client-side route.
        # Without this it would fall through and return index.html with a 200.
        if path == 'api' or path.startswith('api/'):
            return {'message': 'Not found'}, 404

        try:
            return send_from_directory(FRONTEND_DIRECTORY, path)
        except NotFound:
            pass

        index = os.path.join(FRONTEND_DIRECTORY, 'index.html')
        if not os.path.isfile(index):
            return {'message': f'No frontend build at {FRONTEND_DIRECTORY}. '
                               'Run "npm run build" in frontend/.'}, 501

        return send_from_directory(FRONTEND_DIRECTORY, 'index.html')

    return app

# if __name__ == "__main__":
#     app = create_app()
#     app.run()
