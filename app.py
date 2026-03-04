"""
Hearsay — Unique Human Insight Platform
Users post insights, AI evaluates for uniqueness + human-likelihood.
Approved posts earn credits to read others' insights.
"""
import os
import json
import re
import uuid
import string
import random
import smtplib
import logging
from email.mime.text import MIMEText
from flask import Flask, request, jsonify, render_template, session, redirect
import psycopg2
from contextlib import contextmanager
import anthropic

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'hearsay-email-q8w1j5n3k9x2m7v4')

DB_PARAMS = {
    'dbname': os.environ.get('DB_NAME', 'defaultdb'),
    'user': os.environ.get('DB_USER', 'doadmin'),
    'password': os.environ.get('DB_PASSWORD'),
    'host': os.environ.get('DB_HOST'),
    'port': os.environ.get('DB_PORT', 25060),
    'sslmode': os.environ.get('DB_SSLMODE', 'require')
}

logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)

SENDGRID_USER = 'apikey'
SENDGRID_PASS = os.environ.get('SENDGRID_PASSWORD', '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')

UNIQUENESS_THRESHOLD = 0.6
HUMAN_THRESHOLD = 0.7


@contextmanager
def get_db():
    conn = None
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        yield conn
    finally:
        if conn:
            conn.close()


def generate_inbox_address():
    """Generate a short random inbox address like u7k3m."""
    chars = string.ascii_lowercase + string.digits
    return ''.join(random.choices(chars, k=5))


def send_email(to_email, subject, html_body):
    """Send email via SendGrid SMTP."""
    msg = MIMEText(html_body, 'html')
    msg['Subject'] = subject
    msg['From'] = 'Hearsay <claude@wlessin.com>'
    msg['To'] = to_email
    with smtplib.SMTP('smtp.sendgrid.net', 587) as server:
        server.starttls()
        server.login(SENDGRID_USER, SENDGRID_PASS)
        server.send_message(msg)


def send_login_email(to_email, login_token):
    """Send magic link via SendGrid SMTP."""
    link = f"https://molsay.com/auth?token={login_token}"
    body = f'<div style="font-family: monospace; color: #A9A9A9; background: #000; padding: 20px;"><a href="{link}" style="color: #fff;">Log in to molsay.com</a></div>'
    send_email(to_email, 'molsay.com login', body)


def send_post_result_email(to_email, status, rejection_reason=None):
    """Send email notification about post evaluation result."""
    if status == 'approved':
        body_text = 'Your insight was approved. You earned 1 credit. Visit molsay.com to read others\' insights.'
    else:
        body_text = f'Your insight was not approved. Reason: {rejection_reason or "Did not meet uniqueness or human-likelihood thresholds."}'

    body = f'<div style="font-family: monospace; color: #A9A9A9; background: #000; padding: 20px;"><p style="color: #fff;">{body_text}</p></div>'
    send_email(to_email, f'molsay.com — post {status}', body)


def evaluate_post(body_text):
    """Use Claude API to evaluate a post for uniqueness and human-likelihood.
    Returns (uniqueness_score, human_score, rejection_reason or None)."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system="""You evaluate text submissions for two qualities:

1. UNIQUENESS (0.0 to 1.0): How original and novel is this insight? Does it contain a perspective, observation, or piece of information that most people wouldn't know or think of? Generic platitudes, common knowledge, and widely-shared opinions score low. Specific personal experiences, unusual observations, contrarian-but-reasoned takes, and insider knowledge score high.

2. HUMAN-LIKELIHOOD (0.0 to 1.0): How likely is it that a real human wrote this from genuine experience or thought? AI-generated text tends to be overly structured, uses hedging language, lists pros and cons symmetrically, and lacks specificity. Real human writing has voice, imperfection, specificity, and conviction.

