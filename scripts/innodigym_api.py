#!/usr/bin/env python3
"""Tiny stdlib client for power.renhesports.com. Credentials come from an env
file (INNODIGYM_EMAIL / INNODIGYM_PASSWORD), path via $INNODIGYM_ENV_FILE or
argv. Nothing secret is printed."""
import json, os, sys, urllib.request, urllib.error

BASE = "https://power.renhesports.com"


def load_env(path):
    env = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


class Client:
    def __init__(self, env_file=None):
        env_file = env_file or os.environ.get("INNODIGYM_ENV_FILE")
        if not env_file:
            sys.exit("set INNODIGYM_ENV_FILE or pass env file path")
        self.env = load_env(env_file)
        self.token = None

    def call(self, method, path, body=None, auth=True):
        sep = "&" if "?" in path else "?"
        url = f"{BASE}/api{path}{sep}languageId=en"
        data = json.dumps(body).encode() if body is not None else None
        h = {"Content-Type": "application/json"}
        if auth and self.token:
            h["Authorization"] = "Bearer " + self.token
        req = urllib.request.Request(url, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                code, raw = r.status, r.read()
        except urllib.error.HTTPError as e:
            code, raw = e.code, e.read()
        try:
            return code, json.loads(raw)
        except Exception:
            return code, raw.decode("utf8", "replace")[:500]

    def get(self, path): return self.call("GET", path)
    def post(self, path, body=None): return self.call("POST", path, body if body is not None else {})

    def login(self):
        code, res = self.call("POST", "/app/login", {
            "accountType": 2, "accountVal": self.env["INNODIGYM_EMAIL"],
            "password": self.env["INNODIGYM_PASSWORD"], "device": "Web",
            "deviceId": "innodigym-web-editor", "languageId": "en"}, auth=False)
        self.token = res["data"]["token"]
        return self
