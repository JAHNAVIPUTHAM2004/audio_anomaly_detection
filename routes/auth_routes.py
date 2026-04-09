from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required, current_user

from models import db
from models.user import User

auth_bp = Blueprint("auth", __name__, url_prefix="")

@auth_bp.get("/login")
def login():
    if current_user.is_authenticated:
        return redirect(url_for("pages.home"))
    return render_template("auth/login.html")

@auth_bp.post("/login")
def login_post():
    email = (request.form.get("email") or "").strip().lower()
    password = request.form.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        flash("Invalid email or password.", "error")
        return redirect(url_for("auth.login"))
    login_user(user)
    flash("Welcome back!", "success")
    return redirect(url_for("pages.home"))

@auth_bp.get("/register")
def register():
    if current_user.is_authenticated:
        return redirect(url_for("pages.home"))
    return render_template("auth/register.html")

@auth_bp.post("/register")
def register_post():
    name = (request.form.get("name") or "").strip()
    email = (request.form.get("email") or "").strip().lower()
    password = request.form.get("password") or ""
    confirm = request.form.get("confirm") or ""

    if not name or not email or not password:
        flash("All fields are required.", "error")
        return redirect(url_for("auth.register"))
    if password != confirm:
        flash("Passwords do not match.", "error")
        return redirect(url_for("auth.register"))
    if User.query.filter_by(email=email).first():
        flash("Email already registered. Please login.", "error")
        return redirect(url_for("auth.login"))

    user = User(name=name, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    flash("Account created. Please login.", "success")
    return redirect(url_for("auth.login"))

@auth_bp.get("/logout")
@login_required
def logout():
    logout_user()
    flash("Logged out successfully.", "success")
    return redirect(url_for("auth.login"))
