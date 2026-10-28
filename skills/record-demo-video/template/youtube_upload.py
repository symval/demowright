#!/usr/bin/env python3
"""Upload video to YouTube as unlisted using OAuth2."""
import os, sys, pathlib, json, time
import warnings; warnings.filterwarnings('ignore')

SECRETS = str(pathlib.Path.home() / 'client_secrets.json')
TOKEN   = str(pathlib.Path.home() / 'youtube_token.json')
# Paths are relative to the demo project you run this from; override with env vars.
VIDEO   = os.environ.get('VIDEO_PATH', 'tmp/output/screen-recording-with-intro.mp4')
THUMB   = os.environ.get('THUMB_PATH', 'tmp/output/thumbnail.jpg')
SCOPES  = ['https://www.googleapis.com/auth/youtube.upload']

from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
import googleapiclient.discovery
import googleapiclient.http

# ── Auth ──────────────────────────────────────────────────────────────────────
creds = None
if pathlib.Path(TOKEN).exists():
    creds = Credentials.from_authorized_user_file(TOKEN, SCOPES)
if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        import webbrowser
        class _CaptureBrowser:
            def open(self, url, *a, **kw):
                pathlib.Path('/tmp/yt_auth_url.txt').write_text(url)
            def open_new(self, url): self.open(url)
            def open_new_tab(self, url): self.open(url)
        _orig_get = webbrowser.get
        webbrowser.get = lambda *a, **kw: _CaptureBrowser()
        flow = InstalledAppFlow.from_client_secrets_file(SECRETS, SCOPES)
        creds = flow.run_local_server(port=8484, open_browser=True,
                                       prompt='consent', access_type='offline')
        webbrowser.get = _orig_get
    pathlib.Path(TOKEN).write_text(creds.to_json())
    print("Token saved to", TOKEN)

# ── Upload ────────────────────────────────────────────────────────────────────
youtube = googleapiclient.discovery.build('youtube', 'v3', credentials=creds)

body = {
    'snippet': {
        'title': 'playwright-multi-tab: Control Any Chrome from CLI or AI Agent',
        'description': (
            'playwright-cli-multi-tab lets you control any running Chrome browser '
            'from the terminal or an AI agent — no browser relaunch needed.\n\n'
            'GitHub: https://github.com/snomiao/playwright-multi-tab'
        ),
        'tags': ['playwright', 'chrome', 'automation', 'cli', 'ai-agent', 'mcp'],
        'categoryId': '28',  # Science & Technology
    },
    'status': {'privacyStatus': 'unlisted', 'selfDeclaredMadeForKids': False},
}

media = googleapiclient.http.MediaFileUpload(VIDEO, chunksize=-1, resumable=True,
                                              mimetype='video/mp4')
req = youtube.videos().insert(part='snippet,status', body=body, media_body=media)

print(f"Uploading {pathlib.Path(VIDEO).name} ...")
response = None
while response is None:
    status, response = req.next_chunk()
    if status:
        pct = int(status.progress() * 100)
        print(f"  {pct}%", end='\r', flush=True)

video_id = response['id']
print(f"\nUploaded! Video ID: {video_id}")
print(f"URL: https://youtu.be/{video_id}")

# ── Thumbnail ─────────────────────────────────────────────────────────────────
if pathlib.Path(THUMB).exists():
    thumb_media = googleapiclient.http.MediaFileUpload(THUMB, mimetype='image/jpeg')
    youtube.thumbnails().set(videoId=video_id, media_body=thumb_media).execute()
    print("Thumbnail uploaded.")

print(f"\nhttps://studio.youtube.com/video/{video_id}/edit")
