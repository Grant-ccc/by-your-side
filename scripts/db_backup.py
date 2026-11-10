"""Back up the Compose database and restore only into an isolated Docker container."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from tempfile import NamedTemporaryFile
import time
from uuid import uuid4
from zipfile import BadZipFile, ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
BACKUPS = ROOT / '.local' / 'backups'
DATABASE = 'bys_restore'
IMAGE = 'mysql:8.4'
TABLES = (
    'schema_migrations', 'users', 'characters', 'relationships', 'conversations',
    'messages', 'budget_periods', 'generation_runs',
)
DUMP_OPTIONS = (
    '--single-transaction', '--order-by-primary', '--skip-comments', '--skip-dump-date',
    '--skip-extended-insert', '--skip-add-locks', '--skip-triggers', '--no-tablespaces',
    '--set-gtid-purged=OFF', '--default-character-set=utf8mb4',
)


def docker(*args, data=None, timeout=180):
    # The MySQL client can echo a faulty statement, so never print its stderr or rows.
    return subprocess.run(
        ['docker', *args], cwd=ROOT, input=data, capture_output=True, check=True, timeout=timeout,
    ).stdout


def compose_dump():
    return docker(
        'compose', '--env-file', '.env.local', 'exec', '-T', 'mysql', 'sh', '-ec',
        'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u "$MYSQL_USER" "$@" "$MYSQL_DATABASE" '
        + ' '.join(TABLES),
        'bys-backup', *DUMP_OPTIONS,
    )


def pack(dump, directory):
    now = datetime.now(timezone.utc)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"bys-{now:%Y%m%dT%H%M%SZ}-{uuid4().hex[:8]}.zip"
    with NamedTemporaryFile(dir=directory, delete=False) as temp:
        temporary = Path(temp.name)
    try:
        with ZipFile(temporary, 'w', compression=ZIP_DEFLATED) as archive:
            archive.writestr('manifest.json', json.dumps({
                'version': 1, 'createdAt': now.isoformat(), 'sha256': sha256(dump).hexdigest(),
            }))
            archive.writestr('database.sql', dump)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def unpack(path):
    try:
        with ZipFile(path) as archive:
            if sorted(archive.namelist()) != ['database.sql', 'manifest.json']:
                raise ValueError('不是有效的在你身边备份。')
            manifest = json.loads(archive.read('manifest.json'))
            dump = archive.read('database.sql')
    except (BadZipFile, OSError, RuntimeError, ValueError) as error:
        raise ValueError('无法读取备份。请检查文件格式和完整性。') from error
    if not isinstance(manifest, dict) or manifest.get('version') != 1:
        raise ValueError('备份版本不受支持。')
    if sha256(dump).hexdigest() != manifest.get('sha256'):
        raise ValueError('备份完整性校验失败。')
    return dump


def mysql(container, sql):
    return docker(
        'exec', '-i', container, 'mysql', '-uroot', '--binary-mode', '--local-infile=0',
        '--batch', '--skip-column-names', '--default-character-set=utf8mb4', DATABASE,
        data=sql,
    )


def isolated_dump(container):
    return docker('exec', container, 'mysqldump', '-uroot', *DUMP_OPTIONS, DATABASE, *TABLES)


@contextmanager
def isolated_database(keep=False):
    name = f'bys-restore-{uuid4().hex[:12]}'
    docker(
        'run', '-d', '--pull=never', '--name', name, '--network=none',
        '-e', f'MYSQL_DATABASE={DATABASE}', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
        IMAGE, '--skip-networking', '--mysqlx=OFF',
        '--character-set-server=utf8mb4', '--collation-server=utf8mb4_0900_ai_ci',
    )
    verified = False
    try:
        deadline = time.monotonic() + 120
        while True:
            try:
                docker(
                    'exec', name, 'sh', '-ec',
                    'test "$(cat /proc/1/comm)" = mysqld && mysql -uroot "$MYSQL_DATABASE" -e "SELECT 1"',
                    timeout=10,
                )
                break
            except subprocess.CalledProcessError:
                if time.monotonic() >= deadline:
                    raise ValueError('独立 MySQL 启动超时。') from None
                time.sleep(2)
        yield name
        verified = True
    finally:
        if not (keep and verified):
            docker('rm', '-f', '-v', name)


def restore(container, dump):
    if not container.startswith('bys-restore-') or docker(
        'inspect', '--format', '{{.HostConfig.NetworkMode}}', container,
    ).strip() != b'none':
        raise ValueError('恢复目标必须是工具创建的独立容器。')
    if mysql(container, b'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();').strip() != b'0':
        raise ValueError('恢复目标数据库已有数据或表结构。')
    mysql(container, dump)
    if isolated_dump(container) != dump:
        raise ValueError('恢复后的数据或表结构与备份不一致。请使用相同的 MySQL 8.4 镜像。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest='mode', required=True)
    modes.add_parser('backup')
    modes.add_parser('restore').add_argument('archive', type=Path)
    args = parser.parse_args()
    try:
        if args.mode == 'backup':
            print(f'备份已保存到 {pack(compose_dump(), BACKUPS)}')
        else:
            dump = unpack(args.archive)
            with isolated_database(keep=True) as target:
                restore(target, dump)
            print(f'已恢复并核对独立数据库 {target}。现用数据库及其费用账本未写入。')
            print(f'查看数据：docker exec -it {target} mysql -uroot {DATABASE}')
            print(f'结束演练后删除该副本：docker rm -f -v {target}')
    except ValueError as error:
        parser.exit(1, f'{error}\n')
    except (OSError, subprocess.SubprocessError):
        parser.exit(1, '操作失败。请检查 Docker、MySQL 8.4 镜像和数据库状态。为保护聊天内容，未输出 SQL 日志。\n')


if __name__ == '__main__':
    main()
