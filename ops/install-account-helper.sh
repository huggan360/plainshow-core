#!/usr/bin/env bash
set -euo pipefail

SOURCE=$(cd "$(dirname "$0")" && pwd)
sudo -n visudo -cf "$SOURCE/account-helper.sudoers"
sudo -n install -o root -g root -m 0755 "$SOURCE/account-helper.py" /usr/local/libexec/plainshow-account-helper
sudo -n install -o root -g root -m 0440 "$SOURCE/account-helper.sudoers" /etc/sudoers.d/92-plainshow-account-helper
sudo -n visudo -cf /etc/sudoers.d/92-plainshow-account-helper
