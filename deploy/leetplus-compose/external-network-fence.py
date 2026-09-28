"""Exact-source firewall for the external Langame worker.

This controller owns one chain, one ipset and two exact DOCKER-USER hooks. It
does not flush or rewrite Docker/global chains and never grants general HTTPS,
SMTP, Redis or host-proxy access.
"""
import argparse
import hashlib
import ipaddress
import json
import os
import shlex
import socket
import subprocess
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True

CONTRACT = 'LEETPLUS_LANGAME_EXTERNAL_NETWORK_V1'
CHAIN = 'LP_LEETPLUS_LANGAME_EXT_V1'
IPSET = 'lp_leetplus_langame_1171'
TEMP_IPSET = IPSET + '_next'
PARENT = 'DOCKER-USER'
PROJECT_HOOK = ['-s', '172.31.40.0/22', '-j', 'LP_LEETPLUS_EGRESS_V2']
HOOKS = [
    ['-s', '172.31.42.22/32', '-j', CHAIN],
    ['-s', '172.31.43.22/32', '-j', CHAIN],
]
RULES = [
    ['-s', '172.31.42.22/32', '-d', '172.31.42.2/32', '-p', 'tcp', '-m', 'tcp', '--dport', '5432', '-j', 'RETURN'],
    ['-s', '172.31.43.22/32', '-p', 'tcp', '-m', 'tcp', '--dport', '443', '-m', 'set', '--match-set', IPSET, 'dst', '-j', 'RETURN'],
    ['-j', 'DROP'],
]
HOST = '1171.langame.ru'
STATE = Path('/var/lib/leetplus-compose/external-network-fence.json')
IPTABLES = '/usr/sbin/iptables'
IPSET_BIN = '/usr/sbin/ipset'


