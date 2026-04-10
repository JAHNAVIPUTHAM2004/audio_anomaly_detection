import os
from flask import Flask, render_template
from flask_login import LoginManager

from config import Config
from models import db
from models.user import User

from routes.auth_routes import auth_bp
from routes.pages_routes import pages_bp
from routes.api_routes import api_bp


def create_app():
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)

    
    from tensorflow.keras.models import load_model
    try:
        app.model = load_model(
            "FINAL_audio_event_model.keras",
            compile=False,
            safe_mode=False
        )
        print(" Model loaded successfully")
    except Exception as e:
        print(" Model loading failed:", e)

   
    db.init_app(app)
    with app.app_context():
        db.create_all()

  
    login_manager = LoginManager(app)
    login_manager.login_view = "auth.login"

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

  
    app.register_blueprint(auth_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)

  
    @app.errorhandler(404)
    def not_found(e):
        return render_template("errors/404.html"), 404

    @app.errorhandler(500)
    def server_error(e):
        return render_template("errors/500.html"), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)