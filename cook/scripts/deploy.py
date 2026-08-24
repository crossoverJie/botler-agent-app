#!/usr/bin/env python3
"""Deploy web/dist/index.html to the public "index" showcase repo (best-effort).

Copies the single-file build output into <INDEX_REPO>/<project>/index.html, then
git add/commit/push the index repo, and prints a cache-busted public URL for
botler to echo back to the user.

Expected index repo layout (GitHub Pages from the repo root of the main branch):
    index/
      index.html            <- hand-written homepage with navigation
      cook/index.html       <- copied here by cook/scripts/deploy.py
      daily-log/index.html  <- copied here by daily-log/scripts/deploy.py

Config (environment variables, all optional):
    INDEX_REPO    local path of the index repo (default ~/Documents/dev/github/index)
    INDEX_URL     override for the public base URL (default derived from the index
                  repo's `origin` remote: https://<owner>.github.io/<repo>)

Usage:
    python3 scripts/deploy.py            # copy + push + print the link
    python3 scripts/deploy.py --dry-run  # print what would happen + the link, no writes

Never fails the build: missing dist / missing index repo / git errors are all
warnings, and the process exits 0 so the caller (build.py) is not interrupted.
"""
import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.basename(ROOT)
DIST = os.path.join(ROOT, "web", "dist", "index.html")

# Public base URL of the index showcase site. GitHub serves this account's project
# sites under the user site's custom domain (crossoverjie.top), so we use that
# directly instead of the .github.io URL (which would just 301 to it).
# Override with the INDEX_URL env var if the domain ever changes.
DEFAULT_BASE_URL = "https://crossoverjie.top/index"


def warn(msg):
    print(f"WARN: {msg}", file=sys.stderr)


def index_repo_path():
    return os.path.expanduser(os.environ.get("INDEX_REPO", "~/Documents/dev/github/index"))


def resolve_base_url(index_dir):
    """Derive the public base URL: INDEX_URL > CNAME file > DEFAULT_BASE_URL > origin remote."""
    override = os.environ.get("INDEX_URL")
    if override:
        return override.rstrip("/")

    # GitHub Pages writes the custom domain into a CNAME file when one is set.
    cname_file = os.path.join(index_dir, "CNAME")
    if os.path.isfile(cname_file):
        try:
            with open(cname_file, encoding="utf-8") as f:
                cname = f.read().strip()
            if cname:
                return f"https://{cname}"
        except OSError:
            pass

    if DEFAULT_BASE_URL:
        return DEFAULT_BASE_URL

    try:
        out = subprocess.run(
            ["git", "-C", index_dir, "remote", "get-url", "origin"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except subprocess.CalledProcessError:
        return None

    owner = repo = None
    if "@" in out:
        # SSH form: git@github.com:owner/repo.git
        rest = out.split("@", 1)[1]
        if ":" in rest:
            path = rest.split(":", 1)[1]
            owner, _, repo = path.rstrip("/").partition("/")
    else:
        # HTTPS form: https://github.com/owner/repo(.git)
        tail = out.rstrip("/")
        if tail.endswith(".git"):
            tail = tail[:-4]
        parts = tail.split("/")
        if len(parts) >= 2:
            owner, repo = parts[-2], parts[-1]
    if not owner or not repo:
        return None
    return f"https://{owner}.github.io/{repo}"


def git_run(index_dir, args):
    return subprocess.run(["git", *args], cwd=index_dir, capture_output=True, text=True)


def main():
    parser = argparse.ArgumentParser(description="部署 web/dist/index.html 到 index 展示仓库。")
    parser.add_argument("--dry-run", action="store_true", help="只打印动作与链接，不写文件、不 git 操作。")
    args = parser.parse_args()

    if not os.path.isfile(DIST):
        warn(f"未找到 {DIST}，跳过部署（先构建 web）。")
        return 0

    index_dir = index_repo_path()
    if not os.path.isdir(os.path.join(index_dir, ".git")):
        warn(f"index 仓库不存在：{index_dir}（跳过部署）。")
        return 0

    base = resolve_base_url(index_dir)
    if not base:
        warn("无法从 index 仓库的 origin 推导 Pages 地址，也未设置 INDEX_URL，跳过部署。")
        return 0

    target = os.path.join(index_dir, PROJECT, "index.html")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    url = f"{base}/{PROJECT}/?v={stamp}"

    if args.dry_run:
        print(f"[dry-run] 将复制 {DIST} -> {target}")
        print(f"[dry-run] 将在 {index_dir} 先 git pull --rebase 再 git add/commit/push")
        print(f"DEPLOY_OK {url}")
        return 0

    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copyfile(DIST, target)
    print(f"OK: 已复制 -> {target}")

    # The index repo is a shared GitHub Pages repo: any commit pushed from another
    # machine / the web UI leaves the local clone behind, and a plain push is then
    # rejected (non-fast-forward). Rebase our working-tree change on top of upstream
    # first so the subsequent push is a fast-forward. --autostash protects the just
    # copied file if the tree wasn't clean.
    pull = git_run(index_dir, ["pull", "--rebase", "--autostash"])
    if pull.returncode != 0:
        warn(f"git pull --rebase 失败：{pull.stderr.strip()}")
        git_run(index_dir, ["rebase", "--abort"])
        git_run(index_dir, ["stash", "pop"])
        # Surface on stdout (not just stderr) so the caller (botler run tool) sees it
        # instead of the misleading DEPLOY_OK.
        print(f"DEPLOY_FAIL: 与远端合并失败（冲突或网络），请手动处理 {index_dir}")
        return 0

    add = git_run(index_dir, ["add", "-A"])
    if add.returncode != 0:
        warn(f"git add 失败：{add.stderr.strip()}")
        print("DEPLOY_FAIL: git add 失败")
        return 0
    commit = git_run(index_dir, ["commit", "-m", f"deploy {PROJECT} {stamp}"])
    # "nothing to commit" is expected when the content hasn't changed; any other failure is a warning.
    if commit.returncode != 0 and "nothing to commit" not in commit.stdout and "nothing to commit" not in commit.stderr:
        warn(f"git commit 失败：{commit.stderr.strip() or commit.stdout.strip()}")
        print("DEPLOY_FAIL: git commit 失败")
        return 0

    if "nothing to commit" in commit.stdout or "nothing to commit" in commit.stderr:
        # After rebase the copied content already matches HEAD; site is current.
        print("DEPLOY_SKIP: 内容无变化，无需推送。")
        print(f"DEPLOY_OK {url}")
        return 0

    push = git_run(index_dir, ["push"])
    if push.returncode != 0:
        warn(f"git push 失败：{push.stderr.strip()}")
        # Never print DEPLOY_OK on a failed push — the agent would report success
        # while the live site stayed stale.
        print(f"DEPLOY_FAIL: git push 被拒绝（{push.stderr.strip()}）")
        return 0
    print("OK: index 仓库已推送。")
    print(f"DEPLOY_OK {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
