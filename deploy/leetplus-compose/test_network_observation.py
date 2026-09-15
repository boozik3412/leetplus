import importlib.util
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SOURCE = Path(__file__).with_name("network_observation.py")
SPEC = importlib.util.spec_from_file_location("network_observation", SOURCE)
observation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(observation)


class ProviderSetCaptureTests(unittest.TestCase):
    def test_captures_only_member_ttls(self):
        output = """Name: lp_leetplus_https
Number of entries: 999
Members:
198.51.100.4 timeout 1800
198.51.100.5 timeout 901
"""

        def call(args, check=False):
            self.assertFalse(check)
            return subprocess.CompletedProcess(args, 0, output, "")

        self.assertEqual(
            observation.capture_provider_sets(call),
            [
                {"name": "lp_leetplus_https", "count": 2, "minTtlSeconds": 901},
                {"name": "lp_leetplus_smtp", "count": 2, "minTtlSeconds": 901},
            ],
        )

    def test_errors_and_malformed_members_are_unavailable(self):
        def call(args, check=False):
            if args[-1] == "lp_leetplus_https":
                return subprocess.CompletedProcess(args, 1, "Members:\n198.51.100.4 timeout 12\n", "missing")
            return subprocess.CompletedProcess(args, 0, "Members:\nnot-an-ip timeout 12\n", "")

        self.assertEqual(
            observation.capture_provider_sets(call),
            [
                {"name": "lp_leetplus_https", "count": 0, "minTtlSeconds": None},
                {"name": "lp_leetplus_smtp", "count": 0, "minTtlSeconds": None},
            ],
        )

    def test_call_exception_is_unavailable(self):
        def call(args, check=False):
            raise subprocess.SubprocessError("ipset unavailable")

        self.assertEqual(
            observation.capture_provider_sets(call),
            [
                {"name": "lp_leetplus_https", "count": 0, "minTtlSeconds": None},
                {"name": "lp_leetplus_smtp", "count": 0, "minTtlSeconds": None},
            ],
        )


class FreshnessTests(unittest.TestCase):
    def sets(self, ttl=1800):
        return [
            {"name": "lp_leetplus_https", "count": 1, "minTtlSeconds": ttl},
            {"name": "lp_leetplus_smtp", "count": 1, "minTtlSeconds": ttl},
        ]

    def test_precedence_and_missing_sets(self):
        self.assertEqual(observation.classify_freshness([]), "UNAVAILABLE")
        self.assertEqual(observation.classify_freshness(self.sets(900), "FAILED"), "AT_RISK")
        self.assertEqual(observation.classify_freshness(self.sets(), "FAILED"), "DEGRADED")
        self.assertEqual(observation.classify_freshness(self.sets()), "HEALTHY")
        broken = self.sets()
        broken[0]["minTtlSeconds"] = None
        self.assertEqual(observation.classify_freshness(broken), "UNAVAILABLE")


class ObservationFileTests(unittest.TestCase):
    def record(self):
        return {
            "time": "2026-09-15T12:00:00Z",
            "result": "HEALTHY",
            "reasonCode": "REFRESH_OK",
            "sets": [
                {"name": "lp_leetplus_https", "count": 2, "minTtlSeconds": 1800},
                {"name": "lp_leetplus_smtp", "count": 1, "minTtlSeconds": 1700},
            ],
        }

    def test_atomic_round_trip_with_temporary_fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "network-refresh.json"
            with mock.patch.object(observation, "OBSERVATION_PATH", path), \
                 mock.patch.object(observation, "ROOT_UID", os.lstat(directory).st_uid), \
                 mock.patch.object(observation, "_require_root"), \
                 mock.patch.object(observation, "_assert_secure_ancestors"), \
                mock.patch.object(observation, "_assert_secure_file"):
                observation.write_observation(self.record())
                if os.name != "nt":
                    self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
                self.assertEqual(observation.read_observation(), self.record())

    def test_missing_file_is_none_but_unsafe_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "network-refresh.json"
            with mock.patch.object(observation, "OBSERVATION_PATH", path), \
                 mock.patch.object(observation, "ROOT_UID", os.lstat(directory).st_uid), \
                 mock.patch.object(observation, "_require_root"), \
                 mock.patch.object(observation, "_assert_secure_ancestors"):
                self.assertIsNone(observation.read_observation())
                unsafe_symlink = SimpleNamespace(
                    st_mode=stat.S_IFLNK | 0o600,
                    st_uid=observation.ROOT_UID,
                    st_nlink=1,
                    st_size=2,
                )
                with mock.patch.object(observation.os, "lstat", return_value=unsafe_symlink):
                    with self.assertRaisesRegex(ValueError, "Unsafe observation file"):
                        observation._assert_secure_file(path)
                unsafe_hardlink = SimpleNamespace(
                    st_mode=stat.S_IFREG | 0o600,
                    st_uid=observation.ROOT_UID,
                    st_nlink=2,
                    st_size=2,
                )
                with mock.patch.object(observation.os, "lstat", return_value=unsafe_hardlink):
                    with self.assertRaisesRegex(ValueError, "Unsafe observation file"):
                        observation._assert_secure_file(path)

    def test_rejects_unbounded_or_unexpected_data(self):
        invalid = self.record()
        invalid["providerAddress"] = "198.51.100.4"
        with self.assertRaisesRegex(ValueError, "unexpected fields"):
            observation._canonical_bytes(invalid)


if __name__ == "__main__":
    unittest.main()
