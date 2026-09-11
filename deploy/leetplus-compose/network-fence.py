"""Project-scoped Docker firewall. Never flushes global or Docker-owned rules.

Install adds only new named chains for the reserved LeetPlus subnet. Refresh
changes bounded provider IP sets; verify is read-only. The reviewed provider
file belongs to the host control plane, not an application container.
"""
import argparse
import ipaddress
import json
import os
import re
import shlex
import socket
import subprocess
from pathlib import Path

SUBNET = '172.31.40.0/22'
EGRESS = '172.31.43.0/24'
CHAIN = 'LP_LEETPLUS_EGRESS_V2'
HOST_CHAIN = 'LP_LEETPLUS_HOST_V2'
CONFIG = Path('/etc/leetplus-compose/providers.json')


def call(args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True,
                          env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C', 'LANG': 'C'}, timeout=20)


def provider_config():
    stat = CONFIG.lstat()
    if CONFIG.is_symlink() or not CONFIG.is_file() or stat.st_uid != 0 or stat.st_mode & 0o022 or stat.st_size > 8192:
        raise ValueError('Unsafe provider policy')
    value = json.loads(CONFIG.read_text())
    if set(value) != {'httpsHosts', 'smtpHosts'}:
        raise ValueError('Exact HTTPS/SMTP provider sets required')
    for values in value.values():
        if not isinstance(values, list) or not 1 <= len(values) <= 20 or len(values) != len(set(values)):
            raise ValueError('Invalid provider set')
        if any(not isinstance(host, str) or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]{0,250})\.[a-z]{2,63}', host) for host in values):
            raise ValueError('Only exact DNS hostnames are permitted')
    return value


def internal_rules(blue, green, data):
    rules = []
    for slot in [blue, green]:
        rules.append(['-s', f'172.31.{slot}.3/32', '-d', f'172.31.{slot}.2/32', '-p', 'tcp', '-m', 'tcp', '--dport', '4000', '-j', 'RETURN'])
    for source in [10, 11, 20, 21]:
        for destination, port in [(2, '5432'), (3, '6379')]:
            rules.append(['-s', f'172.31.{data}.{source}/32', '-d', f'172.31.{data}.{destination}/32', '-p', 'tcp', '-m', 'tcp', '--dport', port, '-j', 'RETURN'])
    return rules


