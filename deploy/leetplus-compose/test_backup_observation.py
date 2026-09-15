"""Only mutable diagnostics are omitted; controller authority remains backed up."""
import ast
import re
import unittest
from pathlib import Path
from types import SimpleNamespace

source = ast.parse(Path(__file__).with_name('daily-backup.py').read_text())
function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'backup_member_filter')
namespace = {'re': re}
exec(compile(ast.Module(body=[function], type_ignores=[]), 'daily-backup-filter', 'exec'), namespace)
filtered = namespace['backup_member_filter']


class BackupObservation(unittest.TestCase):
    def test_diagnostic_and_owned_temporary_record_are_omitted(self):
        for name in ['system/var/lib/leetplus-compose/network-refresh.json', 'system/var/lib/leetplus-compose/.network-refresh.json.42.' + 'a' * 24 + '.tmp']:
            self.assertIsNone(filtered(SimpleNamespace(name=name)))

    def test_authority_and_unknown_files_are_retained(self):
        for name in ['system/var/lib/leetplus-compose/active.json', 'system/var/lib/leetplus-compose/control-handoffs/id/new-control.tar.gz', 'system/var/lib/leetplus-compose/control-handoffs/id/network-refresh.json', 'system/var/lib/leetplus-compose/.network-refresh.json.unknown', 'system/etc/leetplus-compose/providers.json']:
            item = SimpleNamespace(name=name)
            self.assertIs(filtered(item), item)


if __name__ == '__main__':
    unittest.main()
