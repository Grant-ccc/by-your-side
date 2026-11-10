"""Exercise backup and recovery with two independent MySQL containers and synthetic data."""

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from db_backup import ROOT, docker, isolated_database, isolated_dump, mysql, pack, restore, unpack


def main():
    with TemporaryDirectory() as directory, isolated_database() as source:
        mysql(source, b'CREATE TABLE schema_migrations (name VARCHAR(190) PRIMARY KEY, '
              b'checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB;')
        for migration in sorted((ROOT / 'database' / 'migrations').glob('*.sql')):
            sql = migration.read_bytes()
            mysql(source, sql)
            mysql(source, f"INSERT INTO schema_migrations (name,checksum) VALUES ('{migration.name}','{sha256(sql).hexdigest()}');".encode())
        mysql(source, """
          INSERT INTO users (id,display_name) VALUES ('u','合成用户');
          INSERT INTO characters (id,name) VALUES ('c','合成角色');
          INSERT INTO relationships (id,user_id,character_id,settings) VALUES ('r','u','c','{}');
          INSERT INTO conversations (id,relationship_id,title) VALUES ('c1','r','合成会话');
          INSERT INTO messages (id,conversation_id,role,text,client_request_id) VALUES ('m1','c1','user','第一行\n第二行 ☕','req');
          INSERT INTO messages (id,conversation_id,role,text,reply_to_message_id,version) VALUES ('m2','c1','assistant','替换后的回复','m1',2);
          INSERT INTO budget_periods (id,user_id,period,limit_amount,spent_amount,reserved_amount) VALUES ('b','u','2026-11',20,1.25,0.01);
          INSERT INTO generation_runs (id,conversation_id,request_key,state,source_message_id,budget_period_id,actual_cost) VALUES ('g','c1','fixture','succeeded','m1','b',1.25);
        """.encode())
        snapshot = isolated_dump(source)
        archive = pack(snapshot, Path(directory))
        corrupt = Path(directory) / 'corrupt.zip'
        with ZipFile(archive) as original, ZipFile(corrupt, 'w') as edited:
            edited.writestr('manifest.json', original.read('manifest.json'))
            edited.writestr('database.sql', snapshot + b' ')
        try:
            unpack(corrupt)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid checksum was accepted')
        mysql(source, b"UPDATE budget_periods SET spent_amount=2.50 WHERE id='b';"
              b"INSERT INTO messages (id,conversation_id,role,text) VALUES ('m3','c1','user','new');")
        try:
            restore(source, snapshot)
        except ValueError as error:
            assert '已有数据或表结构' in str(error)
        else:
            raise AssertionError('A non-empty restore target was accepted')
        query = b'SELECT spent_amount,reserved_amount FROM budget_periods; SELECT COUNT(*) FROM messages;'
        with isolated_database() as target:
            restore(target, unpack(archive))
            assert docker('inspect', '--format', '{{.HostConfig.NetworkMode}}', target).strip() == b'none'
            assert not docker('port', target).strip()
            assert mysql(target, query).splitlines() == [b'1.250000\t0.010000', b'2']
            assert mysql(target, b"SELECT id,reply_to_message_id,version,text FROM messages WHERE id='m2';").decode().strip() == 'm2\tm1\t2\t替换后的回复'
            assert mysql(source, query).splitlines() == [b'2.500000\t0.010000', b'3']
    print('PASS: restored rows, message links and revision, ledger snapshot, checksum and network isolation. Source ledger and newer chat were preserved.')


if __name__ == '__main__':
    main()