RULES = [
    ['-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'RETURN'],
    *internal_rules(40, 41, 42),
    ['-s', EGRESS, '-p', 'tcp', '-m', 'tcp', '--dport', '443', '-m', 'set', '--match-set', 'lp_leetplus_https', 'dst', '-j', 'RETURN'],
    ['-s', EGRESS, '-p', 'tcp', '-m', 'multiport', '--dports', '465,587', '-m', 'set', '--match-set', 'lp_leetplus_smtp', 'dst', '-j', 'RETURN'],
    ['-j', 'DROP'],
]
HOST_RULES = [
    ['-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'RETURN'],
    ['-j', 'DROP'],
]


def rule_exists(chain, args):
    return call(['/usr/sbin/iptables', '-w', '5', '-C', chain] + args, check=False).returncode == 0


def verify_chain(name, rules, parent):
    output = call(['/usr/sbin/iptables', '-w', '5', '-S', name]).stdout.splitlines()
    if len([line for line in output if line.startswith('-A ')]) != len(rules):
        raise ValueError('Firewall chain has unexpected rules')
    for args in rules:
        if not rule_exists(name, args):
            raise ValueError('Firewall rule missing')
    def normalized(tokens):
        tokens = list(tokens)
        if '--ctstate' in tokens:
            index = tokens.index('--ctstate') + 1
            tokens[index] = ','.join(sorted(tokens[index].split(',')))
        return tokens
    actual = [normalized(shlex.split(line)[2:]) for line in output if line.startswith('-A ')]
    if actual != [normalized(rule) for rule in rules]:
        raise ValueError('Firewall rule order differs')
    if not rule_exists(parent, ['-s', SUBNET, '-j', name]):
        raise ValueError('Firewall hook missing')
    parent_rules = [line for line in call(['/usr/sbin/iptables', '-w', '5', '-S', parent]).stdout.splitlines() if line.startswith('-A ')]
    if not parent_rules or shlex.split(parent_rules[0])[2:] != ['-s', SUBNET, '-j', name]:
        raise ValueError('Project fence must precede other parent-chain rules')


def install_chain(name, rules, parent):
    result = call(['/usr/sbin/iptables', '-w', '5', '-S', name], check=False)
    if result.returncode == 0:
        verify_chain(name, rules, parent)
        return
    call(['/usr/sbin/iptables', '-w', '5', '-N', name])
    for args in rules:
        call(['/usr/sbin/iptables', '-w', '5', '-A', name] + args)
    # Chain is complete before its first traffic hook becomes visible.
    call(['/usr/sbin/iptables', '-w', '5', '-I', parent, '1', '-s', SUBNET, '-j', name])
    verify_chain(name, rules, parent)


def refresh(config):
    resolved = {}
    for key in ['httpsHosts', 'smtpHosts']:
        addresses = set()
        for host in config[key]:
            for answer in socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM):
                address = ipaddress.ip_address(answer[4][0])
                if not address.is_global:
                    raise ValueError('Provider resolved to a non-public/fake-IP address')
                addresses.add(str(address))
        if not addresses:
            raise ValueError('Empty provider resolution')
        resolved[key] = sorted(addresses)
    for key, name in [('httpsHosts', 'lp_leetplus_https'), ('smtpHosts', 'lp_leetplus_smtp')]:
        call(['/usr/sbin/ipset', 'create', name, 'hash:ip', 'family', 'inet', 'timeout', '3600', 'maxelem', '512', '-exist'])
        temporary = name + '_next'
        call(['/usr/sbin/ipset', 'create', temporary, 'hash:ip', 'family', 'inet', 'timeout', '3600', 'maxelem', '512', '-exist'])
        call(['/usr/sbin/ipset', 'flush', temporary])
        for address in resolved[key]:
            call(['/usr/sbin/ipset', 'add', temporary, address, 'timeout', '3600', '-exist'])
        call(['/usr/sbin/ipset', 'swap', name, temporary])
        call(['/usr/sbin/ipset', 'destroy', temporary])


def rehearsal_fence(install=False):
    sources = ['172.31.50.0/23', '172.31.52.0/24']
    definitions = [
        ('LP_LEETPLUS_REH_V2', 'DOCKER-USER', [
            ['-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'RETURN'],
            *internal_rules(50, 51, 52), ['-j', 'DROP'],
        ]),
        ('LP_LEETPLUS_REH_HOST_V2', 'INPUT', HOST_RULES),
    ]
    for name, parent, rules in definitions:
        existing = call(['/usr/sbin/iptables', '-w', '5', '-S', name], check=False)
        if install and existing.returncode:
            call(['/usr/sbin/iptables', '-w', '5', '-N', name])
            for rule in rules:
                call(['/usr/sbin/iptables', '-w', '5', '-A', name] + rule)
            for subnet in reversed(sources):
                call(['/usr/sbin/iptables', '-w', '5', '-I', parent, '1', '-s', subnet, '-j', name])
        output = call(['/usr/sbin/iptables', '-w', '5', '-S', name]).stdout.splitlines()
        if len([line for line in output if line.startswith('-A ')]) != len(rules) or any(not rule_exists(name, rule) for rule in rules):
            raise ValueError('Rehearsal firewall drift')
        parents = [shlex.split(line)[2:] for line in call(['/usr/sbin/iptables', '-w', '5', '-S', parent]).stdout.splitlines() if line.startswith('-A ')]
        production_hook = ['-s', SUBNET, '-j', CHAIN if parent == 'DOCKER-USER' else HOST_CHAIN]
        if parents and parents[0] == production_hook:
            parents = parents[1:]
        expected = [['-s', subnet, '-j', name] for subnet in sources]
        if parents[:2] != expected:
            raise ValueError('Rehearsal fence must precede other matching rules')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['install', 'refresh', 'verify', 'install-rehearsal', 'verify-rehearsal'])
    args = parser.parse_args()
    if os.getuid() != 0:
        raise SystemExit('Root control plane required')
    if args.command.endswith('-rehearsal'):
        rehearsal_fence(args.command == 'install-rehearsal')
        print(json.dumps({'decision': 'PASS', 'contract': 'LEETPLUS_REHEARSAL_NETWORK_V2', 'providerEgress': 'DENIED', 'hostServices': 'DENIED'}))
        raise SystemExit(0)
    config = provider_config()
    if args.command != 'verify':
        refresh(config)
    if args.command == 'install':
        install_chain(CHAIN, RULES, 'DOCKER-USER')
        install_chain(HOST_CHAIN, HOST_RULES, 'INPUT')
    verify_chain(CHAIN, RULES, 'DOCKER-USER')
    verify_chain(HOST_CHAIN, HOST_RULES, 'INPUT')
    for name in ['lp_leetplus_https', 'lp_leetplus_smtp']:
        value = call(['/usr/sbin/ipset', 'list', name]).stdout
        if 'Type: hash:ip' not in value or not re.search(r'Number of entries: [1-9]', value):
            raise ValueError('Provider set is missing or expired')
    print(json.dumps({'decision': 'PASS', 'contract': 'LEETPLUS_COMPOSE_NETWORK_V1'}))
