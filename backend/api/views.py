from flask import Blueprint, render_template, url_for
from extensions import db

views = Blueprint("views", __name__)

@views.route('/')
def index():
    return render_template('index.html', ii=url_for('static', filename='pic.png'))
