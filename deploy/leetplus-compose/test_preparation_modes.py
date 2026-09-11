"""Exercise the real writer under the production caller's restrictive umask."""
import ast
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path

tree=ast.parse(Path(__file__).with_name('prepare-files.py').read_text())
writer=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='write')
namespace={'os':os,'json':json}
exec(compile(ast.Module(body=[writer],type_ignores=[]),'prepare-files.write','exec'),namespace)
backup=ast.parse(Path(__file__).with_name('daily-backup.py').read_text())
validator=next(node for node in backup.body if isinstance(node,ast.FunctionDef) and node.name=='validate_backup_source')
exec(compile(ast.Module(body=[validator],type_ignores=[]),'daily-backup.validate_source','exec'),namespace)

class BackupFreshness(unittest.TestCase):
    def test_primary_and_streaming_standby(self):
        for value in [{'inRecovery':False},{'inRecovery':True,'replayPaused':False,'receiver':'streaming','lastMessageAgeSeconds':1}]:
            self.assertEqual(namespace['validate_backup_source'](value),value)

    def test_stale_paused_or_disconnected_standby_rejected(self):
        good={'inRecovery':True,'replayPaused':False,'receiver':'streaming','lastMessageAgeSeconds':1}
        for field,value in [('replayPaused',True),('receiver',None),('lastMessageAgeSeconds',None),('lastMessageAgeSeconds',91)]:
            with self.assertRaises(ValueError):namespace['validate_backup_source']({**good,field:value})

@unittest.skipUnless(os.name=='posix','POSIX deployment permission semantics')
class Modes(unittest.TestCase):
    def test_requested_modes_survive_private_caller_umask(self):
        with tempfile.TemporaryDirectory() as temporary:
            old=os.umask(0o077)
            try:
                for mode in [0o400,0o440,0o444,0o660]:
                    file=Path(temporary)/str(mode)
                    namespace['write'](file,{'fixture':True},uid=os.getuid(),gid=os.getgid(),mode=mode)
                    self.assertEqual(stat.S_IMODE(file.stat().st_mode),mode)
                    self.assertEqual(json.loads(file.read_bytes()),{'fixture':True})
            finally:os.umask(old)

if __name__=='__main__':unittest.main()
