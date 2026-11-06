"""Run from any directory: python cd5_tron/cinematic/record.py"""
import argparse
import functools
import json
import math
import shutil
import subprocess
import threading
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser(description="Quay camera gimbal Chu de 5")
    parser.add_argument("--url", help="Existing room URL; otherwise start a local server")
    parser.add_argument("--script", type=Path, default=Path(__file__).with_name("tour.json"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("videos"))
    parser.add_argument("--speed", type=float, default=1)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--smoke", action="store_true", help="Short playback + inspect every camera stop")
    args = parser.parse_args()
    if not math.isfinite(args.speed) or not .05 <= args.speed <= 100:
        parser.error("--speed must be between 0.05 and 100")
    if args.width <= 0 or args.height <= 0:
        parser.error("Video dimensions must be positive")
    script = json.loads(args.script.read_text(encoding="utf-8-sig"))
    output = args.output.resolve() / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    output.mkdir(parents=True)
    server = None
    try:
        url = args.url
        if not url:
            root = Path(__file__).resolve().parents[2]
            handler = functools.partial(QuietHandler, directory=str(root))
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            url = f"http://127.0.0.1:{server.server_port}/cd5_tron/index.html"
        parts = urlsplit(url)
        query = dict(parse_qsl(parts.query))
        query.pop("autoplay", None)
        query["cinematic"] = "1"
        url = urlunsplit(parts._replace(query=urlencode(query)))
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=args.headless)
            size = {"width": args.width, "height": args.height}
            context = browser.new_context(viewport=size, device_scale_factor=1,
                                          record_video_dir=str(output), record_video_size=size)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            video = page.video
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=120_000)
                page.wait_for_function("window.cameraTour || window.cameraTourError", timeout=180_000)
                error = page.evaluate("window.cameraTourError")
                if error:
                    raise RuntimeError(error)
                page.wait_for_function("!document.querySelector('#btn-start').disabled", timeout=180_000)
                page.evaluate("document.fonts.ready")
                print("Assets loaded. Clicking VAO PHONG...", flush=True)
                page.locator("#btn-start").click(timeout=30_000)
                page.wait_for_function("document.querySelector('#blocker').hidden", timeout=30_000)
                print("Entered room. Preparing camera...", flush=True)
                page.evaluate("script => cameraTour.load(script)", script)
                # Move the OS cursor away from portraits before recording the tour.
                page.mouse.move(0, 0)
                page.wait_for_timeout(500)
                timing = page.evaluate("speed => { const status = cameraTour.play({speed}); return {...status, videoStart: performance.now()/1000}; }", args.speed)
                print(f"Tour: {len(script['shots'])} portraits, {timing['duration']/args.speed:.1f} seconds", flush=True)
                if args.smoke:
                    page.wait_for_timeout(1200)
                    assert page.evaluate("cameraTour.status().elapsed") > 0, "Camera is not advancing"
                    targets = page.evaluate("cameraTour.getTargets()")
                    assert len(targets) == 61
                    # Read poses at every arrival, including both sides of the central pillar.
                    arrivals = page.evaluate("""async script => {
                        const {compileTour} = await import('./scripts/v2-5/runtime/camera-tour.js');
                        return compileTour(script,cameraTour.getTargets()).shots.map(s=>s.arrival);
                    }""", script)
                    for index, arrival in enumerate(arrivals):
                        status = page.evaluate("t => cameraTour.seek(t)", arrival)
                        assert status["target"] == script["shots"][index]["target"]
                        if index in [0, 18, 19, 31, 32, 46, 60]:
                            page.wait_for_timeout(100)
                            page.screenshot(path=str(output / f"portrait-{index+1:02d}.png"))
                    # Verify actions through the real modal and click handlers.
                    action_script = {"shots": [
                        {"target": "DU-01", "hold": .3, "actions": [{"type": "open-profile", "target": "DU-01"},
                            {"type": "click", "selector": ".tb[data-t='bio']"}]},
                        {"target": "DU-02", "move": .2, "hold": .2, "actions": [{"type": "close-profile"}]}
                    ]}
                    page.evaluate("script => { cameraTour.load(script); cameraTour.play(); }", action_script)
                    assert page.locator("#modal-wrap").evaluate("el => el.classList.contains('open')")
                    assert page.locator("#tp-bio").evaluate("el => el.classList.contains('on')")
                    page.wait_for_function("cameraTour.status().state === 'complete'", timeout=10_000)
                    assert not page.locator("#modal-wrap").evaluate("el => el.classList.contains('open')")
                    page.evaluate("cameraTour.stop()")
                    assert not page.locator("body").evaluate("el => el.classList.contains('cinematic-active')")
                    print("Smoke passed: all 61 stops, playback, modal actions, restore.", flush=True)
                else:
                    page.wait_for_function("cameraTour.status().state === 'complete'",
                                           timeout=int((timing["duration"] / args.speed + 120) * 1000))
                    page.wait_for_timeout(500)
                if errors:
                    raise RuntimeError("Browser errors: " + "; ".join(errors))
                (output / "timing.json").write_text(json.dumps(timing, indent=2), encoding="utf-8")
            except Exception:
                page.screenshot(path=str(output / "error.png"), timeout=10_000)
                raise
            finally:
                context.close()  # Flush video before saving.
                video.save_as(output / "room-raw.webm")
                raw = video.path()
                if raw != output / "room-raw.webm":
                    raw.unlink(missing_ok=True)
                browser.close()
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg and not args.smoke:
            subprocess.run([ffmpeg, "-y", "-ss", str(timing["videoStart"]), "-i", str(output / "room-raw.webm"),
                            "-t", str(timing["duration"] / args.speed), "-c:v", "libx264", "-crf", "18",
                            "-pix_fmt", "yuv420p", str(output / "room.mp4")], check=True)
        print(f"Saved: {output}", flush=True)
        if not ffmpeg and not args.smoke:
            print("room-raw.webm includes loading. timing.json records the tour start; install FFmpeg for auto-trimmed MP4.")
    finally:
        if server:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
