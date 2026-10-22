#!/usr/bin/python3

import json
import os
import pwd
import re
import socket
import subprocess
import sys
from pathlib import Path


MARKERS = Path('/var/lib/plainshow/account-owners')
PROJECT_STATE = Path('/etc/plainshow/state/projects.json')
MANAGER = '/usr/local/libexec/plainshow-manager'
CLOUD_OCC = '/var/www/html/cloud/occ'
AGENT_SOCKET = '/run/plainshow/agent.sock'
PI_NAME = re.compile(r'^[a-z_][a-z0-9_-]{1,30}$')
CLOUD_NAME = re.compile(r'^[A-Za-z0-9_][A-Za-z0-9_.-]{1,63}$')
GROUP_NAME = re.compile(r'^ps-[1-9][0-9]*$')


def fail(message):
    raise ValueError(message)


def run(*arguments, input_text=None, check=True, env=None):
    return subprocess.run(arguments, input=input_text, text=True, capture_output=True, check=check, timeout=120, env=env)


def protected_name():
    try:
        settings = json.loads(Path('/etc/plainshow/settings.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        fail('Server account settings are unavailable')
    return settings.get('admin_user')


def marker_path(username):
    return MARKERS / (username + '.json')


def owner(username):
    try:
        return json.loads(marker_path(username).read_text(encoding='utf-8'))['user_id']
    except FileNotFoundError:
        return None
    except (ValueError, KeyError, TypeError):
        fail('Account ownership marker is invalid')


def mark(username, user_id):
    MARKERS.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = marker_path(username).with_suffix('.tmp')
    with temporary.open('x', encoding='utf-8') as handle:
        json.dump({'user_id': user_id}, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, marker_path(username))


def pi_account(username):
    try:
        account = pwd.getpwnam(username)
    except KeyError:
        return None
    if account.pw_uid < 1000 or account.pw_shell != '/usr/local/bin/plainshow-shell':
        fail('Refusing to manage a non-PlainShow Linux account')
    return account


def revoke_agent(username):
    with socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET) as connection:
        connection.settimeout(5)
        connection.connect(AGENT_SOCKET)
        connection.send(json.dumps({'op': 'revoke_account', 'username': username}).encode())
        response = json.loads(connection.recv(4096).decode())
    if response.get('ok') is not True:
        fail('Could not revoke Web sessions')


def assert_no_projects(username):
    try:
        state = json.loads(PROJECT_STATE.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        fail('Project state is unavailable')
    projects = state.get('projects', {})
    if not isinstance(projects, dict):
        fail('Project state is invalid')
    for project in projects.values():
        if not isinstance(project, dict):
            fail('Project state is invalid')
        if username == project.get('owner') or username in project.get('owners', []) or username in project.get('members', []):
            fail('Transfer or remove this account from its projects first')


def ensure_pi(username, user_id):
    current_owner = owner(username)
    if current_owner is not None and current_owner != user_id:
        fail('Linux account belongs to a different PlainShow user')
    account = pi_account(username)
    if account is not None and current_owner is None:
        fail('Existing Linux account must be adopted by the server administrator')
    if account is None:
        if current_owner is not None:
            fail('Managed Linux account is missing')
        run(MANAGER, 'account', 'create', username, env={**os.environ, 'SUDO_USER': 'root'})
        mark(username, user_id)


def manage_pi(action, username, user_id):
    if not PI_NAME.fullmatch(username):
        fail('Refusing to manage this Linux account')
    if not user_id.isdecimal() or int(user_id) < 1:
        fail('Invalid PlainShow user ID')
    user_id = int(user_id)
    if action == 'revoke':
        revoke_agent(username)
        return
    if action == 'adopt':
        if os.environ.get('SUDO_USER') not in (None, '', 'root'):
            fail('Only a server administrator may adopt an existing account')
        if username == protected_name():
            try:
                account = pwd.getpwnam(username)
            except KeyError:
                account = None
            if account is not None and account.pw_uid < 1000:
                account = None
        else:
            account = pi_account(username)
        if owner(username) is not None or account is None:
            fail('Account is already managed or does not exist')
        mark(username, user_id)
        return
    if username == protected_name():
        fail('Refusing to alter the protected server account')
    if action in ('ensure', 'password'):
        ensure_pi(username, user_id)
    if owner(username) is None:
        return
    if owner(username) != user_id or pi_account(username) is None:
        fail('Linux account ownership does not match')
    if action == 'password':
        password = sys.stdin.read()
        if len(password) < 10 or len(password) > 512 or '\n' in password or '\x00' in password:
            fail('Invalid password')
        password_hash = run('openssl', 'passwd', '-6', '-stdin', input_text=password).stdout.strip()
        if not password_hash.startswith('$6$'):
            fail('Could not hash password')
        run('usermod', '--password', password_hash, '--expiredate', '', username)
        revoke_agent(username)
    elif action == 'disable':
        run('usermod', '--expiredate', '1', username)
        revoke_agent(username)
    elif action == 'enable':
        run('usermod', '--expiredate', '', username)
    elif action == 'delete':
        assert_no_projects(username)
        revoke_agent(username)
        run('userdel', '--remove', username)
        marker_path(username).unlink()
    elif action != 'ensure':
        fail('Unknown Linux account operation')


def cloud_exists(username):
    result = run('runuser', '-u', 'www-data', '--', 'php', CLOUD_OCC, 'user:info', username, check=False)
    return result.returncode == 0


def manage_cloud(action, username):
    if not CLOUD_NAME.fullmatch(username):
        fail('Invalid Cloud account name')
    if action == 'exists':
        print('1' if cloud_exists(username) else '0')
        return
    if action not in ('enable', 'disable', 'delete'):
        fail('Unknown Cloud account operation')
    if not cloud_exists(username):
        return
    run('runuser', '-u', 'www-data', '--', 'php', CLOUD_OCC, 'user:' + action, username)


def cloud_group_exists(group_id):
    result = run('runuser', '-u', 'www-data', '--', 'php', CLOUD_OCC, 'group:info', group_id, check=False)
    return result.returncode == 0


def manage_group(action, group_id, username=None, display_name=None):
    if not GROUP_NAME.fullmatch(group_id):
        fail('Invalid managed Cloud group')
    if action == 'ensure':
        if display_name is None or len(display_name) > 100 or not display_name.strip():
            fail('Invalid group display name')
        if not cloud_group_exists(group_id):
            run('runuser', '-u', 'www-data', '--', 'php', CLOUD_OCC, 'group:add', group_id, '--display-name=' + display_name)
        return
    if action == 'delete':
        if cloud_group_exists(group_id):
            run('runuser', '-u', 'www-data', '--', 'php', CLOUD_OCC, 'group:delete', group_id)
        return
    if action not in ('add', 'remove') or username is None or not CLOUD_NAME.fullmatch(username):
        fail('Invalid managed Cloud group operation')
    if not cloud_group_exists(group_id) or not cloud_exists(username):
        return
    command = 'group:adduser' if action == 'add' else 'group:removeuser'
    run('runuser', '-u', 'www-data', '--', 'php', CLOUD_OCC, command, group_id, username)


def main(arguments):
    if os.geteuid() != 0:
        fail('Root privileges required')
    if len(arguments) == 3 and arguments[0] == 'cloud':
        manage_cloud(arguments[1], arguments[2])
    elif arguments and arguments[0] == 'group' and len(arguments) in (3, 4):
        manage_group(arguments[1], arguments[2], arguments[3] if arguments[1] in ('add', 'remove') and len(arguments) == 4 else None,
                     arguments[3] if arguments[1] == 'ensure' and len(arguments) == 4 else None)
    elif len(arguments) == 4 and arguments[0] == 'pi':
        manage_pi(arguments[1], arguments[2], arguments[3])
    else:
        fail('Invalid account operation')


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except subprocess.CalledProcessError:
        print('Host account command failed', file=sys.stderr)
        sys.exit(1)
    except (ValueError, subprocess.TimeoutExpired, OSError) as error:
        print(str(error)[:200], file=sys.stderr)
        sys.exit(1)
