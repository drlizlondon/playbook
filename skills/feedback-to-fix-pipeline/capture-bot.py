#!/usr/bin/env python3
"""
Feedback capture bot — phone → a plain Markdown inbox file.

Long-polls the Telegram Bot API (getUpdates — NOT a webhook: no public inbound
port, no infra to host) for messages from a single allowed chat_id, appends each
one to your inbox file under its "## Open" section, and replies with a one-line
confirmation. Text messages and screenshots-with-captions are captured; anything
it can't capture is answered so it is never silently dropped.

Python 3 standard library only (urllib, json, ...) — zero installs required.

Usage:
    python3 capture-bot.py            # run the long-poll loop (needs config.local.json)
    python3 capture-bot.py --selftest # offline test of the file/offset/parse logic —
                                       # no network, no token, never writes the real inbox.

Config (config.local.json — copy config.example.json, never commit it):
    { "bot_token": "...", "allowed_chat_id": 123456789,
      "inbox_path": "~/notes/FEEDBACK-INBOX.md" }   # the file must contain a "## Open" heading
Optional: "photo_dir" (defaults to a "photos/" folder next to this script).
"""

import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SERVICE_DIR, "config.local.json")
OFFSET_PATH = os.path.join(SERVICE_DIR, "offset.local.txt")
API_BASE = "https://api.telegram.org/bot{token}/{method}"
FILE_BASE = "https://api.telegram.org/file/bot{token}/{file_path}"

POLL_TIMEOUT = 30      # seconds — Telegram long-poll wait
RETRY_BACKOFF = 5      # seconds — pause after a transient network/API error

OPEN_MARKER = "## Open"
BOUNDARY_RE = re.compile(r"\n(---\s*\n|## )")


# --------------------------------------------------------------------------
# Inbox file logic (pure functions — this is what --selftest exercises)
# --------------------------------------------------------------------------