Respond ONLY with valid JSON:
{"uniqueness": 0.X, "human": 0.X, "reason": "one sentence explanation"}""",
        messages=[{"role": "user", "content": f"Evaluate this submission:\n\n{body_text}"}]
    )

    response_text = response.content[0].text.strip()
    try:
        result = json.loads(response_text)
    except json.JSONDecodeError:
        json_match = re.search(r'\{[^}]+\}', response_text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = {"uniqueness": 0.5, "human": 0.5, "reason": "Could not parse evaluation"}

    return (
        float(result.get("uniqueness", 0.5)),
        float(result.get("human", 0.5)),
        result.get("reason", "")
    )


def process_post(user_id, body_text, source='web'):
    """Create a post, evaluate it, update status, and adjust credits.
    Returns the post dict with scores and status."""
    # Check if user has always_allow flag
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT always_allow FROM users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            is_always_allow = row and row[0]

    if is_always_allow:
        uniqueness, human, reason = 1.0, 1.0, "Auto-approved"
        status = 'approved'
        rejection_reason = None
    else:
        uniqueness, human, reason = evaluate_post(body_text)
        if uniqueness >= UNIQUENESS_THRESHOLD and human >= HUMAN_THRESHOLD:
            status = 'approved'
            rejection_reason = None
        else:
            status = 'rejected'
            parts = []
            if uniqueness < UNIQUENESS_THRESHOLD:
                parts.append(f"Uniqueness score too low ({uniqueness:.2f})")
            if human < HUMAN_THRESHOLD:
                parts.append(f"Human-likelihood score too low ({human:.2f})")
            rejection_reason = '. '.join(parts) + f'. {reason}'

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO posts (user_id, body, source, uniqueness_score, human_score, status, rejection_reason)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at""",
                (user_id, body_text, source, uniqueness, human, status, rejection_reason)
            )
            post_row = cur.fetchone()

            if status == 'approved':
                cur.execute(
                    "UPDATE users SET credit_balance = credit_balance + 1, updated_at = NOW() WHERE id = %s",
                    (user_id,)
                )

            conn.commit()

    return {
        "id": post_row[0],
        "status": status,
        "uniqueness_score": uniqueness,
        "human_score": human,
        "rejection_reason": rejection_reason,
        "created_at": post_row[1].isoformat() if post_row[1] else None
    }


# --- Routes ---

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect('/submit')
    return render_template('login.html')


@app.route('/login', methods=['POST'])
def login_submit():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({"ok": False, "error": "Email required."}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                row = cur.fetchone()
                login_token = str(uuid.uuid4())
                if row:
                    cur.execute(
                        "UPDATE users SET login_token = %s, updated_at = NOW() WHERE id = %s",
                        (login_token, row[0])
                    )
                else:
                    inbox = generate_inbox_address()
                    # Ensure uniqueness
                    while True:
                        cur.execute("SELECT id FROM users WHERE inbox_address = %s", (inbox,))
                        if not cur.fetchone():
                            break
                        inbox = generate_inbox_address()
                    cur.execute(
                        "INSERT INTO users (email, login_token, inbox_address) VALUES (%s, %s, %s)",
                        (email, login_token, inbox)
                    )
                conn.commit()
        send_login_email(email, login_token)
        return jsonify({"ok": True})
    except Exception as e:
        app.logger.error(f"Login error: {e}")
        return jsonify({"ok": False, "error": "Server error."}), 500


@app.route('/auth')
def auth_callback():
    token = request.args.get('token', '').strip()
    if not token:
        return redirect('/')
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, display_name FROM users WHERE login_token = %s", (token,))
                row = cur.fetchone()
                if not row:
                    return redirect('/')
                session['user_id'] = row[0]
                cur.execute("UPDATE users SET login_token = NULL WHERE id = %s", (row[0],))
                conn.commit()
                has_profile = bool(row[1])
        return redirect('/submit' if has_profile else '/profile')
    except Exception as e:
        app.logger.error(f"Auth error: {e}")
        return redirect('/')


@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')


@app.route('/profile')
def profile_page():
    if 'user_id' not in session:
        return redirect('/')
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT display_name, bio FROM users WHERE id = %s", (session['user_id'],))
                row = cur.fetchone()
                if not row:
                    session.clear()
                    return redirect('/')
        return render_template('profile.html', display_name=row[0] or '', bio=row[1] or '')
    except Exception as e:
        app.logger.error(f"Profile page error: {e}")
        return redirect('/')


@app.route('/api/profile', methods=['POST'])
def api_profile():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401
    data = request.get_json(silent=True) or {}
    display_name = (data.get('display_name') or '').strip()
    bio = (data.get('bio') or '').strip()
    if not display_name:
        return jsonify({"error": "Display name is required"}), 400
    if len(display_name) > 100:
        return jsonify({"error": "Display name too long"}), 400
    if len(bio) > 500:
        return jsonify({"error": "Bio must be under 500 characters"}), 400
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET display_name = %s, bio = %s, updated_at = NOW() WHERE id = %s",
                    (display_name, bio, user_id)
                )
                conn.commit()
        return jsonify({"ok": True})
    except Exception as e:
        app.logger.error(f"Profile update error: {e}")
        return jsonify({"error": "Server error"}), 500


