"""Pure source transport checks; no host or provider operation."""
import ast
import contextlib
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('standalone_source_builder_test', HERE / 'build-standalone-intro-source.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class SourceBuilderTests(unittest.TestCase):
    def members(self):
        return {path: ('source fixture ' + path + '\n').encode() for path in builder.SOURCES}

    def test_closed_source_archive_reproduces_exact_bytes_and_metadata(self):
        first = builder.build(self.members())
        self.assertEqual(first, builder.build(self.members()))
        packed, manifest, files = first
        self.assertEqual(len(files), 19)
        self.assertEqual(manifest, ''.join(f'{files[name]}  ./{name}\n' for name in sorted(files)).encode())
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(packed)), mode='r:') as archive:
            found = archive.getmembers()
            self.assertEqual([item.name for item in found], sorted([*builder.SOURCES, 'SHA256SUMS']))
            self.assertTrue(all(item.isfile() and item.mode == 0o400 and item.uid == item.gid == item.mtime == 0 for item in found))

    def test_missing_extra_or_unbounded_source_is_never_packaged(self):
        missing = self.members()
        missing.pop(next(iter(missing)))
        extra = {**self.members(), '../foreign': b'x'}
        large = self.members()
        large[next(iter(large))] = b'x' * (builder.MAX_LEAF + 1)
        for members in (missing, extra, large):
            with self.assertRaises(ValueError):
                builder.build(members)

    def test_invalid_git_ref_never_calls_subprocess(self):
        with patch.object(builder.subprocess, 'run') as invoked:
            with self.assertRaises(ValueError):
                builder.git_sources('main')
            invoked.assert_not_called()

    def test_builder_and_consumer_require_identical_source_closure(self):
        repo = HERE.parents[1]
        entry_path = repo / 'docs/deployment/production-artifact/install_predecessor_bootstrap.py'
        tree = ast.parse(entry_path.read_bytes())
        assignments = {}
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                try:
                    assignments[node.targets[0].id] = ast.literal_eval(node.value)
                except (ValueError, TypeError):
                    pass
        required = set(assignments['BUNDLE_PATHS']) | {
            assignments[name] for name in ('HELPER_PATH', 'SOURCE_PATH', 'LAYOUT_PATH', 'VERIFIER_SOURCE_PATH', 'LAUNCHER_SOURCE_PATH')}
        self.assertEqual(set(builder.SOURCES), required)

    def test_git_source_reads_exact_commit_blobs_even_if_checkout_drifts(self):
        repo = HERE.parents[1].resolve()
        with tempfile.TemporaryDirectory(prefix='bootstrap-source-git-', dir=repo) as folder:
            work = Path(folder).resolve(strict=True)
            self.assertEqual(work.parent, repo)
            for name, raw in self.members().items():
                target = work / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
            def git(*args):
                return subprocess.run(['git', *args], cwd=work, stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, check=True).stdout.decode().strip()
            git('init', '--quiet')
            git('add', '.')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                'commit', '--quiet', '-m', 'closed source fixture')
            sha = git('rev-parse', 'HEAD')
            original_tree = git('rev-parse', sha + '^{tree}')
            previous = Path.cwd()
            try:
                os.chdir(work)
                self.assertEqual(builder.git_sources(sha), self.members())
                (work / builder.SOURCES[0]).write_bytes(b'working-tree drift')
                self.assertEqual(builder.git_sources(sha), self.members())
                original = git('rev-parse', sha + ':' + builder.SOURCES[0])
                replacement = subprocess.run(['git', 'hash-object', '-w', '--stdin'], cwd=work,
                    input=b'local replacement ref must not be source authority\n',
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout.decode().strip()
                git('replace', original, replacement)
                self.assertEqual(builder.git_sources(sha), self.members())
                empty_tree = subprocess.run(['git', 'mktree'], cwd=work, input=b'',
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout.decode().strip()
                git('replace', original_tree, empty_tree)
                self.assertEqual(builder.git_sources(sha), self.members())
                with contextlib.redirect_stdout(io.StringIO()):
                    builder.publish(work / 'source-output', sha, '123', '1', 'push', 'refs/heads/main')
                receipt = json.loads((work / 'source-output/source-receipt.json').read_bytes())
                self.assertEqual(receipt['sourceRelease'], sha)
                self.assertEqual(receipt['sourceTreeSha'], original_tree)
                self.assertEqual(receipt['sourceFiles'], {path: builder.sha(raw) for path, raw in sorted(self.members().items())})
                self.assertEqual(receipt['decision'], 'SOURCE_BYTES_ONLY_NOT_AUTHORIZATION')
            finally:
                os.chdir(previous)


if __name__ == '__main__':
    unittest.main()