def canonical(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def system_call(args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True,
                          env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C', 'LANG': 'C'}, timeout=20)


def resolve_public_ipv4(host):
    addresses = set()
    for answer in socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM):
        address = ipaddress.ip_address(answer[4][0])
        if not address.is_global:
            raise ValueError('Langame hostname resolved to non-public/fake-IP address')
        addresses.add(str(address))
    if not addresses:
        raise ValueError('Langame hostname resolved to an empty address set')
    return sorted(addresses)


class ExternalNetworkFence:
    def __init__(self, call=system_call, resolve=resolve_public_ipv4, state_path=STATE, secure_state=True):
        self.call = call
        self.resolve = resolve
        self.state_path = Path(state_path)
        self.secure_state = secure_state

    def _iptables(self, args, check=True):
        return self.call([IPTABLES, '-w', '5'] + args, check=check)

    def _ipset(self, args, check=True):
        return self.call([IPSET_BIN] + args, check=check)

    def _chain_exists(self):
        return self._iptables(['-S', CHAIN], check=False).returncode == 0

    def _set_exists(self, name=IPSET):
        return self._ipset(['list', name], check=False).returncode == 0

    def _parent_rules(self):
        lines = self._iptables(['-S', PARENT]).stdout.splitlines()
        return [shlex.split(line)[2:] for line in lines if line.startswith('-A ')]

    def _chain_rules(self):
        result = self._iptables(['-S', CHAIN], check=False)
        if result.returncode:
            return None
        return [shlex.split(line)[2:] for line in result.stdout.splitlines() if line.startswith('-A ')]

    def _set_members(self, name=IPSET, allow_empty=False):
        output = self._ipset(['list', name]).stdout.splitlines()
        if 'Type: hash:ip' not in output or not any(
                line.startswith('Header: ') and all(
                    value in line.split() for value in ('family', 'inet', 'timeout', '3600', 'maxelem', '64'))
                for line in output):
            raise ValueError('Owned Langame ipset type/TTL drift')
        try:
            start = output.index('Members:') + 1
        except ValueError as error:
            raise ValueError('Owned Langame ipset has invalid output') from error
        members = []
        for line in output[start:]:
            token = line.strip().split()[0] if line.strip() else ''
            if not token:
                continue
            address = ipaddress.ip_address(token)
            if address.version != 4 or not address.is_global:
                raise ValueError('Owned Langame ipset contains a non-public address')
            members.append(str(address))
        if (not members and not allow_empty) or len(members) != len(set(members)):
            raise ValueError('Owned Langame ipset is empty or duplicated')
        return sorted(members)

    def _read_state(self):
        if not self.state_path.exists():
            return None
        info = self.state_path.lstat()
        if self.state_path.is_symlink() or not self.state_path.is_file() or info.st_size > 1024 * 1024:
            raise ValueError('Unsafe external network state')
        if self.secure_state and (info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077):
            raise ValueError('External network state must be root-private')
        raw = self.state_path.read_bytes()
        value = json.loads(raw)
        if raw != canonical(value) or value.get('contract') != CONTRACT:
            raise ValueError('Noncanonical external network state')
        return value

    def _write_state(self, value):
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        raw = canonical(value)
        temporary = self.state_path.with_name(self.state_path.name + '.next-' + str(uuid.uuid4()))
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            with os.fdopen(descriptor, 'wb') as output:
                output.write(raw)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.state_path)
            # Linux production needs the directory barrier. Windows unit tests
            # cannot open a directory as a file descriptor.
            if os.name != 'nt':
                directory = os.open(self.state_path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
        finally:
            if temporary.exists():
                temporary.unlink()

    def _origin(self):
        parent = self._parent_rules()
        if not parent or parent[0] != PROJECT_HOOK:
            raise ValueError('Existing project hook must be first before external fence installation')
        if any(rule in HOOKS for rule in parent) or self._chain_exists() or self._set_exists():
            raise ValueError('External fence origin is not clean')
        return parent

    @staticmethod
    def _state(contract_state, origin):
        return {'contract': CONTRACT, 'state': contract_state, 'originParentRules': origin,
                'originParentSha256': digest(canonical(origin)), 'chain': CHAIN, 'ipset': IPSET,
                'hooks': HOOKS, 'rules': RULES, 'hostname': HOST}

    def _validate_state(self, value, allowed):
        if value.get('state') not in allowed or value.get('chain') != CHAIN or value.get('ipset') != IPSET or \
                value.get('hooks') != HOOKS or value.get('rules') != RULES or value.get('hostname') != HOST:
            raise ValueError('External network state contract drift')
        origin = value.get('originParentRules')
        if not isinstance(origin, list) or not origin or origin[0] != PROJECT_HOOK or \
                digest(canonical(origin)) != value.get('originParentSha256'):
            raise ValueError('External network origin binding drift')
        return origin

    def _refresh_set(self, addresses):
        if self._set_exists(TEMP_IPSET):
            raise ValueError('Interrupted Langame ipset refresh requires reconciliation')
        self._ipset(['create', IPSET, 'hash:ip', 'family', 'inet', 'timeout', '3600', 'maxelem', '64', '-exist'])
        self._ipset(['create', TEMP_IPSET, 'hash:ip', 'family', 'inet', 'timeout', '3600', 'maxelem', '64'])
        for address in addresses:
            self._ipset(['add', TEMP_IPSET, address, 'timeout', '3600'])
        self._ipset(['swap', IPSET, TEMP_IPSET])
        self._ipset(['destroy', TEMP_IPSET])
        if self._set_members() != addresses:
            raise ValueError('Atomic Langame ipset refresh postimage differs')

    def _reconcile_chain(self):
        current = self._chain_rules()
        if current is None:
            self._iptables(['-N', CHAIN])
            current = []
        if current != RULES[:len(current)]:
            raise ValueError('Interrupted external chain has ambiguous rules')
        for rule in RULES[len(current):]:
            self._iptables(['-A', CHAIN] + rule)
        if self._chain_rules() != RULES:
            raise ValueError('External chain postimage differs')

    def _reconcile_hooks(self, origin):
        parent = self._parent_rules()
        allowed = [origin, [HOOKS[1]] + origin, HOOKS + origin]
        if parent not in allowed:
            raise ValueError('Interrupted external hooks have ambiguous parent state')
        if parent == origin:
            self._iptables(['-I', PARENT, '1'] + HOOKS[1])
            parent = self._parent_rules()
        if parent == [HOOKS[1]] + origin:
            self._iptables(['-I', PARENT, '1'] + HOOKS[0])
        if self._parent_rules() != HOOKS + origin:
            raise ValueError('External hooks did not reach exact ordered postimage')

    def verify(self, allow_expired=False):
        state = self._read_state()
        if state is None:
            raise ValueError('External network fence has no durable state')
        origin = self._validate_state(state, {'ACTIVE'})
        if self._parent_rules() != HOOKS + origin or self._chain_rules() != RULES:
            raise ValueError('External network fence drift')
        members = self._set_members(allow_empty=allow_expired)
        return {'decision': 'PASS', 'contract': CONTRACT, 'hostname': HOST, 'addresses': members,
                'postgres': '172.31.42.22->172.31.42.2:5432', 'langameTls': '172.31.43.22->ipset:443'}

    def install(self):
        state = self._read_state()
        if state is None:
            origin = self._origin()
            state = self._state('INSTALLING', origin)
            self._write_state(state)
        else:
            origin = self._validate_state(state, {'INSTALLING', 'ACTIVE'})
            if state['state'] == 'ACTIVE':
                return self.verify()
        addresses = self.resolve(HOST)
        if self._set_exists(TEMP_IPSET):
            # A crash before swap may leave an empty final set and a complete
            # temporary set. Hooks are still absent at this point. Reconcile
            # only those exact bytes; do not flush or widen an unknown set.
            if not self._set_exists() or self._parent_rules() != origin:
                raise ValueError('Interrupted external set differs from exact safe preimage')
            final = self._set_members(allow_empty=True)
            temporary = self._set_members(TEMP_IPSET, allow_empty=True)
            if final == [] and set(temporary) <= set(addresses):
                for address in addresses:
                    if address not in temporary:
                        self._ipset(['add', TEMP_IPSET, address, 'timeout', '3600'])
                if self._set_members(TEMP_IPSET) != addresses:
                    raise ValueError('Interrupted external set completion drift')
                self._ipset(['swap', IPSET, TEMP_IPSET])
            elif final != addresses or temporary != []:
                raise ValueError('Interrupted external set differs from exact safe preimage')
            self._ipset(['destroy', TEMP_IPSET])
        elif not self._set_exists():
            self._refresh_set(addresses)
        else:
            if self._set_members() != addresses:
                raise ValueError('Interrupted external set differs from resolved hostname')
        self._reconcile_chain()
        self._reconcile_hooks(origin)
        active = self._state('ACTIVE', origin)
        self._write_state(active)
        return self.verify()

    def refresh(self):
        state = self._read_state()
        if state is None:
            raise ValueError('External network fence has no durable state')
        origin = self._validate_state(state, {'ACTIVE'})
        if self._parent_rules() != HOOKS + origin or self._chain_rules() != RULES or self._set_exists(TEMP_IPSET):
            raise ValueError('External network scope drift before refresh')
        addresses = self.resolve(HOST)
        self._refresh_set(addresses)
        return self.verify()

    def rollback(self):
        state = self._read_state()
        if state is None:
            raise ValueError('Rollback requires the exact installed origin receipt')
        origin = self._validate_state(state, {'ACTIVE', 'ROLLING_BACK', 'ROLLED_BACK'})
        if state['state'] == 'ROLLED_BACK':
            if self._parent_rules() != origin or self._chain_exists() or self._set_exists():
                raise ValueError('Rolled-back external fence postimage drift')
            return {'decision': 'ROLLED_BACK', 'contract': CONTRACT}
        parent = self._parent_rules()
        if state['state'] == 'ACTIVE':
            if parent != HOOKS + origin or self._chain_rules() != RULES:
                raise ValueError('Rollback preimage differs from exact installed fence')
            self._write_state(self._state('ROLLING_BACK', origin))
        elif parent not in [HOOKS + origin, [HOOKS[1]] + origin, origin]:
            raise ValueError('Interrupted rollback has ambiguous parent state')
        if self._parent_rules() == HOOKS + origin:
            self._iptables(['-D', PARENT] + HOOKS[0])
        if self._parent_rules() == [HOOKS[1]] + origin:
            self._iptables(['-D', PARENT] + HOOKS[1])
        if self._parent_rules() != origin:
            raise ValueError('Rollback did not restore exact parent origin')
        chain = self._chain_rules()
        if chain is not None:
            if chain != RULES:
                raise ValueError('Rollback refuses a changed owned chain')
            self._iptables(['-F', CHAIN])
            self._iptables(['-X', CHAIN])
        if self._set_exists():
            self._set_members()
            self._ipset(['destroy', IPSET])
        if self._set_exists(TEMP_IPSET):
            raise ValueError('Rollback refuses an unresolved temporary ipset')
        self._write_state(self._state('ROLLED_BACK', origin))
        return {'decision': 'ROLLED_BACK', 'contract': CONTRACT}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['install', 'verify', 'refresh', 'rollback'])
    args = parser.parse_args()
    if os.getuid() != 0:
        raise SystemExit('Root control plane required')
    controller = ExternalNetworkFence()
    result = getattr(controller, args.command)()
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