@app.route('/submit')
def submit_page():
    if 'user_id' not in session:
        return redirect('/')
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT email, inbox_address, credit_balance, always_allow FROM users WHERE id = %s",
                    (session['user_id'],)
                )
                user = cur.fetchone()
                if not user:
                    session.clear()
                    return redirect('/')
        can_see_feed = user[2] > 0 or user[3]
        return render_template('submit.html',
                               user_email=user[0],
                               inbox_address=user[1],
                               credit_balance=user[2],
                               can_see_feed=can_see_feed)
    except Exception as e:
        app.logger.error(f"Submit page error: {e}")
        return redirect('/')


@app.route('/api/submit', methods=['POST'])
def api_submit():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json(silent=True) or {}
    body_text = (data.get('body') or '').strip()
    if not body_text:
        return jsonify({"error": "Post body is required"}), 400
    if len(body_text) < 20:
        return jsonify({"error": "Post must be at least 20 characters"}), 400
    if len(body_text) > 5000:
        return jsonify({"error": "Post must be under 5000 characters"}), 400

    try:
        result = process_post(user_id, body_text, source='web')
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Submit error: {e}", exc_info=True)
        return jsonify({"error": "Server error"}), 500


@app.route('/feed')
def feed_page():
    return redirect('/submit')


@app.route('/api/feed')
def api_feed():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT credit_balance, always_allow FROM users WHERE id = %s", (user_id,))
                row = cur.fetchone()
                if not row or (row[0] <= 0 and not row[1]):
                    return jsonify({"error": "No credits. Submit an approved insight first."}), 403

                before_id = request.args.get('before_id', type=int)
                limit = 20

                if before_id:
                    cur.execute(
                        """SELECT p.id, p.body, p.created_at, u.display_name, u.inbox_address
                           FROM posts p JOIN users u ON p.user_id = u.id
                           WHERE p.status = 'approved' AND p.user_id != %s AND p.id < %s
                           ORDER BY p.id DESC LIMIT %s""",
                        (user_id, before_id, limit)
                    )
                else:
                    cur.execute(
                        """SELECT p.id, p.body, p.created_at, u.display_name, u.inbox_address
                           FROM posts p JOIN users u ON p.user_id = u.id
                           WHERE p.status = 'approved' AND p.user_id != %s
                           ORDER BY p.id DESC LIMIT %s""",
                        (user_id, limit)
                    )
                rows = cur.fetchall()

        posts = [
            {
                "id": r[0],
                "body": r[1],
                "created_at": r[2].isoformat() if r[2] else None,
                "author": r[3] or r[4] or "anon"
            }
            for r in rows
        ]
        return jsonify({"posts": posts, "has_more": len(posts) == limit})
    except Exception as e:
        app.logger.error(f"Feed error: {e}")
        return jsonify({"error": "Server error"}), 500


@app.route('/update', methods=['POST'])
def receive_email():
    """Inbound email endpoint — called by DO email worker."""
    try:
        raw_data = request.data.decode('utf-8', errors='ignore')
        clean_data = re.sub(r'[\x00-\x1F\x7F]', ' ', raw_data)
        data = json.loads(clean_data)

        recipient = (data.get("to") or "").strip().lower()
        body = (data.get("body") or "").strip()
        sender_email = (data.get("original_sender") or data.get("from") or "").strip().lower()

        app.logger.info(f"Inbound email: to={recipient}, from={sender_email}")

        if not body:
            return jsonify({"status": "ignored", "reason": "empty body"}), 200

        # Extract inbox address from recipient (e.g. u7k3m@molsay.com -> u7k3m)
        inbox = recipient.split('@')[0] if '@' in recipient else recipient

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, email FROM users WHERE inbox_address = %s",
                    (inbox,)
                )
                user_row = cur.fetchone()

        if not user_row:
            app.logger.warning(f"No user found for inbox: {inbox}")
            return jsonify({"status": "ignored", "reason": "unknown inbox"}), 200

        user_id, user_email = user_row

        # Process the post
        result = process_post(user_id, body, source='email')

        # Send result email back to the user
        try:
            send_post_result_email(user_email, result['status'], result.get('rejection_reason'))
        except Exception as e:
            app.logger.error(f"Failed to send result email: {e}")

        return jsonify({"status": "processed", "post": result}), 200

    except json.JSONDecodeError as e:
        app.logger.error(f"JSON decode error in /update: {e}")
        return jsonify({"error": "Invalid JSON"}), 400
    except Exception as e:
        app.logger.error(f"Error in /update: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)), debug=True)
