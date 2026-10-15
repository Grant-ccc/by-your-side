"""Validate/export versioned docs, optionally publish to the project's GitHub Wiki.

Default mode only writes .wiki-export under the project root.
GitHub requires an initial Wiki page before its separate Git remote exists.
"""
import argparse
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs' / 'wiki'
EXPORT = ROOT / '.wiki-export'
CHECKOUT = ROOT / '.wiki-checkout'
REMOTE = 'https://github.com/Grant-ccc/by-your-side.wiki.git'
CREATE_URL = 'https://github.com/Grant-ccc/by-your-side/wiki/_new'
LOCAL_LINK = re.compile(r'(?<!!)\[([^\]]+)\]\(([^\s)]+\.md)(#[^)]*)?\)')


def git(*args, cwd=ROOT, check=True):
    result = subprocess.run(['git', *args], cwd=cwd, text=True,
                            encoding='utf-8', errors='replace', capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result


def export_pages():
    pages = sorted(SOURCE.glob('*.md'))
    if not pages or not (SOURCE / 'Home.md').is_file():
        raise RuntimeError('Missing Wiki source or Home.md.')
    names = {p.name for p in pages}
    rendered = {}
    for page in pages:
        content = page.read_text(encoding='utf-8')

        def convert(match):
            label, target, anchor = match.groups()
            if '://' in target:
                return match.group(0)
            if target not in names:
                raise RuntimeError(f'{page.name}: broken page link: {target}')
            return f'[{label}]({Path(target).stem}{anchor or ""})'

        rendered[page.name] = LOCAL_LINK.sub(convert, content)
    EXPORT.mkdir(exist_ok=True)
    for name, content in rendered.items():
        (EXPORT / name).write_text(content, encoding='utf-8')
    print(f'Validated and exported {len(rendered)} pages to {EXPORT.name}/')
    return rendered


def publish(rendered):
    remote = git('ls-remote', REMOTE, check=False)
    if remote.returncode:
        raise RuntimeError('Wiki remote is not accessible. If it has not been initialized, '
                           f'create its first page at {CREATE_URL}\n'
                           'The source and exported documentation have been preserved.\n'
                           + remote.stderr.strip())
    if not CHECKOUT.exists():
        git('clone', REMOTE, str(CHECKOUT))
    else:
        actual_remote = git('remote', 'get-url', 'origin', cwd=CHECKOUT).stdout.strip()
        if actual_remote != REMOTE:
            raise RuntimeError('Refusing to publish: Wiki checkout has a different origin.')
        if git('status', '--porcelain', cwd=CHECKOUT).stdout.strip():
            raise RuntimeError('Wiki checkout has local changes. Review them before publishing.')
        git('pull', '--ff-only', cwd=CHECKOUT)
    # Copy only owned page names. Never delete unrelated existing Wiki pages.
    for name, content in rendered.items():
        (CHECKOUT / name).write_text(content, encoding='utf-8')
    git('add', '--', *rendered.keys(), cwd=CHECKOUT)
    changes = git('diff', '--cached', '--quiet', cwd=CHECKOUT, check=False)
    if changes.returncode == 0:
        print('Wiki is already up to date.')
        return
    if changes.returncode != 1:
        raise RuntimeError(changes.stderr)
    git('diff', '--cached', '--check', cwd=CHECKOUT)
    for key in ('user.name', 'user.email'):
        value = git('config', '--get', key, check=False).stdout.strip()
        if value:
            git('config', '--local', key, value, cwd=CHECKOUT)
    git('commit', '-m', 'Document architecture, roadmap and implementation status', cwd=CHECKOUT)
    git('push', 'origin', 'HEAD', cwd=CHECKOUT)
    local_sha = git('rev-parse', 'HEAD', cwd=CHECKOUT).stdout.strip()
    branch = git('branch', '--show-current', cwd=CHECKOUT).stdout.strip()
    refs = git('ls-remote', 'origin', f'refs/heads/{branch}', cwd=CHECKOUT).stdout.split()
    if not refs or refs[0] != local_sha:
        raise RuntimeError('Push completed but remote verification did not match.')
    print(f'Published and verified Wiki commit {local_sha[:7]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--publish', action='store_true', help='Commit and push to the initialized GitHub Wiki')
    args = parser.parse_args()
    rendered = export_pages()
    if args.publish:
        publish(rendered)
    else:
        print('Local export only. Use --publish after the initial GitHub Wiki page exists.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
