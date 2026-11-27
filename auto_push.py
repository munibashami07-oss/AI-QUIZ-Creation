
import time
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

PROJECT_DIR = Path(__file__).resolve().parent
DELAY = 5

IGNORE = {
    ".git", "venv", "__pycache__", ".env",
    ".pytest_cache", ".idea", ".vscode"
}

def run_git(*args):
    return subprocess.run(
        ["git", *args],
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True
    )

class ChangeHandler(FileSystemEventHandler):
    def __init__(self):
        self.last_change = 0
        self.pending = False

    def on_any_event(self, event):
        if event.is_directory:
            return

        path = Path(event.src_path)

        if any(part in IGNORE for part in path.parts):
            return

        if path.suffix in {".pyc", ".log"}:
            return

        self.last_change = time.time()
        self.pending = True
        print(f"Change detected: {path.name}")

    def process_changes(self):
        if not self.pending or time.time() - self.last_change < DELAY:
            return

        self.pending = False

        print("Preparing GitHub update...")

        result = run_git("pull", "--rebase", "origin", "main")

        if result.returncode != 0:
            print("Pull failed. Please resolve the Git issue:")
            print(result.stderr)
            return

        run_git("add", "-A")

        status = run_git("diff", "--cached", "--quiet")

        if status.returncode == 0:
            print("No changes to push.")
            return

        commit = run_git("commit", "-m", "Automatic backend update")

        if commit.returncode != 0:
            print(commit.stderr)
            return

        push = run_git("push", "origin", "main")

        if push.returncode == 0:
            print("Successfully updated GitHub!")
        else:
            print("Push failed:")
            print(push.stderr)

if __name__ == "__main__":
    handler = ChangeHandler()
    observer = Observer()
    observer.schedule(handler, str(PROJECT_DIR), recursive=True)
    observer.start()

    print("Automatic GitHub sync is running!")
    print("Press Ctrl+C to stop.")

    try:
        while True:
            handler.process_changes()
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()

    observer.join()