def append_to_inbox(inbox_path, text, when=None):
    """Append one feedback line to the end of the '## Open' section (just above
    its closing '---' divider, or the next '## ' heading if no divider exists),
    preserving every other byte of the file untouched. Returns the line written.
    """
    when = when or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = "- \U0001F195 {} · {}".format(when, text)  # 🆕 ... ·

    with open(inbox_path, "r", encoding="utf-8") as f:
        content = f.read()

    if OPEN_MARKER not in content:
        raise ValueError("{} has no '{}' section".format(inbox_path, OPEN_MARKER))

    open_idx = content.index(OPEN_MARKER)
    after_heading = open_idx + len(OPEN_MARKER)
    section = content[after_heading:]

    boundary = BOUNDARY_RE.search(section)
    insert_at = after_heading + boundary.start() + 1 if boundary else len(content)

    before, after = content[:insert_at], content[insert_at:]
    before = before.rstrip("\n") + "\n\n"
    new_content = before + line + "\n\n" + after

    with open(inbox_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    return line


def extract_message_content(message):
    """Return (text, photo_file_id) for a Telegram message. Pure — no network.

    text: message.text, or a photo/document caption, or None.
    photo_file_id: the largest photo size's file_id, or an image document's
                   file_id, or None. This is what lets a screenshot-with-caption
                   (often the clearest bug report) be captured instead of dropped.
    """
    text = message.get("text") or message.get("caption")

    photo_file_id = None
    photos = message.get("photo")
    if photos:  # a list of PhotoSize, ascending by resolution — take the largest
        photo_file_id = photos[-1].get("file_id")
    else:
        doc = message.get("document") or {}
        if str(doc.get("mime_type", "")).startswith("image/"):
            photo_file_id = doc.get("file_id")

    return text, photo_file_id


def load_offset(path=None):
    path = path or OFFSET_PATH
    if os.path.exists(path):
        text = open(path, "r").read().strip()
        if text:
            return int(text)
    return 0


def save_offset(offset, path=None):
    path = path or OFFSET_PATH
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(str(offset))
    os.replace(tmp, path)


def confirmation_text(message_text):
    return "Logged ✓ — {}".format(message_text[:40])  # Logged ✓ — <40 chars>


# --------------------------------------------------------------------------
# Telegram API (thin wrapper over urllib — the one network dependency)
# --------------------------------------------------------------------------

def log(msg):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print("[{}] {}".format(stamp, msg), flush=True)


def telegram_api(token, method, params=None, timeout=35):
    url = API_BASE.format(token=token, method=method)
    data = urllib.parse.urlencode(params).encode("utf-8") if params is not None else None
    req = urllib.request.Request(url, data=data)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def send_message(token, chat_id, text):
    telegram_api(token, "sendMessage", {"chat_id": chat_id, "text": text})


def download_photo(token, file_id, when, photo_dir):
    """Download a photo/image-document by file_id into photo_dir, named by the
    message timestamp. Returns the saved absolute path. The token is used only in
    the outbound URL to Telegram's own file server; never logged."""
    meta = telegram_api(token, "getFile", {"file_id": file_id})
    if not meta.get("ok"):
        raise RuntimeError("getFile failed: {}".format(meta))
    file_path = meta["result"]["file_path"]

    ext = os.path.splitext(file_path)[1] or ".jpg"
    stamp = when.replace(":", "").replace("-", "")
    os.makedirs(photo_dir, exist_ok=True)
    dest = os.path.join(photo_dir, "screenshot-{}{}".format(stamp, ext))

    url = FILE_BASE.format(token=token, file_path=file_path)
    with urllib.request.urlopen(urllib.request.Request(url), timeout=60) as resp, open(dest, "wb") as out:
        shutil.copyfileobj(resp, out)
    return dest


# --------------------------------------------------------------------------
# Main loop
# --------------------------------------------------------------------------

def load_config():
    if not os.path.exists(CONFIG_PATH):
        raise SystemExit(
            "Missing {}. Copy config.example.json to config.local.json and fill in "
            "bot_token + allowed_chat_id + inbox_path.".format(CONFIG_PATH)
        )
    with open(CONFIG_PATH, "r") as f:
        cfg = json.load(f)
    for key in ("bot_token", "allowed_chat_id", "inbox_path"):
        if not cfg.get(key):
            raise SystemExit("config.local.json must set bot_token, allowed_chat_id and inbox_path.")
    cfg["inbox_path"] = os.path.expanduser(cfg["inbox_path"])
    cfg["photo_dir"] = os.path.expanduser(cfg.get("photo_dir") or os.path.join(SERVICE_DIR, "photos"))
    return cfg


def process_update(cfg, update):
    message = update.get("message") or update.get("edited_message")
    if not message:
        return  # non-message update type — ignore

    chat_id = message.get("chat", {}).get("id")
    if str(chat_id) != str(cfg["allowed_chat_id"]):
        log("ignored message from unrecognised chat_id={}".format(chat_id))
        return

    text, photo_file_id = extract_message_content(message)

    if not text and not photo_file_id:
        # Voice/audio/sticker/etc — not captured. Reply so it is NEVER silently
        # dropped: that silence is exactly how feedback dies.
        log("ignored message with no text/caption/photo (voice/sticker/etc — out of scope)")
        if message.get("voice") or message.get("audio") or message.get("video_note"):
            try:
                send_message(cfg["bot_token"], chat_id,
                             "Voice notes aren't captured — send it as text, or a "
                             "screenshot with a caption, and it'll be logged.")
            except Exception as e:
                log("WARNING: failed to send voice-note nudge: {}".format(e))
        return

    when = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    base_dir = os.path.dirname(cfg["inbox_path"])

    photo_ref = None
    if photo_file_id:
        try:
            dest = download_photo(cfg["bot_token"], photo_file_id, when, cfg["photo_dir"])
            photo_ref = os.path.relpath(dest, base_dir)
            log("saved screenshot: {}".format(dest))
        except Exception as e:
            log("WARNING: failed to download photo: {}".format(e))

    parts = []
    if text:
        parts.append(text)
    if photo_ref:
        parts.append("\U0001F4CE screenshot: {}".format(photo_ref))  # 📎
    entry_text = " · ".join(parts) if parts else "(screenshot received; download failed — resend?)"

    line = append_to_inbox(cfg["inbox_path"], entry_text, when=when)
    log("logged: {}".format(line))

    try:
        send_message(cfg["bot_token"], chat_id, confirmation_text(entry_text))
    except Exception as e:
        log("WARNING: failed to send confirmation reply: {}".format(e))


def run():
    cfg = load_config()
    token = cfg["bot_token"]
    offset = load_offset()
    log("starting long-poll loop, offset={}, allowed_chat_id={}, inbox={}".format(
        offset, cfg["allowed_chat_id"], cfg["inbox_path"]))

    while True:
        try:
            result = telegram_api(token, "getUpdates", {
                "offset": offset,
                "timeout": POLL_TIMEOUT,
                "allowed_updates": json.dumps(["message", "edited_message"]),
            }, timeout=POLL_TIMEOUT + 10)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
            log("WARNING: getUpdates failed ({}); retrying in {}s".format(e, RETRY_BACKOFF))
            time.sleep(RETRY_BACKOFF)
            continue

        if not result.get("ok"):
            log("WARNING: Telegram API error: {}; retrying in {}s".format(result, RETRY_BACKOFF))
            time.sleep(RETRY_BACKOFF)
            continue

        for update in result.get("result", []):
            try:
                process_update(cfg, update)
            except Exception as e:
                log("ERROR processing update {}: {}".format(update.get("update_id"), e))
            offset = update["update_id"] + 1
            save_offset(offset)


# --------------------------------------------------------------------------
# Self-test — offline, no token, no network, never touches a real inbox
# --------------------------------------------------------------------------

def selftest():
    print("Running offline self-test (no network, no token, no real-inbox writes)...")
    ok = True
    fake = "Selftest: a fake feedback line"

    tmp_fd, tmp = tempfile.mkstemp(prefix="feedback-inbox-selftest-", suffix=".md")
    os.close(tmp_fd)
    try:
        with open(tmp, "w") as f:
            f.write("## Open\n\n---\n\n## Done\n")
        before = open(tmp, encoding="utf-8").read()
        line = append_to_inbox(tmp, fake)
        after = open(tmp, encoding="utf-8").read()
        assert line.startswith("- \U0001F195 "), "missing 🆕 marker: {!r}".format(line)
        assert fake in line and line in after and line not in before, "append wrong"
        assert after.index(OPEN_MARKER) < after.index(line), "line landed before '## Open'"
        assert len(after) == len(before) + len(line) + 2, "append changed too much"
        print("  [PASS] append_to_inbox: {}".format(line))
    except Exception as e:
        ok = False
        print("  [FAIL] append_to_inbox: {}".format(e))
    finally:
        os.remove(tmp)

    tmp_fd, tmp_off = tempfile.mkstemp(prefix="offset-selftest-")
    os.close(tmp_fd)
    try:
        save_offset(42, path=tmp_off)
        assert load_offset(path=tmp_off) == 42, "offset round-trip failed"
        print("  [PASS] offset persisted+reloaded")
    except Exception as e:
        ok = False
        print("  [FAIL] offset: {}".format(e))
    finally:
        os.remove(tmp_off)

    try:
        assert confirmation_text(fake) == "Logged ✓ — {}".format(fake[:40]), "confirm wrong"
        t, p = extract_message_content({"text": "plain"})
        assert t == "plain" and p is None
        t, p = extract_message_content({"caption": "cap", "photo": [{"file_id": "s"}, {"file_id": "L"}]})
        assert t == "cap" and p == "L", "should use caption + largest photo"
        t, p = extract_message_content({"document": {"mime_type": "image/png", "file_id": "D"}})
        assert t is None and p == "D", "image-document extraction wrong"
        t, p = extract_message_content({"voice": {"file_id": "v"}})
        assert t is None and p is None, "voice should be ignored"
        print("  [PASS] confirmation + extract_message_content (text / photo+caption / image-doc / ignore)")
    except Exception as e:
        ok = False
        print("  [FAIL] parsing: {}".format(e))

    print()
    print("Self-test PASSED. Real inbox untouched." if ok else "Self-test FAILED.")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else run()
